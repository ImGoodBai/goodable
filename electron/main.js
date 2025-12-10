const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, fork } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let nextServerProcess = null;
let productionUrl = null;
let shuttingDown = false;

const rootDir = isDev ? path.join(__dirname, '..') : app.getAppPath();
// In production, standalone is unpacked from asar
const standaloneDir = isDev
  ? path.join(rootDir, '.next', 'standalone')
  : path.join(rootDir, '..', 'app.asar.unpacked', '.next', 'standalone');
const nodeModulesDir = isDev
  ? path.join(rootDir, 'node_modules')
  : path.join(rootDir, '..', 'app.asar.unpacked', 'node_modules');
const preloadPath = path.join(__dirname, 'preload.js');

function waitForUrl(targetUrl, timeoutMs = 30_000, intervalMs = 200) {
  const { protocol } = new URL(targetUrl);
  const requester = protocol === 'https:' ? https : http;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = requester
        .get(targetUrl, (response) => {
          response.resume();
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
            resolve();
            return;
          }
          if (Date.now() - start >= timeoutMs) {
            reject(new Error(`Timed out waiting for ${targetUrl}`));
          } else {
            setTimeout(poll, intervalMs);
          }
        })
        .on('error', () => {
          if (Date.now() - start >= timeoutMs) {
            reject(new Error(`Timed out waiting for ${targetUrl}`));
          } else {
            setTimeout(poll, intervalMs);
          }
        });

      request.setTimeout(intervalMs, () => request.destroy());
    };

    poll();
  });
}

function checkPortAvailability(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => {
        resolve(false);
      })
      .once('listening', () => {
        tester
          .once('close', () => resolve(true))
          .close();
      })
      .listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort = 3000, maxAttempts = 50) {
  let port = startPort;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1, port += 1) {
    // eslint-disable-next-line no-await-in-loop
    const available = await checkPortAvailability(port);
    if (available) {
      return port;
    }
  }

  throw new Error(
    `Failed to find available port starting at ${startPort}.`
  );
}

function ensureStandaloneArtifacts() {
  const serverPath = path.join(standaloneDir, 'server.js');
  console.log('[DEBUG] Checking for server.js at:', serverPath);
  console.log('[DEBUG] standaloneDir:', standaloneDir);
  console.log('[DEBUG] rootDir:', rootDir);
  console.log('[DEBUG] __dirname:', __dirname);
  console.log('[DEBUG] app.getAppPath():', app.getAppPath());
  console.log('[DEBUG] fs.existsSync(serverPath):', fs.existsSync(serverPath));

  if (!fs.existsSync(serverPath)) {
    // Try alternative path in asar
    const asarPath = app.getAppPath();
    const alternativeServerPath = path.join(asarPath, '.next', 'standalone', 'server.js');
    console.log('[DEBUG] Trying alternative path:', alternativeServerPath);
    console.log('[DEBUG] fs.existsSync(alternativeServerPath):', fs.existsSync(alternativeServerPath));

    if (fs.existsSync(alternativeServerPath)) {
      return alternativeServerPath;
    }

    throw new Error(
      'The Next.js standalone server file is missing. Run `npm run build` and try again.'
    );
  }
  return serverPath;
}

