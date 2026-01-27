/**
 * Electron Main Process - Claude Agent SDK Demo
 * Phase 1: Pure Electron architecture (like Cherry Studio)
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createRequire } = require('module');

// Use createRequire to resolve SDK path (same as Cherry Studio)
const require_ = createRequire(__filename);

// Get SDK executable path with ASAR handling
function getClaudeExecutablePath() {
  let cliPath = require_.resolve('@anthropic-ai/claude-agent-sdk/cli.js');

  // Critical: Handle ASAR path for packaged app
  if (app.isPackaged) {
    const originalPath = cliPath;
    cliPath = cliPath.replace(/\.asar([\\/])/, '.asar.unpacked$1');
    console.log('[SDK] ASAR path transform:', originalPath, '->', cliPath);
  }

  return cliPath;
}

// Main window reference
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in dev mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

// Send log to renderer
function sendLog(type, ...args) {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  console.log(`[${type}]`, message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', { type, message, timestamp: new Date().toISOString() });
  }
}

// Handle chat request from renderer
ipcMain.handle('chat', async (event, prompt) => {
  sendLog('USER', prompt);

  try {
    // Dynamic import for ESM module
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const cliPath = getClaudeExecutablePath();
    const cwd = process.cwd();

    sendLog('SDK', 'CLI path:', cliPath);
    sendLog('SDK', 'Working directory:', cwd);
    sendLog('SDK', 'App packaged:', app.isPackaged);

    // Environment setup (following Cherry Studio pattern)
    const env = {
      ...process.env,
      // API config - read from environment variables
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co',
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || '',
      // Critical for Electron (Cherry Studio pattern)
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      // Claude config directory
      CLAUDE_CONFIG_DIR: path.join(app.getPath('userData'), '.claude'),
    };

    sendLog('ENV', 'ANTHROPIC_BASE_URL:', env.ANTHROPIC_BASE_URL);
    sendLog('ENV', 'ELECTRON_RUN_AS_NODE:', env.ELECTRON_RUN_AS_NODE);
    sendLog('ENV', 'CLAUDE_CONFIG_DIR:', env.CLAUDE_CONFIG_DIR);

    // canUseTool callback - permission check (may not trigger for all tools)
    const canUseTool = async (toolName, input, options) => {
      sendLog('TOOL', `canUseTool called: ${toolName}`);
      sendLog('TOOL', `Input keys: ${Object.keys(input || {}).join(', ')}`);

      // Auto-approve all tools
      return { behavior: 'allow', updatedInput: input };
    };

    // PreToolUse hook - captures ALL tool calls (Cherry Studio pattern)
    const preToolUseHook = async (input, toolUseID, options) => {
      if (input.hook_event_name !== 'PreToolUse') {
        return {};
      }

      sendLog('HOOK', `PreToolUse: ${input.tool_name} (id: ${toolUseID})`);
      sendLog('HOOK', `Permission mode: ${input.permission_mode}`);
      sendLog('HOOK', `CWD: ${input.cwd}`);

      // Log tool input (truncated)
      const inputStr = JSON.stringify(input.tool_input || {});
      sendLog('HOOK', `Input: ${inputStr.substring(0, 100)}${inputStr.length > 100 ? '...' : ''}`);

      // Return empty to proceed without modification
      return {};
    };

    sendLog('SDK', 'Starting query with canUseTool + PreToolUse hook...');

    const response = query({
      prompt,
      options: {
        cwd,
        pathToClaudeCodeExecutable: cliPath,
        env,
        permissionMode: 'default',  // Use default mode to trigger canUseTool
        canUseTool,
        hooks: {
          PreToolUse: [{
            hooks: [preToolUseHook]
          }]
        }
      },
    });

    let reply = '';
    let toolCallCount = 0;

    for await (const message of response) {
      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              reply += block.text;
            } else if (block.type === 'tool_use') {
              toolCallCount++;
              sendLog('STREAM', `Tool use: ${block.name}`);
            }
          }
        }
      } else if (message.type === 'result') {
        sendLog('RESULT', `Session ID: ${message.session_id}`);
        sendLog('RESULT', `Tool calls: ${toolCallCount}`);
      } else if (message.type === 'error') {
        sendLog('ERROR', message.error?.message || 'Unknown error');
      }
    }

    sendLog('ASSISTANT', reply.substring(0, 200) + (reply.length > 200 ? '...' : ''));

    return { success: true, reply, toolCallCount };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    sendLog('ERROR', errorMsg);

    // Check for Stream closed error specifically
    if (errorMsg.includes('Stream closed')) {
      sendLog('ERROR', '>>> Stream closed detected! This is the issue we are investigating.');
    }

    return { success: false, error: errorMsg };
  }
});

// App lifecycle
app.whenReady().then(() => {
  console.log('[APP] Electron ready');
  console.log('[APP] Platform:', process.platform);
  console.log('[APP] Packaged:', app.isPackaged);
  console.log('[APP] User data:', app.getPath('userData'));

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
