const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  moveWindow: (pos) => ipcRenderer.send('move-window', pos),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  getGifs: () => fs.readdirSync(path.join(__dirname, 'assets', 'gif'))
                   .filter(f => f.endsWith('.gif'))
});
