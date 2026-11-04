'use strict';
// Runs real settings, sandboxed preload and both renderers (main + settings window) with an isolated profile.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const settings = require('../src/main/settings');
const { currentStats } = require('../src/main/stats');
const { resolveAction } = require('../src/main/actions');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jeb-smoke-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

const PREFS = { preload: path.resolve(__dirname, '../src/preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  // migracja: stara pojedyncza akcja (0.3.x) → lista akcji
  fs.writeFileSync(path.join(profile, 'jebtosendit-config.json'),
    JSON.stringify({ actionType: 'command', command: 'echo hello', scriptPath: '' }));
  await settings.init();
  let cfg = settings.getAll();
  assert.equal(cfg.actions.length, 1);
  assert.equal(cfg.activeAction, 'legacy-command');
  assert.equal(cfg.actionType, undefined);
  assert.deepEqual(resolveAction(cfg), { actionType: 'command', command: 'echo hello', scriptPath: '' });
  settings.setMany({ recordNotifications: false, stats: { today: 999 } });
  assert.equal(settings.getStats().today, undefined);
  settings.setStats({ day: '2026-11-04', today: 7, record: 12 });

  const wins = {};
  const errors = [];
  const sendAllExcept = (sender, ch, p) => Object.values(wins).forEach((w) => w && !w.isDestroyed() && w.webContents !== sender && w.webContents.send(ch, p));
  ipcMain.handle('settings:get', () => settings.getAll());
  ipcMain.handle('settings:set', (e, partial) => { const next = settings.setMany(partial); sendAllExcept(e.sender, 'settings:changed', next); return next; });
  ipcMain.handle('stats:get', () => currentStats(settings.getStats()));
  ipcMain.handle('app:version', () => require('../package.json').version);
  ipcMain.handle('script:choose', () => '/tmp/test script.js');
  ipcMain.handle('state:setArmed', (_e, value) => value);
  ipcMain.handle('action:test', () => null);
  let trusted = true, openedPane = null;
  ipcMain.handle('perm:status', () => ({ platform: 'darwin', accessibility: trusted }));
  ipcMain.handle('perm:open', (_e, kind) => { openedPane = kind; });
  let opened = null;
  ipcMain.on('settings:open', (_e, tab) => { opened = tab; });
  ipcMain.on('level', () => {});
  ipcMain.on('calib:start', () => wins.main.webContents.send('calib:start'));
  ipcMain.on('calib:progress', (e, p) => sendAllExcept(e.sender, 'calib:progress', p));
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));

  const load = async (name, file, query) => {
    const w = new BrowserWindow({ width: 760, height: 640, show: false, webPreferences: PREFS });
    w.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(`${name}: ${event.message}`); });
    await w.loadFile(path.resolve(__dirname, '../src/renderer', file), { query });
    wins[name] = w;
    return w;
  };
  const main = await load('main', 'index.html');
  const set = await load('settings', 'settings.html', { tab: 'actions' });
  await wait(1200);
  const js = (w, code) => w.webContents.executeJavaScript(`(async () => { const el = id => document.getElementById(id); ${code} })()`);

  // okno główne: szybki wybór akcji
  const chips = await js(main, `
    if (!el('appVersion').textContent) throw Error('Main UI did not initialize');
    return [...el('actionPicker').querySelectorAll('.chip')].map(c => c.textContent + ':' + c.getAttribute('aria-checked'));`);
  assert.deepEqual(chips, ['ENTER:false', 'echo hello:true', ':null']);

  // ustawienia: nowa akcja typu skrypt
  await js(set, `
    if (document.querySelector('[data-pane=actions]').hidden) throw Error('Tab from query ignored');
    el('btnNewAction').click(); await new Promise(r => setTimeout(r, 50));
    el('actName').value = 'Deploy'; el('actName').dispatchEvent(new Event('input'));
    document.querySelector('[data-type=script]').click();
    el('chooseScript').click(); await new Promise(r => setTimeout(r, 400));
    if (el('scriptFields').hidden || el('scriptPath').value !== '/tmp/test script.js') throw Error('Script picker failed');
    el('startMin').checked = true; el('startMin').dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 350));`);
  cfg = settings.getAll();
  const deploy = cfg.actions.find((a) => a.name === 'Deploy');
  assert.ok(deploy, 'new action saved');
  assert.equal(deploy.type, 'script');
  assert.equal(deploy.scriptPath, '/tmp/test script.js');
  assert.equal(cfg.startMinimized, true);

  // okno główne dostało zmianę i wybiera nową akcję jednym klikiem
  await wait(100);
  await js(main, `
    const chip = [...el('actionPicker').querySelectorAll('.chip')].find(c => c.textContent === 'Deploy');
    if (!chip) throw Error('Main window did not sync actions');
    chip.click(); await new Promise(r => setTimeout(r, 100));
    el('actionPicker').querySelector('.chip.add').click();`);
  assert.equal(settings.getAll().activeAction, deploy.id);
  assert.equal(opened, 'actions');

  // usunięcie aktywnej akcji wraca do klawisza; język przełącza oba okna
  await wait(100);
  await js(set, `
    [...el('actionList').children].find(r => r.textContent.includes('Deploy')).click();
    el('btnDelete').click(); await new Promise(r => setTimeout(r, 100));
    document.querySelector('[data-lang=pl]').click(); await new Promise(r => setTimeout(r, 200));`);
  assert.equal(settings.getAll().activeAction, 'key');
  await wait(200);
  const status = await js(main, `return el('statusText').textContent + '|' + el('statusSub').textContent;`);
  assert.match(status, /^UZBROJONY\|Jebnij w laptopa → ENTER$/);

  // zdarzenia z procesu głównego
  main.webContents.send('hit:fired', { stats: { today: 13, record: 13 }, newRecord: true });
  await wait(100);
  assert.equal(await js(main, `return el('recordToast').hidden`), true);
  settings.setMany({ recordNotifications: true });
  main.webContents.send('settings:changed', settings.getAll());
  main.webContents.send('hit:fired', { stats: { today: 14, record: 14 }, newRecord: true });
  main.webContents.send('action:error', 'Example failure');
  await wait(150);
  assert.equal(await js(main, `return el('recordToast').hidden`), false);
  assert.match(await js(main, `return el('actionError').textContent`), /Example failure/);
  assert.equal(await js(set, `return el('statToday').textContent`), '7');

  // brak uprawnień macOS → panel z przyciskiem do Ustawień systemowych zamiast surowego błędu
  main.webContents.send('action:error', { message: 'x', permission: 'automation' });
  await wait(100);
  assert.equal(await js(main, `el('permOpen').click(); return el('permBox').hidden + '|' + el('permText').textContent`),
    'false|macOS nie pozwala JebToSendIt sterować System Events. Włącz to w Prywatność i ochrona → Automatyzacja → JebToSendIt → System Events.');
  await wait(50);
  assert.equal(openedPane, 'automation');
  trusted = false;
  assert.equal(await js(main, `el('permRecheck').click(); await new Promise(r => setTimeout(r, 100)); return el('permBox').hidden + '|' + el('permText').textContent.slice(0, 32)`),
    'false|macOS blokuje wysyłanie klawiszy');
  trusted = true;
  assert.equal(await js(main, `el('permRecheck').click(); await new Promise(r => setTimeout(r, 100)); return el('permBox').hidden`), true);

  console.log('Smoke passed. Renderer errors:', errors);
  assert.equal(errors.length, 0);
  fs.mkdirSync(path.resolve(__dirname, '../dist'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../dist/smoke-main.png'), (await main.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.resolve(__dirname, '../dist/smoke-settings.png'), (await set.webContents.capturePage()).toPNG());
  Object.values(wins).forEach((w) => w.destroy());
  app.exit(0);
}).catch((err) => { console.error(err); app.exit(1); });
setTimeout(() => { console.error('Smoke timed out'); app.exit(1); }, 25000).unref();
// The OS temporary directory owns this isolated profile; Chromium may still
// flush caches during process shutdown, so do not delete it from will-quit.
