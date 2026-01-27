/**
 * Electron Main Process - Phase 2 (BS Architecture)
 * Loads Next.js app in Electron window
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let nextProcess = null;
const NEXT_PORT = 3456;

// Start Next.js server
function startNextServer() {
  return new Promise((resolve, reject) => {
    const nextPath = path.join(__dirname, 'next-app');

    console.log('[ELECTRON] Starting Next.js server...');
    console.log('[ELECTRON] Next.js path:', nextPath);

    // In packaged app, use pre-built Next.js
    const isPackaged = app.isPackaged;
    const command = isPackaged ? 'npm' : 'npm';
    const args = isPackaged ? ['run', 'start'] : ['run', 'dev'];

    nextProcess = spawn(command, args, {
      cwd: nextPath,
      shell: true,
      env: {
        ...process.env,
        PORT: NEXT_PORT,
      },
    });

    nextProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[NEXT]', output.trim());

      // Check if Next.js is ready
      if (output.includes('Ready') || output.includes('started')) {
        console.log('[ELECTRON] Next.js server ready');
        resolve();
      }
    });

    nextProcess.stderr.on('data', (data) => {
      console.error('[NEXT ERROR]', data.toString().trim());
    });

    nextProcess.on('error', (err) => {
      console.error('[ELECTRON] Failed to start Next.js:', err);
      reject(err);
    });

    // Timeout fallback
    setTimeout(() => {
      console.log('[ELECTRON] Next.js startup timeout, proceeding anyway...');
      resolve();
    }, 10000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = `http://localhost:${NEXT_PORT}`;
  console.log('[ELECTRON] Loading:', url);

  mainWindow.loadURL(url);

  // Open DevTools in dev mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  console.log('[ELECTRON] App ready');
  console.log('[ELECTRON] Platform:', process.platform);
  console.log('[ELECTRON] Packaged:', app.isPackaged);

  try {
    await startNextServer();
    createWindow();
  } catch (err) {
    console.error('[ELECTRON] Startup error:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Kill Next.js process
  if (nextProcess) {
    console.log('[ELECTRON] Killing Next.js process...');
    nextProcess.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});
