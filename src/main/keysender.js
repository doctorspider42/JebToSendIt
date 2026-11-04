'use strict';
/*
 * Warstwa wysyłania klawisza — zaprojektowana pod łatwe portowanie.
 *
 * Każda platforma dostaje własną implementację `KeySender` z metodą tap(key).
 * Windows: trwały proces PowerShell, który raz ładuje System.Windows.Forms,
 *          a potem dla każdego uderzenia wykonuje SendKeys (niska latencja,
 *          zero modułów natywnych -> prosty build).
 *
 * macOS: osascript + System Events (Accessibility and Automation permissions).
 */
const { spawn, execFile } = require('child_process');

// mapowanie nazw klawiszy na składnię SendKeys
const SENDKEYS_MAP = {
  enter: '{ENTER}',
  space: ' ',
  tab: '{TAB}',
  esc: '{ESC}',
  escape: '{ESC}',
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
};

class WindowsKeySender {
  constructor() {
    this.proc = null;
    this.ready = false;
  }

  _ensure() {
    if (this.proc && !this.proc.killed) return;
    this.proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-Command', '-'],
      { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }
    );
    this.proc.on('error', () => { this.proc = null; this.ready = false; });
    this.proc.on('exit', () => { this.proc = null; this.ready = false; });
    // załaduj WinForms raz
    this.proc.stdin.on('error', () => {});
    this.proc.stdin.write('Add-Type -AssemblyName System.Windows.Forms\n');
    this.ready = true;
  }

  tap(key = 'enter') {
    try {
      this._ensure();
      const seq = SENDKEYS_MAP[String(key).toLowerCase()] || '{ENTER}';
      // pojedyncze cudzysłowy w PowerShell -> bez interpolacji; sekwencje są bezpieczne
      this.proc.stdin.write(`[System.Windows.Forms.SendKeys]::SendWait('${seq}')\n`);
      return true;
    } catch (e) {
      return false;
    }
  }

  dispose() {
    if (this.proc && !this.proc.killed) {
      try { this.proc.stdin.end(); } catch (_) {}
      try { this.proc.kill(); } catch (_) {}
    }
    this.proc = null;
    this.ready = false;
  }
}

// Rozpoznaje, którego uprawnienia macOS brakuje, po kodzie błędu osascript:
// -1743 = brak zgody Automatyzacja → System Events; -1719 / 1002 / -25211 = brak Dostępności.
function macPermissionError(output) {
  const permission = /-1743|not authori[sz]ed to send apple events/i.test(output) ? 'automation' : 'accessibility';
  const pane = permission === 'automation' ? 'Automation → System Events' : 'Accessibility';
  const err = new Error(`Allow JebToSendIt in System Settings → Privacy & Security → ${pane}.`);
  err.permission = permission;
  return err;
}

// AppleScript is fixed text; only numeric key codes from this allowlist are used.
class MacKeySender {
  async tap(key = 'enter') {
    const codes = { enter: 36, space: 49, tab: 48, esc: 53, escape: 53, up: 126, down: 125, left: 123, right: 124 };
    return new Promise((resolve, reject) => {
      execFile('/usr/bin/osascript', ['-e', `tell application "System Events" to key code ${codes[key] ?? 36}`],
        { timeout: 5000 }, (err, _stdout, stderr) => (err ? reject(macPermissionError(`${stderr || ''} ${err.message}`)) : resolve(true)));
    });
  }
  dispose() {}
}
class UnsupportedKeySender {
  tap() { return false; }
  dispose() {}
}
function createKeySender() {
  if (process.platform === 'win32') return new WindowsKeySender();
  if (process.platform === 'darwin') return new MacKeySender();
  return new UnsupportedKeySender();
}
module.exports = { createKeySender, macPermissionError };
