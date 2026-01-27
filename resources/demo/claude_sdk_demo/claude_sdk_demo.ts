/**
 * Claude Agent SDK Demo
 * Multi-turn conversation example
 */

import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs';

// Get builtin runtime paths (simplified from paths.ts)
function getBuiltinNodeDir(): string | null {
  const nodePath = path.join(process.cwd(), 'node-runtime', 'win32-x64');
  if (fs.existsSync(path.join(nodePath, 'node.exe'))) {
    return nodePath;
  }
  return null;
}

function getBuiltinGitBashPath(): string | null {
  const bashPath = path.join(process.cwd(), 'git-runtime', 'win32-x64', 'bin', 'bash.exe');
  if (fs.existsSync(bashPath)) {
    return bashPath;
  }
  return null;
}

function getClaudeCodeExecutablePath(): string {
  return path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
}

// Get builtin Git directory (allow even if bash.exe missing, for testing)
function getBuiltinGitDir(): string | null {
  if (process.platform !== 'win32') return null;

  const gitDir = path.join(process.cwd(), 'git-runtime', 'win32-x64');
  if (fs.existsSync(gitDir)) {
    return gitDir;
  }
  return null;
}

// Setup environment once
function setupEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // API config - read from environment variables
  env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co';
  env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';

  const pathParts: string[] = [];

  // Inject builtin Node.js to PATH
  const builtinNodeDir = getBuiltinNodeDir();
  if (builtinNodeDir) {
    pathParts.push(builtinNodeDir);
    console.log(`[Setup] Node.js path: ${builtinNodeDir}`);
  }

  // Inject builtin Git to PATH (match main project logic)
  const builtinGitDir = getBuiltinGitDir();
  if (builtinGitDir) {
    pathParts.push(path.join(builtinGitDir, 'cmd'));        // git.exe
    pathParts.push(path.join(builtinGitDir, 'usr', 'bin')); // unix tools
    pathParts.push(path.join(builtinGitDir, 'bin'));        // bash.exe
    console.log(`[Setup] Git runtime path: ${builtinGitDir}`);
  }

  // Set Git Bash path (required by SDK on Windows)
  // Always set this to our builtin path - SDK will error if file doesn't exist
  const gitBashPath = path.join(process.cwd(), 'git-runtime', 'win32-x64', 'bin', 'bash.exe');
  env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath;
  console.log(`[Setup] Git Bash path set: ${gitBashPath}`);
  console.log(`[Setup] Git Bash exists: ${fs.existsSync(gitBashPath)}`);
  if (!fs.existsSync(gitBashPath)) {
    console.log(`[Setup] ⚠️ bash.exe not found at configured path - SDK should error`);
  }

  // PATH isolation mode: use --isolated-path to test production-like environment
  const isolatedPath = process.argv.includes('--isolated-path');

  if (pathParts.length > 0) {
    let newPath: string;

    if (isolatedPath) {
      // Isolated mode: ONLY use builtin runtimes (no system PATH)
      newPath = pathParts.join(path.delimiter);
      console.log(`[Setup] ⚠️  ISOLATED PATH MODE - only builtin runtimes (simulating production)`);
    } else {
      // Normal mode: prepend to existing PATH
      const originalPath = process.env.PATH || process.env.Path || '';
      newPath = pathParts.join(path.delimiter) + (originalPath ? path.delimiter + originalPath : '');
      console.log(`[Setup] PATH prepended: ${pathParts.join(', ')}`);
    }

    env.PATH = newPath;
    // Critical: also modify process.env.PATH as SDK may not use passed env
    process.env.PATH = newPath;
  }

  return env;
}

