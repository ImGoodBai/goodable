/**
 * PreviewManager - Handles per-project development servers (live preview)
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import kill from 'tree-kill';
import { createHash } from 'crypto';
import { findAvailablePort } from '@/lib/utils/ports';
import { getProjectById, updateProject, updateProjectStatus } from './project';
import { scaffoldBasicNextApp } from '@/lib/utils/scaffold';
import { PREVIEW_CONFIG } from '@/lib/config/constants';
import { timelineLogger } from './timeline';
import {
  detectPython,
  createVirtualEnv,
  getVenvPythonPath,
  ensurePythonGitignore,
} from '@/lib/utils/python';
import { getBuiltinNodePath, getBuiltinNpmCliPath, getBuiltinNodeDir } from '@/lib/config/paths';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun';

type PackageManagerId = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * 获取 npm 执行配置
 * 优先使用内置 Node.js，失败时回退到系统 npm
 */
function getNpmExecutor(): { command: string; args: string[]; useBuiltin: boolean } {
  const builtinNode = getBuiltinNodePath();
  const builtinNpmCli = getBuiltinNpmCliPath();

  if (builtinNode && builtinNpmCli) {
    console.log('[PreviewManager] 🔧 Using builtin Node.js for npm operations');
    return {
      command: builtinNode,
      args: [builtinNpmCli],
      useBuiltin: true,
    };
  }

  console.log('[PreviewManager] ⚠️ Builtin Node.js not found, falling back to system npm');
  return {
    command: npmCommand,
    args: [],
    useBuiltin: false,
  };
}

const PACKAGE_MANAGER_COMMANDS: Record<
  PackageManagerId,
  { command: string; installArgs: string[] }
> = {
  npm: { command: npmCommand, installArgs: ['install', '--registry=https://registry.npmmirror.com'] },
  pnpm: { command: pnpmCommand, installArgs: ['install', '--registry=https://registry.npmmirror.com'] },
  yarn: { command: yarnCommand, installArgs: ['install', '--registry=https://registry.npmmirror.com'] },
  bun: { command: bunCommand, installArgs: ['install'] },
};

const LOG_LIMIT = PREVIEW_CONFIG.LOG_LIMIT;
const PREVIEW_FALLBACK_PORT_START = PREVIEW_CONFIG.FALLBACK_PORT_START;
const PREVIEW_FALLBACK_PORT_END = PREVIEW_CONFIG.FALLBACK_PORT_END;
const PREVIEW_MAX_PORT = 65_535;
const PREVIEW_IDLE_STOP_TIMEOUT_MS = 60_000;
const PREVIEW_IDLE_CHECK_INTERVAL_MS = 10_000;
const __VERBOSE_LOG__ = (process.env.LOG_LEVEL || '').toLowerCase() === 'verbose';

/**
 * 创建子项目的安全环境变量
 * 过滤掉主项目特有的敏感变量，防止污染子项目
 */
function createSafeSubprocessEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  // 黑名单：主项目特有的变量，绝对不能传递给子项目
  const BLACKLIST = [
    'DATABASE_URL',      // 主项目数据库（最危险）
    'ENCRYPTION_KEY',    // 主项目加密密钥
    'PROJECTS_DIR',      // 主项目配置目录
  ];

  const safeEnv: Record<string, string | undefined> = { NODE_ENV: 'development' };

  // 复制所有非黑名单的环境变量
  for (const [key, value] of Object.entries(process.env)) {
    if (!BLACKLIST.includes(key)) {
      safeEnv[key] = value;
    }
  }

  // 应用覆盖变量（优先级最高）
  Object.assign(safeEnv, overrides);

  // 规范化运行模式，确保为有效取值
  const mode = String(safeEnv.NODE_ENV || '').toLowerCase();
  if (mode !== 'development' && mode !== 'production' && mode !== 'test') {
    safeEnv.NODE_ENV = 'development';
  }

  return safeEnv as NodeJS.ProcessEnv;
}
const ROOT_ALLOWED_FILES = new Set([
  '.DS_Store',
  '.editorconfig',
  '.env',
  '.env.development',
  '.env.local',
  '.env.production',
  '.eslintignore',
  '.eslintrc',
  '.eslintrc.cjs',
  '.eslintrc.js',
  '.eslintrc.json',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc',
  '.prettierrc.cjs',
  '.prettierrc.js',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  'LICENSE',
  'README',
  'README.md',
  'package-lock.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'requirements.txt',
  'yarn.lock',
]);
const ROOT_ALLOWED_DIR_PREFIXES = ['.'];
const ROOT_ALLOWED_DIRS = new Set([
  '.git',
  '.idea',
  '.vscode',
  '.github',
  '.husky',
  '.pnpm-store',
  '.turbo',
  '.next',
  'node_modules',
]);
const ROOT_OVERWRITABLE_FILES = new Set([
  '.gitignore',
  '.eslintignore',
  '.env',
  '.env.development',
  '.env.local',
  '.env.production',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  'README',
  'README.md',
  'README.txt',
]);

type PreviewStatus = 'starting' | 'running' | 'stopped' | 'error';

interface PreviewProcess {
  process: ChildProcess | null;
  port: number;
  url: string;
  status: PreviewStatus;
  logs: string[];
  startedAt: Date;
  packageJsonMtime?: Date;
  packageJsonHash?: string; // 用于检测 package.json 内容变化
}

interface EnvOverrides {
  port?: number;
  url?: string;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function parsePort(value?: string): number | null {
  if (!value) return null;
  const numeric = Number.parseInt(stripQuotes(value), 10);
  if (Number.isFinite(numeric) && numeric > 0 && numeric <= 65535) {
    return numeric;
  }
  return null;
}

async function readPackageJson(
  projectPath: string
): Promise<Record<string, any> | null> {
  try {
    const raw = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function collectEnvOverrides(projectPath: string): Promise<EnvOverrides> {
  const overrides: EnvOverrides = {};
  const files = ['.env.local', '.env'];

  for (const fileName of files) {
    const filePath = path.join(projectPath, fileName);
    try {
      const contents = await fs.readFile(filePath, 'utf8');
      const lines = contents.split(/\r?\n/);
      let candidateUrl: string | null = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) {
          continue;
        }

        const [rawKey, ...rawValueParts] = line.split('=');
        const key = rawKey.trim();
        const rawValue = rawValueParts.join('=');
        const value = stripQuotes(rawValue);

        if (!overrides.port && (key === 'PORT' || key === 'WEB_PORT')) {
          const parsed = parsePort(value);
          if (parsed) {
            overrides.port = parsed;
          }
        }

        if (!overrides.url && key === 'NEXT_PUBLIC_APP_URL' && value) {
          candidateUrl = value;
        }
      }

      if (!overrides.url && candidateUrl) {
        overrides.url = candidateUrl;
      }

      if (!overrides.port && overrides.url) {
        try {
          const parsedUrl = new URL(overrides.url);
          if (parsedUrl.port) {
            const parsedPort = parsePort(parsedUrl.port);
            if (parsedPort) {
              overrides.port = parsedPort;
            }
          }
        } catch {
          // Ignore invalid URL formats
        }
      }

      if (overrides.port && overrides.url) {
        break;
      }
    } catch {
      // Missing env file is fine; skip
    }
  }

  return overrides;
}

function resolvePreviewBounds(): { start: number; end: number } {
  const envStartRaw = Number.parseInt(process.env.PREVIEW_PORT_START || '', 10);
  const envEndRaw = Number.parseInt(process.env.PREVIEW_PORT_END || '', 10);

  const start = Number.isInteger(envStartRaw)
    ? Math.max(1, envStartRaw)
    : PREVIEW_FALLBACK_PORT_START;

  let end = Number.isInteger(envEndRaw)
    ? Math.min(PREVIEW_MAX_PORT, envEndRaw)
    : PREVIEW_FALLBACK_PORT_END;

  if (end < start) {
    end = Math.min(start + (PREVIEW_FALLBACK_PORT_END - PREVIEW_FALLBACK_PORT_START), PREVIEW_MAX_PORT);
  }

  return { start, end };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function parsePackageManagerField(value: unknown): PackageManagerId | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const [rawName] = value.split('@');
  const name = rawName.trim().toLowerCase();
  if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') {
    return name as PackageManagerId;
  }
  return null;
}

function isCommandNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as NodeJS.ErrnoException;
  return err.code === 'ENOENT';
}

