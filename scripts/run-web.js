#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
require('dotenv').config();

const webDir = path.join(__dirname, '..', 'apps', 'web');
const isWindows = os.platform() === 'win32';

// Get Web port from environment or use default
const webPort = process.env.WEB_PORT || 3000;

// Start the Web server
console.log(`Starting Web server on http://localhost:${webPort}...`);

const webProcess = spawn(
  'npm',
  ['run', 'dev', '--', '--port', webPort.toString()],
  { 
    cwd: webDir,
    stdio: 'inherit',
    shell: isWindows
  }
);

webProcess.on('error', (error) => {
  console.error('\nFailed to start Web server');
  console.error('Error:', error.message);
  console.error('\nHow to fix:');
  console.error('   1. Check if Node modules are installed:');
  console.error('      ls apps/web/node_modules');
  console.error('\n   2. If not, run:');
  console.error('      npm install');
  console.error('\n   3. Check if port is available:');
  console.error(`      lsof -i :${webPort} (Mac/Linux)`);
  console.error(`      netstat -ano | findstr :${webPort} (Windows)`);
  console.error('\n   4. Check .env.local file:');
  console.error('      cat apps/web/.env.local');
  process.exit(1);
});

webProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Web server exited with code ${code}`);
    process.exit(code);
  }
});