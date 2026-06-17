'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jeb', {
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

  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowHide: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('app:quit'),
});
