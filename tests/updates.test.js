'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates, supportsUpdates } = require('../src/main/updates');

function fixture(checkForUpdates = async () => {}) {
  const updater = new EventEmitter();
  let installs = 0, notices = 0;
  updater.checkForUpdates = checkForUpdates;
  updater.quitAndInstall = (silent, restart) => {
    assert.equal(silent, false);
    assert.equal(restart, true);
    installs++;
  };
  const updates = createUpdates({ updater, supported: true, onReady: () => notices++ });
  return { updater, updates, installs: () => installs, notices: () => notices };
}

test('updates are limited to packaged macOS and installed Windows builds', () => {
  for (const platform of ['darwin', 'win32']) {
    assert.equal(supportsUpdates({ platform, isPackaged: true }), true);
    assert.equal(supportsUpdates({ platform, isPackaged: false }), false);
  }
  assert.equal(supportsUpdates({ platform: 'win32', isPackaged: true, portable: true }), false);
  assert.equal(supportsUpdates({ platform: 'linux', isPackaged: true }), false);
  const updates = createUpdates({ supported: false });
  updates.start();
  assert.equal(updates.install(), false);
  assert.deepEqual(updates.getState(), { status: 'unsupported' });
});

test('downloads stable releases automatically, then installs only when ready', async () => {
  const f = fixture();
  assert.equal(f.updater.autoDownload, true);
  assert.equal(f.updater.autoInstallOnAppQuit, true);
  assert.equal(f.updater.allowPrerelease, false);
  assert.equal(f.updater.allowDowngrade, false);
  assert.equal(f.updates.install(), false);
  f.updater.emit('update-available', { version: '0.4.0' });
  f.updater.emit('download-progress', { percent: 53.8 });
  assert.deepEqual(f.updates.getState(), { status: 'downloading', version: '0.4.0', percent: 54 });
  assert.equal(f.updates.install(), false);
  f.updater.emit('update-downloaded', { version: '0.4.0' });
  assert.equal(f.notices(), 1);
  assert.equal((await f.updates.check()).status, 'ready');
  assert.equal(f.updates.install(), true);
  assert.equal(f.updates.install(), false);
  assert.equal(f.installs(), 1);
});

test('coalesces concurrent checks and permits retry after network failure', async () => {
  let finish, calls = 0;
  const f = fixture(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  const first = f.updates.check();
  await f.updates.check();
  assert.equal(calls, 1);
  f.updater.emit('update-not-available');
  finish();
  await first;
  assert.equal(f.updates.getState().status, 'current');
  f.updater.checkForUpdates = async () => { throw new Error('network failure'); };
  await f.updates.check();
  assert.equal(f.updates.getState().status, 'error');
  f.updater.checkForUpdates = async () => f.updater.emit('update-not-available');
  await f.updates.check();
  assert.equal(f.updates.getState().status, 'current');
});

test('handles asynchronous download errors without an unhandled rejection', async () => {
  const f = fixture(async () => ({ downloadPromise: Promise.reject(new Error('download failed')) }));
  await f.updates.check();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.updates.getState().status, 'error');
  f.updater.emit('error', new Error('invalid checksum'));
  assert.equal(f.updates.install(), false);
});

test('checks after startup and periodically, and stops on disposal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let checks = 0;
  const f = fixture(async () => { checks++; f.updater.emit('update-not-available'); });
  f.updates.start();
  f.updates.start();
  t.mock.timers.tick(29_999);
  assert.equal(checks, 0);
  t.mock.timers.tick(1);
  await Promise.resolve();
  assert.equal(checks, 1);
  t.mock.timers.tick(6 * 60 * 60 * 1000);
  await Promise.resolve();
  assert.equal(checks, 2);
  f.updates.dispose();
  t.mock.timers.tick(6 * 60 * 60 * 1000);
  assert.equal(checks, 2);
});
