'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');

function commandForAction(config, platform = process.platform) {
  if (config.actionType === 'command') {
    if (!config.command?.trim()) throw new Error('Choose a command first.');
    return platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', config.command]]
      : [platform === 'darwin' ? '/bin/zsh' : '/bin/sh', ['-c', config.command]];
  }
  if (config.actionType !== 'script') throw new Error('Unknown action.');
  const file = config.scriptPath;
  if (!file || !path.isAbsolute(file)) throw new Error('Choose an absolute script path.');
  switch (path.extname(file).toLowerCase()) {
    case '.js': case '.cjs': case '.mjs': return [process.execPath, [file], { ELECTRON_RUN_AS_NODE: '1' }];
    case '.py': return [platform === 'win32' ? 'python' : 'python3', [file]];
    case '.ps1': return [platform === 'win32' ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-NonInteractive', '-File', file]];
    case '.sh': return [platform === 'win32' ? 'sh' : '/bin/sh', [file]];
    case '.zsh': return [platform === 'win32' ? 'zsh' : '/bin/zsh', [file]];
    default: throw new Error('Supported scripts: .js, .cjs, .mjs, .py, .ps1, .sh, .zsh');
  }
}

// Zamienia ustawienia (lista akcji + aktywna) na konfigurację dla ActionRunner.
function resolveAction(settings, id = settings.activeAction) {
  const custom = id && id !== 'key' ? (settings.actions || []).find((a) => a.id === id) : null;
  if (!custom) return { actionType: 'enter', keyToSend: settings.keyToSend || 'enter' };
  return { actionType: custom.type, command: custom.command, scriptPath: custom.scriptPath };
}

class ActionRunner {
  constructor(keySender) { this.keySender = keySender; this.busy = false; this.child = null; }
  async run(config) {
    if (this.busy) throw new Error('The previous action is still running.');
    this.busy = true;
    try {
      if (config.actionType === 'enter') {
        if (!await this.keySender.tap(config.keyToSend || 'enter')) throw new Error('Could not send the key.');
        return;
      }
      const [file, args, env] = commandForAction(config);
      if (config.actionType === 'script') {
        const stat = await fs.stat(config.scriptPath);
        if (!stat.isFile()) throw new Error('The script is not a file.');
      }
      await new Promise((resolve, reject) => {
        this.child = execFile(file, args, {
          windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024,
          env: { ...process.env, ...env },
          cwd: config.actionType === 'script' ? path.dirname(config.scriptPath) : undefined,
        }, (err) => { this.child = null; err ? reject(new Error(err.killed ? 'Action timed out (30 s).' : `Action failed: ${err.message.slice(0, 500)}`)) : resolve(); });
      });
    } finally { this.busy = false; }
  }
  dispose() { this.child?.kill(); this.keySender.dispose(); }
}
module.exports = { ActionRunner, commandForAction, resolveAction };
