const { app, BrowserWindow, ipcMain, powerMonitor, screen, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const SIZES = { small: 128, medium: 176, large: 224 };
const PET_GAP = 8;
const HOME_MARGIN_X = 20;
const HOME_MARGIN_BOTTOM = 60;
const REAP_EVERY = 5000;
const SYSTEM_SAMPLE_EVERY = 10000;
// Claude Code hooks (hooks/clawd-hook.js) POST activity events here.
const EVENT_PORT = Number(process.env.CLAWD_PORT) || 47321;
const SWITCHES = ['--show', '--hide', '--quit', '--startup-on', '--startup-off', '--launch-on', '--launch-off'];
const DRAG_FRAME = 16;           // ms between window moves while dragging
const DRAG_MAX = 60 * 1000;      // stop following the cursor if the mouse-up never arrives
const NEAR_TASKBAR = 80;         // px: a drop this close to the bottom bounces
const CURSOR_EVERY = 100;        // ms between cursor checks
const CURSOR_RANGE = 700;        // px: farther cursor positions aren't sent to the pets

// How lively the pets are (renderer/behavior.js MODES) and the break reminders.
const MODES = [['kalem', 'Kalem'], ['teman', 'Teman kerja'], ['jahil', 'Jahil'], ['fokus', 'Fokus']];
const REMINDERS = [['water', 'Minum air'], ['stretch', 'Peregangan'], ['eyes', 'Istirahat mata']];

// pets[0] is the home pet: always present, even with no Claude Code session.
// Every further Claude Code session gets its own pet next to it.
const pets = [];
let tray;
let hiddenByUser = false;
let config = {
  autoStart: true,
  launchWithClaude: true,
  size: 'medium',
  x: null,
  y: null,
  mode: 'teman',
  reminders: { water: true, stretch: true, eyes: true },
};
let saveTimer = null;

app.commandLine.appendSwitch('disable-background-timer-throttling');

// --- persisted settings ------------------------------------------------------

function configPath() {
  return path.join(app.getPath('userData'), 'clawd-config.json');
}

function loadConfig() {
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(configPath(), 'utf8')));
  } catch {
    // first run or unreadable file: keep defaults
  }
}

function writeConfigNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('[clawd] cannot save config:', err.message);
  }
}

function saveConfigSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeConfigNow, 1000);
}

// --- geometry ------------------------------------------------------------------

function petSize() {
  const n = SIZES[config.size] || Number(config.size);
  return Number.isFinite(n) ? Math.min(512, Math.max(64, Math.round(n))) : SIZES.medium;
}

function homePosition(size) {
  const { x, y, height } = screen.getPrimaryDisplay().workArea;
  return { x: x + HOME_MARGIN_X, y: y + height - size - HOME_MARGIN_BOTTOM };
}

function isOnScreen(x, y, size) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    x >= a.x && y >= a.y && x + size <= a.x + a.width && y + size <= a.y + a.height);
}

function startPosition(size) {
  if (Number.isFinite(config.x) && Number.isFinite(config.y) && isOnScreen(config.x, config.y, size)) {
    return { x: config.x, y: config.y };
  }
  return homePosition(size);
}

// Extra pets sit next to the home pet: the same row first, then the rows
// above and below, skipping spots that are off screen or already taken.
function slotPosition(size) {
  const [hx, hy] = pets[0].win.getPosition();
  const step = size + PET_GAP;
  const taken = pets.map((p) => p.win.getPosition());
  const isFree = (x, y) => isOnScreen(x, y, size)
    && taken.every(([tx, ty]) => Math.abs(tx - x) >= size || Math.abs(ty - y) >= size);
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];
  for (const dy of offsets) {
    for (const dx of offsets) {
      const x = hx + dx * step;
      const y = hy + dy * step;
      if (isFree(x, y)) return { x, y };
    }
  }
  return { x: hx, y: hy };
}

// setPosition grows the window a few pixels per call under fractional DPI
// scaling (e.g. 150%); setBounds with an explicit size keeps it fixed.
function placePet(pet, { x, y }) {
  const size = petSize();
  pet.win.setBounds({ x, y, width: size, height: size });
}

function ensureOnScreen() {
  const size = petSize();
  pets.forEach((pet, i) => {
    const [x, y] = pet.win.getPosition();
    if (!isOnScreen(x, y, size)) placePet(pet, i === 0 ? homePosition(size) : slotPosition(size));
  });
}

// --- dragging (renderer/input.js asks; the window then follows the cursor) ---------

