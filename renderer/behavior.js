// Clawd's brain. Each pet follows one of two things:
//  - a Claude Code session (meta.claude): reacts to hook events from main.js;
//  - otherwise the laptop itself: user away/back, CPU, RAM, network, battery.
// Whenever nothing is going on, it idles according to the time of day and the
// mode the user picked (kalem / teman / jahil / fokus). The user can poke, pet,
// drag and feed it (renderer/input.js, right-click menu), and the home pet
// brings the break reminders.
//
// What shows, highest first: drag > one-off reaction (flash) > permission
// prompt > reminder > waiting for a high five > Claude working > nap > idle.

const MINUTE = 60 * 1000;
const WORK_TIMEOUT = 5 * MINUTE;    // no hook event this long: treat Claude as idle
const LONG_WAIT = 2 * MINUTE;       // Claude quiet this long mid-task: "this takes a while"
const NAP_AFTER = 20 * MINUTE;      // nothing happening this long: take a nap
const LATE_NAP_AFTER = 5 * MINUTE;  // after 22:00 Clawd gets sleepy sooner
const RECENTLY_BUSY = 30 * MINUTE;
const MANUAL_NAP = 15 * MINUTE;     // "Suruh istirahat" from the menu
const HIGH_FIVE_WAIT = 6000;
const TRICK_COOLDOWN = 20 * MINUTE; // a trick played this recently isn't picked again
const LONG_TIME_NO_SEE = 3 * 60 * MINUTE;
const TICK = 15 * 1000;

const AWAY_AFTER_SECONDS = 5 * 60;  // no keyboard/mouse input this long: user is away
const CPU_BUSY = 85;                // percent, two samples in a row
const MEMORY_FULL = 90;             // percent
const BATTERY_LOW = 0.2;
const BATTERY_CRITICAL = 0.1;
const BATTERY_FULL = 0.99;
const BATTERY_NAG_EVERY = { low: 15 * MINUTE, critical: 5 * MINUTE };

// Per mode: how often a trick plays (ms range), which tricks, how much sparkle,
// and whether the hourly chime rings. Fokus plays nothing on its own.
const MODES = {
    kalem: { trickEvery: [8 * MINUTE, 15 * MINUTE], tricks: 'calm', fx: 'min', chimes: true },
    teman: { trickEvery: [4 * MINUTE, 8 * MINUTE], tricks: 'normal', fx: 'full', chimes: true },
    jahil: { trickEvery: [1.5 * MINUTE, 4 * MINUTE], tricks: 'jahil', fx: 'full', chimes: true },
    fokus: { trickEvery: null, tricks: null, fx: 'off', chimes: false },
};

// Idle tricks. `say` adds a speech bubble; the jahil-only ones are little pranks.
// `ms` overrides how long one plays (the art's own loop length otherwise).
const TRICKS = [
    { state: 'idle-reading', sets: ['calm', 'normal', 'jahil'] },
    { state: 'idle-look', sets: ['calm', 'normal', 'jahil'] },
    { state: 'idle-yawn', sets: ['calm'] },
    { state: 'bubbles', sets: ['calm', 'normal', 'jahil'] },
    { state: 'juggling', sets: ['normal', 'jahil'] },
    { state: 'sweeping', sets: ['normal', 'jahil'] },
    { state: 'carrying', sets: ['normal', 'jahil'] },
    { state: 'react-double-jump', sets: ['normal', 'jahil'] },
    { state: 'yoyo', sets: ['normal', 'jahil'], ms: 8000 },
    { state: 'fishing', sets: ['normal', 'jahil'] },
    { state: 'dumbbell', sets: ['normal', 'jahil'] },
    { state: 'dance', sets: ['normal', 'jahil'], ms: 6000 },
    { state: 'folder', sets: ['jahil'] },
    { state: 'hide-sign', sets: ['jahil'], ms: 10000 },
    { state: 'potato', sets: ['jahil'], say: '🥔' },
    { id: 'scheming', state: 'ultrathink', sets: ['jahil'], say: 'Lagi mikirin cara ngerjain kamu...' },
    { id: 'not-my-bug', state: 'react-annoyed', sets: ['jahil'], say: 'Bug ini bukan salah aku 👀' },
    { id: 'maintenance', state: 'sleeping', sets: ['jahil'], say: 'Sedang maintenance 🚧', ms: 6000 },
    { id: 'upside-down', state: 'idle-reading', sets: ['jahil'], say: 'Baca buku... eh kebalik 🙃', ms: 4000 },
    { id: 'detective', state: 'react-double', sets: ['jahil'], say: 'Siapa yang makan kueku?! ...oh, aku sendiri' },
];

