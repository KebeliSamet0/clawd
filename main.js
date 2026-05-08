const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let win;
let tray;

app.commandLine.appendSwitch('disable-background-timer-throttling');

function createWindow() {
  win = new BrowserWindow({
    width: 128,
    height: 128,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // win.webContents.openDevTools(); // Debug için

  win.on('closed', () => {
    win = null;
  });
}

function createTray() {
  // Not: assets/tray-icon.png dosyası olmalı
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => win.show() },
    { label: 'Hide', click: () => win.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Claude Pet');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.setLoginItemSettings({
    openAtLogin: true,
    name: 'ClaudePet'
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC: Renderer'dan pozisyon güncellemesi
ipcMain.on('move-window', (event, { x, y }) => {
  if (win) {
    win.setPosition(Math.round(x), Math.round(y));
  }
});

// IPC: Ekran boyutunu gönder
ipcMain.handle('get-screen-size', () => {
  return screen.getPrimaryDisplay().workAreaSize;
});
