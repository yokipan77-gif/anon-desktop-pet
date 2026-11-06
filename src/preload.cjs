'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('anon', Object.freeze({
  get: () => ipcRenderer.invoke('anon:get'),
  action: (name) => ipcRenderer.send('anon:action', name),
  settings: (patch) => ipcRenderer.send('anon:settings', patch),
  focus: (minutes) => ipcRenderer.send('anon:focus', minutes),
  room: () => ipcRenderer.send('anon:room'),
  home: () => ipcRenderer.send('anon:home'),
  hide: () => ipcRenderer.send('anon:hide'),
  quit: () => ipcRenderer.send('anon:quit'),
  drag: (active) => ipcRenderer.send('anon:drag', !!active),
  hit: (interactive) => ipcRenderer.send('anon:hit', !!interactive),
  menu: () => ipcRenderer.send('anon:menu'),
  onUpdate: (callback) => { const handler = (_, data) => callback(data); ipcRenderer.on('anon:update', handler); return () => ipcRenderer.removeListener('anon:update', handler); }
}));