const FOODS = {
    cookie: { state: 'eat', say: 'Nyam nyam! Makasih 🍪', burst: 'hearts', label: 'Makan kue' },
    coffee: { state: 'ultrathink', say: 'KOPI!! Semangat banget!!! ☕', burst: 'sparks', label: 'Kebanyakan kopi', ms: 4000 },
    spicy: { state: 'fire', say: 'Pedeees! 🔥🔥', label: 'Kepedesan' },
};

const GREETINGS = ['Hai! 👋', 'Ada apa? 👀', 'Hehe', 'Lagi ngapain?', 'Semangat ngodingnya!'];

// Break reminders, shown by the home pet while the user is at the laptop.
const REMINDERS = {
    eyes: { every: 30 * MINUTE, state: 'eye-rest', text: 'Lihat jauh 20 detik 👀' },
    water: { every: 60 * MINUTE, state: 'drink', text: 'Minum air dulu yuk 💧' },
    stretch: { every: 90 * MINUTE, state: 'stretch', text: 'Peregangan bentar yuk 🙆' },
};
const REMINDER_SHOWN_FOR = 3 * MINUTE;  // then it counts as seen
const REMINDER_SNOOZE = 10 * MINUTE;
const AWAY_COUNTS_AS = ['eyes', 'stretch'];  // being away 5+ minutes is that break

// What Clawd does while a given Claude Code tool runs.
const TOOL_STATES = [
    [/^(Edit|MultiEdit|Write|NotebookEdit)$/, 'typing'],
    [/^(Read|Grep|Glob|LS)$/, 'idle-reading'],
    [/^(Task|Agent)$/, 'conducting'],
    [/^(WebFetch|WebSearch)$/, 'juggling'],
    [/^TodoWrite$/, 'sweeping'],
    [/^mcp__/, 'juggling'],
];
// Shell commands, classified by hooks/clawd-hook.js.
const SHELL_STATES = { git: 'carrying', test: 'debugger', build: 'building', install: 'building' };

const CLAUDE_LABELS = {
    thinking: 'Claude lagi mikir',
    typing: 'Claude lagi nulis kode',
    'idle-reading': 'Claude lagi baca file',
    conducting: 'Claude lagi ngatur subagent',
    juggling: 'Claude lagi multitasking',
    sweeping: 'Claude lagi beres-beres',
    carrying: 'Claude lagi ngurus git',
    debugger: 'Claude lagi ngetes',
    building: 'Claude lagi jalanin command',
    notification: 'Claude butuh jawaban kamu',
    error: 'Ada yang error!',
    happy: 'Claude selesai!',
    'react-double-jump': 'Halo!',
    'react-annoyed': 'Udah malam, istirahat gih',
};

const badge = document.getElementById('badge');

let claudeMode = false;  // this pet follows a Claude Code session
let petNumber = 1;
let work = null;         // looping state while Claude is busy
let hold = null;         // state that waits for the user (permission prompt)
let lastActiveAt = Date.now();
let flashUntil = 0;
let flashTimer = null;
let lastReported = '';
let lastHour = new Date().getHours();
let lastLateNagHour = -1;
let nextTrickAt = Infinity;

let settings = { mode: 'teman', modeLabel: 'Teman kerja', reminders: { water: true, stretch: true, eyes: true } };
let dragging = false;
let napUntil = 0;
let highFiveUntil = 0;
let highFiveTimer = null;
let reminder = null;     // { key, text, until } while a reminder is up
let game = null;         // { state, prompt } while a mini-game runs (renderer/games.js)
const reminderDue = {};
for (const [key, { every }] of Object.entries(REMINDERS)) reminderDue[key] = Date.now() + every;

let system = { cpu: 0, memory: 0, idleSeconds: 0 };
let busySamples = 0;
let userAway = false;
let online = navigator.onLine;
let battery = null;
let lastBatteryNagAt = 0;
let announcedFull = false;

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A state from assets/svg/clawd-act-*.svg, or an older one if that file is missing.
const art = (state, fallback) => (pet.has(state) ? state : fallback);

