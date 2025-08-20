#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    console.log(`  Removing ${dirPath}...`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

console.log('🧹 Cleaning project...');

// Clean directories
const dirsToClean = [
  path.join(__dirname, '..', 'node_modules'),
  path.join(__dirname, '..', 'apps', 'web', 'node_modules'),
  path.join(__dirname, '..', 'apps', 'web', '.next'),
  path.join(__dirname, '..', 'apps', 'api', '.venv'),
  path.join(__dirname, '..', 'apps', 'api', '__pycache__'),
];

dirsToClean.forEach(removeDir);

console.log('✅ Clean complete!');