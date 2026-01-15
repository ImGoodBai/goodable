/**
 * Unified path configuration
 *
 * All project directory paths must use this module.
 * If PROJECTS_DIR is not configured, the application will fail to start.
 */

import path from 'path';
import fs from 'fs';

/**
 * Get and validate PROJECTS_DIR from environment
 */
function getProjectsDirectory(): string {
  const projectsDir = process.env.PROJECTS_DIR;

  if (!projectsDir || projectsDir.trim() === '') {
    console.error('\n❌ FATAL ERROR: PROJECTS_DIR environment variable is not set!\n');
    console.error('Please configure PROJECTS_DIR in your .env file:');
    console.error('  PROJECTS_DIR="/path/to/your/projects"\n');
    console.error('Example:');
    console.error('  PROJECTS_DIR="./data/projects"');
    console.error('  PROJECTS_DIR="/Users/yourname/my-projects"\n');
    throw new Error('PROJECTS_DIR environment variable is required but not set');
  }

  // Convert to absolute path
  const absolutePath = path.isAbsolute(projectsDir)
    ? path.resolve(projectsDir)
    : path.resolve(process.cwd(), projectsDir);

  // Ensure directory exists
  try {
    if (!fs.existsSync(absolutePath)) {
      console.log(`[PathConfig] Creating projects directory: ${absolutePath}`);
      fs.mkdirSync(absolutePath, { recursive: true });
    }

    // Verify write permissions
    fs.accessSync(absolutePath, fs.constants.W_OK | fs.constants.R_OK);

    console.log(`[PathConfig] ✅ Projects directory configured: ${absolutePath}`);
  } catch (error) {
    console.error(`\n❌ FATAL ERROR: Cannot access PROJECTS_DIR: ${absolutePath}\n`);

    if (error instanceof Error && 'code' in error) {
      if (error.code === 'EACCES') {
        console.error('Permission denied. Please check directory permissions.');
      } else if (error.code === 'ENOENT') {
        console.error('Directory does not exist and cannot be created.');
      } else {
        console.error(`Error: ${error.message}`);
      }
    }

    throw new Error(`Cannot access PROJECTS_DIR: ${absolutePath}`);
  }

  return absolutePath;
}

/**
 * Absolute path to projects directory
 * This is the single source of truth for all project paths
 */
export const PROJECTS_DIR_ABSOLUTE = getProjectsDirectory();

/**
 * Get templates directory path
 */
function getTemplatesDirectory(): string {
  const templatesDir = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');

  // Convert to absolute path
  const absolutePath = path.isAbsolute(templatesDir)
    ? path.resolve(templatesDir)
    : path.resolve(process.cwd(), templatesDir);

  // Ensure directory exists
  try {
    if (!fs.existsSync(absolutePath)) {
      console.log(`[PathConfig] Creating templates directory: ${absolutePath}`);
      fs.mkdirSync(absolutePath, { recursive: true });
    }

    console.log(`[PathConfig] ✅ Templates directory configured: ${absolutePath}`);
  } catch (error) {
    console.warn(`[PathConfig] ⚠️ Cannot access TEMPLATES_DIR: ${absolutePath}`);
    console.warn('Templates feature will be unavailable');
  }

  return absolutePath;
}

/**
 * Absolute path to templates directory (builtin templates)
 */
export const TEMPLATES_DIR_ABSOLUTE = getTemplatesDirectory();

/**
 * Get user templates directory path (for imported templates)
 */
function getUserTemplatesDirectory(): string {
  // Priority 1: Use environment variable (set by Electron main process)
  const envUserTemplatesDir = process.env.USER_TEMPLATES_DIR;
  if (envUserTemplatesDir && envUserTemplatesDir.trim() !== '') {
    const absolutePath = path.isAbsolute(envUserTemplatesDir)
      ? path.resolve(envUserTemplatesDir)
      : path.resolve(process.cwd(), envUserTemplatesDir);

    try {
      if (!fs.existsSync(absolutePath)) {
        console.log(`[PathConfig] Creating user templates directory: ${absolutePath}`);
        fs.mkdirSync(absolutePath, { recursive: true });
      }
      console.log(`[PathConfig] ✅ User templates directory configured: ${absolutePath}`);
    } catch (error) {
      console.warn(`[PathConfig] ⚠️ Cannot access user templates directory: ${absolutePath}`);
    }

    return absolutePath;
  }

  // Priority 2: Development fallback - use data/user-templates
  const userTemplatesPath = path.join(process.cwd(), 'data', 'user-templates');

  // Ensure directory exists
  try {
    if (!fs.existsSync(userTemplatesPath)) {
      console.log(`[PathConfig] Creating user templates directory: ${userTemplatesPath}`);
      fs.mkdirSync(userTemplatesPath, { recursive: true });
    }

    console.log(`[PathConfig] ✅ User templates directory configured: ${userTemplatesPath}`);
  } catch (error) {
    console.warn(`[PathConfig] ⚠️ Cannot access user templates directory: ${userTemplatesPath}`);
  }

  return userTemplatesPath;
}