// Laptop-wide alerts come from pet #1 only, so several pets don't chorus.
const isHomePet = () => petNumber === 1;
const mode = () => MODES[settings.mode] || MODES.teman;
const napping = () => Date.now() < napUntil;
const waitingForHighFive = () => Date.now() < highFiveUntil;
const asking = () => claudeMode && hold;
// Something already has Clawd's attention: no hover or wave reaction now.
const busy = () => reminder || asking() || game || work || napping() || waitingForHighFive()
    || Date.now() < flashUntil;

// --- memory (kept across restarts, shared by all pets) -------------------------

const MEMORY_KEY = 'clawd-memory';

function loadMemory() {
    const empty = { recent: [], food: {}, lastTouch: null, games: {} };
    try {
        return { ...empty, ...JSON.parse(localStorage.getItem(MEMORY_KEY)) };
    } catch {
        return empty;
    }
}

// Re-read before writing: another pet may have changed it meanwhile.
function remember(change) {
    const memory = loadMemory();
    change(memory);
    memory.recent = memory.recent.slice(-20);
    try {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
    } catch {
        // storage unavailable: Clawd just forgets
    }
    return memory;
}

// --- speech & effects ------------------------------------------------------------

// Passing lines and particles stay out of the way of an important message.
function say(text, ms) {
    if (!reminder && !asking()) fx.say(text, ms);
}

function burst(kind) {
    if (!reminder && !asking()) fx.burst(kind);
}

function stickyText() {
    if (asking()) return 'Butuh kamu! 🙋';
    if (reminder) return reminder.text;
    if (game) return game.prompt;
    if (waitingForHighFive()) return 'Tos! Klik aku ✋';
    return null;
}

// --- what to show ------------------------------------------------------------------

function report(state, label) {
    const text = label || CLAUDE_LABELS[state] || state;
    if (text === lastReported) return;
    lastReported = text;
    window.electronAPI.reportStatus({ state, label: text });
}

function idleState() {
    const hour = new Date().getHours();
    if (userAway) return { state: 'sleeping', label: 'Nungguin kamu balik' };
    if (!claudeMode) {
        if (!online) return { state: art('antenna', 'react-annoyed'), label: 'Internet putus' };
        if (busySamples >= 2) return { state: 'building', label: `Laptop kerja keras (CPU ${system.cpu}%)` };
        if (system.memory >= MEMORY_FULL) return { state: 'carrying', label: `RAM hampir penuh (${system.memory}%)` };
    }
    const quietFor = claudeMode ? Date.now() - lastActiveAt : system.idleSeconds * 1000;
    if (hour < 5) return { state: 'sleeping', label: 'tidur' };
    if (quietFor > NAP_AFTER) return { state: 'sleeping', label: 'ketiduran' };
    if (hour >= 22) {
        return quietFor > LATE_NAP_AFTER
            ? { state: 'sleeping', label: 'ngantuk, tidur duluan' }
            : { state: 'idle', label: 'santai malam' };
    }
    if (hour === 12) return { state: 'juggling', label: 'istirahat siang' };
    if (hour >= 18) return { state: 'idle-reading', label: 'baca-baca santai' };
    return { state: 'idle', label: claudeMode ? 'nunggu perintah' : 'jagain laptop' };
}

function show(state, label) {
    pet.loop(state);
    report(state, label);
}

function renderState() {
    if (dragging) return show('react-drag', 'Lagi diangkat');
    if (Date.now() < flashUntil) return undefined;
    if (asking()) return show(art('raise-hand', hold), CLAUDE_LABELS.notification);
    if (reminder) return show(art(REMINDERS[reminder.key].state, 'notification'), reminder.text);
    if (game) return show(game.state, 'Lagi main');
    if (waitingForHighFive()) return show('react-right', 'Nunggu tos');
    const quiet = Date.now() - lastActiveAt;
    if (claudeMode && work && quiet < WORK_TIMEOUT) {
        if (quiet >= LONG_WAIT) return show(art('wait-clock', 'idle-look'), 'Prosesnya lama, aku tungguin');
        return show(work);
    }
    work = null;
    if (napping()) return show('sleeping', 'Istirahat dulu');
    const { state, label } = idleState();
    return show(state, label);
}

function render() {
    renderState();
    fx.sticky(stickyText());
}

