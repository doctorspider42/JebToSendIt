'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateLegacy, sanitizeActions } = require('../src/main/settings');
const { resolveAction } = require('../src/main/actions');

test('legacy single action becomes a list entry and stays active', () => {
  const cmd = migrateLegacy({ actionType: 'command', command: 'git push', scriptPath: '' });
  assert.equal(cmd.actions.length, 1);
  assert.equal(cmd.activeAction, 'legacy-command');
  assert.deepEqual(resolveAction({ ...cmd, keyToSend: 'enter' }), { actionType: 'command', command: 'git push', scriptPath: '' });

  const both = migrateLegacy({ actionType: 'script', command: 'echo hi', scriptPath: '/x/deploy.sh' });
  assert.deepEqual(both.actions.map((a) => a.name), ['echo hi', 'deploy.sh']);
  assert.equal(both.activeAction, 'legacy-script');

  const enter = migrateLegacy({ actionType: 'enter', command: '', scriptPath: '' });
  assert.deepEqual(enter, { actions: [], activeAction: 'key' });
});

test('actions are sanitized and unknown active action falls back to the key', () => {
  const list = sanitizeActions([
    { id: 'ok', name: 'A', type: 'script', scriptPath: '/a.sh' },
    { id: 'ok', name: 'dup' },
    { id: 'bad id!', name: 'x' },
    null,
  ]);
  assert.deepEqual(list, [{ id: 'ok', name: 'A', type: 'script', command: '', scriptPath: '/a.sh' }]);
  assert.deepEqual(resolveAction({ actions: list, activeAction: 'gone', keyToSend: 'tab' }), { actionType: 'enter', keyToSend: 'tab' });
  assert.equal(resolveAction({ actions: list, activeAction: 'ok' }).actionType, 'script');
});