// Send a message and get response
async function sendMessage(
  prompt: string,
  env: NodeJS.ProcessEnv,
  sessionId?: string,
  useAdditionalDirectories?: boolean
): Promise<{ reply: string; sessionId: string }> {
  const cliPath = getClaudeCodeExecutablePath();
  const cwd = process.cwd();

  const options: any = {
    cwd,
    pathToClaudeCodeExecutable: cliPath,
    env: env,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    resume: sessionId,
  };

  // Test additionalDirectories (triggers cygpath on Windows)
  if (useAdditionalDirectories) {
    options.additionalDirectories = [cwd];
    console.log(`[Test] Using additionalDirectories: [${cwd}]`);
  }

  const response = query({
    prompt,
    options,
  });

  let reply = '';
  let resultSessionId = sessionId || '';

  for await (const message of response) {
    if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            reply += block.text;
          }
        }
      }
    } else if (message.type === 'result') {
      const result = message as SDKResultMessage;
      resultSessionId = result.session_id;
    }
  }

  return { reply, sessionId: resultSessionId };
}

// Verify command sources
function verifyCommandSources() {
  const { execSync } = require('child_process');
  const gitRuntimePath = path.join(process.cwd(), 'git-runtime', 'win32-x64').toLowerCase();

  console.log('\n--- Command Source Verification ---');

  const commands = ['bash', 'git', 'cygpath', 'sh'];
  for (const cmd of commands) {
    try {
      const cmdPath = execSync(`where ${cmd}`, { encoding: 'utf-8' }).split('\n')[0].trim();
      const isBuiltin = cmdPath.toLowerCase().includes(gitRuntimePath);
      const marker = isBuiltin ? '✓' : '⚠️';
      console.log(`${marker} ${cmd}: ${cmdPath} ${isBuiltin ? '(builtin)' : '(EXTERNAL!)'}`);
    } catch (err) {
      console.log(`❌ ${cmd}: NOT FOUND`);
    }
  }
  console.log('');
}

async function main() {
  const testFileOps = process.argv.includes('--file-ops');
  const testAbsolutePath = process.argv.includes('--test-abs-path');

  console.log('=== Claude Agent SDK Multi-turn Demo ===\n');

  const env = setupEnv();

  // Verify command sources after PATH setup
  verifyCommandSources();

  const cliPath = getClaudeCodeExecutablePath();
  console.log(`[Setup] CLI path: ${cliPath}`);
  console.log(`[Setup] API URL: ${env.ANTHROPIC_BASE_URL}`);
  console.log(`[Setup] File ops test: ${testFileOps ? 'enabled' : 'disabled (use --file-ops to enable)'}`);
  console.log(`[Setup] Absolute path test: ${testAbsolutePath ? 'enabled' : 'disabled (use --test-abs-path to enable)'}\n`);

  // Turn 1: Initial greeting
  console.log('--- Turn 1 ---');
  console.log('[User] My favorite number is 42. Please remember it.');
  const turn1 = await sendMessage('My favorite number is 42. Please remember it.', env, undefined, testAbsolutePath);
  console.log('[Assistant]', turn1.reply);
  console.log('[Session ID]', turn1.sessionId);

  // Turn 2: Test context memory
  console.log('\n--- Turn 2 ---');
  console.log('[User] What is my favorite number?');
  const turn2 = await sendMessage('What is my favorite number?', env, turn1.sessionId);
  console.log('[Assistant]', turn2.reply);

  if (testFileOps) {
    // Turn 3: Test file creation
    console.log('\n--- Turn 3: File Creation ---');
    console.log('[User] Create a file named test-demo.txt with content "Hello World"');
    const turn3 = await sendMessage('Create a file named test-demo.txt with content "Hello World"', env, turn2.sessionId);
    console.log('[Assistant]', turn3.reply);

    // Turn 4: Test file modification
    console.log('\n--- Turn 4: File Modification ---');
    console.log('[User] Modify test-demo.txt to change "Hello World" to "Hello Claude SDK"');
    const turn4 = await sendMessage('Modify test-demo.txt to change "Hello World" to "Hello Claude SDK"', env, turn3.sessionId);
    console.log('[Assistant]', turn4.reply);

    // Turn 5: Test file reading
    console.log('\n--- Turn 5: File Reading ---');
    console.log('[User] Read test-demo.txt and show me its content');
    const turn5 = await sendMessage('Read test-demo.txt and show me its content', env, turn4.sessionId);
    console.log('[Assistant]', turn5.reply);
  }

  console.log('\n=== Demo completed ===');
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});