function startDrag(pet) {
  stopDrag(pet);
  const cursor = screen.getCursorScreenPoint();
  const [x, y] = pet.win.getPosition();
  const offset = { x: cursor.x - x, y: cursor.y - y };
  const startedAt = Date.now();
  pet.drag = setInterval(() => {
    if (pet.win.isDestroyed() || Date.now() - startedAt > DRAG_MAX) {
      stopDrag(pet);
      return;
    }
    const p = screen.getCursorScreenPoint();
    placePet(pet, { x: p.x - offset.x, y: p.y - offset.y });
  }, DRAG_FRAME);
}

function stopDrag(pet) {
  if (!pet.drag) return false;
  clearInterval(pet.drag);
  pet.drag = null;
  return true;
}

// Ends a drag: keep the pet inside the work area of the screen it was dropped on,
// remember where the home pet now lives, and tell the renderer how it landed.
function dropPet(pet) {
  if (!stopDrag(pet) || pet.win.isDestroyed()) return { moved: false };
  const size = petSize();
  const [x, y] = pet.win.getPosition();
  const area = screen.getDisplayNearestPoint({ x: x + size / 2, y: y + size / 2 }).workArea;
  const nx = Math.min(Math.max(x, area.x), area.x + area.width - size);
  const ny = Math.min(Math.max(y, area.y), area.y + area.height - size);
  placePet(pet, { x: nx, y: ny });
  if (pet === pets[0]) {
    config.x = nx;
    config.y = ny;
    saveConfigSoon();
  }
  return { moved: true, nearBottom: ny + size >= area.y + area.height - NEAR_TASKBAR };
}

// --- pets ----------------------------------------------------------------------

// `claude` tells the renderer whether this pet follows a Claude Code session
// or the laptop itself.
function metaFor(pet) {
  return { number: pets.indexOf(pet) + 1, total: pets.length, project: pet.project, claude: Boolean(pet.session) };
}

function broadcastMeta() {
  for (const pet of pets) {
    if (!pet.win.isDestroyed()) pet.win.webContents.send('pet-meta', metaFor(pet));
  }
  updateTrayTooltip();
}

function sendEvent(pet, ev) {
  if (pet.ready) pet.win.webContents.send('claude-event', ev);
  else if (pet.queue.length < 20) pet.queue.push(ev);
}

function createPet(session = null) {
  const size = petSize();
  const index = pets.length;
  const win = new BrowserWindow({
    width: size,
    height: size,
    ...(index === 0 ? startPosition(size) : slotPosition(size)),
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  const pet = { win, session, pid: null, project: '', status: { state: 'idle', label: 'santai' }, ready: false, queue: [], drag: null };
  pets.push(pet);

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.once('did-finish-load', () => {
    pet.ready = true;
    pet.queue.splice(0).forEach((ev) => sendEvent(pet, ev));
  });
  win.once('ready-to-show', () => {
    if (!hiddenByUser) win.showInactive();
  });

  // Keep the pet alive if its renderer ever crashes.
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.reload();
  });

  win.on('closed', () => {
    stopDrag(pet);
    const i = pets.indexOf(pet);
    if (i !== -1) pets.splice(i, 1);
    broadcastMeta();
  });

  broadcastMeta();
  return pet;
}

function showPets() {
  hiddenByUser = false;
  for (const pet of pets) {
    pet.win.showInactive();
    pet.win.moveTop();
  }
}

function hidePets() {
  hiddenByUser = true;
  for (const pet of pets) pet.win.hide();
}

// --- Claude Code sessions ------------------------------------------------------

// One pet per Claude Code process (CLAUDE_PID); session_id is the fallback.
function sessionKey(ev) {
  if (ev.pid) return `pid:${ev.pid}`;
  if (ev.session) return `session:${ev.session}`;
  return null;
}

function petForSession(key) {
  if (!key) return pets[0];
  const bound = pets.find((p) => p.session === key);
  if (bound) return bound;
  const free = pets.find((p) => !p.session);
  if (free) {
    free.session = key;
    broadcastMeta();
    return free;
  }
  return createPet(key);
}

