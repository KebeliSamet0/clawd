let screenWidth = 1920;
let screenHeight = 1080;
const winSize = 128;
let homeX = 20;
let homeY = 1000;

function hide() {
    window.electronAPI.moveWindow({ x: -500, y: -500 });
}

function show() {
    window.electronAPI.moveWindow({ x: homeX, y: homeY });
}

function appear() {
    show();
    window.playOnce(() => {
        hide();
        scheduleAppear();
    });
}

function scheduleAppear() {
    const hiddenFor = Math.random() * 60000 + 60000; // 1-2 dakika gizli
    setTimeout(appear, hiddenFor);
}

async function init() {
    const size = await window.electronAPI.getScreenSize();
    screenWidth = size.width;
    screenHeight = size.height;

    homeX = 20;
    homeY = screenHeight - winSize - 60;

    hide();

    // İlk açılışta 1 saniye sonra çık
    setTimeout(appear, 1000);
}

init();