async function detectPackageManager(projectPath: string): Promise<PackageManagerId> {
  const packageJson = await readPackageJson(projectPath);
  const fromField = parsePackageManagerField(packageJson?.packageManager);
  if (fromField) {
    return fromField;
  }

  if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await fileExists(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (await fileExists(path.join(projectPath, 'bun.lockb'))) {
    return 'bun';
  }
  if (await fileExists(path.join(projectPath, 'package-lock.json'))) {
    return 'npm';
  }
  return 'npm';
}

/**
 * 错误分类和建议
 */
function classifyInstallError(error: unknown): {
  errorType: string;
  suggestion: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('enoent') || lowerMsg.includes('no such file')) {
    return {
      errorType: 'dependency',
      suggestion: '依赖文件缺失，正在重试安装...',
    };
  }
  if (lowerMsg.includes('eaddrinuse')) {
    return {
      errorType: 'port',
      suggestion: '端口被占用，正在自动切换端口...',
    };
  }
  if (lowerMsg.includes('etimedout') || lowerMsg.includes('econnreset') || lowerMsg.includes('network')) {
    return {
      errorType: 'network',
      suggestion: '网络连接异常，正在重试...',
    };
  }
  if (lowerMsg.includes('module not found')) {
    const match = message.match(/module ['"](.*?)['"]/i);
    const moduleName = match ? match[1] : '';
    return {
      errorType: 'dependency',
      suggestion: `缺少模块 ${moduleName}，建议检查 package.json`,
    };
  }
  if (lowerMsg.includes('syntaxerror')) {
    return {
      errorType: 'build',
      suggestion: '代码语法错误，请检查最近的修改',
    };
  }

  return {
    errorType: 'unknown',
    suggestion: '安装失败，正在重试...',
  };
}

/**
 * 清理构建缓存
 */
async function cleanBuildCache(projectPath: string, deep: boolean = false): Promise<void> {
  const nextDir = path.join(projectPath, '.next');

  // 总是清理 .next
  try {
    await fs.rm(nextDir, { recursive: true, force: true });
  } catch {
    // 忽略清理失败
  }

  // 深度清理：清理 node_modules
  if (deep) {
    const nodeModulesDir = path.join(projectPath, 'node_modules');
    try {
      await fs.rm(nodeModulesDir, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
  }
}

/**
 * 原始安装函数（不含重试）
 * 优先使用内置 Node.js，失败时回退到系统 npm
 */
async function runInstallOnce(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void,
  projectId?: string,
  taskId?: string
): Promise<void> {
  const manager = await detectPackageManager(projectPath);
  const { command: systemCommand, installArgs: systemInstallArgs } = PACKAGE_MANAGER_COMMANDS[manager];

  // 获取内置 Node.js 执行器
  const npmExecutor = getNpmExecutor();

  // 确定最终使用的命令
  let finalCommand: string;
  let finalArgs: string[];
  let isUsingBuiltin = false;

  // npm 使用内置 Node.js（如果可用）
  if (manager === 'npm' && npmExecutor.useBuiltin) {
    finalCommand = npmExecutor.command;
    finalArgs = [...npmExecutor.args, 'install', '--registry=https://registry.npmmirror.com'];
    isUsingBuiltin = true;
  } else {
    finalCommand = systemCommand;
    finalArgs = systemInstallArgs;
  }

  logger(`[PreviewManager] ========================================`);
  logger(`[PreviewManager] Working Directory: ${projectPath}`);
  logger(`[PreviewManager] Installing dependencies using ${manager}${isUsingBuiltin ? ' (builtin Node.js)' : ''}.`);
  logger(`[PreviewManager] Command: ${finalCommand} ${finalArgs.join(' ')}`);
  logger(`[PreviewManager] ========================================`);
  if (projectId) {
    timelineLogger.logInstall(projectId, `Installing dependencies using ${manager}${isUsingBuiltin ? ' (builtin)' : ''}`, 'info', taskId, { manager, command: finalCommand, args: finalArgs, isUsingBuiltin }, 'install.start').catch(() => {});
    timelineLogger.logInstall(projectId, 'Detect package manager', 'info', taskId, { manager }, 'install.detect_pm').catch(() => {});
  }

  // 注入内置 Node.js 到 PATH（确保子进程的 npm 等命令也能使用内置 Node）
  const builtinNodeDir = getBuiltinNodeDir();
  const envWithBuiltinNode = builtinNodeDir
    ? { ...env, PATH: `${builtinNodeDir}${path.delimiter}${env.PATH || ''}` }
    : env;

  try {
    await appendCommandLogs(finalCommand, finalArgs, projectPath, envWithBuiltinNode, logger, projectId, taskId, isUsingBuiltin);
  } catch (error) {
    // 如果使用内置 Node 失败，尝试回退到系统 npm
    if (isUsingBuiltin) {
      logger(`[PreviewManager] ⚠️ Builtin Node.js failed, falling back to system npm...`);
      if (projectId) {
        timelineLogger.logInstall(projectId, 'Builtin Node.js failed, fallback to system npm', 'warn', taskId, { error: error instanceof Error ? error.message : String(error) }, 'install.fallback_builtin').catch(() => {});
      }

      try {
        await appendCommandLogs(
          systemCommand,
          systemInstallArgs,
          projectPath,
          env,
          logger,
          projectId,
          taskId,
          false
        );
        if (projectId) {
          timelineLogger.logInstall(projectId, 'Install completed via system npm fallback', 'info', taskId, { manager: 'npm' }, 'install.complete').catch(() => {});
        }
        return;
      } catch (fallbackError) {
        // 回退也失败，抛出原始错误
        throw error;
      }
    }

    // 非 npm 包管理器不可用时回退到 npm
    if (manager !== 'npm' && isCommandNotFound(error)) {
      logger(
        `[PreviewManager] ${systemCommand} unavailable. Falling back to npm install.`
      );
      if (projectId) {
        timelineLogger.logInstall(projectId, `${systemCommand} unavailable. Fallback to npm install.`, 'warn', taskId, { from: systemCommand, to: 'npm' }, 'install.fallback').catch(() => {});
      }

      // 回退时也优先使用内置 Node.js
      if (npmExecutor.useBuiltin) {
        await appendCommandLogs(
          npmExecutor.command,
          [...npmExecutor.args, 'install', '--registry=https://registry.npmmirror.com'],
          projectPath,
          envWithBuiltinNode,
          logger,
          projectId,
          taskId,
          true
        );
      } else {
        await appendCommandLogs(
          PACKAGE_MANAGER_COMMANDS.npm.command,
          PACKAGE_MANAGER_COMMANDS.npm.installArgs,
          projectPath,
          env,
          logger,
          projectId,
          taskId,
          false
        );
      }
      if (projectId) {
        timelineLogger.logInstall(projectId, 'Install completed via npm fallback', 'info', taskId, { manager: 'npm' }, 'install.complete').catch(() => {});
      }
      return;
    }
    throw error;
  }
  if (projectId) {
    timelineLogger.logInstall(projectId, 'Install completed', 'info', taskId, { manager, isUsingBuiltin }, 'install.complete').catch(() => {});
  }
}

/**
 * 带重试的安装函数
 * 重试3次，间隔5s/10s/20s（指数退避）
 * 分层清理：第1次重试只清.next，第2次起清理node_modules
 */
async function runInstallWithPreferredManager(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void,
  projectId?: string,
  taskId?: string
): Promise<void> {
  const maxRetries = 3;
  const retryDelays = [5000, 10000, 20000]; // 5s, 10s, 20s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await runInstallOnce(projectPath, env, logger, projectId, taskId);
      return; // 成功则返回
    } catch (error) {
      const { errorType, suggestion } = classifyInstallError(error);

      if (attempt < maxRetries) {
        const delay = retryDelays[attempt];
        const deep = attempt >= 1; // 第2次重试起深度清理

        logger(`[PreviewManager] ❌ 安装失败 (尝试 ${attempt + 1}/${maxRetries + 1})`);
        logger(`[PreviewManager] 错误类型: ${errorType}`);
        logger(`[PreviewManager] ${suggestion}`);
        logger(`[PreviewManager] 清理缓存${deep ? '（深度清理 node_modules）' : '（仅清理 .next）'}...`);

        // 发送错误事件
        if (projectId) {
          const { streamManager } = require('./stream');
          streamManager.publish(projectId, {
            type: 'preview_error',
            data: {
              message: suggestion,
              severity: 'error',
              phase: 'installing',
              errorType,
              suggestion,
              metadata: { attempt: attempt + 1, maxRetries: maxRetries + 1 },
            },
          });
          timelineLogger.logInstall(projectId, 'Install retry scheduled', 'warn', taskId, { attempt: attempt + 1, delayMs: delay, deep }, 'install.retry').catch(() => {});
        }

        // 清理缓存
        await cleanBuildCache(projectPath, deep);
        if (projectId) {
          timelineLogger.logInstall(projectId, 'Clean build cache', 'info', taskId, { deep }, 'install.cleanup').catch(() => {});
        }

        logger(`[PreviewManager] ⏳ 等待 ${delay / 1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // 最后一次也失败了
        logger(`[PreviewManager] ❌ 安装失败，已达最大重试次数 (${maxRetries + 1})`);
        logger(`[PreviewManager] 错误类型: ${errorType}`);
        logger(`[PreviewManager] ${suggestion}`);

        if (projectId) {
          const { streamManager } = require('./stream');
          streamManager.publish(projectId, {
            type: 'preview_error',
            data: {
              message: `安装依赖失败: ${suggestion}`,
              severity: 'error' as const,
            },
          });
          timelineLogger.logInstall(projectId, 'Install failed after max retries', 'error', taskId, { errorType, suggestion, attempts: maxRetries + 1 }, 'install.error').catch(() => {});
        }

        throw error;
      }
    }
  }
}

/**
 * Python依赖安装函数（不含重试）
 */
async function installPythonDependencies(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void,
  projectId?: string,
  taskId?: string
): Promise<void> {
  logger('[PreviewManager] ========================================');
  logger('[PreviewManager] Installing Python dependencies...');
  logger('[PreviewManager] Working Directory: ' + projectPath);
  logger('[PreviewManager] ========================================');

  // 获取 pip 路径
  const pipPath = path.join(
    projectPath,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'pip.exe' : 'pip'
  );

  const args = [
    'install',
    '-i',
    'https://pypi.tuna.tsinghua.edu.cn/simple',
    '-r',
    'requirements.txt',
  ];

  logger(`[PreviewManager] Command: ${pipPath} ${args.join(' ')}`);

  if (projectId) {
    timelineLogger
      .logInstall(
        projectId,
        'Installing Python dependencies',
        'info',
        taskId,
        { command: pipPath, args },
        'install.start'
      )
      .catch(() => {});
  }

  try {
    await appendCommandLogs(pipPath, args, projectPath, env, logger, projectId, taskId);

    if (projectId) {
      timelineLogger
        .logInstall(
          projectId,
          'Python dependencies installed successfully',
          'info',
          taskId,
          undefined,
          'install.complete'
        )
        .catch(() => {});

      // 更新依赖安装状态
      try {
        await updateProject(projectId, { dependenciesInstalled: true });
      } catch (error) {
        console.warn('[PreviewManager] Failed to update dependenciesInstalled:', error);
      }
    }
  } catch (error) {
    if (projectId) {
      timelineLogger
        .logInstall(
          projectId,
          'Python dependency installation failed',
          'error',
          taskId,
          { error: error instanceof Error ? error.message : String(error) },
          'install.error'
        )
        .catch(() => {});
    }

    throw error;
  }
}

/**
 * 带重试的Python依赖安装函数
 */
async function installPythonDependenciesWithRetry(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void,
  projectId?: string,
  taskId?: string
): Promise<void> {
  const maxRetries = 3;
  const retryDelays = [5000, 10000, 20000]; // 5s, 10s, 20s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await installPythonDependencies(projectPath, env, logger, projectId, taskId);
      return; // 成功则返回
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 分类错误
      let errorType = 'UNKNOWN_ERROR';
      let suggestion = '请查看错误日志';

      if (errorMsg.includes('No module named') || errorMsg.includes('not found')) {
        errorType = 'PACKAGE_NOT_FOUND';
        suggestion = '依赖包不存在或拼写错误，请检查 requirements.txt';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('network')) {
        errorType = 'NETWORK_ERROR';
        suggestion = '网络连接失败，请检查网络后重试';
      } else if (errorMsg.includes('error: command') || errorMsg.includes('gcc')) {
        errorType = 'COMPILE_REQUIRED';
        suggestion = '该依赖包需要编译工具，当前不支持。请使用纯 Python 包';
      }

      if (attempt < maxRetries) {
        const delay = retryDelays[attempt];

        logger(`[PreviewManager] ❌ 安装失败 (尝试 ${attempt + 1}/${maxRetries + 1})`);
        logger(`[PreviewManager] 错误类型: ${errorType}`);
        logger(`[PreviewManager] ${suggestion}`);
        logger(`[PreviewManager] ⏳ 等待 ${delay / 1000} 秒后重试...`);

        // 发送错误事件
        if (projectId) {
          const { streamManager } = require('./stream');
          streamManager.publish(projectId, {
            type: 'preview_error',
            data: {
              message: suggestion,
              severity: 'error',
              phase: 'installing',
              errorType,
              suggestion,
              metadata: { attempt: attempt + 1, maxRetries: maxRetries + 1 },
            },
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // 最后一次也失败了
        logger(`[PreviewManager] ❌ 安装失败，已达最大重试次数 (${maxRetries + 1})`);
        logger(`[PreviewManager] 错误类型: ${errorType}`);
        logger(`[PreviewManager] ${suggestion}`);

        if (projectId) {
          const { streamManager } = require('./stream');
          streamManager.publish(projectId, {
            type: 'preview_error',
            data: {
              message: `安装依赖失败: ${suggestion}`,
              severity: 'error',
              errorType,
              suggestion,
            },
          });
        }

        throw error;
      }
    }
  }
}

async function isLikelyNextProject(dirPath: string): Promise<boolean> {
  const pkgPath = path.join(dirPath, 'package.json');
  try {
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    if (typeof deps.next === 'string') {
      return true;
    }
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      const scriptValues = Object.values(pkg.scripts as Record<string, unknown>);
      if (
        scriptValues.some(
          (value) =>
            typeof value === 'string' &&
            (value.includes('next dev') || value.includes('next start'))
        )
      ) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  const configCandidates = [
    'next.config.js',
    'next.config.cjs',
    'next.config.mjs',
    'next.config.ts',
  ];
  for (const candidate of configCandidates) {
    if (await fileExists(path.join(dirPath, candidate))) {
      return true;
    }
  }

  const appDirCandidates = [
    'app',
    path.join('src', 'app'),
    'pages',
    path.join('src', 'pages'),
  ];
  for (const candidate of appDirCandidates) {
    if (await directoryExists(path.join(dirPath, candidate))) {
      return true;
    }
  }

  return false;
}

/**
 * 项目类型定义
 */
type ProjectType = 'nextjs' | 'python-fastapi';

/**
 * 校验Python项目是否符合规范
 */
async function validatePythonProject(projectPath: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // 1. 检查必需文件
  const requiredFiles = ['app/main.py', 'requirements.txt'];

  for (const file of requiredFiles) {
    const filePath = path.join(projectPath, file);
    if (!(await fileExists(filePath))) {
      errors.push(`缺少必需文件：${file}`);
    }
  }

  // 2. 检查 main.py 中是否包含健康检查端点
  try {
    const mainPyPath = path.join(projectPath, 'app', 'main.py');
    const mainPyContent = await fs.readFile(mainPyPath, 'utf8');

    const hasHealthCheck =
      mainPyContent.includes('/health') ||
      mainPyContent.includes('"/health"') ||
      mainPyContent.includes("'/health'");

    if (!hasHealthCheck) {
      errors.push('app/main.py 缺少健康检查端点 GET /health');
    }

    const hasFastAPIApp =
      mainPyContent.includes('FastAPI()') || mainPyContent.includes('= FastAPI');

    if (!hasFastAPIApp) {
      errors.push('app/main.py 缺少 FastAPI 应用实例（app = FastAPI()）');
    }
  } catch (error) {
    // 文件不存在的错误已在上面检查过
  }

  // 3. 检查 requirements.txt 中的黑名单依赖
  // 注意：numpy/pandas/scipy/matplotlib/pillow 已有预编译 wheel，主流平台可直接安装
  const blacklist = [
    'tensorflow',
    'torch',
    'keras',
    'scikit-learn',
    'opencv-python',
    'mysql-connector',
    'psycopg2',
    'pymongo',
  ];

  try {
    const reqPath = path.join(projectPath, 'requirements.txt');
    const reqContent = await fs.readFile(reqPath, 'utf8');
    const lines = reqContent.toLowerCase().split('\n');

    for (const pkg of blacklist) {
      if (lines.some((line) => line.trim().startsWith(pkg))) {
        errors.push(`不支持的依赖包：${pkg}（需要编译工具或外部服务）`);
      }
    }
  } catch (error) {
    // 文件不存在的错误已在上面检查过
  }

  // 4. 检查数据库路径（如果存在数据库配置）
  try {
    const files = ['app/main.py', 'app/database.py', '.env', '.env.example'];

    for (const file of files) {
      const filePath = path.join(projectPath, file);
      if (!(await fileExists(filePath))) continue;

      const content = await fs.readFile(filePath, 'utf8');

      // 检查违规路径
      const dangerousPatterns = [
        /DATABASE_URL.*\.\.\//,  // 相对父目录
        /sqlite:\/\/\/\/[A-Z]:/i,  // Windows 绝对路径
        /sqlite:\/\/\/\/\//,  // Unix 绝对路径
        /data\/prod\.db/,  // 主平台数据库
        /sub_dev\.db/,  // Next.js 数据库
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          errors.push(`数据库路径违规：必须使用相对路径 sqlite:///./python_dev.db`);
          break;
        }
      }
    }
  } catch (error) {
    // 忽略文件读取错误
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isAllowedRootFile(name: string): boolean {
  if (ROOT_ALLOWED_FILES.has(name)) {
    return true;
  }
  if (name.endsWith('.md') || name.startsWith('.env.')) {
    return true;
  }
  return false;
}

function isAllowedRootDirectory(name: string): boolean {
  if (ROOT_ALLOWED_DIRS.has(name)) {
    return true;
  }
  return ROOT_ALLOWED_DIR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isOverwritableRootFile(name: string): boolean {
  if (ROOT_OVERWRITABLE_FILES.has(name)) {
    return true;
  }
  if (name.startsWith('.env.') || name.endsWith('.md')) {
    return true;
  }
  return false;
}

async function ensureProjectRootStructure(
  projectPath: string,
  log: (message: string) => void
): Promise<void> {
  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  const hasRootPackageJson = entries.some(
    (entry) => entry.isFile() && entry.name === 'package.json'
  );
  if (hasRootPackageJson) {
    return;
  }

  const candidateDirs: { name: string; path: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === 'node_modules') {
      continue;
    }
    const dirPath = path.join(projectPath, entry.name);
    // quick skip for empty directory
    const isCandidate = await isLikelyNextProject(dirPath);
    if (isCandidate) {
      candidateDirs.push({ name: entry.name, path: dirPath });
    }
  }

  if (candidateDirs.length === 0) {
    return;
  }

  if (candidateDirs.length > 1) {
    const dirNames = candidateDirs.map((dir) => dir.name).join(', ');
    throw new Error(
      `Multiple potential Next.js projects detected in subdirectories (${dirNames}). Please move the desired project files to the project root.`
    );
  }

  const candidate = candidateDirs[0];
  const { name: nestedName, path: nestedPath } = candidate;

  for (const entry of entries) {
    if (entry.name === nestedName) {
      continue;
    }
    if (entry.isDirectory()) {
      if (!isAllowedRootDirectory(entry.name)) {
        throw new Error(
          `Cannot normalize project structure because directory "${entry.name}" exists alongside "${nestedName}". Move project files to the root manually.`
        );
      }
      continue;
    }

    if (!isAllowedRootFile(entry.name)) {
      throw new Error(
        `Cannot normalize project structure because file "${entry.name}" exists alongside "${nestedName}". Move project files to the root manually.`
      );
    }
  }

  // Remove nested node_modules and root node_modules (if any) to avoid conflicts during move.
  await fs.rm(path.join(nestedPath, 'node_modules'), { recursive: true, force: true });
  await fs.rm(path.join(projectPath, 'node_modules'), { recursive: true, force: true });

  const nestedEntries = await fs.readdir(nestedPath, { withFileTypes: true });
  for (const nestedEntry of nestedEntries) {
    const sourcePath = path.join(nestedPath, nestedEntry.name);
    const destinationPath = path.join(projectPath, nestedEntry.name);
    if (await pathExists(destinationPath)) {
      if (nestedEntry.isFile() && isOverwritableRootFile(nestedEntry.name)) {
        await fs.rm(destinationPath, { force: true });
        await fs.rename(sourcePath, destinationPath);
        log(
          `Replaced existing root file "${nestedEntry.name}" with the version from "${nestedName}".`
        );
        continue;
      }
      throw new Error(
        `Cannot move "${nestedEntry.name}" from "${nestedName}" because "${nestedEntry.name}" already exists in the project root.`
      );
    }
    await fs.rename(sourcePath, destinationPath);
  }

  await fs.rm(nestedPath, { recursive: true, force: true });
  log(
    `Detected Next.js project inside subdirectory "${nestedName}". Contents moved to the project root.`
  );
}

async function waitForPreviewReady(
  url: string,
  log: (chunk: Buffer | string) => void,
  timeoutMs = 30_000,
  intervalMs = 1_000
) {
  const start = Date.now();
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        // 检查响应内容，确保不是错误页面
        const text = await response.text();

        // Next.js 错误页面特征
        const isErrorPage =
          text.includes('"page":"/_error"') ||
          text.includes('Application error') ||
          text.includes('Module build failed') ||
          (text.includes('__NEXT_DATA__') && text.includes('"statusCode":500'));

        if (isErrorPage) {
          log(
            Buffer.from(
              `[PreviewManager] Server responded but returned an error page. Attempt ${attempts}...`
            )
          );
          // 继续等待，可能正在重新编译
        } else {
          log(
            Buffer.from(
              `[PreviewManager] ✅ Preview server is ready after ${attempts} attempt(s).`
            )
          );
          return true;
        }
      }
    } catch (error) {
      if (attempts === 1) {
        log(
          Buffer.from(
            `[PreviewManager] Waiting for preview server at ${url} (${error instanceof Error ? error.message : String(error)
            }).`
          )
        );
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  log(
    Buffer.from(
      `[PreviewManager] Preview server did not respond within ${timeoutMs}ms; continuing regardless.`
    )
  );
  return false;
}

async function appendCommandLogs(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void,
  projectId?: string,
  taskId?: string,
  isUsingBuiltinNode: boolean = false
) {
  await new Promise<void>((resolve, reject) => {
    // 使用内置 Node.js 时不需要 shell（避免路径问题）
    // 只有在 Windows 上使用系统命令时才需要 shell
    const needsShell = process.platform === 'win32' && !isUsingBuiltinNode;

    const child = spawn(command, args, {
      cwd,
      env,
      shell: needsShell,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutHandler = (chunk: Buffer | string) => {
      logger(chunk);
      // 写入统一日志文件
      if (projectId && taskId) {
        timelineLogger.logInstall(projectId, chunk.toString().trim(), 'info', taskId).catch(err => {
          console.error('[appendCommandLogs] Failed to write timeline:', err);
        });
      }
    };

    const stderrHandler = (chunk: Buffer | string) => {
      logger(chunk);
      // 写入统一日志文件
      if (projectId && taskId) {
        timelineLogger.logInstall(projectId, chunk.toString().trim(), 'error', taskId).catch(err => {
          console.error('[appendCommandLogs] Failed to write timeline:', err);
        });
      }
    };

    child.stdout?.on('data', stdoutHandler);
    child.stderr?.on('data', stderrHandler);

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`${command} ${args.join(' ')} exited with code ${code}`)
        );
      }
    });
  });
}

async function ensureDependencies(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void,
  projectId?: string,
  taskId?: string
) {
  try {
    await fs.access(path.join(projectPath, 'node_modules'));
    return;
  } catch {
    // node_modules missing, fall back to npm install
  }

  await runInstallWithPreferredManager(projectPath, env, logger, projectId, taskId);
}

// 计算 package.json 依赖部分的 hash
async function computePackageJsonHash(projectPath: string): Promise<string | null> {
  try {
    const pkg = await readPackageJson(projectPath);
    if (!pkg) return null;

    // 只对 dependencies 和 devDependencies 计算 hash
    const depsContent = JSON.stringify({
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
    });

    return createHash('sha256').update(depsContent).digest('hex');
  } catch {
    return null;
  }
}

// 检查 package.json 声明的依赖是否缺失
async function listMissingDependencies(projectPath: string): Promise<string[]> {
  const pkg = await readPackageJson(projectPath);
  if (!pkg) return [];
  const allDeps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  } as Record<string, unknown>;
  const names = Object.keys(allDeps);
  const missing: string[] = [];
  for (const name of names) {
    const segments = name.split('/');
    const moduleDir = path.join(projectPath, 'node_modules', ...segments);
    const exists = await directoryExists(moduleDir);
    if (!exists) missing.push(name);
  }
  return missing;
}

