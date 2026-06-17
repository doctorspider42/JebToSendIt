'use strict';
/*
 * Warstwa wysyłania klawisza — zaprojektowana pod łatwe portowanie.
 *
 * Każda platforma dostaje własną implementację `KeySender` z metodą tap(key).
 * Windows: trwały proces PowerShell, który raz ładuje System.Windows.Forms,
 *          a potem dla każdego uderzenia wykonuje SendKeys (niska latencja,
 *          zero modułów natywnych -> prosty build).
 *
 * TODO (port): macOS -> osascript 'tell app "System Events" to key code 36'
 *              Linux -> xdotool key Return  (lub ydotool pod Wayland)
 */
const { spawn } = require('child_process');

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

// Zaślepki na przyszłość — żeby warstwa była gotowa do portu.
class UnsupportedKeySender {
  tap() { console.warn('[keysender] platforma jeszcze niewspierana'); return false; }
  dispose() {}
}

function createKeySender() {
  if (process.platform === 'win32') return new WindowsKeySender();
  // TODO: macOS / linux
  return new UnsupportedKeySender();
}

module.exports = { createKeySender };
