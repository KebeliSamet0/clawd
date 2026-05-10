const rawGifs = window.electronAPI.getGifs();

const MOVE_KEYWORDS = ['idle', 'happy', 'reading'];

const STATES = {};
const DURATIONS = {};
rawGifs.forEach(({ name, duration }) => {
    const key = name.replace('.gif', '');
    STATES[key] = `../assets/gif/${name}`;
    DURATIONS[key] = duration;
});

const MOVE_STATES = Object.keys(STATES).filter(k =>
    MOVE_KEYWORDS.some(kw => k.includes(kw))
);
const STATIONARY_STATES = Object.keys(STATES).filter(k =>
    !MOVE_KEYWORDS.some(kw => k.includes(kw))
);

const container = document.getElementById('pet-container');
const petImg = document.getElementById('pet-img');

let currentState = '';
let recentStates = [];

function pickRandom() {
    const keys = Object.keys(STATES).filter(k => !recentStates.includes(k));
    const pool = keys.length > 0 ? keys : Object.keys(STATES);
    return pool[Math.floor(Math.random() * pool.length)];
}

// 1 gif, 1 loop, sonra onDone çağır
window.playOnce = function(onDone) {
    const state = pickRandom();
    recentStates = [...recentStates.slice(-3), state];

    container.classList.remove(currentState);
    container.classList.add(state);
    petImg.src = STATES[state];
    currentState = state;

    setTimeout(onDone, DURATIONS[state]);
};

window.getCurrentState = () => currentState;
window.isStationary = () => STATIONARY_STATES.includes(currentState);
