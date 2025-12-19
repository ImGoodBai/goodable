/**
 * Crash Monitoring & Error Handling for Electron
 *
 * 监控和处理应用崩溃，包括：
 * - 主进程未捕获异常
 * - Promise rejection
 * - 渲染进程崩溃
 * - GPU 进程崩溃
 * - 子进程意外退出
 */

const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const crashLogDir = path.join(app.getPath('userData'), 'crash-logs');

/**
 * 初始化崩溃监控
 */
function initCrashMonitoring() {
  // 创建日志目录
  if (!fs.existsSync(crashLogDir)) {
    fs.mkdirSync(crashLogDir, { recursive: true });
  }

  // 清理 7 天前的日志
  cleanOldCrashLogs();

  console.log('[CrashMonitor] Initialized, log directory:', crashLogDir);
}

/**
 * 写入崩溃日志
 */
function writeCrashLog(type, error, details = {}) {
  const timestamp = new Date().toISOString();
  const logFile = path.join(crashLogDir, `crash-${new Date().toISOString().split('T')[0]}.log`);

  const packageJson = require(path.join(__dirname, '..', 'package.json'));

  const logEntry = {
    timestamp,
    type,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : String(error),
    details,
    appVersion: packageJson.version,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };

  const logText = `
========================================
[${timestamp}] ${type}
========================================
${JSON.stringify(logEntry, null, 2)}

`;

  // 异步写入，避免阻塞
  fs.appendFile(logFile, logText, (err) => {
    if (err) {
      console.error('[CrashMonitor] Failed to write crash log:', err);
    } else {
      console.error(`[CrashMonitor] ${type} logged to ${logFile}`);
    }
  });
}

/**
 * 显示崩溃对话框
 */
function showCrashDialog(type, message) {
  const options = {
    type: 'error',
    title: '应用遇到错误',
    message: `应用检测到异常：${type}`,
    detail: `错误信息：${message}\n\n日志已保存到：${crashLogDir}\n\n应用将尝试继续运行，如频繁出现请重启应用。`,
    buttons: ['确定', '查看日志目录'],
  };

  dialog.showMessageBox(options).then((response) => {
    if (response.response === 1) {
      // 用户点击"查看日志目录"
      shell.openPath(crashLogDir);
    }
  }).catch((err) => {
    console.error('[CrashMonitor] Failed to show dialog:', err);
  });
}

/**
 * 清理 7 天前的日志
 */
function cleanOldCrashLogs() {
  try {
    if (!fs.existsSync(crashLogDir)) return;

    const files = fs.readdirSync(crashLogDir);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    files.forEach(file => {
      const filePath = path.join(crashLogDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < sevenDaysAgo) {
        fs.unlinkSync(filePath);
        console.log(`[CrashMonitor] Cleaned old log: ${file}`);
      }
    });
  } catch (err) {
    console.warn('[CrashMonitor] Failed to clean old logs:', err);
  }
}

/**
 * 监控主进程异常
 */
function monitorMainProcess() {
  // 1. 未捕获异常
  process.on('uncaughtException', (error) => {
    console.error('[CrashMonitor] Uncaught Exception:', error);
    writeCrashLog('UNCAUGHT_EXCEPTION', error);
    showCrashDialog('未捕获异常', error.message);

    // 延迟 2 秒退出，让日志写完
    setTimeout(() => {
      console.error('[CrashMonitor] Exiting due to uncaught exception...');
      app.quit();
    }, 2000);
  });

  // 2. 未处理的 Promise rejection
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[CrashMonitor] Unhandled Promise Rejection:', reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    writeCrashLog('UNHANDLED_REJECTION', error, {
      promise: String(promise),
    });
    showCrashDialog('未处理的Promise拒绝', error.message);
  });

  console.log('[CrashMonitor] Main process monitoring enabled');
}

/**
 * 监控 GPU 进程
 */
function monitorGPUProcess() {
  app.on('gpu-process-crashed', (event, killed) => {
    console.error('[CrashMonitor] GPU process crashed, killed:', killed);
    writeCrashLog('GPU_PROCESS_CRASHED', new Error('GPU process crashed'), { killed });
    showCrashDialog('GPU进程崩溃', 'GPU 进程已崩溃，可能是显卡驱动问题');
  });

  console.log('[CrashMonitor] GPU process monitoring enabled');
}

/**
 * 监控渲染进程
 */
function setupRendererCrashMonitoring(window, createMainWindowFn) {
  window.webContents.on('render-process-gone', (event, details) => {
    console.error('[CrashMonitor] Renderer process gone:', details);
    writeCrashLog('RENDERER_PROCESS_GONE', new Error('Renderer process crashed'), details);

    if (details.reason !== 'clean-exit') {
      showCrashDialog('渲染进程崩溃', `原因: ${details.reason}`);

      // 自动重启窗口
      console.log('[CrashMonitor] Attempting to restart window...');
      setTimeout(() => {
        createMainWindowFn().catch((err) => {
          console.error('[CrashMonitor] Failed to restart window:', err);
        });
      }, 1000);
    }
  });

  window.webContents.on('unresponsive', () => {
    console.warn('[CrashMonitor] Renderer process unresponsive');
    writeCrashLog('RENDERER_UNRESPONSIVE', new Error('Renderer became unresponsive'));

    const options = {
      type: 'warning',
      title: '应用无响应',
      message: '页面已无响应',
      detail: '是否等待页面恢复？',
      buttons: ['等待', '重启应用'],
    };

    dialog.showMessageBox(options).then((response) => {
      if (response.response === 1) {
        app.relaunch();
        app.quit();
      }
    }).catch((err) => {
      console.error('[CrashMonitor] Failed to show dialog:', err);
    });
  });

  window.webContents.on('responsive', () => {
    console.log('[CrashMonitor] Renderer process responsive again');
  });

  console.log('[CrashMonitor] Renderer process monitoring enabled');
}

/**
 * 监控子进程
 * @param {ChildProcess} childProcess - 子进程实例
 * @param {string} name - 进程名称
 * @param {Function} isShuttingDown - 返回是否正在关闭的函数
 */
function monitorChildProcess(childProcess, name, isShuttingDown) {
  childProcess.on('error', (error) => {
    console.error(`[CrashMonitor] ${name} spawn error:`, error);
    writeCrashLog('CHILD_PROCESS_ERROR', error, { processName: name });
    showCrashDialog('子进程错误', `${name} 启动失败: ${error.message}`);
  });

  childProcess.on('exit', (code, signal) => {
    // 检查是否正在关闭（通过函数调用或直接值）
    const shuttingDown = typeof isShuttingDown === 'function' ? isShuttingDown() : isShuttingDown;

    if (!shuttingDown && code !== 0) {
      console.error(`[CrashMonitor] ${name} exited unexpectedly. Code: ${code}, Signal: ${signal}`);
      writeCrashLog('CHILD_PROCESS_EXIT', new Error(`${name} exited with code ${code}`), {
        processName: name,
        exitCode: code,
        signal,
      });
      showCrashDialog('子进程退出', `${name} 意外退出，退出码: ${code}`);
    }
  });

  console.log(`[CrashMonitor] Monitoring child process: ${name}`);
}

module.exports = {
  initCrashMonitoring,
  monitorMainProcess,
  monitorGPUProcess,
  setupRendererCrashMonitoring,
  monitorChildProcess,
};