// Play a one-off reaction, then fall back to whatever render() decides.
// `ms` overrides the animation length; `say` and `burst` add a line and particles.
function flash(state, { times = 1, label, ms, say: line, burst: kind } = {}) {
    if (dragging || !pet.has(state)) return;
    clearTimeout(flashTimer);
    pet.once(state);
    report(state, label);
    const duration = ms || pet.duration(state) * times;
    if (line) say(line, Math.min(Math.max(duration, 2000), 4000));
    if (kind) burst(kind);
    flashUntil = Date.now() + duration;
    flashTimer = setTimeout(() => {
        flashUntil = 0;
        render();
    }, duration);
}

// --- Claude Code ---------------------------------------------------------------

function toolState(tool, kind) {
    if (tool === 'Bash' || tool === 'PowerShell') return SHELL_STATES[kind] || 'building';
    const match = TOOL_STATES.find(([pattern]) => pattern.test(tool || ''));
    return match ? match[1] : 'typing';
}

// Map one Claude Code hook event to { work, hold, flash, times, label, say, burst }.
// A failed Bash/PowerShell command (non-zero exit) arrives as PostToolUseFailure.
function effectFor({ event, tool, kind, notification }) {
    switch (event) {
        case 'SessionStart': return { flash: 'react-double-jump', label: 'Halo! Sesi Claude baru' };
        case 'UserPromptSubmit': return { work: 'thinking' };
        case 'PreToolUse': return { work: toolState(tool, kind) };
        case 'PostToolUse':
            return kind === 'test'
                ? { flash: art('stamp', 'happy'), label: 'Tes lulus!', say: 'Tes lulus ✅', burst: 'confetti' }
                : {};
        case 'SubagentStart': return { work: 'conducting' };
        case 'PreCompact': return { work: 'sweeping' };
        case 'PostToolUseFailure':
            return kind === 'test'
                ? { flash: 'error', times: 2, label: 'Tes gagal', say: 'Tes gagal ❌ hmm...' }
                : { flash: 'error', label: `${tool || 'Tool'} gagal` };
        case 'PermissionRequest': return { hold: 'notification' };
        case 'Notification':
            return ['permission_prompt', 'elicitation_dialog'].includes(notification)
                ? { hold: 'notification' }
                : { flash: 'notification', times: 2 };
        case 'Stop': return { work: null, flash: art('bell', 'happy'), label: CLAUDE_LABELS.happy };
        case 'StopFailure': return { work: null, flash: 'error', times: 3, label: 'Claude berhenti karena error' };
        case 'SessionEnd': return { work: null };
        default: return {};
    }
}

function onClaudeEvent(ev) {
    const effect = effectFor(ev);
    const wasAsleep = pet.current() === 'sleeping';
    lastActiveAt = Date.now();
    if (ev.event === 'UserPromptSubmit') napUntil = 0;

    // Any progress after a permission prompt means the user answered it.
    if (ev.event !== 'Notification' && ev.event !== 'PermissionRequest') hold = null;
    if ('work' in effect) work = effect.work;
    if (effect.hold) {
        hold = effect.hold;
        fx.clear();
    }

    const hour = new Date().getHours();
    if (ev.event === 'UserPromptSubmit' && hour < 5 && lastLateNagHour !== hour) {
        lastLateNagHour = hour;
        flash('react-annoyed', { times: 2, label: `Udah jam ${hour} pagi, jangan begadang` });
    } else if (effect.flash) {
        flash(effect.flash, effect);
    } else if (wasAsleep) {
        flash('react-double-jump', { label: 'Kebangun! Ayo kerja' });
    }
    render();
}

function applyMeta(meta) {
    if (!meta) return;
    petNumber = meta.number;
    badge.textContent = meta.number;
    badge.classList.toggle('show', meta.total > 1);
    if (meta.claude === claudeMode) return;
    claudeMode = meta.claude;
    work = null;
    hold = null;
    if (claudeMode) render();
    else flash('sweeping', { label: 'Claude ditutup, balik jagain laptop' });
}

// --- settings (mode, reminders) from the tray / right-click menu -----------------

function scheduleTrick() {
    const every = mode().trickEvery;
    nextTrickAt = every ? Date.now() + randomBetween(...every) : Infinity;
}

function applySettings(next, { quiet = false } = {}) {
    if (!next) return;
    const modeChanged = next.mode !== settings.mode;
    settings = next;
    fx.level = mode().fx;
    if (reminder && !settings.reminders[reminder.key]) reminder = null;
    if (modeChanged || nextTrickAt === Infinity) scheduleTrick();
    if (modeChanged && !quiet) say(`Mode ${settings.modeLabel}`, 2500);
    render();
}

