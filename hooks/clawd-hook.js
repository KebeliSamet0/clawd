#!/usr/bin/env node
// Claude Code hook: forwards the current hook event to the Clawd desktop pet
// on 127.0.0.1. Only a few small fields are sent (event, tool name, a coarse
// shell-command kind, project folder name, Claude's process id) — never
// prompts, file contents or command text.
// On SessionStart it also starts Clawd if it isn't running (unless the user
// turned that off with `clawd off`).
// Always exits 0 and prints nothing, so it can never block or alter Claude.

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.CLAWD_PORT) || 47321;
const EXE = process.env.CLAWD_EXE
  || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'clawd-desktop', 'ClaudePet.exe');
// Electron's userData folder is named after package.json "name".
const CONFIG = path.join(process.env.APPDATA || '', 'clawd-desktop', 'clawd-config.json');

// Never linger: give up after a short while whatever happens.
setTimeout(() => process.exit(0), 10000).unref();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shellKind(command) {
  const c = command.trim().toLowerCase();
  if (/^(git|gh)\b/.test(c)) return 'git';
  if (/\b(test|tests|jest|vitest|pytest|mocha|playwright)\b/.test(c)) return 'test';
  if (/\b(npm|pnpm|yarn|bun)\s+(i|install|ci|add)\b|\bpip3?\s+install\b/.test(c)) return 'install';
  if (/\b(build|compile|make|tsc|webpack|vite|gradle|cargo|dotnet|electron-builder)\b/.test(c)) return 'build';
  return 'other';
}

// Resolves true when Clawd accepted the event.
function post(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      path: '/event',
      method: 'POST',
      timeout: 1000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode < 300));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => req.destroy());
    req.end(body);
  });
}

function launchAllowed() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8')).launchWithClaude !== false;
  } catch {
    return true;
  }
}

function launchClawd() {
  if (!fs.existsSync(EXE)) return false;
  // Start via Explorer so Clawd is not a child of Claude Code's hook process
  // (and doesn't inherit its environment or get cleaned up with it).
  spawn('explorer.exe', [EXE], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

async function forward(payload) {
  if (await post(payload)) return;
  if (payload.event !== 'SessionStart' || !launchAllowed() || !launchClawd()) return;
  for (let i = 0; i < 16; i++) {
    await sleep(500);
    if (await post(payload)) return;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', async () => {
  let input;
  try {
    // Strip a UTF-8 BOM (Windows PowerShell adds one when piping).
    input = JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    process.exit(0);
  }
  const pid = Number(process.env.CLAUDE_PID);
  const payload = {
    event: input.hook_event_name,
    tool: input.tool_name,
    notification: input.notification_type,
    reason: input.reason,
    session: typeof input.session_id === 'string' ? input.session_id.slice(0, 12) : undefined,
    project: typeof input.cwd === 'string' ? path.basename(input.cwd) : undefined,
    pid: Number.isInteger(pid) && pid > 0 ? pid : undefined,
  };
  const command = input.tool_input && input.tool_input.command;
  if (typeof command === 'string') payload.kind = shellKind(command);
  await forward(payload);
  process.exit(0);
});