function releasePet(pet) {
  if (pet !== pets[0]) {
    pet.win.destroy();
    return;
  }
  pet.session = null;
  pet.pid = null;
  pet.project = '';
  sendEvent(pet, { event: 'SessionEnd' });
  // Keep one pet per session: the home pet takes over the newest extra session.
  const extra = pets[pets.length - 1];
  if (extra !== pet) {
    Object.assign(pet, { session: extra.session, pid: extra.pid, project: extra.project });
    extra.win.destroy();
  }
  broadcastMeta();
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function reapClosedSessions() {
  for (const pet of [...pets]) {
    if (!pet.win.isDestroyed() && pet.pid && !isAlive(pet.pid)) releasePet(pet);
  }
}

function handleClaudeEvent(ev) {
  const pet = petForSession(sessionKey(ev));
  if (ev.pid) pet.pid = ev.pid;
  if (ev.project && ev.project !== pet.project) {
    pet.project = ev.project;
    broadcastMeta();
  }
  // Opening Claude Code always brings Clawd back, even after "Hide".
  if (ev.event === 'SessionStart' && hiddenByUser) showPets();

  sendEvent(pet, { event: ev.event, tool: ev.tool, kind: ev.kind, notification: ev.notification });

  // Without a pid there is no process to watch, so trust SessionEnd (not /clear).
  if (ev.event === 'SessionEnd' && !pet.pid && pet.session && ev.reason !== 'clear') releasePet(pet);
}

// --- laptop state (what the pet reacts to without Claude Code) --------------------

function broadcastSystem(message) {
  for (const pet of pets) {
    if (pet.ready && !pet.win.isDestroyed()) pet.win.webContents.send('system-event', message);
  }
}

function cpuTimes() {
  return os.cpus().reduce((sum, { times: t }) => {
    sum.idle += t.idle;
    sum.total += t.user + t.nice + t.sys + t.idle + t.irq;
    return sum;
  }, { idle: 0, total: 0 });
}

let lastCpu = cpuTimes();

function sampleSystem() {
  const now = cpuTimes();
  const total = now.total - lastCpu.total;
  const idle = now.idle - lastCpu.idle;
  lastCpu = now;
  broadcastSystem({
    type: 'sample',
    cpu: total > 0 ? Math.round(100 * (1 - idle / total)) : 0,
    memory: Math.round(100 * (1 - os.freemem() / os.totalmem())),
    idleSeconds: powerMonitor.getSystemIdleTime(),
    onBattery: powerMonitor.isOnBatteryPower(),
  });
}

function watchSystem() {
  for (const type of ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery']) {
    powerMonitor.on(type, () => broadcastSystem({ type }));
  }
  setInterval(sampleSystem, SYSTEM_SAMPLE_EVERY);
}

// Where the cursor is relative to each pet (its body, not the window corner), so
// it can notice the cursor coming, going and circling outside its own window.
// Sent only while the cursor is within CURSOR_RANGE, plus once when it leaves.
function watchCursor() {
  let last = null;
  setInterval(() => {
    if (hiddenByUser) return;
    const p = screen.getCursorScreenPoint();
    if (last && last.x === p.x && last.y === p.y) return;
    last = p;
    const size = petSize();
    for (const pet of pets) {
      if (!pet.ready || pet.drag || pet.win.isDestroyed()) continue;
      const [x, y] = pet.win.getPosition();
      const dx = Math.round(p.x - (x + size / 2));
      const dy = Math.round(p.y - (y + size * 0.7));
      const near = Math.hypot(dx, dy) <= CURSOR_RANGE;
      if (near || pet.cursorNear) pet.win.webContents.send('cursor', { dx, dy });
      pet.cursorNear = near;
    }
  }, CURSOR_EVERY);
}

// --- tray & settings -------------------------------------------------------------

function updateTrayTooltip() {
  if (!tray) return;
  const parts = pets.map((p, i) => {
    const number = pets.length > 1 ? `#${i + 1} ` : '';
    const project = p.project ? `${p.project}: ` : '';
    return `${number}${project}${p.status.label || p.status.state}`;
  });
  tray.setToolTip(`Claude Pet — ${parts.join(' | ')}`.slice(0, 127));
}

function applyLoginItem() {
  // In dev (`npm start`) execPath is the bare electron.exe without the project
  // path, so registering it would launch the default Electron app at login.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: config.autoStart, name: 'ClaudePet' });
  }
}

function setAutoStart(on) {
  config.autoStart = on;
  writeConfigNow();
  applyLoginItem();
  if (tray) buildTrayMenu();
}

function setLaunchWithClaude(on) {
  config.launchWithClaude = on;
  writeConfigNow();
  if (tray) buildTrayMenu();
}

function setSize(value) {
  if (!(value in SIZES) && !/^\d+$/.test(value)) return;
  config.size = value;
  writeConfigNow();
  for (const pet of pets) {
    const [x, y] = pet.win.getPosition();
    placePet(pet, { x, y });
  }
  ensureOnScreen();
  if (tray) buildTrayMenu();
}

