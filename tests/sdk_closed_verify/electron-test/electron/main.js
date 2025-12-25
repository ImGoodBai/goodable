const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
const logFile = path.join(app.getPath('userData'), `electron-sdk-test-${Date.now()}.log`);

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

log('========================================');
log('Electron SDK Stdio Test');
log('========================================');
log(`isDev: ${isDev}`);
log(`isPackaged: ${app.isPackaged}`);
log(`appPath: ${app.getAppPath()}`);
log(`userData: ${app.getPath('userData')}`);
log(`logFile: ${logFile}`);
log('========================================');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 加载简单的HTML页面
  mainWindow.loadFile('electron/index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  log('✅ Main window created');
}

// 在Electron ready后自动运行SDK测试
app.whenReady().then(() => {
  createWindow();

  // 延迟2秒后运行测试，确保窗口已创建
  setTimeout(() => {
    log('\n🚀 Starting SDK test in 2 seconds...\n');
    runSDKTest();
  }, 2000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// SDK测试函数
async function runSDKTest() {
  const { query } = require('@anthropic-ai/claude-agent-sdk');
  const { spawn } = require('child_process');

  log('📝 Test: Spawn with stdio configuration');
  log(`Environment: ${isDev ? 'Development' : 'Production (Packaged)'}`);
  log(`Platform: ${process.platform}`);
  log(`Node version: ${process.version}`);

  // 设置API配置
  process.env.ANTHROPIC_AUTH_TOKEN = 'sk-6WtM66cmhfWv6Wirw34bh5S0FeyBTkLlOcV6UqQXgA';
  process.env.ANTHROPIC_BASE_URL = 'https://api.100agent.co';

  try {
    const testDir = path.join(app.getPath('userData'), 'sdk-test-workspace');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    log(`Test workspace: ${testDir}`);

    const response = query({
      prompt: "创建一个hello.txt文件，内容写入'Hello from Electron SDK Test'",
      options: {
        cwd: testDir,
        model: 'claude-sonnet-4-5-20250929',
        permissionMode: 'default', // 必须用default模式测试
        stderr: (data) => {
          log(`[SDK stderr] ${data}`);
        },
        // 关键：自定义spawn配置，捕获完整输出
        spawnClaudeCodeProcess: (options) => {
          log('🔧 Custom spawn called');
          log(`  Command: ${options.command}`);
          log(`  Args count: ${options.args.length}`);
          log(`  CWD: ${options.cwd}`);

          // 记录CLI路径
          const cliPath = options.args[0];
          log(`  CLI path: ${cliPath}`);

          const proc = spawn(options.command, options.args, {
            cwd: options.cwd,
            env: options.env,
            stdio: ['pipe', 'pipe', 'pipe'], // 明确使用pipe模式
            windowsHide: true,
          });

          log(`  ✅ Process spawned, PID: ${proc.pid}`);
          log(`  📊 Streams: stdin=${!!proc.stdin}, stdout=${!!proc.stdout}, stderr=${!!proc.stderr}`);

          // 监听所有输出用于诊断
          if (proc.stdout) {
            proc.stdout.on('data', (data) => {
              log(`  [CLI stdout] ${data.toString()}`);
            });
            proc.stdout.on('close', () => {
              log('  🔚 stdout closed');
            });
          }

          if (proc.stderr) {
            proc.stderr.on('data', (data) => {
              log(`  [CLI stderr] ${data.toString()}`);
            });
            proc.stderr.on('close', () => {
              log('  🔚 stderr closed');
            });
          }

          if (proc.stdin) {
            proc.stdin.on('close', () => {
              log('  🔚 stdin closed');
            });
            proc.stdin.on('error', (err) => {
              log(`  ❌ stdin error: ${err.message}`);
            });
          }

          proc.on('exit', (code, signal) => {
            log(`  🔚 Process exited, code: ${code}, signal: ${signal}`);
          });

          proc.on('error', (err) => {
            log(`  ❌ Process spawn error: ${err.message}`);
          });

          return proc;
        },
        // Hook测试（验证Hook是否能被调用）
        hooks: {
          PreToolUse: [{
            matcher: '.*',
            hooks: [
              async (hookInput) => {
                log(`🪝 PreToolUse Hook called! Tool: ${hookInput.tool_name}`);
                return {};
              }
            ]
          }]
        }
      }
    });

    let messageCount = 0;
    let hasError = false;
    let hookCalled = false;

    for await (const msg of response) {
      messageCount++;
      log(`Message #${messageCount}, type: ${msg.type}`);

      if (msg.type === 'system' && msg.subtype === 'init') {
        log(`  ✅ Session initialized: ${msg.session_id}`);
      }

      if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          const textContent = content.find(c => c.type === 'text');
          if (textContent?.text) {
            log(`  💬 Assistant: ${textContent.text.substring(0, 100)}`);
          }
          const toolUse = content.find(c => c.type === 'tool_use');
          if (toolUse) {
            log(`  🔧 Tool use: ${toolUse.name}`);
          }
        }
      }

      if (msg.type === 'result') {
        log(`  🎯 Result: ${msg.subtype}`);
        if (msg.subtype === 'error' || msg.is_error) {
          log(`  ❌ Error detected`);
          hasError = true;
        }
        if (msg.subtype === 'success') {
          log(`  ✅ Success`);
        }
      }
    }

    log(`\n📊 Test Summary:`);
    log(`Total messages: ${messageCount}`);
    log(`Has errors: ${hasError}`);
    log(`Result: ${hasError ? '❌ FAILED' : '✅ PASSED'}`);
    log(`\nLog file saved to: ${logFile}`);

    // 通知窗口测试完成
    if (mainWindow) {
      mainWindow.webContents.send('test-complete', {
        success: !hasError,
        messageCount,
        logFile
      });
    }

  } catch (error) {
    log(`\n❌ Test failed with exception:`);
    log(`Error: ${error.message}`);
    log(`Stack: ${error.stack}`);

    if (mainWindow) {
      mainWindow.webContents.send('test-complete', {
        success: false,
        error: error.message,
        logFile
      });
    }
  }
}

// IPC处理
ipcMain.on('run-test', () => {
  log('Received run-test request from renderer');
  runSDKTest();
});
