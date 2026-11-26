const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voidDesktopExport', {
  host: () => ipcRenderer.invoke('game-export:host'),
  build: (settings, html) => ipcRenderer.invoke('game-export:build', settings, html),
  reveal: () => ipcRenderer.invoke('game-export:reveal'),
  onProgress: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('game-export:progress',listener);
    return () => ipcRenderer.removeListener('game-export:progress',listener);
  },
});