// What the renderers need to know: the mode and which reminders are on.
function petSettings() {
  const [mode, modeLabel] = MODES.find(([value]) => value === config.mode) || MODES[1];
  const on = config.reminders || {};
  return { mode, modeLabel, reminders: Object.fromEntries(REMINDERS.map(([key]) => [key, on[key] !== false])) };
}

function broadcastSettings() {
  for (const pet of pets) {
    if (!pet.win.isDestroyed()) pet.win.webContents.send('pet-settings', petSettings());
  }
}

function setMode(value) {
  if (!MODES.some(([v]) => v === value)) return;
  config.mode = value;
  writeConfigNow();
  broadcastSettings();
  if (tray) buildTrayMenu();
}

function setReminder(key, on) {
  config.reminders = { ...config.reminders, [key]: on };
  writeConfigNow();
  broadcastSettings();
  if (tray) buildTrayMenu();
}

const modeMenu = () => MODES.map(([value, label]) => ({
  label,
  type: 'radio',
  checked: petSettings().mode === value,
  click: () => setMode(value),
}));

const reminderMenu = () => REMINDERS.map(([key, label]) => ({
  label,
  type: 'checkbox',
  checked: petSettings().reminders[key],
  click: (item) => setReminder(key, item.checked),
}));

// Right-click on a pet. Actions go back to that pet's renderer (behavior.js onAction).
function showPetMenu(pet, context) {
  const act = (action) => () => {
    if (!pet.win.isDestroyed()) pet.win.webContents.send('pet-action', action);
  };
  const items = [];
  if (context.reminder) {
    items.push(
      { label: 'Udah, makasih', click: act({ type: 'reminder-done' }) },
      { label: 'Tunda 10 menit', click: act({ type: 'reminder-snooze' }) },
      { type: 'separator' },
    );
  }
  items.push(
    {
      label: 'Kasih makan',
      submenu: [
        { label: 'Kue', click: act({ type: 'feed', item: 'cookie' }) },
        { label: 'Kopi', click: act({ type: 'feed', item: 'coffee' }) },
        { label: 'Makanan pedas', click: act({ type: 'feed', item: 'spicy' }) },
      ],
    },
    { label: 'Ajak tos', click: act({ type: 'high-five' }) },
    {
      label: 'Main',
      submenu: context.playing
        ? [{ label: 'Berhenti main', click: act({ type: 'game-stop' }) }]
        : [
          { label: 'Suit (batu-gunting-kertas)', click: act({ type: 'game', name: 'suit' }) },
          { label: 'Tebak tangan', click: act({ type: 'game', name: 'tebak' }) },
          { label: 'Tepuk serangga', click: act({ type: 'game', name: 'serangga' }) },
        ],
    },
    context.napping
      ? { label: 'Bangunin', click: act({ type: 'wake' }) }
      : { label: 'Suruh istirahat', click: act({ type: 'nap' }) },
    { type: 'separator' },
    { label: 'Mode', submenu: modeMenu() },
    { label: 'Pengingat', submenu: reminderMenu() },
    { type: 'separator' },
    { label: 'Sembunyikan', click: hidePets },
  );
  Menu.buildFromTemplate(items).popup({ window: pet.win });
}

