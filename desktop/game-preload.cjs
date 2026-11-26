const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voidGameWindow', {
  setFullscreen: enabled => ipcRenderer.invoke('void-game:fullscreen',enabled),
  onFullscreenChange(callback) {
    const listener = (_event,enabled) => callback(enabled);
    ipcRenderer.on('void-game:fullscreen-changed',listener);
    return () => ipcRenderer.removeListener('void-game:fullscreen-changed',listener);
  },
});