async function startProductionServer() {
  if (productionUrl) {
    return productionUrl;
  }

  const serverPath = ensureStandaloneArtifacts();

  // Ensure node_modules link exists in standalone dir for production
  if (!isDev) {
    const standaloneNodeModules = path.join(standaloneDir, 'node_modules');
    if (!fs.existsSync(standaloneNodeModules)) {
      try {
        fs.symlinkSync(nodeModulesDir, standaloneNodeModules, 'dir');
        console.log('[INFO] Created node_modules symlink in standalone directory');
      } catch (err) {
        console.warn('[WARN] Failed to create node_modules symlink:', err.message);
      }
    }

    // Set Prisma engine paths to prisma-hidden directory
    const prismaHiddenPath = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'prisma-hidden', 'client');
    if (fs.existsSync(prismaHiddenPath)) {
      // Create .prisma symlink pointing to prisma-hidden
      const prismaTarget = path.join(nodeModulesDir, '.prisma');
      const prismaSource = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'prisma-hidden');
      if (!fs.existsSync(prismaTarget)) {
        try {
          fs.symlinkSync(prismaSource, prismaTarget, 'dir');
          console.log('[INFO] Created .prisma symlink to prisma-hidden');
        } catch (err) {
          console.warn('[WARN] Failed to create .prisma symlink:', err.message);
          try {
            try { fs.rmSync(prismaTarget, { recursive: true, force: true }); } catch {}
            fs.cpSync(prismaSource, prismaTarget, { recursive: true });
            console.log('[INFO] Copied prisma-hidden to .prisma as fallback');
          } catch (copyErr) {
            console.warn('[WARN] Fallback copy of prisma-hidden failed:', copyErr?.message || String(copyErr));
          }
        }
      }
    }

    // Ensure static files are accessible - link from extraResources
    const standaloneStaticDir = path.join(standaloneDir, '.next', 'static');
    const resourcesStaticDir = path.join(app.getAppPath(), '..', '.next', 'static');
    if (!fs.existsSync(standaloneStaticDir) && fs.existsSync(resourcesStaticDir)) {
      try {
        fs.symlinkSync(resourcesStaticDir, standaloneStaticDir, 'dir');
        console.log('[INFO] Created static files symlink in standalone directory');
      } catch (err) {
        console.warn('[WARN] Failed to create static symlink:', err.message);
        try {
          fs.mkdirSync(path.dirname(standaloneStaticDir), { recursive: true });
          fs.cpSync(resourcesStaticDir, standaloneStaticDir, { recursive: true });
          console.log('[INFO] Copied static files as fallback');
        } catch (copyErr) {
          console.warn('[WARN] Fallback copy of static files failed:', copyErr?.message || String(copyErr));
        }
      }
    }
  }

  const startPort =
    Number.parseInt(process.env.WEB_PORT || process.env.PORT || '3000', 10) || 3000;
  const port = await findAvailablePort(startPort);
  const url = `http://127.0.0.1:${port}`;

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
  };

  // Resolve writable paths for production runtime
  try {
    const userDataDir = app.getPath('userData');
    const writableDataDir = path.join(userDataDir, 'data');
    const writableProjectsDir = path.join(userDataDir, 'projects');

    // Ensure directories exist
    try {
      fs.mkdirSync(writableDataDir, { recursive: true });
    } catch (err) {
      console.warn('[WARN] Failed to create data directory:', err?.message || String(err));
    }
    try {
      fs.mkdirSync(writableProjectsDir, { recursive: true });
    } catch (err) {
      console.warn('[WARN] Failed to create projects directory:', err?.message || String(err));
    }

    // Prepare database file
    const writableDbPath = path.join(writableDataDir, 'prod.db');
    if (!fs.existsSync(writableDbPath)) {
      // Try copying packaged db if available, otherwise create empty file
      const packagedDbCandidates = [
        path.join(standaloneDir, 'data', 'prod.db'),
        path.join(rootDir, 'data', 'prod.db'),
      ];
      const source = packagedDbCandidates.find((p) => {
        try { return fs.existsSync(p); } catch { return false; }
      });
      try {
        if (source) {
          fs.copyFileSync(source, writableDbPath);
          console.log('[INFO] Copied initial database to writable location');
        } else {
          fs.writeFileSync(writableDbPath, '');
          console.log('[INFO] Created empty database at writable location');
        }
      } catch (err) {
        console.warn('[WARN] Failed to initialize writable database file:', err?.message || String(err));
      }
    }

    // Override env for child server process to use writable locations
    env.DATABASE_URL = `file:${writableDbPath}`;
    env.PROJECTS_DIR = writableProjectsDir;
    console.log('[INFO] Runtime paths configured:', {
      DATABASE_URL: env.DATABASE_URL,
      PROJECTS_DIR: env.PROJECTS_DIR,
    });
  } catch (err) {
    console.warn('[WARN] Failed to configure writable runtime paths:', err?.message || String(err));
  }

  // Ensure database schema matches packaged Prisma schema (prisma-hidden)
  try {
    if (!isDev && env.DATABASE_URL) {
      const schemaPath = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'prisma-hidden', 'client', 'schema.prisma');
      const prismaCli = path.join(nodeModulesDir, 'prisma', 'build', 'index.js');
      if (fs.existsSync(schemaPath) && fs.existsSync(prismaCli)) {
        console.log('[INFO] Synchronizing database schema for production...');
        let attempt = 0;
        let ok = false;
        while (attempt < 2 && !ok) {
          attempt += 1;
          try {
            const res = spawn(process.execPath, [prismaCli, 'db', 'push', '--skip-generate', '--schema', schemaPath], {
              cwd: standaloneDir,
              env: { ...env },
              stdio: 'inherit',
              windowsHide: true,
            });
            await new Promise((resolve, reject) => {
              res.once('exit', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`Prisma db push failed: ${code}`))));
              res.once('error', reject);
            });
            ok = true;
          } catch (syncErr) {
            console.warn('[WARN] Prisma db push failed, will retry:', syncErr?.message || String(syncErr));
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        if (ok) {
          console.log('[INFO] Database schema synchronized');
        } else {
          console.warn('[WARN] Database schema synchronization failed after retries');
        }
      } else {
        console.warn('[WARN] Prisma CLI or schema not found for synchronization');
      }
    }
  } catch (err) {
    console.warn('[WARN] Failed to synchronize database schema:', err?.message || String(err));
  }

  console.log('[DEBUG] Starting Next.js server...');
  console.log('[DEBUG] serverPath:', serverPath);
  console.log('[DEBUG] cwd:', standaloneDir);
  console.log('[DEBUG] port:', port);

  // Use fork instead of spawn - fork uses Node.js built into Electron
  nextServerProcess = fork(serverPath, [], {
    cwd: standaloneDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });

  nextServerProcess.on('error', (err) => {
    console.error('[SPAWN ERROR]', err);
  });

  nextServerProcess.stdout.on('data', (data) => {
    console.log(`[Next.js] ${data.toString().trim()}`);
  });

  nextServerProcess.stderr.on('data', (data) => {
    console.error(`[Next.js Error] ${data.toString().trim()}`);
  });

  nextServerProcess.on('exit', (code, signal) => {
    if (!shuttingDown && typeof code === 'number' && code !== 0) {
      console.error(`⚠️  Next.js server exited with code ${code} (signal: ${signal ?? 'n/a'}).`);
    }
    nextServerProcess = null;
  });

  await waitForUrl(url).catch((error) => {
    console.error('❌ The Next.js production server failed to start.');
    throw error;
  });

  productionUrl = url;
  return productionUrl;
}

