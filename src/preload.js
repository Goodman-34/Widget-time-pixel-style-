/*
 * preload.js - jembatan kecil dan aman antara jendela widget dan proses utama.
 * Renderer tidak punya akses Node; hanya fungsi di bawah ini yang tersedia.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetAPI', {
  isElectron: true,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.send('settings:set', partial),
  setScale: (scale) => ipcRenderer.send('win:scale', scale),
  setOpacity: (v) => ipcRenderer.send('win:opacity', v),
  setAlwaysOnTop: (on) => ipcRenderer.send('win:top', on),
  setAutoStart: (on) => ipcRenderer.send('win:autostart', on),
  hide: () => ipcRenderer.send('win:hide'),
  quit: () => ipcRenderer.send('app:quit'),
  onSettingsChanged: (cb) => {
    ipcRenderer.on('settings:changed', (_e, patch) => cb(patch));
  }
});
