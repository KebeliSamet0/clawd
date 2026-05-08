# Clawd — Desktop Pet

A chaotic little Claude mascot that lives on your Windows desktop.

Transparent, frameless, always-on-top. Wanders around your screen, plays animations, lives in your system tray.

## Download

Grab the latest installer from [Releases](../../releases/latest).

## Features

- Transparent & frameless window — only the character is visible
- Roams the screen randomly, reacts with different animations
- Animations: idle, walking, building, typing, thinking, sleeping, error, happy, and more
- System tray control (Show / Hide / Quit)
- Auto-starts with Windows

## Run from Source

```bash
npm install
npm start
```

## Build Installer

```bash
npm run build
# Output: dist/ClaudePet Setup x.x.x.exe
```

## Stack

- Electron — window management, system tray, IPC
- Vanilla JS — animation state machine, motion engine
- CSS keyframes — sprite animations
