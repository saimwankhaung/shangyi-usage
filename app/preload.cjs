const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shangyi', {
  getState: () => ipcRenderer.invoke('state:get'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  chooseCodex: () => ipcRenderer.invoke('codex:choose'),
  connectClaude: () => ipcRenderer.invoke('claude:connect'),
  disconnectClaude: () => ipcRenderer.invoke('claude:disconnect'),
  openUsage: provider => ipcRenderer.invoke('usage:open', provider),
  resize: compact => ipcRenderer.invoke('window:compact', compact),
  settle: () => ipcRenderer.invoke('window:settle'),
  hide: () => ipcRenderer.invoke('window:hide'),
  showMenu: () => ipcRenderer.invoke('window:menu'),
  quit: () => ipcRenderer.invoke('app:quit'),
  move: delta => ipcRenderer.send('window:move', delta),
  passThrough: enabled => ipcRenderer.send('window:passthrough', enabled),
  onState: callback => {
    const handler = (_, state) => callback(state);
    ipcRenderer.on('state:update', handler);
    return () => ipcRenderer.removeListener('state:update', handler);
  },
  onOpenSettings: callback => {
    const handler = () => callback();
    ipcRenderer.on('ui:settings', handler);
    return () => ipcRenderer.removeListener('ui:settings', handler);
  },
  onCollapse: callback => {
    const handler = () => callback();
    ipcRenderer.on('ui:collapse', handler);
    return () => ipcRenderer.removeListener('ui:collapse', handler);
  },
  onNotice: callback => {
    const handler = (_, message) => callback(message);
    ipcRenderer.on('ui:notice', handler);
    return () => ipcRenderer.removeListener('ui:notice', handler);
  }
});
