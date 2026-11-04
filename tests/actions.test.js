'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ActionRunner, commandForAction } = require('../src/main/actions');
test('commands select the OS shell and preserve literal content', () => {
  const command = 'echo "hello world"; echo $HOME';
  assert.deepEqual(commandForAction({ actionType: 'command', command }, 'darwin'), ['/bin/zsh', ['-c', command]]);
  assert.deepEqual(commandForAction({ actionType: 'command', command }, 'win32'), ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]]);
  assert.throws(() => commandForAction({ actionType: 'command', command: ' ' }));
  assert.throws(() => commandForAction({ actionType: 'script', scriptPath: 'relative.js' }));
});
test('Enter remains default behavior, delivery failures reach the caller', async () => {
  let key;
  const runner = new ActionRunner({ tap: (value) => { key = value; return true; }, dispose() {} });
  await runner.run({ actionType: 'enter' });
  assert.equal(key, 'enter');
  runner.keySender.tap = () => false;
  await assert.rejects(runner.run({ actionType: 'enter' }), /Could not send/);
});
test('scripts with spaces run from their own directory; errors and overlap are handled', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jeb test '));
  try {
    const file = path.join(dir, 'my script.cjs');
    await fs.writeFile(file, "setTimeout(() => require('node:fs').writeFileSync('done.txt', 'yes'), 150)");
    const runner = new ActionRunner({ dispose() {} });
    const config = { actionType: 'script', scriptPath: file };
    const first = runner.run(config);
    await assert.rejects(runner.run(config), /still running/);
    await first;
    assert.equal(await fs.readFile(path.join(dir, 'done.txt'), 'utf8'), 'yes');
    await fs.writeFile(file, 'process.exit(7)');
    await assert.rejects(runner.run(config), /Action failed/);
    assert.equal(runner.busy, false);
    await assert.rejects(runner.run({ actionType: 'script', scriptPath: path.join(dir, 'missing.js') }), /ENOENT/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('macOS osascript errors name the missing permission', () => {
  const { macPermissionError } = require('../src/main/keysender');
  assert.equal(macPermissionError('execution error: Not authorized to send Apple events to System Events. (-1743)').permission, 'automation');
  assert.equal(macPermissionError('System Events got an error: osascript is not allowed to send keystrokes. (1002)').permission, 'accessibility');
});