export interface PreviewInfo {
  port: number | null;
  url: string | null;
  status: PreviewStatus;
  logs: string[];
  pid?: number;
  instanceId?: number;
}

class PreviewManager {
  private processes = new Map<string, PreviewProcess>();
  private installing = new Map<string, Promise<void>>();
  private forceInstall = new Map<string, boolean>();
  private lastRestartTime = new Map<string, number>();
  private projectTaskIds = new Map<string, string>(); // projectId -> taskId 映射
  private idleTimers = new Map<string, NodeJS.Timeout>();
  private idleStart = new Map<string, number>();
  private startingLock = new Map<string, Promise<PreviewInfo>>(); // 防止并发启动的Promise锁

  /**
   * 获取或生成项目的 taskId
   */
  private getOrCreateTaskId(projectId: string): string {
    let taskId = this.projectTaskIds.get(projectId);
    if (!taskId) {
      taskId = `task-${Date.now()}`;
      this.projectTaskIds.set(projectId, taskId);
    }
    return taskId;
  }

  private getLogger(processInfo: PreviewProcess, projectId: string, level: 'stdout' | 'stderr' = 'stdout', taskId?: string) {
    let lastLine = '';
    let lastTs = 0;
    const ignorePatterns: RegExp[] = [
      /\bGET\s+\/_next\//i,
      /\bHEAD\s+\/_next\//i,
      /\bGET\s+\/favicon\.ico/i,
      /Compiled\s+successfully/i,
      /Ready\s+-\s+started\s+server/i,
      /Waiting\s+for\s+file\s+changes/i,
    ];
    const assetExt = /(\.js|\.css|\.map|\.png|\.jpg|\.jpeg|\.svg|\.ico|\.webp|\.gif)(\?.*)?$/i;
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

    return (chunk: Buffer | string) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .filter((line) => line.trim().length);
      lines.forEach((raw) => {
        const cleaned = stripAnsi(raw);
        const isRequest = /^(GET|HEAD)\s+\//i.test(cleaned);
        const isAssetRequest = isRequest && assetExt.test(cleaned);
        const shouldIgnore = isAssetRequest || ignorePatterns.some((re) => re.test(cleaned));
        const isDuplicate = cleaned === lastLine && Date.now() - lastTs < 2000;

        // 始终写入 timeline（不裁剪、不忽略）
        const logLevel = level === 'stderr' ? 'error' : 'info';
        timelineLogger.logPreview(projectId, cleaned, logLevel, taskId).catch(() => {});

        // 仅在不忽略且非短期重复时，推送到前端并缓存
        if (shouldIgnore || isDuplicate) {
          return;
        }

        lastLine = cleaned;
        lastTs = Date.now();

        processInfo.logs.push(cleaned);
        if (processInfo.logs.length > LOG_LIMIT) {
          processInfo.logs.shift();
        }

        const { streamManager } = require('./stream');
        streamManager.publish(projectId, {
          type: 'log',
          data: {
            level,
            content: cleaned,
            source: 'preview',
            projectId,
            timestamp: new Date().toISOString(),
          },
        });
      });
    };
  }

  /**
   * 初始化 Prisma（如果项目包含 Prisma schema）
   */
  private async initializePrismaIfNeeded(
    projectPath: string,
    projectId: string,
    taskId: string,
    logger: (chunk: Buffer | string) => void
  ): Promise<void> {
    try {
      // 1. 检测是否存在 prisma/schema.prisma
      const schemaPath = path.join(projectPath, 'prisma', 'schema.prisma');
      const schemaExists = await directoryExists(path.dirname(schemaPath)) &&
                          await fs.access(schemaPath).then(() => true).catch(() => false);

      if (!schemaExists) {
        // 没有 Prisma，跳过
        return;
      }

      logger('[PreviewManager] ========================================');
      logger('[PreviewManager] Detected Prisma schema, initializing...');
      logger('[PreviewManager] ========================================');

      try {
        await timelineLogger.logInstall(projectId, '================== PRISMA 初始化 START ==================', 'info', taskId, undefined, 'separator.prisma.start');
        await timelineLogger.logInstall(projectId, 'Prisma schema detected', 'info', taskId, { schemaPath }, 'prisma.detect');
      } catch {}

      const env = createSafeSubprocessEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'file:./sub_dev.db',
      });

      // 2. 执行 prisma generate（生成 Prisma Client）
      logger('[PreviewManager] Step 1: Generating Prisma Client...');
      try {
        await timelineLogger.logInstall(projectId, 'prisma generate start', 'info', taskId, undefined, 'prisma.generate.start');
      } catch {}

      try {
        await appendCommandLogs(
          'npx',
          ['prisma', 'generate'],
          projectPath,
          env,
          logger,
          projectId,
          taskId
        );
        logger('[PreviewManager] ✓ Prisma Client generated successfully');
        try {
          await timelineLogger.logInstall(projectId, 'prisma generate success', 'info', taskId, undefined, 'prisma.generate.success');
        } catch {}
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger(`[PreviewManager] ✗ Prisma generate failed: ${errorMessage}`);

        try {
          await timelineLogger.logInstall(projectId, 'prisma generate failed', 'error', taskId, { error: errorMessage }, 'prisma.generate.error');
        } catch {}

        // 发送错误到前端
        const { streamManager } = require('./stream');
        streamManager.publish(projectId, {
          type: 'preview_error',
          data: {
            message: `Prisma Client 生成失败: ${errorMessage}`,
            severity: 'error',
            phase: 'prisma_generate',
            suggestion: '请检查 prisma/schema.prisma 文件是否有语法错误',
          },
        });

        throw error; // 中断后续步骤
      }

      // 3. 检查数据库文件是否存在，并验证路径安全（与约定一致：项目根目录）
      const dbPath = path.join(projectPath, 'sub_dev.db');

      // 路径安全检查：确保数据库文件在项目目录内
      const normalizedDbPath = path.resolve(dbPath);
      const normalizedProjectPath = path.resolve(projectPath);

      if (!normalizedDbPath.startsWith(normalizedProjectPath + path.sep)) {
        const errorMsg = `🚨 SECURITY: Database path outside project directory!\nDB: ${normalizedDbPath}\nProject: ${normalizedProjectPath}`;
        logger(`[PreviewManager] ${errorMsg}`);

        try {
          await timelineLogger.logInstall(projectId, errorMsg, 'error', taskId, { dbPath: normalizedDbPath, projectPath: normalizedProjectPath }, 'prisma.db.security_error');
        } catch {}

        const { streamManager } = require('./stream');
        streamManager.publish(projectId, {
          type: 'preview_error',
          data: {
            message: '数据库路径安全检查失败：数据库文件不能位于项目目录之外',
            severity: 'error',
            phase: 'prisma_security',
            suggestion: '请确保 DATABASE_URL 指向 ./sub_dev.db',
          },
        });

        throw new Error('Database path outside project directory');
      }

      const dbExists = await fs.access(dbPath).then(() => true).catch(() => false);

      if (dbExists) {
        logger('[PreviewManager] ✓ Database already exists, skipping initialization');
        try {
          await timelineLogger.logInstall(projectId, 'Database already exists', 'info', taskId, { dbPath }, 'prisma.db.exists');
        } catch {}
      } else {
        // 4. 执行 prisma db push（创建数据库和表结构）
        logger('[PreviewManager] Step 2: Creating database...');
        try {
          await timelineLogger.logInstall(projectId, 'prisma db push start', 'info', taskId, { dbPath }, 'prisma.db.push.start');
        } catch {}

        try {
          await appendCommandLogs(
            'npx',
            ['prisma', 'db', 'push', '--skip-generate'],
            projectPath,
            env,
            logger,
            projectId,
            taskId
          );
          logger('[PreviewManager] ✓ Database initialized successfully');
          try {
            await timelineLogger.logInstall(projectId, 'prisma db push success', 'info', taskId, { dbPath }, 'prisma.db.push.success');
          } catch {}
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger(`[PreviewManager] ✗ Database initialization failed: ${errorMessage}`);

          try {
            await timelineLogger.logInstall(projectId, 'prisma db push failed', 'error', taskId, { error: errorMessage, dbPath }, 'prisma.db.push.error');
          } catch {}

          // 发送错误到前端
          const { streamManager } = require('./stream');
          streamManager.publish(projectId, {
            type: 'preview_error',
            data: {
              message: `数据库初始化失败: ${errorMessage}`,
              severity: 'error',
              phase: 'prisma_db_push',
              suggestion: '请检查 DATABASE_URL 配置和 schema.prisma 模型定义',
            },
          });

          throw error;
        }
      }

      try {
        await timelineLogger.logInstall(projectId, '================== PRISMA 初始化 END ==================', 'info', taskId, undefined, 'separator.prisma.end');
      } catch {}

      logger('[PreviewManager] ========================================');
      logger('[PreviewManager] Prisma initialization completed');
      logger('[PreviewManager] ========================================');

    } catch (error) {
      // 错误已经在上面处理并记录，这里只是确保不中断整个install流程
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger(`[PreviewManager] ⚠️ Prisma initialization failed, but continuing: ${errorMessage}`);

      try {
        await timelineLogger.logInstall(projectId, 'Prisma init failed but continuing', 'warn', taskId, { error: errorMessage }, 'prisma.init.warn');
      } catch {}
    }
  }

  public async installDependencies(projectId: string): Promise<{ logs: string[] }> {
    if (__VERBOSE_LOG__) {
      console.log(`====安装预览 ### [install.entry] installDependencies called for project: ${projectId}`);
    }
    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const taskId = this.getOrCreateTaskId(projectId);

    const projectPath = project.repoPath
      ? path.resolve(project.repoPath)
      : path.join(process.cwd(), 'projects', projectId);

    await fs.mkdir(projectPath, { recursive: true });

    const logs: string[] = [];
    const record = (message: string) => {
      const formatted = `[PreviewManager] ${message}`;
      console.log(formatted);
      logs.push(formatted);
    };

    await ensureProjectRootStructure(projectPath, record);

    try {
      await fs.access(path.join(projectPath, 'package.json'));
    } catch {
      record(`Bootstrapping minimal Next.js app for project ${projectId}`);
      await scaffoldBasicNextApp(projectPath, projectId);
    }

    const hadNodeModules = await directoryExists(path.join(projectPath, 'node_modules'));

    const collectFromChunk = (chunk: Buffer | string) => {
      chunk
        .toString()
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .forEach((line) => record(line));
    };

    // Use a per-project lock to avoid concurrent install commands
    const runInstall = async () => {
      const installPromise = (async () => {
        try {
          const hasNodeModules = await directoryExists(path.join(projectPath, 'node_modules'));
          if (!hasNodeModules) {
            await runInstallWithPreferredManager(
              projectPath,
              createSafeSubprocessEnv(),
              collectFromChunk,
              projectId,
              taskId
            );
          }
        } finally {
          this.installing.delete(projectId);
        }
      })();
      this.installing.set(projectId, installPromise);
      await installPromise;
    };

    // If an install is already in progress, wait for it; otherwise start one
    const existing = this.installing.get(projectId);
    if (existing) {
      record('Dependency installation already in progress; waiting for completion.');
      await existing;
    } else {
      await runInstall();
    }

    if (hadNodeModules) {
      record('Dependencies already installed. Skipped install command.');
    } else {
      record('Dependency installation completed.');
    }

    // 更新依赖安装状态（不管是新安装还是已存在）
    try {
      await updateProject(projectId, { dependenciesInstalled: true });
    } catch (error) {
      console.warn('[PreviewManager] Failed to update dependenciesInstalled:', error);
    }

    if (__VERBOSE_LOG__) {
      console.log(`====安装预览 ### [install.exit] installDependencies completed for project: ${projectId}`);
    }
    return { logs };
  }

  public async start(projectId: string): Promise<PreviewInfo> {
    if (__VERBOSE_LOG__) {
      console.log(`====安装预览 ### [preview.start.entry] start called for project: ${projectId}`);
    }
    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const taskId = this.getOrCreateTaskId(projectId);

    const projectPath = project.repoPath
      ? path.resolve(project.repoPath)
      : path.join(process.cwd(), 'projects', projectId);

    // 获取项目类型（必须存在）
    const projectType = (project as any).projectType as ProjectType | undefined;

    if (!projectType) {
      throw new Error('项目类型未定义：projectType 字段缺失');
    }

    if (projectType !== 'nextjs' && projectType !== 'python-fastapi') {
      throw new Error(`不支持的项目类型: ${projectType}`);
    }

    console.log(`[PreviewManager] 📋 Project Type: ${projectType}`);

    // 如果是Python项目，使用专门的启动逻辑
    if (projectType === 'python-fastapi') {
      // 1. 检查是否有正在进行的启动（Promise锁，防止并发）
      const pendingStart = this.startingLock.get(projectId);
      if (pendingStart) {
        console.log(`[PreviewManager] 🐍 Python project start already in progress for ${projectId}, waiting...`);
        return pendingStart;
      }

      // 2. 检查已完成的进程（避免重复启动已运行的进程）
      const existingProcess = this.processes.get(projectId);
      if (existingProcess && existingProcess.status !== 'error' && existingProcess.status !== 'stopped') {
        console.log(`[PreviewManager] 🐍 Python project already running for ${projectId}, returning existing...`);
        return this.toInfo(existingProcess);
      }

      console.log(`[PreviewManager] 🐍 Starting Python FastAPI project...`);

      // 3. 创建启动Promise并立即设置锁（同步操作，防止竞态）
      const startPromise = (async () => {
        try {
          return await this.startPythonProject(projectId, projectPath);
        } finally {
          this.startingLock.delete(projectId);
        }
      })();
      this.startingLock.set(projectId, startPromise);

      return startPromise;
    } else {
      console.log(`[PreviewManager] ⚛️  Starting Next.js project...`);
    }

    // 检测 package.json 变更（使用 hash 检测内容变化）
    let currentPackageJsonMtime: Date | undefined;
    let currentPackageJsonHash: string | null = null;

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const stat = await fs.stat(packageJsonPath);
      currentPackageJsonMtime = stat.mtime;
      currentPackageJsonHash = await computePackageJsonHash(projectPath);
    } catch {
      // package.json 不存在，忽略
    }

    const existing = this.processes.get(projectId);
    if (existing && existing.status !== 'error') {
      // 检查 package.json 依赖是否有变更（优先使用 hash 比对）
      let hasPackageJsonChanged = false;

      if (currentPackageJsonHash && existing.packageJsonHash) {
        // 使用 hash 精确比对依赖变化
        hasPackageJsonChanged = currentPackageJsonHash !== existing.packageJsonHash;
        if (hasPackageJsonChanged && __VERBOSE_LOG__) {
          console.log(`====安装预览 ### [preview.deps_changed] Dependencies changed (hash mismatch)`);
        }
      } else if (currentPackageJsonMtime && existing.packageJsonMtime) {
        // 回退到 mtime 比对
        hasPackageJsonChanged = currentPackageJsonMtime.getTime() > existing.packageJsonMtime.getTime();
        if (hasPackageJsonChanged && __VERBOSE_LOG__) {
          console.log(`====安装预览 ### [preview.deps_changed] package.json changed (mtime)`);
        }
      }

      if (hasPackageJsonChanged) {
        // 防抖：检查距离上次重启是否超过 3 秒
        const now = Date.now();
        const lastRestart = this.lastRestartTime.get(projectId) || 0;
        const timeSinceLastRestart = now - lastRestart;

        if (timeSinceLastRestart < 3000) {
          if (__VERBOSE_LOG__) {
            console.log(`====安装预览 ### [preview.debounce] Debouncing restart (${timeSinceLastRestart}ms < 3000ms)`);
          }
          return this.toInfo(existing);
        }

        console.log('[PreviewManager] package.json dependencies changed, restarting preview to reinstall...');
        this.lastRestartTime.set(projectId, now);
        this.forceInstall.set(projectId, true);

        // 停止现有进程
        await this.stop(projectId);
        // 继续执行后续启动逻辑
      } else {
        return this.toInfo(existing);
      }
    }

    // Publish preview starting status
    const { streamManager } = require('./stream');
    streamManager.publish(projectId, {
      type: 'preview_status',
      data: {
        status: 'preview_starting',
        message: 'Starting preview server...',
      },
    });
    timelineLogger.logPreview(projectId, 'Starting preview server...', 'info', taskId, { phase: 'starting' }, 'preview.starting').catch(() => {});

    await fs.mkdir(projectPath, { recursive: true });

  const pendingLogs: string[] = [];
  const queueLog = (message: string) => {
    const formatted = `[PreviewManager] ${message}`;
    console.log(formatted);
    pendingLogs.push(formatted);
  };

    await ensureProjectRootStructure(projectPath, queueLog);

    try {
      const nextDir = path.join(projectPath, '.next');
      await fs.rm(nextDir, { recursive: true, force: true });
      queueLog('Cleaned .next directory before start');
    } catch (error) {
      queueLog(`Failed to clean .next directory: ${error}`);
    }

    const envFiles = [
      '.env',
      '.env.local',
      '.env.development',
      '.env.development.local',
      '.env.test',
      '.env.production',
    ];
    for (const name of envFiles) {
      try {
        const p = path.join(projectPath, name);
        const raw = await fs.readFile(p, 'utf8');
        const next = raw.replace(/^\s*NODE_ENV\s*=.*$/gm, '').replace(/\n{3,}/g, '\n\n');
        if (next !== raw) {
          await fs.writeFile(p, next, 'utf8');
          queueLog(`Sanitized ${name}: removed NODE_ENV`);
        }
      } catch {}
    }

    try {
      await fs.access(path.join(projectPath, 'package.json'));
    } catch {
      console.log(
        `[PreviewManager] Bootstrapping minimal Next.js app for project ${projectId}`
      );
      await scaffoldBasicNextApp(projectPath, projectId);
    }

    // 检测项目类型并提醒（不阻止启动）
    const isNextJs = await isLikelyNextProject(projectPath);
    if (!isNextJs) {
      queueLog('⚠️  警告：检测到非 Next.js 项目结构');
      queueLog('⚠️  平台仅完全支持 Next.js 15 App Router 项目');
      queueLog('⚠️  其他框架可能无法正常预览');
      const { streamManager } = require('./stream');
      streamManager.publish(projectId, {
        type: 'log',
        data: {
          level: 'warn',
          content: '⚠️ 警告：检测到非 Next.js 项目，可能无法正常预览。平台仅支持 Next.js 15 App Router。',
          source: 'system',
          projectId,
          phase: 'starting',
          errorType: 'structure',
          suggestion: '建议让 AI 重新生成符合要求的 Next.js 项目',
        },
      });
    }

    const previewBounds = resolvePreviewBounds();
    const preferredPort = await findAvailablePort(
      previewBounds.start,
      previewBounds.end
    );

    // 预检测内置 Node.js 以便日志输出
    const plannedNpmExecutor = getNpmExecutor();
    const plannedCommand = plannedNpmExecutor.useBuiltin
      ? `${plannedNpmExecutor.command} ${plannedNpmExecutor.args.join(' ')} run dev -- --port ${preferredPort}`
      : `${npmCommand} run dev -- --port ${preferredPort}`;

    queueLog(`[PreviewManager] Planned Working Directory: ${projectPath}`);
    queueLog(`[PreviewManager] Planned Command: ${plannedCommand}${plannedNpmExecutor.useBuiltin ? ' (builtin Node.js)' : ''}`);
    queueLog(`[PreviewManager] Parent NODE_ENV: ${String(process.env.NODE_ENV ?? '')}`);

    const initialUrl = `http://localhost:${preferredPort}`;

    const env: NodeJS.ProcessEnv = createSafeSubprocessEnv({
      PORT: String(preferredPort),
      WEB_PORT: String(preferredPort),
      NEXT_PUBLIC_APP_URL: initialUrl,
      NODE_ENV: 'development',
      DATABASE_URL: 'file:./sub_dev.db',
    });
    queueLog(`[PreviewManager] Effective NODE_ENV: ${String(env.NODE_ENV)}`);

    try {
      const scriptDir = path.join(projectPath, 'scripts');
      await fs.mkdir(scriptDir, { recursive: true });
      const runDevPath = path.join(scriptDir, 'run-dev.js');
      const isWindows = process.platform === 'win32';
      const content = `#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const projectRoot = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';
function parseCliArgs(argv) {
  const passthrough = [];
  let preferredPort;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      const value = argv[i + 1];
      if (value && !value.startsWith('-')) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed)) preferredPort = parsed;
        i += 1;
        continue;
      }
    } else if (arg.startsWith('--port=')) {
      const value = arg.slice('--port='.length);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) preferredPort = parsed;
      continue;
    } else if (arg.startsWith('-p=')) {
      const value = arg.slice('-p='.length);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) preferredPort = parsed;
      continue;
    } else if (/^\d+$/.test(arg)) {
      const parsed = Number.parseInt(arg, 10);
      if (!Number.isNaN(parsed)) {
        preferredPort = parsed;
        continue;
      }
    }
    passthrough.push(arg);
  }
  return { preferredPort, passthrough };
}
async function isPortAvailable(port) {
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
  return results[0].status === 'fulfilled' && results[0].value && results[2].status === 'fulfilled' && results[2].value;
}
async function resolvePort(preferredPort) {
  const candidates = [preferredPort, process.env.PORT, process.env.WEB_PORT, process.env.PREVIEW_PORT_START, 3135];
  let start = 3135;
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const numeric = typeof candidate === 'number' ? candidate : Number.parseInt(String(candidate), 10);
    if (!Number.isNaN(numeric) && numeric > 0 && numeric <= 65535) { start = numeric; break; }
  }
  const end = Number.parseInt(String(process.env.PREVIEW_PORT_END ?? 3999), 10);
  for (let p = start; p <= end; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(p)) return p;
  }
  return start;
}
(async () => {
  const argv = process.argv.slice(2);
  const { preferredPort, passthrough } = parseCliArgs(argv);
  const port = await resolvePort(preferredPort);
  const url = process.env.NEXT_PUBLIC_APP_URL || \`http://localhost:\${port}\`;
  process.env.PORT = String(port);
  process.env.WEB_PORT = String(port);
  process.env.NEXT_PUBLIC_APP_URL = url;
  if (process.env.NODE_ENV && !['development','production','test'].includes(String(process.env.NODE_ENV).toLowerCase())) {
    delete process.env.NODE_ENV;
  }
  process.env.NODE_ENV = 'development';
  const nextBin = path.join(projectRoot, 'node_modules', '.bin', isWindows ? 'next.cmd' : 'next');
  const exists = fs.existsSync(nextBin);
  console.log('ENV NODE_ENV=' + process.env.NODE_ENV + ' PORT=' + process.env.PORT + ' WEB_PORT=' + process.env.WEB_PORT + ' NEXT_PUBLIC_APP_URL=' + process.env.NEXT_PUBLIC_APP_URL);
  console.log('Starting Next.js dev server on ' + url);
  const child = spawn(exists ? nextBin : 'npx', exists ? ['dev', '--port', String(port), ...passthrough] : ['next', 'dev', '--port', String(port), ...passthrough], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      WEB_PORT: String(port),
      NEXT_PUBLIC_APP_URL: url,
      NEXT_TELEMETRY_DISABLED: '1'
    }
  });
  child.on('exit', (code) => {
    if (typeof code === 'number' && code !== 0) {
      console.error('Next.js dev server exited with code ' + code);
      process.exit(code);
    }
  });
  child.on('error', (error) => {
    console.error('Failed to start Next.js dev server');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
})();
`;
      await fs.writeFile(runDevPath, content, 'utf8');
      try {
        await fs.chmod(runDevPath, 0o755);
      } catch {}
      queueLog(`[PreviewManager] Updated scripts/run-dev.js with enforced NODE_ENV`);
    } catch {}

    const previewProcess: PreviewProcess = {
      process: null,
      port: preferredPort,
      url: initialUrl,
      status: 'starting',
      logs: [],
      startedAt: new Date(),
      packageJsonMtime: currentPackageJsonMtime,
      packageJsonHash: currentPackageJsonHash ?? undefined,
    };

    const log = this.getLogger(previewProcess, projectId, 'stdout', taskId);
    const flushPendingLogs = () => {
      if (pendingLogs.length === 0) {
        return;
      }
      const entries = pendingLogs.splice(0);
      entries.forEach((entry) => log(Buffer.from(entry)));
    };
    flushPendingLogs();

    // Ensure dependencies with the same per-project lock used by installDependencies
    const ensureWithLock = async () => {
      const needForceInstall = this.forceInstall.get(projectId);
      const hasNodeModules = await directoryExists(path.join(projectPath, 'node_modules'));
      const missingDeps = await listMissingDependencies(projectPath);

      // 如果不需要强制安装且 node_modules 存在，跳过安装但更新状态
      if (!needForceInstall && hasNodeModules && missingDeps.length === 0) {
        // 更新依赖安装状态
        try {
          await updateProject(projectId, { dependenciesInstalled: true });
        } catch (error) {
          console.warn('[PreviewManager] Failed to update dependenciesInstalled:', error);
        }
        return;
      }

      const existing = this.installing.get(projectId);
      if (existing) {
        log(Buffer.from('[PreviewManager] Dependency installation already in progress; waiting...'));
        await existing;
        return;
      }

      const installPromise = (async () => {
        try {
          const shouldInstall = needForceInstall || !(await directoryExists(path.join(projectPath, 'node_modules'))) || missingDeps.length > 0;

          if (shouldInstall) {
            try {
              await timelineLogger.logInstall(projectId, '================== 安装 START ==================', 'info', taskId, undefined, 'separator.install.start');
              await timelineLogger.logInstall(projectId, 'Install start', 'info', taskId, { force: !!needForceInstall }, 'install.start');
            } catch {}
            if (needForceInstall) {
              log(Buffer.from('[PreviewManager] Force installing dependencies due to package.json changes...'));
            }

            // 发送安装依赖事件
            const { streamManager } = require('./stream');
            streamManager.publish(projectId, {
              type: 'preview_installing',
              data: {
                status: 'preview_installing',
                message: needForceInstall ? 'Reinstalling dependencies...' : 'Installing dependencies...',
                phase: 'installing',
              },
            });
            try {
              await timelineLogger.logInstall(projectId, 'Install check', 'info', taskId, { missing: missingDeps }, 'install.check');
            } catch {}

            await runInstallWithPreferredManager(projectPath, env, log, projectId, taskId);

            // Prisma 自动初始化
            await this.initializePrismaIfNeeded(projectPath, projectId, taskId, log);

            try {
              await timelineLogger.logInstall(projectId, 'Install end', 'info', taskId, { ok: true }, 'install.end');
              await timelineLogger.logInstall(projectId, '================== 安装 END ==================', 'info', taskId, undefined, 'separator.install.end');
            } catch {}

            // 清除强制安装标记
            this.forceInstall.delete(projectId);

            // 更新依赖安装状态
            try {
              await updateProject(projectId, { dependenciesInstalled: true });
            } catch (error) {
              console.warn('[PreviewManager] Failed to update dependenciesInstalled:', error);
            }
          }
        } finally {
          this.installing.delete(projectId);
        }
      })();
      this.installing.set(projectId, installPromise);
      await installPromise;
    };

    await ensureWithLock();
    try {
      const exists = await directoryExists(path.join(projectPath, 'node_modules'));
      if (!exists) {
        await timelineLogger.logInstall(projectId, 'Install end', 'info', taskId, { ok: true, skipped: true }, 'install.end');
      }
    } catch {}

    const packageJson = await readPackageJson(projectPath);
    const hasPredev = Boolean(packageJson?.scripts?.predev);

    // 获取内置 Node.js 执行器用于 predev
    const predevNpmExecutor = getNpmExecutor();
    const predevBuiltinNodeDir = getBuiltinNodeDir();
    const predevEnv = predevBuiltinNodeDir
      ? { ...env, PATH: `${predevBuiltinNodeDir}${path.delimiter}${env.PATH || ''}` }
      : env;

    if (hasPredev) {
      if (predevNpmExecutor.useBuiltin) {
        await appendCommandLogs(predevNpmExecutor.command, [...predevNpmExecutor.args, 'run', 'predev'], projectPath, predevEnv, log, projectId, taskId, true);
      } else {
        await appendCommandLogs(npmCommand, ['run', 'predev'], projectPath, env, log);
      }
    }

    // 静态检查：type-check 和 lint
    if (__VERBOSE_LOG__) {
      console.log('====安装预览 ### [static.check.start] Starting static checks');
    }
    try {
      await timelineLogger.logPreview(projectId, '====安装预览 ### Static checks start', 'info', taskId, undefined, 'static.check.start');
    } catch {}

    const hasTypeCheck = Boolean(packageJson?.scripts?.[('type-check')]);
    const hasLint = Boolean(packageJson?.scripts?.lint);

    // Type check
    if (hasTypeCheck) {
      if (__VERBOSE_LOG__) {
        console.log('====安装预览 ### [static.check.type] Running type-check');
      }
      try {
        await timelineLogger.logPreview(projectId, '====安装预览 ### Running type-check', 'info', taskId, undefined, 'static.check.type.start');
      } catch {}

      try {
        if (predevNpmExecutor.useBuiltin) {
          await appendCommandLogs(predevNpmExecutor.command, [...predevNpmExecutor.args, 'run', 'type-check'], projectPath, predevEnv, log, projectId, taskId, true);
        } else {
          await appendCommandLogs(npmCommand, ['run', 'type-check'], projectPath, env, log, projectId, taskId);
        }
        if (__VERBOSE_LOG__) {
          console.log('====安装预览 ### [static.check.type.success] Type check passed');
        }
        try {
          await timelineLogger.logPreview(projectId, '====安装预览 ### Type check passed', 'info', taskId, undefined, 'static.check.type.success');
        } catch {}
      } catch (typeError) {
        const errorMsg = typeError instanceof Error ? typeError.message : String(typeError);
        if (__VERBOSE_LOG__) {
          console.warn(`====安装预览 ### [static.check.type.warn] Type check failed (non-blocking): ${errorMsg}`);
        }
        try {
          await timelineLogger.logPreview(projectId, `====安装预览 ### Type check failed (non-blocking): ${errorMsg}`, 'warn', taskId, { error: errorMsg }, 'static.check.type.warn');
        } catch {}
      }
    } else {
      if (__VERBOSE_LOG__) {
        console.log('====安装预览 ### [static.check.type.skip] No type-check script, skipping');
      }
      try {
        await timelineLogger.logPreview(projectId, '====安装预览 ### No type-check script, skipping', 'info', taskId, undefined, 'static.check.type.skip');
      } catch {}
    }

    // Lint check
    if (hasLint) {
      if (__VERBOSE_LOG__) {
        console.log('====安装预览 ### [static.check.lint] Running lint');
      }
      try {
        await timelineLogger.logPreview(projectId, '====安装预览 ### Running lint', 'info', taskId, undefined, 'static.check.lint.start');
      } catch {}

      try {
        if (predevNpmExecutor.useBuiltin) {
          await appendCommandLogs(predevNpmExecutor.command, [...predevNpmExecutor.args, 'run', 'lint'], projectPath, predevEnv, log, projectId, taskId, true);
        } else {
          await appendCommandLogs(npmCommand, ['run', 'lint'], projectPath, env, log, projectId, taskId);
        }
        if (__VERBOSE_LOG__) {
          console.log('====安装预览 ### [static.check.lint.success] Lint passed');
        }
        try {
          await timelineLogger.logPreview(projectId, '====安装预览 ### Lint passed', 'info', taskId, undefined, 'static.check.lint.success');
        } catch {}
      } catch (lintError) {
        const errorMsg = lintError instanceof Error ? lintError.message : String(lintError);
        if (__VERBOSE_LOG__) {
          console.warn(`====安装预览 ### [static.check.lint.warn] Lint failed (non-blocking): ${errorMsg}`);
        }
        try {
          await timelineLogger.logPreview(projectId, `====安装预览 ### Lint failed (non-blocking): ${errorMsg}`, 'warn', taskId, { error: errorMsg }, 'static.check.lint.warn');
        } catch {}
      }
    } else {
      if (__VERBOSE_LOG__) {
        console.log('====安装预览 ### [static.check.lint.skip] No lint script, skipping');
      }
      try {
        await timelineLogger.logPreview(projectId, '====安装预览 ### No lint script, skipping', 'info', taskId, undefined, 'static.check.lint.skip');
      } catch {}
    }

    if (__VERBOSE_LOG__) {
      console.log('====安装预览 ### [static.check.complete] Static checks complete');
    }
    try {
      await timelineLogger.logPreview(projectId, '====安装预览 ### Static checks complete', 'info', taskId, undefined, 'static.check.complete');
    } catch {}

    const overrides = await collectEnvOverrides(projectPath);

    if (overrides.port) {
      if (
        overrides.port < previewBounds.start ||
        overrides.port > previewBounds.end
      ) {
        queueLog(
          `Ignoring project-specified port ${overrides.port} because it falls outside the allowed preview range ${previewBounds.start}-${previewBounds.end}.`
        );
        delete overrides.port;
      }
    }

    if (overrides.url) {
      try {
        const parsed = new URL(overrides.url);
        if (parsed.port) {
          const parsedPort = parsePort(parsed.port);
          if (
            parsedPort &&
            (parsedPort < previewBounds.start ||
              parsedPort > previewBounds.end)
          ) {
            queueLog(
              `Ignoring project-specified NEXT_PUBLIC_APP_URL (${overrides.url}) because port ${parsed.port} is outside the allowed preview range ${previewBounds.start}-${previewBounds.end}.`
            );
            delete overrides.url;
          }
        }
      } catch {
        queueLog(
          `Ignoring project-specified NEXT_PUBLIC_APP_URL (${overrides.url}) because it could not be parsed as a valid URL.`
        );
        delete overrides.url;
      }
    }

    flushPendingLogs();

    if (overrides.port && overrides.port !== previewProcess.port) {
      previewProcess.port = overrides.port;
      env.PORT = String(overrides.port);
      env.WEB_PORT = String(overrides.port);
      log(
        Buffer.from(
          `[PreviewManager] Detected project-specified port ${overrides.port}.`
        )
      );
    }

    const effectivePort = previewProcess.port;
    let resolvedUrl: string = `http://localhost:${effectivePort}`;
    if (typeof overrides.url === 'string' && overrides.url.trim().length > 0) {
      resolvedUrl = overrides.url.trim();
    }

    env.NEXT_PUBLIC_APP_URL = resolvedUrl;
    previewProcess.url = resolvedUrl;

    // 获取内置 Node.js 执行器用于启动 dev server
    const npmExecutor = getNpmExecutor();
    const builtinNodeDir = getBuiltinNodeDir();

    // 注入内置 Node.js 到 PATH
    if (builtinNodeDir) {
      env.PATH = `${builtinNodeDir}${path.delimiter}${env.PATH || ''}`;
    }

    // 确定 spawn 命令和参数
    let spawnCommand: string;
    let spawnArgs: string[];
    let useShell: boolean;

    if (npmExecutor.useBuiltin) {
      spawnCommand = npmExecutor.command;
      spawnArgs = [...npmExecutor.args, 'run', 'dev', '--', '--port', String(effectivePort)];
      useShell = false; // 内置 Node 不需要 shell
    } else {
      spawnCommand = npmCommand;
      spawnArgs = ['run', 'dev', '--', '--port', String(effectivePort)];
      useShell = process.platform === 'win32';
    }

    // Log working directory and command for debugging
    log(Buffer.from(`[PreviewManager] ========================================`));
    log(Buffer.from(`[PreviewManager] Working Directory: ${projectPath}`));
    log(Buffer.from(`[PreviewManager] Command: ${spawnCommand} ${spawnArgs.join(' ')}${npmExecutor.useBuiltin ? ' (builtin Node.js)' : ''}`));
    log(Buffer.from(`[PreviewManager] ========================================`));

    const child = spawn(
      spawnCommand,
      spawnArgs,
      {
        cwd: projectPath,
        env,
        shell: useShell,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    previewProcess.process = child;
    this.processes.set(projectId, previewProcess);
    timelineLogger.logProcess(projectId, 'Spawn preview process', 'info', taskId, { pid: child.pid, command: spawnCommand, args: spawnArgs, cwd: projectPath, isBuiltin: npmExecutor.useBuiltin }, 'process.spawn').catch(() => {});

    const logStderr = this.getLogger(previewProcess, projectId, 'stderr', taskId);

    try {
      await timelineLogger.logPreview(projectId, '================== 预览 START ==================', 'info', taskId, undefined, 'separator.preview.start');
      await timelineLogger.logPreview(projectId, 'Preview start', 'info', taskId, { cwd: projectPath, port: effectivePort }, 'preview.start');
    } catch {}
    child.stdout?.on('data', (chunk) => {
      log(chunk);
      if (previewProcess.status === 'starting') {
        previewProcess.status = 'running';
        // Publish preview running status
        const { streamManager } = require('./stream');
        streamManager.publish(projectId, {
          type: 'preview_status',
          data: {
            status: 'preview_running',
            message: `Preview server running at ${previewProcess.url}`,
            metadata: { url: previewProcess.url, port: previewProcess.port },
          },
        });
        timelineLogger.logPreview(projectId, `Preview server running at ${previewProcess.url}`, 'info', taskId, { url: previewProcess.url, port: previewProcess.port, phase: 'running' }, 'preview.running').catch(() => {});
        timelineLogger.logPreview(projectId, '================== 预览 READY ==================', 'info', taskId, undefined, 'separator.preview.ready').catch(() => {});
      }
    });

    child.stderr?.on('data', (chunk) => {
      logStderr(chunk);

      // 识别关键错误并触发 preview_error 事件
      const text = chunk.toString();
      const isError = text.includes('Error:') || text.includes('Failed') || text.includes('ERROR');

      if (isError) {
        let errorType = 'UNKNOWN_ERROR';
        let suggestion = '请查看错误日志';
        let phase = 'unknown';

        // Module not found
        if (text.includes('Cannot find module') || text.includes('Module not found')) {
          const match = text.match(/['"]([^'"]+)['"]/);
          const moduleName = match ? match[1] : 'unknown';
          errorType = 'MODULE_NOT_FOUND';
          suggestion = `缺少模块 "${moduleName}"，请检查 package.json 中是否包含此依赖`;
          phase = 'compilation';
        }
        // Build failed
        else if (text.includes('Module build failed') || text.includes('Build failed')) {
          errorType = 'BUILD_ERROR';
          suggestion = '编译失败，请检查代码语法和配置';
          phase = 'compilation';
        }
        // Syntax error
        else if (text.includes('SyntaxError') || text.includes('Unexpected token')) {
          errorType = 'SYNTAX_ERROR';
          suggestion = '代码存在语法错误，请检查最近修改的文件';
          phase = 'compilation';
        }
        // Port in use
        else if (text.includes('EADDRINUSE') || text.includes('address already in use')) {
          errorType = 'PORT_IN_USE';
          suggestion = '端口被占用，系统将尝试使用其他端口';
          phase = 'starting';
        }

        // 发送 preview_error 事件
        const { streamManager } = require('./stream');
        streamManager.publish(projectId, {
          type: 'preview_error',
          data: {
            message: text.substring(0, 300),
            errorType,
            suggestion,
            phase,
            severity: 'error' as const,
          },
        });

        timelineLogger.logError(projectId, text.substring(0, 300), taskId, { errorType, suggestion, phase }, 'preview.error').catch(() => {});

        console.error(`[PreviewManager] Preview error detected [${errorType}]: ${suggestion}`);
      }
    });

    child.on('exit', (code, signal) => {
      previewProcess.status = code === 0 ? 'stopped' : 'error';
      this.processes.delete(projectId);
      updateProject(projectId, {
        previewUrl: null,
        previewPort: null,
      }).catch((error) => {
        console.error('[PreviewManager] Failed to reset project preview:', error);
      });
      updateProjectStatus(projectId, code === 0 ? 'idle' : 'error').catch((error) => {
        console.error('[PreviewManager] Failed to reset project status:', error);
      });
      log(
        Buffer.from(
          `Preview process exited (code: ${code ?? 'null'}, signal: ${
            signal ?? 'null'
          })`
        )
      );

      timelineLogger.logProcess(projectId, 'Preview process exited', code === 0 ? 'info' : 'error', taskId, { exitCode: code, signal }, 'process.exit').catch(() => {});
      if (code === 0) {
        timelineLogger.logPreview(projectId, 'Preview stopped', 'info', taskId, { exitCode: code, signal }, 'preview.stop').catch(() => {});
        timelineLogger.logPreview(projectId, '================== 预览 STOP ==================', 'info', taskId, undefined, 'separator.preview.stop').catch(() => {});
      } else {
        timelineLogger.logPreview(projectId, 'Preview error on exit', 'error', taskId, { exitCode: code, signal }, 'preview.error').catch(() => {});
      }

      // Publish preview stopped/error status
      const { streamManager } = require('./stream');
      streamManager.publish(projectId, {
        type: 'preview_status',
        data: {
          status: code === 0 ? 'preview_stopped' : 'preview_error',
          message: code === 0 ? 'Preview server stopped' : `Preview server error (exit code: ${code})`,
          metadata: { exitCode: code, signal },
        },
      });
      if (code !== 0) {
        streamManager.publish(projectId, {
          type: 'preview_error',
          data: {
            message: `Preview process exited with code ${code ?? 'null'} (signal: ${signal ?? 'null'})`,
            severity: 'error',
            phase: 'unknown',
            metadata: { exitCode: code, signal },
          },
        });
      }
    });

    child.on('error', (error) => {
      previewProcess.status = 'error';
      log(Buffer.from(`Preview process failed: ${error.message}`));
      updateProject(projectId, {
        previewUrl: null,
        previewPort: null,
      }).catch(() => {});
      updateProjectStatus(projectId, 'error').catch(() => {});
      timelineLogger.logPreview(projectId, 'Preview process failed', 'error', taskId, { error: error?.message }, 'preview.error').catch(() => {});
      const { streamManager } = require('./stream');
      streamManager.publish(projectId, {
        type: 'preview_error',
        data: {
          message: error?.message || 'Preview process failed',
          severity: 'error',
          phase: 'unknown',
        },
      });
    });

    const confirmed = await waitForPreviewReady(previewProcess.url, log).catch(() => false);

    if (confirmed) {
      if (__VERBOSE_LOG__) {
        console.log(`====安装预览 ### [preview.ready] Preview ready at ${previewProcess.url}`);
      }
      const { streamManager: smReady } = require('./stream');
      smReady.publish(projectId, {
        type: 'preview_ready',
        data: {
          status: 'preview_ready',
          message: `Preview is ready at ${previewProcess.url}`,
          phase: 'ready',
          metadata: { url: previewProcess.url, port: previewProcess.port, instanceId: previewProcess.startedAt.getTime() },
        },
      });
      timelineLogger.logPreview(projectId, `Preview is ready at ${previewProcess.url}`, 'info', taskId, { url: previewProcess.url, port: previewProcess.port, phase: 'ready' }, 'preview.ready').catch(() => {});

      await updateProject(projectId, {
        previewUrl: previewProcess.url,
        previewPort: previewProcess.port,
        status: 'running',
      });
    } else {
      const { streamManager } = require('./stream');
      streamManager.publish(projectId, {
        type: 'preview_status',
        data: {
          status: 'preview_running',
          message: 'Preview server is starting, waiting for readiness confirmation...',
          metadata: { url: previewProcess.url, port: previewProcess.port },
        },
      });
      timelineLogger.logPreview(projectId, 'Preview running without readiness confirmation', 'warn', taskId, { url: previewProcess.url, port: previewProcess.port, phase: 'running' }, 'preview.running.unconfirmed').catch(() => {});
    }

    // 空闲自动停止：若无任何连接，超过阈值自动停止
    try {
      const { streamManager } = require('./stream');
      const existingTimer = this.idleTimers.get(projectId);
      if (existingTimer) {
        clearInterval(existingTimer);
      }
      const timer = setInterval(async () => {
        try {
          const count = streamManager.getStreamCount(projectId);
          if (count === 0) {
            if (!this.idleStart.has(projectId)) {
              this.idleStart.set(projectId, Date.now());
            }
            const startTs = this.idleStart.get(projectId) || Date.now();
            const elapsed = Date.now() - startTs;
            if (elapsed >= PREVIEW_IDLE_STOP_TIMEOUT_MS) {
              clearInterval(timer);
              this.idleTimers.delete(projectId);
              this.idleStart.delete(projectId);
              await this.stop(projectId);
            }
          } else {
            this.idleStart.delete(projectId);
          }
        } catch {}
      }, PREVIEW_IDLE_CHECK_INTERVAL_MS);
      this.idleTimers.set(projectId, timer);
    } catch {}

    return this.toInfo(previewProcess);
  }

  public async stop(projectId: string): Promise<PreviewInfo> {
    const taskId = this.getOrCreateTaskId(projectId);
    const processInfo = this.processes.get(projectId);
    if (!processInfo) {
      const project = await getProjectById(projectId);
      if (project) {
        await updateProject(projectId, {
          previewUrl: null,
          previewPort: null,
        });
        // 只有当前不是error状态才设置为idle
        if (project.status !== 'error') {
          await updateProjectStatus(projectId, 'idle');
        }
      }
      return {
        port: null,
        url: null,
        status: 'stopped',
        logs: [],
      };
    }

    // Kill process tree (including child processes)
    if (processInfo.process?.pid) {
      try {
        await new Promise<void>((resolve, reject) => {
          kill(processInfo.process!.pid!, 'SIGTERM', (error) => {
            if (error) {
              console.error('[PreviewManager] Failed to kill process tree:', error);
              reject(error);
            } else {
              console.log('[PreviewManager] Process tree killed successfully');
              timelineLogger.logProcess(projectId, 'Killed preview process tree', 'warn', undefined, { pid: processInfo.process!.pid!, signal: 'SIGTERM' }, 'process.kill').catch(() => {});
              resolve();
            }
          });
        });
      } catch (error) {
        console.error('[PreviewManager] Error killing process, trying SIGKILL:', error);
        // Fallback to SIGKILL if SIGTERM fails
        try {
          await new Promise<void>((resolve, reject) => {
            kill(processInfo.process!.pid!, 'SIGKILL', (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
          timelineLogger.logProcess(projectId, 'Force killed preview process tree', 'error', undefined, { pid: processInfo.process!.pid!, signal: 'SIGKILL' }, 'process.kill').catch(() => {});
        } catch (killError) {
          console.error('[PreviewManager] Failed to force kill process:', killError);
        }
      }
    }

    timelineLogger.logPreview(projectId, 'Preview stopped', 'info', taskId, undefined, 'preview.stop').catch(() => {});

    // 清理空闲定时器
    const t = this.idleTimers.get(projectId);
    if (t) {
      try { clearInterval(t); } catch {}
      this.idleTimers.delete(projectId);
    }
    this.idleStart.delete(projectId);
    this.processes.delete(projectId);
    await updateProject(projectId, {
      previewUrl: null,
      previewPort: null,
    });
    // 只有当前不是error状态才设置为idle
    const project = await getProjectById(projectId);
    if (project && project.status !== 'error') {
      await updateProjectStatus(projectId, 'idle');
    }

    return {
      port: null,
      url: null,
      status: 'stopped',
      logs: processInfo.logs,
    };
  }

  public getStatus(projectId: string): PreviewInfo {
    const processInfo = this.processes.get(projectId);
    if (!processInfo) {
      return {
        port: null,
        url: null,
        status: 'stopped',
        logs: [],
      };
    }
    return this.toInfo(processInfo);
  }

  public getLogs(projectId: string): string[] {
    const processInfo = this.processes.get(projectId);
    return processInfo ? [...processInfo.logs] : [];
  }

  private toInfo(processInfo: PreviewProcess): PreviewInfo {
    return {
      port: processInfo.port,
      url: processInfo.url,
      status: processInfo.status,
      logs: [...processInfo.logs],
      pid: processInfo.process?.pid,
      instanceId: processInfo.startedAt.getTime(),
    };
  }

  /**
   * 启动Python FastAPI项目
   */
  private async startPythonProject(
    projectId: string,
    projectPath: string
  ): Promise<PreviewInfo> {
    const taskId = this.getOrCreateTaskId(projectId);
    const { streamManager } = require('./stream');

    // 静态检查
    const validation = await validatePythonProject(projectPath);
    if (!validation.valid) {
      const errorMsg = '项目不符合规范：\n' + validation.errors.join('\n');

      streamManager.publish(projectId, {
        type: 'preview_error',
        data: {
          message: errorMsg,
          severity: 'error',
          phase: 'validation',
        },
      });

      throw new Error(errorMsg);
    }

    // 检测 Python（优先内置，降级系统）
    const pythonCmd = await detectPython();
    if (!pythonCmd) {
      const errorMsg =
        '未检测到 Python 环境\n\n请访问 https://www.python.org/downloads/ 下载安装后重试';

      timelineLogger
        .logPreview(
          projectId,
          '[🐍 PYTHON] ❌ Python 环境检测失败：未找到可用的 Python',
          'error',
          taskId
        )
        .catch(() => {});

      streamManager.publish(projectId, {
        type: 'preview_error',
        data: {
          message: errorMsg,
          severity: 'error',
          phase: 'environment',
        },
      });

      throw new Error(errorMsg);
    }

    // 记录 Python 检测结果到 timeline
    const isBuiltin = pythonCmd.includes('python-runtime');
    const pythonType = isBuiltin ? '内置 Python' : '系统 Python';
    timelineLogger
      .logPreview(
        projectId,
        `[🐍 PYTHON] ✅ 使用 ${pythonType}: ${pythonCmd}`,
        'info',
        taskId
      )
      .catch(() => {});

    // 创建虚拟环境
    await createVirtualEnv(projectPath, pythonCmd);

    // 确保.gitignore包含必要条目
    await ensurePythonGitignore(projectPath);

    // 检查虚拟环境
    const venvPython = getVenvPythonPath(projectPath);
    const hasVenv = await fileExists(venvPython);

    if (!hasVenv) {
      throw new Error('虚拟环境创建失败');
    }

    // 分配端口
    const previewBounds = resolvePreviewBounds();
    const port = await findAvailablePort(previewBounds.start, previewBounds.end);
    const url = `http://localhost:${port}`;

    const previewProcess: PreviewProcess = {
      process: null,
      port,
      url,
      status: 'starting',
      logs: [],
      startedAt: new Date(),
    };

    const log = this.getLogger(previewProcess, projectId, 'stdout', taskId);

    // 安装依赖
    log(Buffer.from('[PreviewManager] ========================================'));
    log(Buffer.from('[PreviewManager] Checking Python dependencies...'));
    log(Buffer.from('[PreviewManager] ========================================'));

    await installPythonDependenciesWithRetry(
      projectPath,
      createSafeSubprocessEnv(),
      log,
      projectId,
      taskId
    );

    // 启动uvicorn
    log(Buffer.from('[PreviewManager] ========================================'));
    log(Buffer.from('[PreviewManager] Starting FastAPI server...'));
    log(Buffer.from(`[PreviewManager] Working Directory: ${projectPath}`));
    log(
      Buffer.from(
        `[PreviewManager] Command: ${venvPython} -m uvicorn app.main:app --host 0.0.0.0 --port ${port}`
      )
    );
    log(Buffer.from('[PreviewManager] ========================================'));

    const child = spawn(
      venvPython,
      [
        '-m',
        'uvicorn',
        'app.main:app',
        '--host',
        '0.0.0.0',
        '--port',
        String(port),
        '--reload',
        '--reload-dir',
        './app',
      ],
      {
        cwd: projectPath,
        env: createSafeSubprocessEnv({
          PYTHONUNBUFFERED: '1', // 禁用Python输出缓冲
          PYTHONIOENCODING: 'utf-8',
        }),
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    previewProcess.process = child;
    this.processes.set(projectId, previewProcess);

    timelineLogger
      .logProcess(
        projectId,
        'Spawn Python preview process',
        'info',
        taskId,
        { pid: child.pid, command: venvPython, port },
        'process.spawn'
      )
      .catch(() => {});

    const logStderr = this.getLogger(previewProcess, projectId, 'stderr', taskId);

    // 日志收集
    child.stdout?.on('data', (chunk) => {
      log(chunk);
      const text = chunk.toString();

      if (previewProcess.status === 'starting') {
        // 检测启动成功的标志
        if (text.includes('Uvicorn running') || text.includes('Application startup complete')) {
          previewProcess.status = 'running';

          streamManager.publish(projectId, {
            type: 'preview_status',
            data: {
              status: 'preview_running',
              message: `Preview server running at ${url}`,
              metadata: { url, port },
            },
          });
        }
      }

      // 错误检测（uvicorn的错误也会输出到stdout）
      if (text.includes('Error') || text.includes('ERROR') || text.includes('Failed') || text.includes('Traceback')) {
        let errorType = 'UNKNOWN_ERROR';
        let suggestion = '请查看错误日志';
        let isFatalError = false;

        if (text.includes('ModuleNotFoundError')) {
          errorType = 'MODULE_NOT_FOUND';
          suggestion = '缺少Python模块，请检查依赖是否已正确安装';
          isFatalError = true;
        } else if (text.includes('Address already in use')) {
          errorType = 'PORT_IN_USE';
          suggestion = '端口被占用，系统将尝试使用其他端口';
        } else if (text.includes('SyntaxError')) {
          errorType = 'SYNTAX_ERROR';
          suggestion = '代码存在语法错误，请检查Python代码';
          isFatalError = true;
        }

        streamManager.publish(projectId, {
          type: 'preview_error',
          data: {
            message: text.substring(0, 300),
            errorType,
            suggestion,
            severity: 'error',
          },
        });

        // 致命错误：立即更新数据库状态
        if (isFatalError) {
          updateProjectStatus(projectId, 'error').catch((error) => {
            console.error('[PreviewManager] Failed to update project status to error:', error);
          });
        }
      }
    });

    child.stderr?.on('data', (chunk) => {
      logStderr(chunk);

      // 错误检测和分类
      const text = chunk.toString();
      if (text.includes('Error') || text.includes('ERROR') || text.includes('Failed')) {
        let errorType = 'UNKNOWN_ERROR';
        let suggestion = '请查看错误日志';
        let isFatalError = false;

        if (text.includes('ModuleNotFoundError')) {
          errorType = 'MODULE_NOT_FOUND';
          suggestion = '缺少Python模块，请检查依赖是否已正确安装';
          isFatalError = true;
        } else if (text.includes('Address already in use')) {
          errorType = 'PORT_IN_USE';
          suggestion = '端口被占用，系统将尝试使用其他端口';
        } else if (text.includes('SyntaxError')) {
          errorType = 'SYNTAX_ERROR';
          suggestion = '代码存在语法错误，请检查Python代码';
          isFatalError = true;
        }

        streamManager.publish(projectId, {
          type: 'preview_error',
          data: {
            message: text.substring(0, 300),
            errorType,
            suggestion,
            severity: 'error',
          },
        });

        // 致命错误：立即更新数据库状态
        if (isFatalError) {
          updateProjectStatus(projectId, 'error').catch((error) => {
            console.error('[PreviewManager] Failed to update project status to error:', error);
          });
        }
      }
    });

    child.on('exit', (code, signal) => {
      previewProcess.status = code === 0 ? 'stopped' : 'error';
      this.processes.delete(projectId);

      updateProject(projectId, {
        previewUrl: null,
        previewPort: null,
      }).catch(() => {});

      updateProjectStatus(projectId, code === 0 ? 'idle' : 'error').catch(() => {});

      log(Buffer.from(`Preview process exited (code: ${code}, signal: ${signal})`));

      timelineLogger
        .logProcess(
          projectId,
          'Python preview process exited',
          code === 0 ? 'info' : 'error',
          taskId,
          { exitCode: code, signal },
          'process.exit'
        )
        .catch(() => {});
    });

    child.on('error', (error) => {
      previewProcess.status = 'error';
      log(Buffer.from(`Preview process failed: ${error.message}`));

      updateProject(projectId, {
        previewUrl: null,
        previewPort: null,
      }).catch(() => {});

      updateProjectStatus(projectId, 'error').catch(() => {});
    });

    // 健康检查
    const healthCheckUrl = `${url}/health`;
    const confirmed = await waitForPreviewReady(
      healthCheckUrl,
      log,
      60000, // Python启动可能较慢，超时时间设为60秒
      1000
    ).catch(() => false);

    if (confirmed) {
      streamManager.publish(projectId, {
        type: 'preview_ready',
        data: {
          status: 'preview_ready',
          message: `Preview is ready at ${url}`,
          metadata: { url, port, instanceId: previewProcess.startedAt.getTime() },
        },
      });

      await updateProject(projectId, {
        previewUrl: url,
        previewPort: port,
        status: 'running',
      });
    }

    return this.toInfo(previewProcess);
  }
}

const globalPreviewManager = globalThis as unknown as {
  __claudable_preview_manager__?: PreviewManager;
};

export const previewManager: PreviewManager =
  globalPreviewManager.__claudable_preview_manager__ ??
  (globalPreviewManager.__claudable_preview_manager__ = new PreviewManager());
