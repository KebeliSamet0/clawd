let screenWidth = 1920;
let screenHeight = 1080;
let posX = 0;
let posY = 0;

const winSize = 128;

async function init() {
    const size = await window.electronAPI.getScreenSize();
    screenWidth = size.width;
    screenHeight = size.height;
    
    // Sabit Pozisyon: Sol Alt Köşe
    posX = 50; 
    // Ekranın en altından biraz yukarıda (Taskbar üstü gibi)
    posY = screenHeight - winSize - 20; 
    
    // Pozisyonu bir kez ayarla ve bırak
    window.electronAPI.moveWindow({ x: posX, y: posY });
    
    console.log(`Position frozen at: ${posX}, ${posY}`);
}

init();
