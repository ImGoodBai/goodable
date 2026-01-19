const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
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
// In production, standalone is in extraResources (resources/standalone)
const standaloneDir = isDev
  ? path.join(rootDir, '.next', 'standalone')
  : path.join(process.resourcesPath, 'standalone');
// nodeModulesDir no longer needed - standalone has its own dependencies
const preloadPath = path.join(__dirname, 'preload.js');

function waitForUrl(targetUrl, timeoutMs = 60_000, intervalMs = 200) {
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

async function checkPortAvailability(port) {
  const checkAddress = (addr) => new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    try {
      srv.listen(port, addr);
    } catch {
      resolve(false);
    }
  });

  const results = await Promise.allSettled([
    checkAddress('0.0.0.0'),
    checkAddress('::'),
    checkAddress('127.0.0.1'),
    checkAddress('::1')
  ]);

  // IPv4 必须都可用，IPv6 失败忽略
  return results[0].status === 'fulfilled' && results[0].value &&
         results[2].status === 'fulfilled' && results[2].value;
}

async function findAvailablePort(startPort = 3035, maxAttempts = 50) {
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

  // In production, standalone is inside asar and has its own node_modules
  // No symlink creation needed - standalone is self-contained

  if (!isDev) {
    // Set migrations directory path for Drizzle
    // In production, migrations are copied to extraResources/migrations
    const migrationsPath = path.join(app.getAppPath(), '..', 'migrations');
    if (fs.existsSync(migrationsPath)) {
      process.env.MIGRATIONS_DIR = migrationsPath;
      console.log('[INFO] Set MIGRATIONS_DIR to:', migrationsPath);
    } else {
      console.warn('[WARN] Migrations directory not found at:', migrationsPath);
    }

    // Static files are served from extraResources via cwd=resourcesPath
    // No symlink needed - Next.js will find them relative to cwd
  }

  const startPort =
    Number.parseInt(process.env.WEB_PORT || process.env.PORT || '3035', 10) || 3035;
  const port = await findAvailablePort(startPort);
  const url = `http://127.0.0.1:${port}`;

  // macOS: Dock 启动时 PATH 可能不完整，需补全常用路径以确保 SDK spawn node 能找到 node
  const ensureMacOSPath = () => {
    if (process.platform !== 'darwin') {
      return process.env.PATH || '';
    }
    const currentPath = process.env.PATH || '';
    const macOSPaths = [
      '/opt/homebrew/bin',   // Apple Silicon homebrew
      '/opt/homebrew/sbin',
      '/usr/local/bin',      // Intel homebrew
      '/usr/local/sbin',
    ];
    const missingPaths = macOSPaths.filter((p) => !currentPath.includes(p));
    if (missingPaths.length > 0) {
      return missingPaths.join(':') + ':' + currentPath;
    }
    return currentPath;
  };

  const env = {
    ...process.env,
    PATH: ensureMacOSPath(),
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NEXT_TELEMETRY_DISABLED: '1',
  };

  // Windows: 注入内置 Git 环境变量（Claude SDK 依赖 git-bash）
  if (process.platform === 'win32') {
    const gitRuntimeDir = path.join(process.resourcesPath, 'git-runtime', 'win32-x64');
    const gitBashPath = path.join(gitRuntimeDir, 'bin', 'bash.exe');

    if (fs.existsSync(gitBashPath)) {
      // 设置 CLAUDE_CODE_GIT_BASH_PATH（SDK 硬依赖）
      env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath;

      // 将 Git 相关目录添加到 PATH 前面
      const gitPaths = [
        path.join(gitRuntimeDir, 'cmd'),        // git.exe
        path.join(gitRuntimeDir, 'usr', 'bin'), // unix tools
        path.join(gitRuntimeDir, 'bin'),        // bash.exe
      ].filter(p => fs.existsSync(p));

      if (gitPaths.length > 0) {
        const currentPath = env.PATH || process.env.PATH || '';
        env.PATH = gitPaths.join(path.delimiter) + path.delimiter + currentPath;
      }

      console.log('[INFO] Injected builtin Git for Claude SDK:', gitBashPath);
    } else {
      console.warn('[WARN] Builtin Git not found at:', gitBashPath);
    }
  }

  // Inject builtin Node.js runtime to PATH (Claude SDK spawns 'node' command)
  let nodeExePath = null;
  {
    const platform = process.platform;
    const arch = process.arch;
    let nodeRuntimeDir = null;

    if (platform === 'win32') {
      nodeRuntimeDir = path.join(process.resourcesPath, 'node-runtime', 'win32-x64');
      nodeExePath = path.join(nodeRuntimeDir, 'node.exe');
    } else if (platform === 'darwin') {
      const platformDir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
      nodeRuntimeDir = path.join(process.resourcesPath, 'node-runtime', platformDir, 'bin');
      nodeExePath = path.join(nodeRuntimeDir, 'node');
    }

    if (nodeExePath && fs.existsSync(nodeExePath)) {
      const currentPath = env.PATH || process.env.PATH || '';
      env.PATH = nodeRuntimeDir + path.delimiter + currentPath;
      console.log('[INFO] Injected builtin Node.js to PATH:', nodeRuntimeDir);
    } else if (nodeExePath) {
      console.warn('[WARN] Builtin Node.js not found at:', nodeExePath);
    }
  }

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
      // Try copying packaged db if available
      const packagedDbCandidates = [
        path.join(standaloneDir, 'data', 'prod.db'),
        path.join(rootDir, 'data', 'prod.db'),
      ];
      const source = packagedDbCandidates.find((p) => {
        try { return fs.existsSync(p); } catch { return false; }
      });
      if (source) {
        try {
          fs.copyFileSync(source, writableDbPath);
          console.log('[INFO] Copied initial database to writable location');
        } catch (err) {
          console.warn('[WARN] Failed to copy database file:', err?.message || String(err));
          console.log('[INFO] Database will be initialized by Drizzle on first connection');
        }
      } else {
        // No packaged database found - Drizzle will create and migrate on first connection
        console.log('[INFO] No packaged database found, will be initialized by Drizzle migrations');
      }
    }

    // User templates directory (for imported templates)
    const writableUserTemplatesDir = path.join(userDataDir, 'user-templates');
    try {
      fs.mkdirSync(writableUserTemplatesDir, { recursive: true });
    } catch (err) {
      console.warn('[WARN] Failed to create user-templates directory:', err?.message || String(err));
    }

    // User skills directory (for imported skills)
    const writableUserSkillsDir = path.join(userDataDir, 'user-skills');
    try {
      fs.mkdirSync(writableUserSkillsDir, { recursive: true });
    } catch (err) {
      console.warn('[WARN] Failed to create user-skills directory:', err?.message || String(err));
    }

    // User employees directory (for user-created employees)
    const writableUserEmployeesDir = path.join(userDataDir, 'employees');
    try {
      fs.mkdirSync(writableUserEmployeesDir, { recursive: true });
    } catch (err) {
      console.warn('[WARN] Failed to create employees directory:', err?.message || String(err));
    }

    // Copy demo-config.json to settings directory if not exists
    const demoConfigDest = path.join(writableSettingsDir, 'demo-config.json');
    if (!fs.existsSync(demoConfigDest)) {
      const demoConfigSources = [
        path.join(standaloneDir, 'templates', 'demo-config.json'),
        path.join(rootDir, 'templates', 'demo-config.json'),
      ];
      const demoConfigSource = demoConfigSources.find(p => fs.existsSync(p));
      if (demoConfigSource) {
        try {
          fs.copyFileSync(demoConfigSource, demoConfigDest);
          console.log('[INFO] Copied demo-config.json to settings directory');
        } catch (err) {
          console.warn('[WARN] Failed to copy demo-config.json:', err?.message || String(err));
        }
      }
    }

    // Override env for child server process to use writable locations
    env.DATABASE_URL = `file:${writableDbPath}`;
    env.PROJECTS_DIR = writableProjectsDir;
    env.SETTINGS_DIR = writableSettingsDir;
    env.USER_TEMPLATES_DIR = writableUserTemplatesDir;
    env.USER_SKILLS_DIR = writableUserSkillsDir;
    env.USER_EMPLOYEES_DIR = writableUserEmployeesDir;
    console.log('[INFO] Runtime paths configured:', {
      DATABASE_URL: env.DATABASE_URL,
      PROJECTS_DIR: env.PROJECTS_DIR,
      SETTINGS_DIR: env.SETTINGS_DIR,
      USER_TEMPLATES_DIR: env.USER_TEMPLATES_DIR,
      USER_SKILLS_DIR: env.USER_SKILLS_DIR,
      USER_EMPLOYEES_DIR: env.USER_EMPLOYEES_DIR,
    });
  } catch (err) {
    console.warn('[WARN] Failed to configure writable runtime paths:', err?.message || String(err));
  }

  // Drizzle migrations run automatically on first DB connection
  // See lib/db/client.ts for migration logic
  console.log('[DEBUG] Starting Next.js server...');
  // cwd must be standaloneDir so Next.js can find static/public relative paths
  const serverCwd = standaloneDir;

  console.log('[DEBUG] serverPath:', serverPath);
  console.log('[DEBUG] cwd:', serverCwd);
  console.log('[DEBUG] port:', port);

  // === Startup validation (fail fast) ===
  // 1. Check standalone/server.js exists
  if (!fs.existsSync(serverPath)) {
    const errMsg = `[FATAL] standalone/server.js not found at: ${serverPath}`;
    console.error(errMsg);
    dialog.showErrorBox('Startup Failed', errMsg);
    app.exit(1);
    return null;
  }

  // 2. Check node-runtime exists (production only)
  if (nodeExePath && !fs.existsSync(nodeExePath)) {
    const errMsg = `[FATAL] node-runtime not found at: ${nodeExePath}`;
    console.error(errMsg);
    dialog.showErrorBox('Startup Failed', errMsg);
    app.exit(1);
    return null;
  }

  // Pass resource paths to standalone subprocess (it runs as pure Node, not Electron)
  env.GOODABLE_RESOURCES_PATH = process.resourcesPath;
  env.CLAUDE_CLI_PATH = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@anthropic-ai',
    'claude-agent-sdk',
    'cli.js'
  );

  // 3. Check CLAUDE_CLI_PATH exists (production only)
  if (!fs.existsSync(env.CLAUDE_CLI_PATH)) {
    const errMsg = `[FATAL] Claude CLI not found at: ${env.CLAUDE_CLI_PATH}`;
    console.error(errMsg);
    dialog.showErrorBox('Startup Failed', errMsg);
    app.exit(1);
    return null;
  }

  console.log('[INFO] Passing GOODABLE_RESOURCES_PATH:', env.GOODABLE_RESOURCES_PATH);
  console.log('[INFO] Passing CLAUDE_CLI_PATH:', env.CLAUDE_CLI_PATH);

  // Use fork instead of spawn - use builtin node-runtime in production
  const forkOptions = {
    cwd: serverCwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  };
  if (nodeExePath && fs.existsSync(nodeExePath)) {
    forkOptions.execPath = nodeExePath;
    console.log('[INFO] Fork using builtin Node.js:', nodeExePath);
  }
  nextServerProcess = fork(serverPath, [], forkOptions);

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
    ? process.env.ELECTRON_START_URL || `http://localhost:${process.env.WEB_PORT || '3035'}`
    : await startProductionServer();

  // Healthcheck disabled - will be moved to in-app self-diagnosis feature later
  // if (!isDev) {
  //   const { runHealthcheck } = require('./healthcheck');
  //   const result = await runHealthcheck(startUrl);
  //   if (!result.success) {
  //     dialog.showErrorBox('启动失败', result.message || '健康检查失败，请查看日志');
  //     app.exit(1);
  //     return;
  //   }
  // }

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

  // 开发模式下不再默认打开开发者工具（可通过标题栏按钮手动打开）
  // if (isDev) {
  //   mainWindow.webContents.openDevTools({ mode: 'detach', activate: true });
  // }

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

  // 选择目录对话框
  ipcMain.handle('select-directory', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow || targetWindow.isDestroyed()) {
      return { success: false, error: '窗口不存在' };
    }

    try {
      const result = await dialog.showOpenDialog(targetWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择工作目录',
        buttonLabel: '选择'
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      console.error('选择目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  // Open folder in system file manager
  ipcMain.handle('open-folder', async (event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') {
      return { success: false, error: 'Invalid folder path' };
    }

    try {
      await shell.openPath(folderPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to open folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Set window size (for slim mode)
  ipcMain.handle('set-window-size', async (event, { width, height, minWidth, minHeight } = {}) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow || targetWindow.isDestroyed()) {
      return { success: false, error: '窗口不存在' };
    }

    try {
      // Set minimum size first if provided (to allow smaller sizes like slim mode)
      if (typeof minWidth === 'number' || typeof minHeight === 'number') {
        const currentMinSize = targetWindow.getMinimumSize();
        targetWindow.setMinimumSize(
          typeof minWidth === 'number' ? minWidth : currentMinSize[0],
          typeof minHeight === 'number' ? minHeight : currentMinSize[1]
        );
      }

      // Set window size
      if (typeof width === 'number' && typeof height === 'number') {
        targetWindow.setSize(width, height, true);
      } else if (typeof width === 'number') {
        const currentSize = targetWindow.getSize();
        targetWindow.setSize(width, currentSize[1], true);
      } else if (typeof height === 'number') {
        const currentSize = targetWindow.getSize();
        targetWindow.setSize(currentSize[0], height, true);
      }

      return { success: true, size: targetWindow.getSize() };
    } catch (error) {
      console.error('设置窗口大小失败:', error);
      return { success: false, error: error.message };
    }
  });

  // Get window size
  ipcMain.handle('get-window-size', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow || targetWindow.isDestroyed()) {
      return { width: 0, height: 0 };
    }

    const [width, height] = targetWindow.getSize();
    return { width, height };
  });

  // 打开新窗口
  ipcMain.handle('open-new-window', async (event, options = {}) => {
    const MAX_WINDOWS = 8;
    const currentWindowCount = BrowserWindow.getAllWindows().length;

    if (currentWindowCount >= MAX_WINDOWS) {
      return {
        success: false,
        message: `最多只能打开 ${MAX_WINDOWS} 个窗口`
      };
    }

    try {
      // 获取当前窗口位置和尺寸
      const sourceWindow = BrowserWindow.fromWebContents(event.sender);
      const [srcX, srcY] = sourceWindow ? sourceWindow.getPosition() : [100, 100];
      const [srcWidth] = sourceWindow ? sourceWindow.getSize() : [1280];

      // Slim mode support: use smaller size if requested
      const isSlimMode = options.slimMode === true;
      const windowWidth = isSlimMode ? 420 : 1280;
      const windowHeight = isSlimMode ? 550 : 800;
      const windowMinWidth = isSlimMode ? 400 : 1024;
      const windowMinHeight = isSlimMode ? 400 : 640;

      // Calculate new window position
      let newX, newY;
      if (isSlimMode) {
        // Slim mode: align horizontally with 5px gap
        newX = srcX + srcWidth + 5;
        newY = srcY;
      } else {
        // Normal mode: offset diagonally
        newX = srcX + 30;
        newY = srcY + 30;
      }

      // 构建 workspace URL
      const baseUrl = isDev
        ? process.env.ELECTRON_START_URL || `http://localhost:${process.env.WEB_PORT || '3035'}`
        : productionUrl || 'http://127.0.0.1:3035';

      // Support custom URL path from options
      const targetUrl = options.url
        ? `${baseUrl}${options.url.startsWith('/') ? options.url : '/' + options.url}`
        : `${baseUrl}/workspace`;

      // 创建新窗口
      const newWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: windowMinWidth,
        minHeight: windowMinHeight,
        x: newX,
        y: newY,
        show: false,
        backgroundColor: '#111827',
        frame: false,
        titleBarStyle: os.platform() === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: os.platform() === 'darwin' ? { x: 12, y: 12 } : undefined,
        title: `Goodable v${APP_VERSION}`,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
          additionalArguments: [CUSTOM_TITLEBAR_FLAG, `--app-version=${APP_VERSION}`],
        },
      });

      // 先注册事件再加载 URL
      newWindow.once('ready-to-show', () => {
        if (newWindow && !newWindow.isDestroyed() && !newWindow.isVisible()) {
          newWindow.show();
        }
      });

      await newWindow.loadURL(targetUrl);

      // fallback: 确保窗口显示
      if (!newWindow.isDestroyed() && !newWindow.isVisible()) {
        newWindow.show();
      }

      // 注册窗口状态和导航事件
      registerWindowStateEvents(newWindow);
      registerNavigationEvents(newWindow);

      // 设置崩溃监控
      crashMonitor.setupRendererCrashMonitoring(newWindow, null);

      // 开发模式下不再默认打开开发者工具（可通过标题栏按钮手动打开）
      // if (isDev) {
      //   newWindow.webContents.openDevTools({ mode: 'detach', activate: true });
      // }

      return { success: true };
    } catch (error) {
      console.error('创建新窗口失败:', error);
      return {
        success: false,
        message: '创建新窗口失败: ' + (error.message || '未知错误')
      };
    }
  });

  // Arrange slim windows in a 2x4 grid
  ipcMain.handle('arrange-slim-windows', async () => {
    try {
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

      // Get all windows sorted by webContents.id (creation order)
      const allWindows = BrowserWindow.getAllWindows()
        .filter(win => !win.isDestroyed())
        .sort((a, b) => a.webContents.id - b.webContents.id);

      // Filter slim windows (width <= 500)
      const slimWindows = allWindows.filter(win => {
        const [w] = win.getSize();
        return w <= 500;
      });

      if (slimWindows.length === 0) {
        return { success: true, arranged: 0 };
      }

      // Grid layout: 2 rows x 4 cols, max 8 windows
      const cols = 4;
      const rows = 2;
      const maxWindows = cols * rows;
      const windowsToArrange = slimWindows.slice(0, maxWindows);

      // Layout settings
      const startX = 90;           // Start 90px from left edge
      const gapX = 15;             // Horizontal gap between windows
      const gapY = 60;             // Vertical gap between rows

      // Calculate window size (account for gaps)
      const availableWidth = screenWidth - startX - (cols - 1) * gapX;
      const availableHeight = screenHeight - (rows - 1) * gapY;
      const windowWidth = Math.floor(availableWidth / cols);
      const windowHeight = Math.floor(availableHeight / rows);

      // Arrange windows from left side of screen
      windowsToArrange.forEach((win, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = startX + col * (windowWidth + gapX);
        const y = row * (windowHeight + gapY);

        win.setBounds({
          x,
          y,
          width: windowWidth,
          height: windowHeight
        });
      });

      return { success: true, arranged: windowsToArrange.length };
    } catch (error) {
      console.error('Failed to arrange slim windows:', error);
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

      // Disable cache for preview ports (3135-3999) - same as browser "Disable cache"
      const { session } = require('electron');
      const previewPortUrls = [];
      for (let port = 3135; port <= 3999; port++) {
        previewPortUrls.push(`http://localhost:${port}/*`);
        previewPortUrls.push(`http://127.0.0.1:${port}/*`);
      }
      session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: previewPortUrls },
        (details, callback) => {
          details.requestHeaders['Cache-Control'] = 'no-cache';
          details.requestHeaders['Pragma'] = 'no-cache';
          callback({ requestHeaders: details.requestHeaders });
        }
      );
      console.log('[INFO] Preview cache disabled for ports 3135-3999');

      registerIpcHandlers();
      return createMainWindow();
    })
    .catch((error) => {
      console.error('❌ An error occurred while initializing the Electron app.');
      console.error(error instanceof Error ? error.stack || error.message : error);
      app.quit();
    });
}
