# Clawd — AI Desktop Pet for Windows

<p align="center">
  <img src="assets/gif/clawd-typing.gif" width="120" alt="Clawd typing"/>
  <img src="assets/gif/clawd-building.gif" width="120" alt="Clawd building"/>
  <img src="assets/gif/clawd-juggling.gif" width="120" alt="Clawd juggling"/>
  <img src="assets/gif/clawd-happy.gif" width="120" alt="Clawd happy"/>
  <img src="assets/gif/clawd-sleeping.gif" width="120" alt="Clawd sleeping"/>
</p>

<p align="center"><b>Clawd</b> is a pixel-art Claude mascot that lives on your Windows desktop — a virtual pet for AI developers.</p>

<p align="center">
  <a href="https://github.com/KebeliSamet0/clawd/releases/latest"><img src="https://img.shields.io/github/v/release/KebeliSamet0/clawd" alt="Latest Release"/></a>
  <a href="https://www.npmjs.com/package/clawd-desktop"><img src="https://img.shields.io/npm/v/clawd-desktop" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/clawd-desktop"><img src="https://img.shields.io/npm/dt/clawd-desktop" alt="npm downloads"/></a>
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform: Windows"/>
  <a href="https://github.com/KebeliSamet0/clawd/stargazers"><img src="https://img.shields.io/github/stars/KebeliSamet0/clawd?style=flat&color=yellow" alt="GitHub Stars"/></a>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"/>
</p>

---

Clawd is a transparent, frameless, always-on-top desktop companion built with Electron. The pixel-art Claude mascot wanders around your screen, reacts with different animations while you work, and hides in your system tray when not needed. Perfect for fans of Claude Code, Cursor, Codex, and AI-assisted development.

## Download

Grab the latest `.exe` installer from [**Releases**](../../releases/latest) — no setup required.

Or install globally via npm:

```bash
npm install -g clawd-desktop
clawd-desktop
```

## Features

- **Transparent & frameless** — only the character is visible, no window chrome
- **Roams freely** — wanders your screen, bounces off edges
- **Rich animations** — idle, walking, building, typing, thinking, sleeping, error, happy, juggling, and more
- **System tray control** — Show / Hide / Size / Mode / Reminders / Quit from the tray icon
- **Interactive** — click, pet, drag and feed it; break reminders; four liveliness modes
- **Auto-start with Windows** — always there when you open your PC
- **Lightweight** — built on Electron with vanilla JS, no heavy framework

## Screenshots & Animations

| Typing | Building | Happy | Sleeping |
|--------|----------|-------|---------|
| ![typing](assets/gif/clawd-typing.gif) | ![building](assets/gif/clawd-building.gif) | ![happy](assets/gif/clawd-happy.gif) | ![sleeping](assets/gif/clawd-sleeping.gif) |

## Run from Source

```bash
git clone https://github.com/KebeliSamet0/clawd.git
cd clawd
npm install
npm start
```

## Claude Code Integration

Clawd stays on screen and reacts to Claude Code activity through local
[hooks](https://code.claude.com/docs/en/hooks). The app listens on
`127.0.0.1:47321` (override with `CLAWD_PORT`); `hooks/clawd-hook.js` forwards
only the event name, tool name, a coarse shell-command kind, the project folder
name and Claude's process id — never prompts, file contents or command text.

1. Copy `hooks/clawd-hook.js` somewhere stable, e.g. `~/.claude/hooks/`.
2. Add a command hook for each event in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"C:/Users/<you>/.claude/hooks/clawd-hook.js\"", "async": true, "timeout": 5 }] }]
  }
}
```

Useful events: `SessionStart` (use `"timeout": 15`; it starts Clawd if needed),
`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
`PermissionRequest`, `Notification`, `SubagentStart`, `PreCompact`, `Stop`,
`StopFailure`, `SessionEnd`.

### Two modes

- **Claude mode** — every running Claude Code window gets its own pet (numbered
  when there are several). A pet disappears when its Claude Code process exits.
- **Laptop mode** — with no Claude Code session the pet watches the laptop: it
  naps when you are away for 5 minutes and greets you back, reacts to resume and
  unlock, charger plugged/unplugged, low battery, high CPU or RAM, and losing
  the network.

In both modes Clawd follows the clock when nothing is happening: sleeps after
midnight, takes a lunch break at noon, reads in the evening and chimes on the hour.

