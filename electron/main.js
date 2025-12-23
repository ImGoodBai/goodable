const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, fork } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Crash monitoring
const crashMonitor = require('./crash-monitor');

// Read app version from package.json
const packageJson = require(path.join(__dirname, '..', 'package.json'));
const APP_VERSION = packageJson.version;

// 自定义标题栏配置
const CUSTOM_TITLEBAR_FLAG = '--enable-custom-titlebar';
const CUSTOM_TITLEBAR_HEIGHT = 40;

// Load dotenv for .env file support
let dotenv;
try {
  dotenv = require('dotenv');
} catch (err) {
  console.warn('[WARN] dotenv module not found, .env files will not be loaded');
}

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

  // Load .env file from standalone directory
  if (dotenv && !isDev) {
    const envPath = path.join(standaloneDir, '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envConfig = dotenv.parse(fs.readFileSync(envPath));
        // Merge .env config into process.env (don't override existing)
        Object.keys(envConfig).forEach(key => {
          if (!process.env[key]) {
            process.env[key] = envConfig[key];
          }
        });
        console.log('[INFO] Loaded .env file from standalone directory');
        console.log('[DEBUG] PORT from .env:', process.env.PORT);
        console.log('[DEBUG] WEB_PORT from .env:', process.env.WEB_PORT);
      } catch (err) {
        console.warn('[WARN] Failed to load .env file:', err.message);
      }
    } else {
      console.warn('[WARN] .env file not found at:', envPath);
    }
  }

  // Ensure node_modules link exists in standalone dir for production
  if (!isDev) {
    const standaloneNodeModules = path.join(standaloneDir, 'node_modules');

    // Helper function to check if symlink is valid
    const isValidSymlink = (targetPath, testSubPath = null) => {
      try {
        const stats = fs.lstatSync(targetPath);
        if (!stats.isSymbolicLink()) return false;

        // For junction/symlinks, verify the target actually exists
        const linkTarget = fs.readlinkSync(targetPath);
        const actualTarget = path.isAbsolute(linkTarget)
          ? linkTarget
          : path.resolve(path.dirname(targetPath), linkTarget);

        // Check if target path exists
        if (!fs.existsSync(actualTarget)) return false;

        // If a test sub-path is provided, verify it exists
        if (testSubPath) {
          const testPath = path.join(targetPath, testSubPath);
          fs.accessSync(testPath);
        }

        return true;
      } catch {
        return false;
      }
    };

    // Check if we need to create/recreate the symlink
    let needsCreate = false;
    if (fs.existsSync(standaloneNodeModules)) {
      if (!isValidSymlink(standaloneNodeModules)) {
        console.log('[INFO] Found invalid node_modules (not a valid symlink), will recreate');
        needsCreate = true;
        try {
          fs.rmSync(standaloneNodeModules, { recursive: true, force: true });
        } catch (err) {
          console.warn('[WARN] Failed to remove invalid node_modules:', err?.message || String(err));
        }
      }
    } else {
      needsCreate = true;
    }

    if (needsCreate) {
      try {
        // Use relative path for portability
        // From .next/standalone/node_modules to ../../node_modules
        const nodeModulesRelative = path.join('..', '..', 'node_modules');

        // On Windows, symlinks may require admin privileges, use junction instead
        const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
        fs.symlinkSync(nodeModulesRelative, standaloneNodeModules, symlinkType);
        console.log('[INFO] Created node_modules symlink in standalone directory (relative path)');
      } catch (err) {
        console.warn('[WARN] Failed to create node_modules symlink, trying copy fallback:', err.message);
        try {
          fs.cpSync(nodeModulesDir, standaloneNodeModules, { recursive: true });
          console.log('[INFO] Copied node_modules as fallback');
        } catch (copyErr) {
          console.warn('[WARN] Failed to copy node_modules:', copyErr?.message || String(copyErr));
        }
      }
    } else {
      console.log('[INFO] Valid node_modules symlink already exists');
    }


    // Set migrations directory path for Drizzle
    // In production, migrations are copied to extraResources/migrations
    const migrationsPath = path.join(app.getAppPath(), '..', 'migrations');
    if (fs.existsSync(migrationsPath)) {
      process.env.MIGRATIONS_DIR = migrationsPath;
      console.log('[INFO] Set MIGRATIONS_DIR to:', migrationsPath);
    } else {
      console.warn('[WARN] Migrations directory not found at:', migrationsPath);
    }

    // Ensure static files are accessible - link from extraResources
    const standaloneStaticDir = path.join(standaloneDir, '.next', 'static');
    const resourcesStaticDir = path.join(app.getAppPath(), '..', '.next', 'static');
    if (!fs.existsSync(standaloneStaticDir) && fs.existsSync(resourcesStaticDir)) {
      try {
        // Use relative path for portability
        // From .next/standalone/.next/static to ../../../../.next/static
        const staticSourceRelative = path.join('..', '..', '..', '..', '.next', 'static');

        // On Windows, use junction for better compatibility
        const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
        fs.symlinkSync(staticSourceRelative, standaloneStaticDir, symlinkType);
        console.log('[INFO] Created static files symlink in standalone directory (relative path)');
      } catch (err) {
        console.warn('[WARN] Failed to create static symlink, using copy fallback:', err.message);
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
    HOSTNAME: '127.0.0.1',
    NEXT_TELEMETRY_DISABLED: '1',
  };

  // Resolve writable paths for production runtime
  try {
    const userDataDir = app.getPath('userData');
    const writableDataDir = path.join(userDataDir, 'data');
    const writableProjectsDir = path.join(userDataDir, 'projects');
    const writableSettingsDir = path.join(userDataDir, 'settings');

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
    try {
      fs.mkdirSync(writableSettingsDir, { recursive: true });
    } catch (err) {
      console.warn('[WARN] Failed to create settings directory:', err?.message || String(err));
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
    env.SETTINGS_DIR = writableSettingsDir;
    console.log('[INFO] Runtime paths configured:', {
      DATABASE_URL: env.DATABASE_URL,
      PROJECTS_DIR: env.PROJECTS_DIR,
      SETTINGS_DIR: env.SETTINGS_DIR,
    });
  } catch (err) {
    console.warn('[WARN] Failed to configure writable runtime paths:', err?.message || String(err));
  }

  // Drizzle migrations run automatically on first DB connection
  // See lib/db/client.ts for migration logic
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

  // 添加崩溃监控
  crashMonitor.monitorChildProcess(nextServerProcess, 'Next.js Server', () => shuttingDown);

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
  // 打印应用信息
  console.log(`\n🚀 Goodable v${APP_VERSION}`);
  console.log(`📦 Mode: ${isDev ? 'Development' : 'Production'}`);

  // 打印开发环境路径
  if (isDev) {
    console.log(`📁 Dev Paths:`);
    console.log(`   - Root: ${rootDir}`);
    console.log(`   - Data: ${path.join(process.cwd(), 'data')}`);
    console.log(`   - Projects: ${process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects')}`);
    console.log(`   - Settings: ${process.env.SETTINGS_DIR || path.join(process.cwd(), 'data')}`);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#111827',
    frame: false, // 使用自定义标题栏
    titleBarStyle: os.platform() === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: os.platform() === 'darwin' ? { x: 12, y: 12 } : undefined,
    title: `Goodable v${APP_VERSION}`,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      additionalArguments: [CUSTOM_TITLEBAR_FLAG, `--app-version=${APP_VERSION}`], // 传递标题栏启用标志和版本号
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

  // Configure secondary window (e.g., settings window)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1100,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#ffffff',
        frame: false, // 二级窗口也使用自定义标题栏
        titleBarStyle: os.platform() === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: os.platform() === 'darwin' ? { x: 12, y: 12 } : undefined,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
          additionalArguments: [CUSTOM_TITLEBAR_FLAG], // 二级窗口也传递标题栏标志
        },
      },
    };
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

  // 开发模式下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach', activate: true });
  }

  // 注册窗口状态变化事件
  registerWindowStateEvents(mainWindow);
  registerNavigationEvents(mainWindow);

  // 设置崩溃监控
  crashMonitor.setupRendererCrashMonitoring(mainWindow, createMainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== 窗口状态管理 ====================

function getWindowStatePayload(window) {
  if (!window || window.isDestroyed()) {
    return { isMaximized: false, isFullScreen: false };
  }

  return {
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen()
  };
}

function sendWindowStateUpdate(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  try {
    window.webContents.send('window-state-changed', getWindowStatePayload(window));
  } catch (error) {
    console.warn('发送窗口状态更新失败:', error);
  }
}

function registerWindowStateEvents(window) {
  if (!window) {
    return;
  }

  const emitState = () => sendWindowStateUpdate(window);
  window.on('maximize', emitState);
  window.on('unmaximize', emitState);
  window.on('enter-full-screen', emitState);
  window.on('leave-full-screen', emitState);
}

// ==================== 导航状态管理 ====================

function getNavigationStatePayload(window) {
  if (!window || window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) {
    return { canGoBack: false, canGoForward: false };
  }

  // 使用新的 navigationHistory API（Electron 新版本）
  const webContents = window.webContents;
  if (webContents.navigationHistory) {
    return {
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward()
    };
  }

  // 降级到旧API（向后兼容）
  return {
    canGoBack: webContents.canGoBack(),
    canGoForward: webContents.canGoForward()
  };
}

function sendNavigationStateUpdate(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  try {
    window.webContents.send('navigation-state-changed', getNavigationStatePayload(window));
  } catch (error) {
    console.warn('发送导航状态更新失败:', error);
  }
}

function registerNavigationEvents(window) {
  if (!window || !window.webContents) {
    return;
  }

  const emitNavigationState = () => sendNavigationStateUpdate(window);
  const events = ['did-start-navigation', 'did-navigate', 'did-navigate-in-page', 'did-frame-finish-load', 'did-finish-load'];

  events.forEach(eventName => {
    window.webContents.on(eventName, emitNavigationState);
  });
}

// ==================== IPC 处理器 ====================

function registerIpcHandlers() {
  ipcMain.handle('ping', async () => 'pong');

  // 窗口控制
  ipcMain.handle('window-control', async (event, { action } = {}) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow || targetWindow.isDestroyed()) {
      return { success: false, error: '窗口不存在' };
    }

    switch (action) {
      case 'minimize':
        targetWindow.minimize();
        break;
      case 'toggle-maximize':
        if (targetWindow.isMaximized()) {
          targetWindow.unmaximize();
        } else {
          targetWindow.maximize();
        }
        break;
      case 'close':
        targetWindow.close();
        return { success: true };
      default:
        console.warn(`收到未知的窗口控制操作: ${action}`);
        break;
    }

    const state = getWindowStatePayload(targetWindow);
    sendWindowStateUpdate(targetWindow);
    return { success: true, state };
  });

  // 获取窗口状态
  ipcMain.handle('get-window-state', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) {
      return { isMaximized: false, isFullScreen: false };
    }
    return getWindowStatePayload(targetWindow);
  });

  // 导航控制
  ipcMain.handle('window-navigation', async (event, { action } = {}) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow || targetWindow.isDestroyed() || !targetWindow.webContents || targetWindow.webContents.isDestroyed()) {
      return { success: false, error: '窗口不存在' };
    }

    const webContents = targetWindow.webContents;

    switch (action) {
      case 'back':
        if (webContents.canGoBack()) {
          webContents.goBack();
        }
        break;
      case 'forward':
        if (webContents.canGoForward()) {
          webContents.goForward();
        }
        break;
      case 'refresh':
        webContents.reload();
        break;
      case 'force-refresh':
        webContents.reloadIgnoringCache();
        break;
      case 'toggle-devtools':
        if (webContents.isDevToolsOpened()) {
          webContents.closeDevTools();
        } else {
          webContents.openDevTools();
        }
        break;
      default:
        console.warn(`收到未知的导航操作: ${action}`);
        break;
    }

    const state = getNavigationStatePayload(targetWindow);
    sendNavigationStateUpdate(targetWindow);
    return { success: true, state };
  });

  // 获取导航状态
  ipcMain.handle('get-navigation-state', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    return getNavigationStatePayload(targetWindow);
  });

  // 打开外部链接
  ipcMain.handle('open-external', async (event, url) => {
    if (!url || typeof url !== 'string') {
      return { success: false, error: '无效的URL' };
    }

    // 安全检查：只允许http和https协议
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: '仅支持HTTP/HTTPS链接' };
    }

    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('打开外部链接失败:', error);
      return { success: false, error: error.message };
    }
  });
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
      // 初始化崩溃监控
      crashMonitor.initCrashMonitoring();
      crashMonitor.monitorMainProcess();
      crashMonitor.monitorGPUProcess();

      registerIpcHandlers();
      return createMainWindow();
    })
    .catch((error) => {
      console.error('❌ An error occurred while initializing the Electron app.');
      console.error(error instanceof Error ? error.stack || error.message : error);
      app.quit();
    });
}
