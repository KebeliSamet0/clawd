let screenHeight = 1080;
const winSize = 128;
let homeX = 20;
let homeY = 1000;
let offscreenY = 9999;

function hide() {
    window.electronAPI.moveWindow({ x: homeX, y: offscreenY });
}

function show() {
    window.electronAPI.moveWindow({ x: homeX, y: homeY });
}

function appear() {
    if (typeof window.playOnce !== 'function') { scheduleAppear(); return; }
    show();
    window.playOnce(() => {
        hide();
        scheduleAppear();
    });
}

function scheduleAppear() {
    const hiddenFor = Math.random() * 60000 + 60000;
    setTimeout(appear, hiddenFor);
}

async function init() {
    const size = await window.electronAPI.getScreenSize();
    screenHeight = size.height;
    homeX = 20;
    homeY = screenHeight - winSize - 60;
    offscreenY = screenHeight + 500;

    hide();
    setTimeout(appear, 1000);
}

init();