// --- tricks ------------------------------------------------------------------------

function chooseTrick() {
    const set = mode().tricks;
    const playable = TRICKS.filter((t) => t.sets.includes(set) && pet.has(t.state) && t.state !== pet.current());
    const now = Date.now();
    const { recent } = loadMemory();
    const fresh = playable.filter((t) => !recent.some((r) => r.id === (t.id || t.state) && now - r.at < TRICK_COOLDOWN));
    const pool = fresh.length ? fresh : playable;
    return pool.length ? pick(pool) : null;
}

function playTrick() {
    const trick = chooseTrick();
    if (!trick) return;
    remember((m) => m.recent.push({ id: trick.id || trick.state, at: Date.now() }));
    flash(trick.state, { label: 'lagi main-main', say: trick.say, ms: trick.ms });
}

// --- the user poking the pet (renderer/input.js) and the right-click menu ----------

function touch(type) {
    const before = loadMemory().lastTouch;
    remember((m) => { m.lastTouch = { type, at: Date.now() }; });
    return before;
}

function greeting(lastTouch) {
    if (lastTouch && Date.now() - lastTouch.at > LONG_TIME_NO_SEE) return 'Akhirnya disapa juga! 🥹';
    return pick(GREETINGS);
}

function wakeUp() {
    napUntil = 0;
    flash('wake', { label: 'Kebangun', say: 'Hoaam... udah bangun!' });
}

function feed(item) {
    const food = FOODS[item];
    if (!food) return;
    const memory = remember((m) => { m.food[item] = (m.food[item] || 0) + 1; });
    touch('feed');
    const [favorite, most] = Object.entries(memory.food).reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
    const line = favorite === item && most >= 3 ? `${food.say} (favorit aku!)` : food.say;
    napUntil = 0;
    flash(food.state, { label: food.label, say: line, burst: food.burst, ms: food.ms });
}

function askHighFive() {
    clearTimeout(highFiveTimer);
    highFiveUntil = Date.now() + HIGH_FIVE_WAIT;
    render();
    highFiveTimer = setTimeout(() => {
        highFiveUntil = 0;
        render();
        say('Yah, nggak jadi tos 😢', 2000);
    }, HIGH_FIVE_WAIT);
}

function dismissReminder() {
    if (!reminder) return;
    const { key } = reminder;
    reminder = null;
    reminderDue[key] = Date.now() + REMINDERS[key].every;
    flash('happy', { label: 'Pengingat beres', say: 'Mantap! 👍', burst: 'confetti' });
    render();
}

function snoozeReminder() {
    if (!reminder) return;
    reminderDue[reminder.key] = Date.now() + REMINDER_SNOOZE;
    reminder = null;
    render();
    say('Oke, 10 menit lagi ya ⏰', 2500);
}