function buildTrayMenu() {
  const sizeItem = (label, value) => ({
    label,
    type: 'radio',
    checked: config.size === value,
    click: () => setSize(value),
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: showPets },
    { label: 'Hide', click: hidePets },
    { type: 'separator' },
    { label: 'Size', submenu: [sizeItem('Small', 'small'), sizeItem('Medium', 'medium'), sizeItem('Large', 'large')] },
    { label: 'Mode', submenu: modeMenu() },
    { label: 'Reminders', submenu: reminderMenu() },
    {
      label: 'Show when Claude Code starts',
      type: 'checkbox',
      checked: config.launchWithClaude !== false,
      click: (item) => setLaunchWithClaude(item.checked),
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: config.autoStart,
      enabled: app.isPackaged,
      click: (item) => setAutoStart(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.ico');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  buildTrayMenu();
  updateTrayTooltip();
}

// --- local event server ------------------------------------------------------------

const shortString = (v) => (typeof v === 'string' ? v.slice(0, 64) : undefined);

function startEventServer() {
  const server = http.createServer((req, res) => {
    // Browsers attach Origin to cross-site requests; hook scripts and curl don't.
    if (req.headers.origin) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        visible: !hiddenByUser,
        autoStart: config.autoStart,
        launchWithClaude: config.launchWithClaude !== false,
        size: config.size,
        pets: pets.map((p, i) => {
          const [x, y] = p.win.getPosition();
          return { number: i + 1, project: p.project || null, state: p.status.state, label: p.status.label, x, y };
        }),
      }));
      return;
    }
    const isJson = String(req.headers['content-type'] || '').startsWith('application/json');
    if (req.method !== 'POST' || req.url !== '/event' || !isJson) {
      res.writeHead(404).end();
      return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16 * 1024) req.destroy();
    });
    req.on('end', () => {
      let ev;
      try {
        ev = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (!ev || typeof ev.event !== 'string') {
        res.writeHead(400).end();
        return;
      }
      handleClaudeEvent({
        event: shortString(ev.event),
        tool: shortString(ev.tool),
        kind: shortString(ev.kind),
        notification: shortString(ev.notification),
        reason: shortString(ev.reason),
        session: shortString(ev.session),
        project: shortString(ev.project),
        pid: Number.isInteger(ev.pid) && ev.pid > 0 ? ev.pid : null,
      });
      res.writeHead(204).end();
    });
  });

  server.on('error', (err) => console.error('[clawd] event server:', err.message));
  server.listen(EVENT_PORT, '127.0.0.1');
}

const petFor = (webContents) => pets.find((p) => !p.win.isDestroyed() && p.win.webContents === webContents);

ipcMain.handle('get-pet-meta', (event) => {
  const pet = petFor(event.sender);
  return pet ? metaFor(pet) : null;
});

ipcMain.on('pet-status', (event, s) => {
  const pet = petFor(event.sender);
  if (!pet) return;
  pet.status = { state: shortString(s && s.state), label: shortString(s && s.label) };
  updateTrayTooltip();
});

ipcMain.handle('get-settings', () => petSettings());

ipcMain.on('show-menu', (event, context) => {
  const pet = petFor(event.sender);
  if (!pet) return;
  const flag = (key) => Boolean(context && context[key]);
  showPetMenu(pet, { reminder: flag('reminder'), napping: flag('napping'), playing: flag('playing') });
});

ipcMain.on('drag-start', (event) => {
  const pet = petFor(event.sender);
  if (pet) startDrag(pet);
});

ipcMain.handle('drag-end', (event) => {
  const pet = petFor(event.sender);
  return pet ? dropPet(pet) : { moved: false };
});

// --- command-line control (clawd.cmd: ClaudePet.exe --hide, --size=large, ...) ----

function parseArgs(argv) {
  const size = argv.find((a) => a.startsWith('--size='));
  return {
    flags: new Set(argv.filter((a) => SWITCHES.includes(a))),
    size: size ? size.slice('--size='.length) : null,
  };
}

function applySettings({ flags, size }) {
  if (flags.has('--startup-on')) setAutoStart(true);
  if (flags.has('--startup-off')) setAutoStart(false);
  if (flags.has('--launch-on')) setLaunchWithClaude(true);
  if (flags.has('--launch-off')) setLaunchWithClaude(false);
  if (size) setSize(size);
}

// A plain launch (no switches) means "show me the pet".
const wantsPet = ({ flags, size }) =>
  flags.has('--show') || flags.has('--hide') || (flags.size === 0 && !size);

function applyArgs(args) {
  applySettings(args);
  if (args.flags.has('--quit')) app.quit();
  else if (args.flags.has('--hide')) hidePets();
  else if (wantsPet(args)) showPets();
}

const startArgs = parseArgs(process.argv);

// Only one Clawd process: a second launch forwards its switches and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => applyArgs(parseArgs(argv)));

  app.whenReady().then(() => {
    loadConfig();
    applySettings(startArgs);

    // `clawd off`, `clawd size large`, ... while Clawd isn't running: save and exit.
    if (startArgs.flags.has('--quit') || !wantsPet(startArgs)) {
      app.quit();
      return;
    }

    hiddenByUser = startArgs.flags.has('--hide');
    createTray();
    createPet();
    startEventServer();
    applyLoginItem();
    setInterval(reapClosedSessions, REAP_EVERY);
    watchSystem();
    watchCursor();

    screen.on('display-removed', ensureOnScreen);
    screen.on('display-metrics-changed', ensureOnScreen);
  });
}

app.on('before-quit', () => {
  if (saveTimer) writeConfigNow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