/**
 * Absolute path to user templates directory (imported templates)
 */
export const USER_TEMPLATES_DIR_ABSOLUTE = getUserTemplatesDirectory();

/**
 * Get builtin Python runtime path
 */
export function getBuiltinPythonPath(): string | null {
  try {
    const platform = process.platform;
    const arch = process.arch;

    // Determine platform directory
    let platformDir = '';
    if (platform === 'darwin') {
      platformDir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    } else if (platform === 'win32') {
      platformDir = 'win32-x64';
    } else if (platform === 'linux') {
      platformDir = 'linux-x64';
    } else {
      return null;
    }

    // Determine Python executable name
    const pythonBin = platform === 'win32' ? 'python.exe' : 'python3';

    // Build path to builtin Python
    // In packaged Electron app, use process.resourcesPath
    // In development (Next.js), use process.cwd()
    const electronResourcesPath = (process as any).resourcesPath as string | undefined;
    const appRoot =
      electronResourcesPath && fs.existsSync(electronResourcesPath)
        ? electronResourcesPath
        : process.cwd();

    const runtimeDir = path.join(appRoot, 'python-runtime', platformDir);
    const pythonPath = path.join(runtimeDir, 'bin', pythonBin);

    // Check if exists
    if (fs.existsSync(pythonPath)) {
      console.log(`[PathConfig] ✅ Found builtin Python: ${pythonPath}`);
      return pythonPath;
    }

    console.log(`[PathConfig] ⚠️ Builtin Python not found at: ${pythonPath}`);
    return null;
  } catch (error) {
    console.error('[PathConfig] ❌ Error detecting builtin Python:', error);
    return null;
  }
}

/**
 * Get builtin Node.js path
 * 优先使用内置 Node，开发环境也优先使用（如果存在）
 */
export function getBuiltinNodePath(): string | null {
  try {
    const platform = process.platform;
    const arch = process.arch;

    let platformDir = '';
    if (platform === 'darwin') {
      platformDir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    } else if (platform === 'win32') {
      platformDir = 'win32-x64';
    } else {
      return null;
    }

    const nodeBin = platform === 'win32' ? 'node.exe' : 'bin/node';

    // 生产环境: process.resourcesPath 指向 resources 目录
    // 开发环境: 使用 cwd
    const electronResourcesPath = (process as any).resourcesPath as string | undefined;
    const appRoot = electronResourcesPath && fs.existsSync(electronResourcesPath)
      ? electronResourcesPath
      : process.cwd();

    const nodePath = path.join(appRoot, 'node-runtime', platformDir, nodeBin);

    if (fs.existsSync(nodePath)) {
      console.log(`[PathConfig] ✅ Found builtin Node.js: ${nodePath}`);
      return nodePath;
    }

    console.log(`[PathConfig] ⚠️ Builtin Node.js not found at: ${nodePath}`);
    return null;
  } catch (error) {
    console.error('[PathConfig] ❌ Error detecting builtin Node.js:', error);
    return null;
  }
}

/**
 * Get builtin Node.js directory (for PATH injection)
 */
export function getBuiltinNodeDir(): string | null {
  const nodePath = getBuiltinNodePath();
  if (!nodePath) return null;

  // Windows: node.exe 直接在目录下
  // macOS: node 在 bin/ 子目录下，需要返回 bin/ 目录
  return path.dirname(nodePath);
}

/**
 * Get npm-cli.js path (避免依赖符号链接)
 */
export function getBuiltinNpmCliPath(): string | null {
  try {
    const platform = process.platform;
    const arch = process.arch;

    let platformDir = '';
    if (platform === 'darwin') {
      platformDir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    } else if (platform === 'win32') {
      platformDir = 'win32-x64';
    } else {
      return null;
    }

    const electronResourcesPath = (process as any).resourcesPath as string | undefined;
    const appRoot = electronResourcesPath && fs.existsSync(electronResourcesPath)
      ? electronResourcesPath
      : process.cwd();

    // npm-cli.js 的相对路径
    const npmCliRelative = platform === 'win32'
      ? 'node_modules/npm/bin/npm-cli.js'
      : 'lib/node_modules/npm/bin/npm-cli.js';

    const npmCliPath = path.join(appRoot, 'node-runtime', platformDir, npmCliRelative);

    if (fs.existsSync(npmCliPath)) {
      console.log(`[PathConfig] ✅ Found builtin npm-cli.js: ${npmCliPath}`);
      return npmCliPath;
    }

    console.log(`[PathConfig] ⚠️ Builtin npm-cli.js not found at: ${npmCliPath}`);
    return null;
  } catch (error) {
    console.error('[PathConfig] ❌ Error detecting builtin npm-cli.js:', error);
    return null;
  }
}

/**
 * Get Claude Code CLI executable path
 * Returns runtime-resolved path instead of build-time hardcoded path
 */