window.clawd = {
    click(side) {
        if (reminder) return dismissReminder();
        if (waitingForHighFive()) {
            clearTimeout(highFiveTimer);
            highFiveUntil = 0;
            touch('high-five');
            return flash('happy', { label: 'Tos!', say: 'Tos! ✋', burst: 'confetti' });
        }
        if (napping()) return wakeUp();
        if (asking()) return undefined;
        const lastTouch = touch('click');
        return flash(side === 'left' ? 'react-left' : 'react-right', { label: 'Disapa', say: greeting(lastTouch) });
    },
    doubleClick() {
        if (reminder) return dismissReminder();
        if (asking()) return undefined;
        touch('double-click');
        napUntil = 0;
        return flash('react-double-jump', { label: 'Salto!', say: 'Hup! 🤸', burst: 'stars' });
    },
    dizzy() {
        if (reminder || asking()) return;
        touch('dizzy');
        napUntil = 0;
        if (pet.has('dizzy')) {
            flash('dizzy', { label: 'Pusing', say: 'Pusiiing... 😵', ms: 4000 });
            return;
        }
        flash('react-annoyed', { label: 'Pusing', say: 'Pusiiing... 😵', burst: 'stars', ms: 3500 });
        fx.wobble(3500);
    },
    pet() {
        if (reminder || asking()) return;
        touch('pet');
        flash(napping() ? 'sleeping' : 'happy', { label: 'Dielus', say: 'Hehe, enak 😊', burst: 'hearts', ms: 2500 });
    },
    hover() {
        if (busy() || settings.mode === 'fokus') return;
        flash('idle-follow', { label: 'Merhatiin kamu', ms: 2500 });
    },
    // The cursor went away after a while near Clawd (renderer/input.js).
    wave() {
        if (busy() || settings.mode === 'fokus') return;
        flash(art('wave', 'react-right'), { label: 'Dadah', say: 'Dadah! 👋', ms: 2500 });
    },
    // The cursor kept circling Clawd.
    chased() {
        if (reminder || asking() || game || settings.mode === 'fokus') return;
        touch('chased');
        flash(art('dizzy', 'react-annoyed'), { label: 'Capek ngejar', say: 'Capek ngejar kamu... 😵', ms: 3500 });
    },

    // For renderer/games.js: what Clawd shows while a game runs (null ends it),
    // a one-off reaction, and that game's saved stats (`change` updates them).
    setGame(next) {
        game = next;
        if (game) {
            napUntil = 0;
            fx.clear();
        }
        render();
    },
    react: (state, options) => flash(state, options),
    stats(name, change) {
        const memory = remember((m) => {
            m.games = m.games || {};
            m.games[name] = m.games[name] || {};
            if (change) change(m.games[name]);
        });
        return memory.games[name];
    },
    dragStart() {
        clearTimeout(flashTimer);
        flashUntil = 0;
        napUntil = 0;
        dragging = true;
        touch('drag');
        render();
        say('Wiii! 🎈', 1500);
    },
    // Dropped near the taskbar it bounces; anywhere else it floats down on a parachute.
    drop({ nearBottom }) {
        dragging = false;
        if (nearBottom || !pet.has('parachute')) {
            if (nearBottom) fx.bounce();
            flash('react-double', {
                label: 'Mendarat',
                say: nearBottom ? 'Boing! 🛏️' : 'Di mana aku? 😳',
                burst: 'dust',
                ms: 2500,
            });
        } else {
            flash('parachute', { label: 'Mendarat', say: 'Wuuush~ 🪂' });
        }
        render();
    },
    menuContext: () => ({ reminder: Boolean(reminder), napping: napping(), playing: Boolean(game) }),
};

function onAction(action) {
    switch (action && action.type) {
        case 'feed': return feed(action.item);
        case 'high-five': return askHighFive();
        case 'nap':
            napUntil = Date.now() + MANUAL_NAP;
            return flash('idle-yawn', { label: 'Mau istirahat', say: 'Hoaam... tidur bentar ya 💤' });
        case 'wake': return wakeUp();
        case 'reminder-done': return dismissReminder();
        case 'reminder-snooze': return snoozeReminder();
        case 'game':
            if (reminder || asking()) return say('Nanti dulu ya, ada yang penting 🙏', 2500);
            return games.start(action.name);
        case 'game-stop': return games.stop();
        default: return undefined;
    }
}

// --- break reminders (home pet only) -------------------------------------------------

function checkReminders() {
    if (!isHomePet()) return;
    const now = Date.now();
    if (reminder) {
        if (now < reminder.until) return;
        reminderDue[reminder.key] = now + REMINDERS[reminder.key].every;  // shown long enough
        reminder = null;
        render();
        return;
    }
    if (userAway || dragging || asking() || game) return;
    const key = Object.keys(REMINDERS).find((k) => settings.reminders[k] && reminderDue[k] <= now);
    if (!key) return;
    reminder = { key, text: REMINDERS[key].text, until: now + REMINDER_SHOWN_FOR };
    clearTimeout(flashTimer);
    flashUntil = 0;
    fx.clear();
    render();
}

// --- the laptop ----------------------------------------------------------------

function onSample(sample) {
    system = sample;
    busySamples = sample.cpu >= CPU_BUSY ? busySamples + 1 : 0;
    const away = sample.idleSeconds >= AWAY_AFTER_SECONDS;
    if (userAway && !away) {
        userAway = false;
        for (const key of AWAY_COUNTS_AS) reminderDue[key] = Date.now() + REMINDERS[key].every;
        flash('react-double-jump', { label: 'Selamat datang balik!', say: 'Selamat datang balik!' });
        return;
    }
    userAway = away;
    render();
}

