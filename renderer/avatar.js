const rawGifs = window.electronAPI.getGifs();

const STATES = {};
const DURATIONS = {};
rawGifs.forEach(({ name, duration }) => {
    const key = name.replace('.gif', '');
    STATES[key] = `../assets/gif/${name}`;
    DURATIONS[key] = duration;
});

const container = document.getElementById('pet-container');
const petImg = document.getElementById('pet-img');

let currentState = '';
let recentStates = [];

function pickRandom() {
    const all = Object.keys(STATES);
    if (all.length === 0) return null;
    const keys = all.filter(k => !recentStates.includes(k));
    const pool = keys.length > 0 ? keys : all;
    return pool[Math.floor(Math.random() * pool.length)];
}

window.playOnce = function(onDone) {
    const state = pickRandom();
    if (!state) { onDone(); return; }
    recentStates = [...recentStates.slice(-3), state];

    if (currentState) container.classList.remove(currentState);
    container.classList.add(state);
    petImg.src = STATES[state];
    currentState = state;

    setTimeout(onDone, DURATIONS[state]);
};
