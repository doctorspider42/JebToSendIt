'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, session, nativeImage, dialog, Notification, systemPreferences, shell } = require('electron');
const path = require('path');
const i18next = require('i18next');
const settings = require('./settings');
const resources = require('../renderer/locales');
const { createKeySender } = require('./keysender');
const { ActionRunner, resolveAction } = require('./actions');
const { currentStats, recordHit } = require('./stats');

// język interfejsu (tray): z ustawień albo z lokalizacji systemu (PL → pl, reszta → en)
function resolveLanguage() {
  const saved = settings.getAll().language;
  if (saved === 'en' || saved === 'pl') return saved;
  return (app.getLocale() || 'en').toLowerCase().startsWith('pl') ? 'pl' : 'en';
}
const tr = (key, opts) => i18next.t(key, opts);

const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.png');

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let keySender = null;
let isQuitting = false;
let actionRunner;
let lastHit = -Infinity;

// pojedyncza instancja
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// wysyła do wszystkich okien poza tym, które zmianę zrobiło
function broadcastExcept(sender, channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.webContents !== sender) w.webContents.send(channel, payload);
  }
}

function setArmed(value) {
  const next = settings.setMany({ armed: !!value });
  updateTrayMenu();
  broadcast('state:armed', next.armed);
  return next.armed;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 600,
    minWidth: 380,
    minHeight: 520,
    show: false,
    frame: false,
    resizable: true,
    backgroundColor: '#06060d',
    icon: ICON_PATH,
    title: 'JebToSendIt',
    webPreferences: { ...SECURE_PREFS, backgroundThrottling: false },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!settings.getAll().startMinimized) showWindow();
  });

  // zamknięcie okna = chowanie do tray, nie zamykanie apki
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

const SECURE_PREFS = {
  preload: path.join(__dirname, '..', 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

// drugie okno: wszystkie ustawienia (detekcja, kalibracja, akcje, statystyki, apka)
function openSettings(tab) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (tab) settingsWindow.webContents.send('settings:tab', tab);
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 580,
    minWidth: 620,
    minHeight: 460,
    show: false,
    frame: false,
    resizable: true,
    backgroundColor: '#06060d',
    icon: ICON_PATH,
    title: 'JebToSendIt — Settings',
    webPreferences: SECURE_PREFS,
  });
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'), { query: { tab: tab || '' } });
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  const armed = settings.getAll().armed;
  const menu = Menu.buildFromTemplate([
    { label: armed ? tr('tray.armedItem') : tr('tray.asleepItem'), enabled: false },
    { type: 'separator' },
    {
      label: armed ? tr('tray.disarm') : tr('tray.arm'),
      click: () => setArmed(!armed),
    },
    { label: tr('tray.show'), click: () => showWindow() },
    { label: tr('tray.settings'), click: () => openSettings() },
    { type: 'separator' },
    {
      label: tr('tray.quit'),
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(tr('tray.tooltip', { state: armed ? tr('tray.stateArmed') : tr('tray.stateAsleep') }));
}

function createTray() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
  updateTrayMenu();
}

// ---- IPC ----
function wireIpc() {
  ipcMain.handle('settings:get', () => settings.getAll());
  ipcMain.handle('settings:set', async (e, partial) => {
    const next = settings.setMany(partial);
    broadcastExcept(e.sender, 'settings:changed', next);
    if (partial && Object.prototype.hasOwnProperty.call(partial, 'language')) {
      await i18next.changeLanguage(resolveLanguage());
      updateTrayMenu();
    }
    if (partial && Object.prototype.hasOwnProperty.call(partial, 'armed')) {
      updateTrayMenu();
      broadcast('state:armed', next.armed);
    }
    return next;
  });
  ipcMain.handle('state:setArmed', (_e, value) => setArmed(value));

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('stats:get', () => currentStats(settings.getStats()));
  ipcMain.handle('script:choose', async (e) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) || mainWindow, {
      properties: ['openFile'], filters: [{ name: 'Scripts', extensions: ['js', 'cjs', 'mjs', 'py', 'ps1', 'sh', 'zsh'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.on('hit:fire', async () => {
    const cfg = settings.getAll();
    const now = performance.now();
    if (!cfg.armed || now - lastHit < cfg.cooldownMs) return;
    lastHit = now;
    const { stats, newRecord } = recordHit(settings.getStats());
    settings.setStats(stats);
    broadcast('hit:fired', { stats, newRecord: newRecord && cfg.recordNotifications });
    if (newRecord && cfg.recordNotifications && Notification.isSupported()) {
      new Notification({ title: tr('records.title'), body: tr('records.message', { count: stats.today }) }).show();
    }
    try { await actionRunner.run(resolveAction(cfg)); }
    catch (err) { broadcast('action:error', { message: err.message, permission: err.permission || null }); }
  });
  // "Przetestuj" w ustawieniach — odpala wskazaną akcję bez jebnięcia
  ipcMain.handle('action:test', async (_e, id) => {
    try { await actionRunner.run(resolveAction(settings.getAll(), id)); return null; }
    catch (err) { return err.message; }
  });

  // kalibracja i poziom sygnału żyją w oknie głównym (tam jest detektor)
  ipcMain.on('calib:start', () => mainWindow && mainWindow.webContents.send('calib:start'));
  ipcMain.on('calib:progress', (e, p) => broadcastExcept(e.sender, 'calib:progress', p));
  ipcMain.on('level', (_e, v) => { if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('level', v); });

  // uprawnienia macOS do wysyłania klawiszy (Dostępność + Automatyzacja → System Events)
  ipcMain.handle('perm:status', () => ({
    platform: process.platform,
    accessibility: process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : true,
  }));
  ipcMain.handle('perm:open', async (_e, kind) => {
    if (process.platform !== 'darwin') return;
    // z promptem: macOS sam dopisze apkę do listy Dostępności i pokaże systemowe okienko
    if (kind === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true);
    const pane = kind === 'automation' ? 'Privacy_Automation' : 'Privacy_Accessibility';
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
  });

  ipcMain.on('settings:open', (_e, tab) => openSettings(typeof tab === 'string' ? tab : undefined));
  ipcMain.on('settings:close', () => settingsWindow && settingsWindow.close());

  ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.on('window:hide', () => mainWindow && mainWindow.hide());
  ipcMain.on('app:quit', () => { isQuitting = true; app.quit(); });
}

app.whenReady().then(async () => {
  await settings.init();
  // i18n procesu głównego (tray) — synchronicznie, bo zasoby są wbudowane
  await i18next.init({
    lng: resolveLanguage(),
    fallbackLng: 'en',
    resources,
    interpolation: { escapeValue: false },
  });

  // zgoda na mikrofon w rendererze
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media' || permission === 'microphone');
  });

  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone');
  }
  keySender = createKeySender();
  actionRunner = new ActionRunner(keySender);
  wireIpc();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

// nie zamykaj apki po zamknięciu wszystkich okien (żyje w tray)
app.on('window-all-closed', (e) => {
  if (!isQuitting) e.preventDefault?.();
});

app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => { actionRunner?.dispose(); });