function onSystemEvent(message) {
    switch (message.type) {
        case 'sample':
            onSample(message);
            break;
        case 'resume':
        case 'unlock-screen':
            userAway = false;
            flash('react-double-jump', { label: 'Halo lagi!', say: 'Halo lagi!' });
            break;
        case 'on-ac':
            lastBatteryNagAt = 0;
            if (isHomePet()) flash('happy', { label: 'Ngecas, makasih!', burst: 'sparks' });
            break;
        case 'on-battery':
            if (isHomePet()) flash('notification', { label: 'Sekarang pakai baterai' });
            break;
        default:
            break;  // suspend / lock-screen: nobody is looking
    }
}

function checkBattery() {
    if (!battery || !isHomePet()) return;
    const level = battery.level;
    if (battery.charging) {
        if (level >= BATTERY_FULL && !announcedFull) {
            announcedFull = true;
            flash('happy', { label: 'Baterai penuh', say: 'Baterai penuh! 🔋', burst: 'sparks' });
        }
        return;
    }
    announcedFull = false;
    const kind = level <= BATTERY_CRITICAL ? 'critical' : level <= BATTERY_LOW ? 'low' : null;
    if (!kind || Date.now() - lastBatteryNagAt < BATTERY_NAG_EVERY[kind]) return;
    lastBatteryNagAt = Date.now();
    const percent = Math.round(level * 100);
    if (kind === 'critical') flash('error', { times: 3, label: `Baterai ${percent}%! Colokin charger sekarang` });
    else flash('react-annoyed', { times: 2, label: `Baterai tinggal ${percent}%` });
}

window.addEventListener('offline', () => {
    online = false;
    if (isHomePet()) flash(art('antenna', 'error'), { label: 'Internet putus', say: 'Sinyal ilang... 📡' });
});
window.addEventListener('online', () => {
    online = true;
    if (isHomePet()) flash('happy', { label: 'Internet nyambung lagi' });
});

if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
        battery = b;
        announcedFull = b.charging && b.level >= BATTERY_FULL;  // no cheer for a battery that was already full
        b.addEventListener('levelchange', checkBattery);
        b.addEventListener('chargingchange', () => {
            lastBatteryNagAt = 0;
            checkBattery();
        });
        checkBattery();
    }).catch(() => {});
}

// --- clock ---------------------------------------------------------------------

function onHourChange(hour) {
    const recentlyBusy = claudeMode && Date.now() - lastActiveAt < RECENTLY_BUSY;
    if (hour < 5) {
        if (recentlyBusy) flash('react-annoyed', { times: 2, label: `Udah jam ${hour}, tidur gih` });
        return;
    }
    // Don't interrupt work, a nap or a reminder for a chime; Fokus has none.
    if (work || hold || userAway || reminder || napping() || !mode().chimes) return;
    if (hour === 6) flash('react-double-jump', { label: 'Selamat pagi!', say: 'Selamat pagi! ☀️' });
    else if (hour === 12) flash('happy', { label: 'Waktunya makan siang', say: 'Waktunya makan siang 🍱' });
    else if (hour === 18) flash('sweeping', { label: 'Sore! Beres-beres dulu' });
    else if (hour === 22) flash('notification', { times: 2, label: 'Udah jam 10 malam', say: 'Udah jam 10 malam 🌙' });
    else if (hour > 6 && hour < 22) flash('notification', { label: `Ting! Jam ${hour}` });
}

function onTick() {
    const hour = new Date().getHours();
    if (hour !== lastHour) {
        lastHour = hour;
        onHourChange(hour);
    }
    checkBattery();
    checkReminders();

    const free = !work && !hold && !reminder && !game && !dragging && !napping() && !waitingForHighFive()
        && Date.now() >= flashUntil;
    if (free && Date.now() >= nextTrickAt) {
        scheduleTrick();
        if (idleState().state === 'idle') playTrick();
    }
    render();
}

window.electronAPI.onClaudeEvent(onClaudeEvent);
window.electronAPI.onSystemEvent(onSystemEvent);
window.electronAPI.onMeta(applyMeta);
window.electronAPI.onAction(onAction);
window.electronAPI.onSettings((s) => applySettings(s));
window.electronAPI.getMeta().then(applyMeta);
window.electronAPI.getSettings().then((s) => applySettings(s, { quiet: true }));
if (idleState().state === 'sleeping') render();
else flash('react-double-jump', { label: 'Halo! Clawd siap nemenin' });
setInterval(onTick, TICK);
