#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'cc.db');

function backupDatabase() {
  if (!fs.existsSync(dbFile)) {
    console.log('❌ No database file found to backup');
    return;
  }
  
  const timestamp = new Date().toISOString()
    .replace(/:/g, '')
    .replace(/\./g, '')
    .replace('T', '_')
    .substring(0, 15);
  
  const backupFile = path.join(dataDir, `cc.db.backup.${timestamp}`);
  
  try {
    fs.copyFileSync(dbFile, backupFile);
    console.log(`✅ Database backed up to ${backupFile}`);
  } catch (error) {
    console.error('❌ Failed to backup database:', error.message);
    process.exit(1);
  }
}

// Run backup
backupDatabase();