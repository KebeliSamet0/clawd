const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

function getGifDuration(filePath) {
  const buf = fs.readFileSync(filePath);
  let delay = 0;
  for (let i = 0; i < buf.length - 5; i++) {
    if (buf[i] === 0x21 && buf[i+1] === 0xF9 && buf[i+2] === 0x04) {
      delay += buf[i+4] | (buf[i+5] << 8);
    }
  }
  return Math.max(delay * 10, 1000);
}

// SVG animations are CSS keyframes; one "play" is the longest cycle up to 6s
// (longer cycles are slow background loops, not the main motion).
function getSvgDuration(filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  const cycles = [...css.matchAll(/animation(?:-duration)?\s*:[^;}]*?([\d.]+)(m?s)\b/g)]
    .map(([, n, unit]) => Number(n) * (unit === 's' ? 1000 : 1))
    .filter((ms) => ms > 0 && ms <= 6000);
  return cycles.length ? Math.max(1000, ...cycles) : 2000;
}

// "clawd-idle-reading.gif" -> "idle-reading", "clawd-working-ultrathink.svg" -> "ultrathink",
// "clawd-act-drink.svg" -> "drink" (act-: animations drawn for this fork).
const stateName = (file) => file.replace(/\.(gif|svg)$/, '').replace(/^clawd-/, '').replace(/^(working|act)-/, '');

// GIFs first; an SVG only adds states that have no GIF.
function listStates() {
  const states = {};
  for (const [dir, ext, duration] of [['gif', '.gif', getGifDuration], ['svg', '.svg', getSvgDuration]]) {
    try {
      const folder = path.join(__dirname, 'assets', dir);
      for (const f of fs.readdirSync(folder).filter((name) => name.endsWith(ext))) {
        const name = stateName(f);
        if (!states[name]) states[name] = { src: `../assets/${dir}/${f}`, duration: duration(path.join(folder, f)) };
      }
    } catch {
      // missing folder: no states from it
    }
  }
  return states;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getStates: listStates,
  onClaudeEvent: (callback) => ipcRenderer.on('claude-event', (_event, ev) => callback(ev)),
  onSystemEvent: (callback) => ipcRenderer.on('system-event', (_event, message) => callback(message)),
  getMeta: () => ipcRenderer.invoke('get-pet-meta'),
  onMeta: (callback) => ipcRenderer.on('pet-meta', (_event, meta) => callback(meta)),
  reportStatus: (status) => ipcRenderer.send('pet-status', status),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettings: (callback) => ipcRenderer.on('pet-settings', (_event, settings) => callback(settings)),
  onAction: (callback) => ipcRenderer.on('pet-action', (_event, action) => callback(action)),
  onCursor: (callback) => ipcRenderer.on('cursor', (_event, offset) => callback(offset)),
  showMenu: (context) => ipcRenderer.send('show-menu', context),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.invoke('drag-end'),
});
