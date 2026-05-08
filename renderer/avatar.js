const rawGifs = window.electronAPI.getGifs();

const MOVE_KEYWORDS = ['idle', 'happy', 'reading'];

const STATES = {};
rawGifs.forEach(f => {
    const key = f.replace('.gif', '');
    STATES[key] = `../assets/gif/${f}`;
});

const MOVE_STATES = Object.keys(STATES).filter(k =>
    MOVE_KEYWORDS.some(kw => k.includes(kw))
);
const STATIONARY_STATES = Object.keys(STATES).filter(k =>
    !MOVE_KEYWORDS.some(kw => k.includes(kw))
);

const container = document.getElementById('pet-container');
const petImg = document.getElementById('pet-img');

let currentState = 'clawd-idle';
let recentStates = [];

function setState(newState) {
    if (!STATES[newState]) return;

    container.classList.remove(currentState);
    container.classList.add(newState);

    petImg.src = STATES[newState];
    currentState = newState;

    recentStates = [...recentStates.slice(-3), newState];

    const nextTimeout = Math.random() * 15000 + 10000;
    setTimeout(pickRandomState, nextTimeout);
}

function pickRandomState() {
    const keys = Object.keys(STATES).filter(k => !recentStates.includes(k));
    const pool = keys.length > 0 ? keys : Object.keys(STATES);
    const next = pool[Math.floor(Math.random() * pool.length)];
    setState(next);
}

window.addEventListener('load', () => {
    const keys = Object.keys(STATES);
    const initial = keys.find(k => k.includes('idle')) || keys[0];
    setState(initial);
});

window.getCurrentState = () => currentState;
window.isStationary = () => STATIONARY_STATES.includes(currentState);
