// Mouse gestures on the pet window, passed on to behavior.js (window.clawd):
// click (left/right half), double click, many clicks, petting (stroking the
// cursor back and forth), hovering, dragging and the right-click menu.
// The drag itself is done by main.js, which moves the window with the cursor;
// a CSS app-region drag would swallow every click.

(() => {
    const api = window.electronAPI;
    const root = document.documentElement;

    const DRAG_THRESHOLD = 4;      // px the cursor moves before a press becomes a drag
    const CLICK_GAP = 280;         // ms to wait for a second click
    const DIZZY_CLICKS = 5;        // this many clicks ...
    const DIZZY_WINDOW = 2000;     // ... within this many ms make Clawd dizzy
    const PET_SWINGS = 4;          // back-and-forth turns of the cursor ...
    const PET_WINDOW = 1500;       // ... within this many ms count as petting
    const PET_COOLDOWN = 4000;
    const HOVER_COOLDOWN = 30000;
    // The cursor outside the window (main.js sends its offset from Clawd's body):
    const NEAR = 220;              // px: closer than this, Clawd notices it
    const GONE = 450;              // px: back beyond this after a while near: wave goodbye
    const STAYED = 1500;           // ms near before leaving counts as a goodbye
    const WAVE_COOLDOWN = 60000;
    const CIRCLE_RING = [60, 450]; // px: circling only counts in this ring
    const CIRCLE_TURNS = 2;        // this many turns around Clawd ...
    const CIRCLE_WINDOW = 8000;    // ... within this many ms tire it out

    let press = null;       // screen position where the left button went down
    let held = false;       // the window is being dragged
    let clicks = 0;
    let clickSide = 'right';
    let clickTimer = null;
    let recentClicks = [];
    let lastX = null;
    let lastDir = 0;
    let swings = [];
    let lastPetAt = 0;
    let lastHoverAt = 0;
    let cursorNear = false;
    let nearSince = 0;
    let lastWaveAt = 0;
    let lastAngle = null;
    let turns = [];         // { t, d }: angle steps (radians) of the cursor around Clawd

    // A mini-game owns the mouse while it runs (its buttons handle their own clicks).
    const playing = () => window.games && window.games.active();

    function noticeHover(now) {
        if (now - lastHoverAt <= HOVER_COOLDOWN) return;
        lastHoverAt = now;
        window.clawd.hover();
    }

    function trackCircling(dx, dy, now) {
        const dist = Math.hypot(dx, dy);
        if (dist < CIRCLE_RING[0] || dist > CIRCLE_RING[1]) {
            lastAngle = null;
            return;
        }
        const angle = Math.atan2(dy, dx);
        if (lastAngle !== null) {
            let d = angle - lastAngle;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            turns.push({ t: now, d });
        }
        lastAngle = angle;
        turns = turns.filter((s) => now - s.t < CIRCLE_WINDOW);
        const total = Math.abs(turns.reduce((sum, s) => sum + s.d, 0)) / (2 * Math.PI);
        if (total >= CIRCLE_TURNS) {
            turns = [];
            lastAngle = null;
            window.clawd.chased();
        }
    }

    api.onCursor(({ dx, dy }) => {
        if (press || playing()) return;
        const now = Date.now();
        const dist = Math.hypot(dx, dy);
        if (dist <= NEAR && !cursorNear) {
            cursorNear = true;
            nearSince = now;
            noticeHover(now);
        } else if (dist >= GONE && cursorNear) {
            cursorNear = false;
            if (now - nearSince >= STAYED && now - lastWaveAt > WAVE_COOLDOWN) {
                lastWaveAt = now;
                window.clawd.wave();
            }
        }
        trackCircling(dx, dy, now);
    });

    // Ends a press; resolves true when it was a drag (so not a click).
    async function release() {
        const wasHeld = held;
        press = null;
        held = false;
        document.body.classList.remove('held');
        if (wasHeld) window.clawd.drop((await api.dragEnd()) || {});
        return wasHeld;
    }

    function registerClick(e) {
        const now = Date.now();
        recentClicks = recentClicks.filter((t) => now - t < DIZZY_WINDOW).concat(now);
        clearTimeout(clickTimer);
        if (recentClicks.length >= DIZZY_CLICKS) {
            recentClicks = [];
            clicks = 0;
            window.clawd.dizzy();
            return;
        }
        clicks += 1;
        clickSide = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
        clickTimer = setTimeout(() => {
            const count = clicks;
            clicks = 0;
            if (count >= 2) window.clawd.doubleClick();
            else window.clawd.click(clickSide);
        }, CLICK_GAP);
    }

    function trackPetting(e) {
        if (lastX === null) {
            lastX = e.screenX;
            return;
        }
        const dx = e.screenX - lastX;
        lastX = e.screenX;
        if (Math.abs(dx) < 2) return;
        const dir = Math.sign(dx);
        const now = Date.now();
        if (lastDir && dir !== lastDir) swings = swings.filter((t) => now - t < PET_WINDOW).concat(now);
        lastDir = dir;
        if (swings.length >= PET_SWINGS && now - lastPetAt > PET_COOLDOWN) {
            swings = [];
            lastPetAt = now;
            window.clawd.pet();
        }
    }

    root.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || playing()) return;
        press = { x: e.screenX, y: e.screenY };
        root.setPointerCapture(e.pointerId);
    });

    root.addEventListener('pointermove', (e) => {
        if (press && !held) {
            if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_THRESHOLD) return;
            held = true;
            document.body.classList.add('held');
            api.dragStart();
            window.clawd.dragStart();
            return;
        }
        if (!press && e.buttons === 0 && !playing()) trackPetting(e);
    });

    root.addEventListener('pointerup', async (e) => {
        if (e.button !== 0 || !press) return;
        if (!(await release())) registerClick(e);
    });

    // The press ended somewhere we can't see (e.g. another window took the mouse).
    root.addEventListener('pointercancel', () => { if (press) release(); });
    window.addEventListener('blur', () => { if (held) release(); });

    root.addEventListener('pointerenter', () => {
        lastX = null;
        lastDir = 0;
        swings = [];
        if (!press && !playing()) noticeHover(Date.now());
    });

    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        api.showMenu(window.clawd.menuContext());
    });
})();
