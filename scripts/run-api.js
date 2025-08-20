#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config();

const apiDir = path.join(__dirname, '..', 'apps', 'api');
const isWindows = os.platform() === 'win32';

// Get API port from environment or use default
const apiPort = process.env.API_PORT || 8080;

// Determine Python path in venv
const pythonPath = isWindows 
  ? path.join(apiDir, '.venv', 'Scripts', 'python.exe')
  : path.join(apiDir, '.venv', 'bin', 'python');

// Start the API server
console.log(`Starting API server on http://localhost:${apiPort}...`);

const apiProcess = spawn(
  pythonPath,
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', apiPort.toString(), '--log-level', 'warning'],
  { 
    cwd: apiDir,
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, API_PORT: apiPort.toString() }
  }
);

apiProcess.on('error', (error) => {
  console.error('\nFailed to start API server');
  console.error('Error:', error.message);
  console.error('\nHow to fix:');
  console.error('   1. Check if Python virtual environment exists:');
  console.error('      ls apps/api/.venv');
  console.error('\n   2. If not, run:');
  console.error('      npm install');
  console.error('\n   3. If it exists but still fails:');
  console.error('      npm run clean');
  console.error('      npm install');
  console.error('\n   4. Check if port is available:');
  console.error(`      lsof -i :${apiPort} (Mac/Linux)`);
  console.error(`      netstat -ano | findstr :${apiPort} (Windows)`);
  process.exit(1);
});

apiProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`API server exited with code ${code}`);
    process.exit(code);
  }
});