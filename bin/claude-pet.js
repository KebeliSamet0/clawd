#!/usr/bin/env node
const electron = require('electron');
const { spawn } = require('child_process');
const path = require('path');

spawn(electron, [path.join(__dirname, '..')], { stdio: 'inherit' });
