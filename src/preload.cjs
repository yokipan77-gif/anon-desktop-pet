'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('anon', Object.freeze({
  get: () => ipcRenderer.invoke('anon:get'),
  action: (name) => ipcRenderer.send('anon:action', name),
  settings: (patch) => ipcRenderer.send('anon:settings', patch),
  focus: (minutes) => ipcRenderer.send('anon:focus', minutes),
  room: (tab) => ipcRenderer.send('anon:room', tab),
  chat: Object.freeze({
    get: () => ipcRenderer.invoke('anon:chat-get'),
    configure: value => ipcRenderer.invoke('anon:chat-configure', value),
    test: () => ipcRenderer.invoke('anon:chat-test'),
    models: () => ipcRenderer.invoke('anon:chat-models'),
    notes: value => ipcRenderer.invoke('anon:chat-notes', value),
    clear: scope => ipcRenderer.invoke('anon:chat-clear', scope),
    send: text => ipcRenderer.invoke('anon:chat-send', text),
    cancel: () => ipcRenderer.invoke('anon:chat-cancel'),
    onUpdate: callback => { const handler = (_, data) => callback(data); ipcRenderer.on('anon:chat-update', handler); return () => ipcRenderer.removeListener('anon:chat-update', handler); }
  }),
  onTab: callback => { const handler = (_, tab) => callback(tab); ipcRenderer.on('anon:tab', handler); return () => ipcRenderer.removeListener('anon:tab', handler); },
  getTab: () => ipcRenderer.invoke('anon:tab-get'),
  home: () => ipcRenderer.send('anon:home'),
  hide: () => ipcRenderer.send('anon:hide'),
  quit: () => ipcRenderer.send('anon:quit'),
  drag: (active) => ipcRenderer.send('anon:drag', !!active),
  hit: (interactive) => ipcRenderer.send('anon:hit', !!interactive),
  menu: () => ipcRenderer.send('anon:menu'),
  onUpdate: (callback) => { const handler = (_, data) => callback(data); ipcRenderer.on('anon:update', handler); return () => ipcRenderer.removeListener('anon:update', handler); }
}));
