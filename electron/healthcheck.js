const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function findRipgrepPath(rootDir) {
  const rgExe = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const platformDir = `${process.arch}-${process.platform}`;
  const sdkVendorPath = path.join(
    '@anthropic-ai', 'claude-agent-sdk', 'vendor', 'ripgrep', platformDir, rgExe
  );

  if (isDev) {
    return path.join(rootDir, 'node_modules', sdkVendorPath);
  }

  // 生产环境：优先查 C2 路径（standalone），兜底查 C1 路径（app.asar.unpacked）
  const c2Path = path.join(
    process.resourcesPath, 'standalone', 'node_modules', sdkVendorPath
  );
  const c1Path = path.join(
    process.resourcesPath, 'app.asar.unpacked', 'node_modules', sdkVendorPath
  );

  if (fs.existsSync(c2Path)) return c2Path;
  if (fs.existsSync(c1Path)) return c1Path;

  throw new Error('ripgrep not found in either C1 or C2 path');
}

function findWasmPath(rootDir, filename) {
  const sdkWasmPath = path.join('@anthropic-ai', 'claude-agent-sdk', filename);

  if (isDev) {
    return path.join(rootDir, 'node_modules', sdkWasmPath);
  }

  // 生产环境：优先 C2，兜底 C1
  const c2Path = path.join(
    process.resourcesPath, 'standalone', 'node_modules', sdkWasmPath
  );
  const c1Path = path.join(
    process.resourcesPath, 'app.asar.unpacked', 'node_modules', sdkWasmPath
  );

  if (fs.existsSync(c2Path)) return c2Path;
  if (fs.existsSync(c1Path)) return c1Path;

  throw new Error(`${filename} not found in either C1 or C2 path`);
}

async function checkNextServerAlive(url, maxRetries = 40, intervalMs = 500) {
  const http = require('http');
  const https = require('https');
  const { protocol } = new URL(url);
  const requester = protocol === 'https:' ? https : http;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const request = requester.get(url, (response) => {
          response.resume();
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
            resolve();
          } else {
            reject(new Error(`HTTP ${response.statusCode}`));
          }
        });
        request.on('error', reject);
        request.setTimeout(intervalMs, () => {
          request.destroy();
          reject(new Error('timeout'));
        });
      });
      return { success: true };
    } catch (e) {
      // 连接失败，继续重试
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { success: false, message: `Next server not responding after ${maxRetries * intervalMs / 1000}s` };
}

function execCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function runHealthcheck(nextServerUrl) {
  const rootDir = isDev ? path.join(__dirname, '..') : app.getAppPath();
  const userDataDir = app.getPath('userData');
  const logsDir = path.join(userDataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, 'healthcheck.log');
  const logs = [];

  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    logs.push(line);
    console.log('[Healthcheck]', msg);
  }

  try {
    log('=== Healthcheck started ===');

    // 1. better-sqlite3
    log('Checking better-sqlite3...');
    try {
      const Database = require('better-sqlite3');
      const testDbPath = path.join(userDataDir, 'healthcheck-test.db');
      const db = new Database(testDbPath);
      db.close();
      fs.unlinkSync(testDbPath);
      log('✓ better-sqlite3 OK');
    } catch (e) {
      log('✗ better-sqlite3 failed: ' + e.message);
      throw new Error('better-sqlite3 check failed: ' + e.message);
    }

    // 2. SDK 加载（优先 dynamic import，fallback require）
    log('Checking SDK module...');
    try {
      const sdkPath = isDev
        ? path.join(rootDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')
        : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk');

      // ESM 使用 dynamic import，但仅测试模块可加载，不调用
      try {
        await import(path.join(sdkPath, 'sdk.mjs'));
        log('✓ SDK module (ESM) OK');
      } catch (esmErr) {
        // Fallback to require for CJS
        require(sdkPath);
        log('✓ SDK module (CJS) OK');
      }
    } catch (e) {
      log('✗ SDK module failed: ' + e.message);
      throw new Error('SDK module check failed: ' + e.message);
    }

    // 3. ripgrep 存在和可执行
    log('Checking ripgrep...');
    try {
      const rgPath = findRipgrepPath(rootDir);
      fs.accessSync(rgPath, fs.constants.X_OK);
      const version = await execCommand(rgPath, ['--version']);
      log(`✓ ripgrep OK: ${version.split('\n')[0]}`);
    } catch (e) {
      log('✗ ripgrep failed: ' + e.message);
      throw new Error('ripgrep check failed: ' + e.message);
    }

    // 4. wasm 文件存在
    log('Checking wasm files...');
    try {
      const wasmFiles = ['resvg.wasm', 'tree-sitter-bash.wasm', 'tree-sitter.wasm'];
      for (const wasm of wasmFiles) {
        const wasmPath = findWasmPath(rootDir, wasm);
        fs.accessSync(wasmPath, fs.constants.R_OK);
      }
      log('✓ wasm files OK');
    } catch (e) {
      log('✗ wasm files failed: ' + e.message);
      throw new Error('wasm files check failed: ' + e.message);
    }

    // 5. git 可用
    log('Checking git...');
    try {
      const version = await execCommand('git', ['--version']);
      log(`✓ git OK: ${version}`);
    } catch (e) {
      log('✗ git failed: ' + e.message);
      throw new Error('git check failed: ' + e.message);
    }

    // 6. Next server 存活（带重试）
    if (nextServerUrl) {
      log(`Checking Next server at ${nextServerUrl}...`);
      const result = await checkNextServerAlive(nextServerUrl);
      if (!result.success) {
        log('✗ Next server failed: ' + result.message);
        throw new Error('Next server check failed: ' + result.message);
      }
      log('✓ Next server OK');
    }

    log('=== Healthcheck passed ===');
    fs.writeFileSync(logFile, logs.join('\n'), 'utf8');
    return { success: true };
  } catch (error) {
    log('=== Healthcheck FAILED ===');
    log('Error: ' + error.message);
    fs.writeFileSync(logFile, logs.join('\n'), 'utf8');
    return { success: false, message: error.message };
  }
}

module.exports = { runHealthcheck };
