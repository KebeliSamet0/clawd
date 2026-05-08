const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  moveWindow: (pos) => ipcRenderer.send('move-window', pos),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size')
});