function stopProductionServer() {
  if (nextServerProcess && !nextServerProcess.killed) {
    nextServerProcess.kill('SIGTERM');
    nextServerProcess = null;
  }
  productionUrl = null;
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#111827',
    titleBarStyle: os.platform() === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const startUrl = isDev
    ? process.env.ELECTRON_START_URL || `http://localhost:${process.env.WEB_PORT || '3000'}`
    : await startProductionServer();

  let loadError = null;
  try {
    await mainWindow.loadURL(startUrl);
  } catch (error) {
    loadError = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Failed to load start URL in Electron window:', loadError);
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('🪟 Main window ready-to-show – displaying window.');
      mainWindow.show();
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('🪟 Main window did-finish-load – displaying window.');
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`❌ Failed to load ${validatedURL || startUrl}: [${errorCode}] ${errorDescription}`);
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('🪟 Showing fallback window after load failure.');
      mainWindow.show();
    }
  });

  if (loadError && mainWindow) {
    console.log('🪟 Showing window despite load error.');
    mainWindow.show();
  }

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log('🪟 Timed show fallback – displaying window.');
      mainWindow.show();
    }
  }, 1500);

  if (isDev && process.env.ELECTRON_DEBUG_TOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach', activate: false });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle('ping', async () => 'pong');
}

function setupSingleInstanceLock() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  return true;
}

app.disableHardwareAcceleration();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  shuttingDown = true;
  stopProductionServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      console.error('❌ Failed to recreate the main window.');
      console.error(error instanceof Error ? error.stack || error.message : error);
    });
  }
});

if (setupSingleInstanceLock()) {
  app
    .whenReady()
    .then(() => {
      registerIpcHandlers();
      return createMainWindow();
    })
    .catch((error) => {
      console.error('❌ An error occurred while initializing the Electron app.');
      console.error(error instanceof Error ? error.stack || error.message : error);
      app.quit();
    });
}