A shell command that looks like a test run (`test`, `jest`, `vitest`, `pytest`,
...) ends with confetti when it passes and a "failed" sign when it exits
non-zero. When Claude has been quiet for 2 minutes mid-task, Clawd looks around
and waits.

### Playing with Clawd

- **Click** — it waves toward the side you clicked. **Double-click** — a jump.
  **Five quick clicks** — it gets dizzy and wobbles.
- **Pet it** — move the cursor back and forth over it: hearts.
- **Hover** — it looks at you (at most every 30 seconds).
- **Drag** — it dangles from the cursor; dropped near the taskbar it bounces,
  anywhere else it floats down on a little parachute.
- **Right-click** — feed it (cookie, coffee, spicy food), ask for a high five,
  play a mini-game, send it to nap or wake it, pick the mode and the reminders,
  or hide it.
- **The cursor outside its window** — Clawd notices it coming closer (within
  about 220 px), waves goodbye when it leaves after a while (at most once a
  minute), and gets dizzy if you circle it twice within 8 seconds.

### Mini-games

Right-click → Main. They run inside the pet's own window; tricks and reminders
wait until the game is over, and the results are remembered.

- **Suit** — rock-paper-scissors against Clawd, first to two round wins.
- **Tebak tangan** — guess which hand holds the gift.
- **Tepuk serangga** — squash as many bugs as you can in 15 seconds; Clawd
  keeps your record.

Speech bubbles and small particle effects (hearts, stars, confetti, dust, fire)
go with the reactions. Clawd remembers the tricks it played recently (so it
doesn't repeat them), what you fed it most, and when you last played with it.

### Mode

Set from the tray or the right-click menu:

| Mode | Behavior |
|------|----------|
| Kalem | Rare, quiet tricks (reading, looking around, yawning); minimal effects |
| Teman kerja | Default: tricks every 4–8 minutes, Claude status, reminders |
| Jahil | Tricks every 1.5–4 minutes, including little pranks |
| Fokus | No tricks, effects or hourly chime; Claude status and reminders only |

### Break reminders

Pet #1 reminds you to rest your eyes (every 30 minutes), drink water (60) and
stretch (90) while you are at the laptop; being away for 5 minutes counts as an
eye and stretch break. A reminder stays up for 3 minutes with nothing else
moving over it. Click Clawd to mark it done, or right-click → snooze 10 minutes.
Each reminder can be turned off under Reminders / Pengingat.

### Animations drawn for this fork

`assets/svg/clawd-act-*.svg` (state name without `clawd-act-`) are new pixel-art
animations in the same style, animated with CSS keyframes:

| When | Animation |
|------|-----------|
| Reminders | `drink` (glass of water), `stretch`, `eye-rest` (covers its eyes, looks at a faraway tree) |
| Claude Code | `bell` (Claude finished), `raise-hand` (needs your permission), `wait-clock` (quiet for 2 minutes), `stamp` (tests passed) |
| You | `eat` (cookie), `fire` (spicy food), `dizzy` (five quick clicks or circling it), `parachute` (dropped), `wave` (cursor leaves) |
| Laptop | `antenna` (offline) |
| Idle tricks | `yoyo`, `bubbles`, `fishing` (catches a shoe), `dumbbell` (the weights are balloons), `dance` |
| Jahil pranks | `folder` (disguised as a folder), `hide-sign` ("AKU NGGAK ADA"), `potato` |

If one of these files is missing, Clawd falls back to the older animation.

### Command-line control

`scripts/clawd.cmd` (put it on your `PATH`) controls the installed app:

```
clawd [show]           start Clawd or bring it back
clawd hide             hide Clawd (stays in the tray)
clawd quit             close Clawd (it comes back with the next Claude Code session)
clawd off              close Clawd and stop it coming back with Claude Code
clawd on               allow that again and start Clawd
clawd size SIZE        small, medium, large or pixels (64-512)
clawd status           what Clawd is doing (JSON)
clawd startup on|off   start with Windows
```

## Build Installer

```bash
npm run build
# Output: dist/ClaudePet Setup x.x.x.exe
```

## Stack

- **Electron** — window management, system tray, IPC
- **Vanilla JS** — animation state machine, motion engine
- **CSS keyframes** — sprite animations

## Contributing

PRs welcome. Open an issue for bugs or animation ideas.

## License

MIT © [KebeliSamet0](https://github.com/KebeliSamet0)
