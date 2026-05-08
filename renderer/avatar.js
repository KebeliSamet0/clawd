const STATES = {
    'idle': '../assets/gif/clawd-idle.gif',
    'reading': '../assets/gif/clawd-idle-reading.gif',
    'happy': '../assets/gif/clawd-happy.gif',
    'thinking': '../assets/gif/clawd-thinking.gif',
    'sleeping': '../assets/gif/clawd-sleeping.gif',
    'typing': '../assets/gif/clawd-typing.gif',
    'sweeping': '../assets/gif/clawd-sweeping.gif',
    'juggling': '../assets/gif/clawd-juggling.gif'
};

// Movement states
const MOVE_STATES = ['idle', 'reading', 'happy']; // These will trigger movement in motion.js
const STATIONARY_STATES = ['thinking', 'sleeping', 'typing', 'sweeping', 'juggling'];

const container = document.getElementById('pet-container');
const petImg = document.getElementById('pet-img');

let currentState = 'idle';

function setState(newState) {
    if (!STATES[newState]) return;
    
    container.classList.remove(currentState);
    container.classList.add(newState);
    
    petImg.src = STATES[newState];
    currentState = newState;
    
    console.log(`State changed to: ${newState}`);

    // Schedule next state change
    const nextTimeout = Math.random() * 15000 + 10000; // Longer duration (10-25s) for stability
    setTimeout(pickRandomState, nextTimeout);
}

function pickRandomState() {
    const keys = Object.keys(STATES);
    let next = keys[Math.floor(Math.random() * keys.length)];
    
    // Don't pick the same state twice in a row if possible
    if (next === currentState) {
        next = keys[Math.floor(Math.random() * keys.length)];
    }
    
    setState(next);
}

// Initial state
window.addEventListener('load', () => {
    setState('idle');
});

window.getCurrentState = () => currentState;
window.isStationary = () => STATIONARY_STATES.includes(currentState);
