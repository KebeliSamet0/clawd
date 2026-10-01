// state name -> { src, duration } (GIFs, plus SVG-only states).
const STATES = window.electronAPI.getStates();

const petImg = document.getElementById('pet-img');

let currentState = '';
let playCount = 0;

window.pet = {
    has: (state) => state in STATES,
    duration: (state) => (STATES[state] && STATES[state].duration) || 1000,
    current: () => currentState,

    // Loop a state. Asking for the state already shown is a no-op, so the
    // animation keeps running instead of restarting.
    loop(state) {
        if (!STATES[state] || state === currentState) return;
        currentState = state;
        petImg.src = STATES[state].src;
    },

    // Play a state from its first frame (the query string forces a restart).
    once(state) {
        if (!STATES[state]) return;
        currentState = state;
        petImg.src = `${STATES[state].src}?play=${++playCount}`;
    },
};
