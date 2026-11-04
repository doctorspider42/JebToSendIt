'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, cb) {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}

contextBridge.exposeInMainWorld('jeb', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  getStats: () => ipcRenderer.invoke('stats:get'),
  chooseScript: () => ipcRenderer.invoke('script:choose'),
  onActionError: (cb) => {
    const h = (_e, message) => cb(message);
    ipcRenderer.on('action:error', h);
    return () => ipcRenderer.removeListener('action:error', h);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  setArmed: (value) => ipcRenderer.invoke('state:setArmed', value),

  // uderzenie wykryte -> poproś main o wysłanie klawisza
  fireHit: (payload) => ipcRenderer.send('hit:fire', payload),

  onArmedChanged: (cb) => {
    const h = (_e, v) => cb(v);
    ipcRenderer.on('state:armed', h);
    return () => ipcRenderer.removeListener('state:armed', h);
  },
  onHitFired: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('hit:fired', h);
    return () => ipcRenderer.removeListener('hit:fired', h);
  },

  onSettingsChanged: (cb) => listen('settings:changed', cb),
  testAction: (id) => ipcRenderer.invoke('action:test', id),
  permissionStatus: () => ipcRenderer.invoke('perm:status'),
  openPermission: (kind) => ipcRenderer.invoke('perm:open', kind),

  // okno ustawień
  openSettings: (tab) => ipcRenderer.send('settings:open', tab),
  closeSettings: () => ipcRenderer.send('settings:close'),
  onSettingsTab: (cb) => listen('settings:tab', cb),

  // kalibracja: ustawienia proszą, okno główne (detektor) wykonuje i raportuje
  startCalibration: () => ipcRenderer.send('calib:start'),
  onCalibrationStart: (cb) => listen('calib:start', cb),
  reportCalibration: (progress) => ipcRenderer.send('calib:progress', progress),
  onCalibrationProgress: (cb) => listen('calib:progress', cb),

  // poziom sygnału z detektora → wskaźnik w ustawieniach
  sendLevel: (value) => ipcRenderer.send('level', value),
  onLevel: (cb) => listen('level', cb),

  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowHide: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('app:quit'),
});