export function getClaudeCodeExecutablePath(): string {
  try {
    // Priority 1: Environment variable (passed from Electron main process to standalone subprocess)
    if (process.env.CLAUDE_CLI_PATH) {
      console.log(`[PathConfig] ✅ Using CLAUDE_CLI_PATH from env: ${process.env.CLAUDE_CLI_PATH}`);
      return process.env.CLAUDE_CLI_PATH;
    }

    // Priority 2: GOODABLE_RESOURCES_PATH (resource root passed from main process)
    const resourcesPath = process.env.GOODABLE_RESOURCES_PATH;
    if (resourcesPath) {
      const cliPath = path.join(
        resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@anthropic-ai',
        'claude-agent-sdk',
        'cli.js'
      );
      if (fs.existsSync(cliPath)) {
        console.log(`[PathConfig] ✅ CLI found via GOODABLE_RESOURCES_PATH: ${cliPath}`);
        return cliPath;
      }
    }

    // Priority 3: Electron's process.resourcesPath (for code running in Electron main/renderer)
    const electronResourcesPath = (process as any).resourcesPath as string | undefined;

    let cliPath: string;

    if (electronResourcesPath && fs.existsSync(electronResourcesPath)) {
      // Production (Electron): resources/app.asar.unpacked/node_modules/...
      cliPath = path.join(
        electronResourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@anthropic-ai',
        'claude-agent-sdk',
        'cli.js'
      );
    } else {
      // Development: project_root/node_modules/...
      cliPath = path.join(
        process.cwd(),
        'node_modules',
        '@anthropic-ai',
        'claude-agent-sdk',
        'cli.js'
      );
    }

    // Verify path exists before returning
    if (!fs.existsSync(cliPath)) {
      console.error(`[PathConfig] ❌ CLI not found at: ${cliPath}`);

      // Fallback: try alternative paths
      const fallbackPaths = [
        // Try process.cwd() if we were using electronResourcesPath
        electronResourcesPath ? path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js') : null,
        // Try without app.asar.unpacked
        electronResourcesPath ? path.join(electronResourcesPath, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js') : null,
      ].filter((p): p is string => p !== null && fs.existsSync(p));

      if (fallbackPaths.length > 0) {
        cliPath = fallbackPaths[0];
        console.log(`[PathConfig] ✅ Fallback CLI path found: ${cliPath}`);
      } else {
        throw new Error(`Claude Code CLI not found. Searched: ${cliPath} and ${fallbackPaths.length} fallback paths`);
      }
    }

    console.log(`[PathConfig] ✅ Claude Code CLI path resolved: ${cliPath}`);
    return cliPath;
  } catch (error) {
    console.error('[PathConfig] ❌ Error resolving Claude Code CLI path:', error);
    // Fallback to relative path
    return path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  }
}

// ========== Git Runtime (Windows only) ==========

// 模块级缓存，避免高频 fs.existsSync + 日志刷屏
let _cachedGitDir: string | null | undefined = undefined;
let _cachedGitBashPath: string | null | undefined = undefined;

/**
 * Get builtin Git directory (PortableGit)
 * Windows only - for Claude Code SDK's git-bash requirement
 */
export function getBuiltinGitDir(): string | null {
  // 返回缓存值（包括 null）
  if (_cachedGitDir !== undefined) {
    return _cachedGitDir;
  }

  // 仅 Windows 需要内置 Git
  if (process.platform !== 'win32') {
    _cachedGitDir = null;
    return null;
  }

  try {
    const electronResourcesPath = (process as any).resourcesPath as string | undefined;

    // 两段式 fallback：先 resourcesPath，不存在再 cwd
    // 注意：Electron dev 模式下 resourcesPath 也存在，但指向 Electron 自身，不是我们的 runtime
    const candidatePaths = [
      electronResourcesPath ? path.join(electronResourcesPath, 'git-runtime', 'win32-x64') : null,
      path.join(process.cwd(), 'git-runtime', 'win32-x64'),
    ].filter((p): p is string => p !== null);

    for (const gitDir of candidatePaths) {
      if (fs.existsSync(gitDir) && fs.existsSync(path.join(gitDir, 'bin', 'bash.exe'))) {
        console.log(`[PathConfig] ✅ Found builtin Git: ${gitDir}`);
        _cachedGitDir = gitDir;
        return gitDir;
      }
    }

    console.log(`[PathConfig] ⚠️ Builtin Git not found in any of: ${candidatePaths.join(', ')}`);
    _cachedGitDir = null;
    return null;
  } catch (error) {
    console.error('[PathConfig] ❌ Error detecting builtin Git:', error);
    _cachedGitDir = null;
    return null;
  }
}

/**
 * Get builtin Git Bash path
 * For CLAUDE_CODE_GIT_BASH_PATH environment variable
 */
export function getBuiltinGitBashPath(): string | null {
  // 返回缓存值（包括 null）
  if (_cachedGitBashPath !== undefined) {
    return _cachedGitBashPath;
  }

  const gitDir = getBuiltinGitDir();
  if (!gitDir) {
    _cachedGitBashPath = null;
    return null;
  }

  const bashPath = path.join(gitDir, 'bin', 'bash.exe');
  if (fs.existsSync(bashPath)) {
    _cachedGitBashPath = bashPath;
    return bashPath;
  }

  _cachedGitBashPath = null;
  return null;
}
