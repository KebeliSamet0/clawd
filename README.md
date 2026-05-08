# Clawd — Desktop Pet

<p align="center">
  <img src="assets/gif/clawd-typing.gif" width="120" alt="typing"/>
  <img src="assets/gif/clawd-building.gif" width="120" alt="building"/>
  <img src="assets/gif/clawd-juggling.gif" width="120" alt="juggling"/>
  <img src="assets/gif/clawd-happy.gif" width="120" alt="happy"/>
  <img src="assets/gif/clawd-sleeping.gif" width="120" alt="sleeping"/>
</p>

<p align="center"><i>A pixel-art Claude mascot that lives on your Windows desktop.</i></p>

<p align="center">
  <a href="https://github.com/KebeliSamet0/clawd/releases/latest"><img src="https://img.shields.io/github/v/release/KebeliSamet0/clawd" alt="Release"/></a>
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform"/>
  <a href="https://github.com/KebeliSamet0/clawd/stargazers"><img src="https://img.shields.io/github/stars/KebeliSamet0/clawd?style=flat&color=yellow" alt="Stars"/></a>
</p>

Transparent, frameless, always-on-top. Wanders around your screen, plays animations, lives in your system tray.

## Download

Grab the latest installer from [Releases](../../releases/latest).

Or run via npm:

```bash
npm install -g claude-pet
claude-pet
```

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
