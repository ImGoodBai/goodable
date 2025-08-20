#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dbFile = path.join(__dirname, '..', 'data', 'cc.db');

function askConfirmation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('⚠️  WARNING: This will delete all data in the database!\nAre you sure? [y/N]: ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function resetDatabase() {
  if (!fs.existsSync(dbFile)) {
    console.log('📝 No database file to delete');
    return;
  }

  const confirmed = await askConfirmation();
  
  if (!confirmed) {
    console.log('❌ Database reset cancelled');
    return;
  }

  try {
    fs.unlinkSync(dbFile);
    console.log('✅ Database deleted. A new one will be created on next start');
  } catch (error) {
    console.error('❌ Failed to delete database:', error.message);
    process.exit(1);
  }
}

// Run reset
resetDatabase();