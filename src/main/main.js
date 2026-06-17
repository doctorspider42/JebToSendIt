'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, session, nativeImage } = require('electron');
const path = require('path');
const settings = require('./settings');
const { createKeySender } = require('./keysender');

const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.png');

let mainWindow = null;
let tray = null;
let keySender = null;
let isQuitting = false;

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

function setArmed(value) {
  const next = settings.setMany({ armed: !!value });
  updateTrayMenu();
  broadcast('state:armed', next.armed);
  return next.armed;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 700,
    minWidth: 380,
    minHeight: 600,
    show: false,
    frame: false,
    resizable: true,
    backgroundColor: '#06060d',
    icon: ICON_PATH,
    title: 'JebToSendIt',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  const armed = settings.getAll().armed;
  const menu = Menu.buildFromTemplate([
    { label: armed ? '● UZBROJONY' : '○ uśpiony', enabled: false },
    { type: 'separator' },
    {
      label: armed ? 'Rozbrój' : 'Uzbrój',
      click: () => setArmed(!armed),
    },
    { label: 'Pokaż okno', click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'Zamknij JebToSendIt',
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`JebToSendIt — ${armed ? 'UZBROJONY' : 'uśpiony'}`);
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
  ipcMain.handle('settings:set', (_e, partial) => {
    const next = settings.setMany(partial);
    if (partial && Object.prototype.hasOwnProperty.call(partial, 'armed')) {
      updateTrayMenu();
      broadcast('state:armed', next.armed);
    }
    return next;
  });
  ipcMain.handle('state:setArmed', (_e, value) => setArmed(value));

  // uderzenie wykryte w rendererze -> wyślij klawisz (jeśli uzbrojony)
  ipcMain.on('hit:fire', (_e, payload) => {
    const cfg = settings.getAll();
    if (!cfg.armed) return;
    if (keySender) keySender.tap(cfg.keyToSend || 'enter');
    broadcast('hit:fired', payload || {});
  });

  ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.on('window:hide', () => mainWindow && mainWindow.hide());
  ipcMain.on('app:quit', () => { isQuitting = true; app.quit(); });
}

app.whenReady().then(() => {
  // zgoda na mikrofon w rendererze
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media' || permission === 'microphone');
  });

  keySender = createKeySender();
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
app.on('will-quit', () => { if (keySender) keySender.dispose(); });
