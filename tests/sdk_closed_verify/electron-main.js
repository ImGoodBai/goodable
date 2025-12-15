const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { runSDKTest } = require('./test-sdk-electron');

let mainWindow;
const logFilePath = path.join(app.getPath('userData'), `electron-test-${Date.now()}.log`);

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFilePath, line + '\n');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // 加载简单的测试界面，带上自动测试参数
  const autoTest = process.env.AUTO_TEST === 'true' || process.argv.includes('--auto-test');
  mainWindow.loadFile('index.html', { hash: autoTest ? 'auto' : '' });

  log(`自动测试模式: ${autoTest ? '是' : '否'}`);

  // 打开开发者工具（方便查看日志）
  mainWindow.webContents.openDevTools();

  log('========================================');
  log('Electron 应用启动');
  log('========================================');
  log(`App path: ${app.getAppPath()}`);
  log(`User data: ${app.getPath('userData')}`);
  log(`Is packaged: ${app.isPackaged}`);
  log(`Node ENV: ${process.env.NODE_ENV}`);
  log(`Platform: ${process.platform}`);
  log(`Log file: ${logFilePath}`);
  log('========================================\n');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 监听测试请求
ipcMain.handle('run-test', async (event, testConfig) => {
  log(`\n收到测试请求: ${testConfig.name}`);
  log(`使用自定义spawn: ${testConfig.useCustomSpawn}`);

  try {
    const result = await runSDKTest({
      ...testConfig,
      logFn: log,
      workDir: app.getPath('userData'),
    });

    log(`测试完成: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    return result;
  } catch (error) {
    log(`测试异常: ${error.message}`);
    log(`Stack: ${error.stack}`);
    return {
      success: false,
      error: error.message,
    };
  }
});

// 获取日志文件路径
ipcMain.handle('get-log-path', () => {
  return logFilePath;
});

// 获取应用信息
ipcMain.handle('get-app-info', () => {
  return {
    isPackaged: app.isPackaged,
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform,
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
  };
});
