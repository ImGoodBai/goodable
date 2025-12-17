/**
 * Python utility functions for FastAPI project support
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

/**
 * 执行命令并返回输出
 */
async function execCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['--version'], {
      shell: true,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout + stderr);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

/**
 * 检查文件是否存在
 */
async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * 检查目录是否存在
 */
async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 检测系统Python并返回可执行文件路径
 * 要求版本 >= 3.11
 */
export async function detectSystemPython(): Promise<string | null> {
  const candidates = ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = await execCommand(cmd);
      const match = result.match(/Python (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major === 3 && minor >= 11) {
          return cmd;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * 校验Python版本
 */
export async function checkPythonVersion(
  pythonCmd: string
): Promise<{ valid: boolean; version: string; message: string }> {
  try {
    const result = await execCommand(pythonCmd);
    const match = result.match(/Python (\d+)\.(\d+)\.(\d+)/);

    if (!match) {
      return {
        valid: false,
        version: 'unknown',
        message: '无法解析Python版本号',
      };
    }

    const [, major, minor, patch] = match;
    const version = `${major}.${minor}.${patch}`;
    const majorNum = parseInt(major, 10);
    const minorNum = parseInt(minor, 10);

    if (majorNum === 3 && minorNum >= 11) {
      return {
        valid: true,
        version,
        message: `Python版本符合要求: ${version}`,
      };
    }

    return {
      valid: false,
      version,
      message: `Python版本过低: ${version}，要求 >= 3.11`,
    };
  } catch (error) {
    return {
      valid: false,
      version: 'unknown',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 创建虚拟环境
 */
export async function createVirtualEnv(
  projectPath: string,
  pythonCmd: string
): Promise<void> {
  const venvPath = path.join(projectPath, '.venv');

  // 检查是否已存在
  if (await directoryExists(venvPath)) {
    // 验证虚拟环境是否有效
    const pythonBin = getVenvPythonPath(projectPath);
    if (await fileExists(pythonBin)) {
      return; // 已存在且有效
    }
  }

  // 创建虚拟环境
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pythonCmd, ['-m', 'venv', '.venv'], {
      cwd: projectPath,
      shell: process.platform === 'win32',
      stdio: 'pipe',
    });

    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Virtual environment creation failed with code ${code}${stderr ? `: ${stderr}` : ''}`
          )
        );
      }
    });
  });
}

/**
 * 获取虚拟环境Python路径
 */
export function getVenvPythonPath(projectPath: string): string {
  const isWindows = process.platform === 'win32';
  const binDir = isWindows ? 'Scripts' : 'bin';
  const pythonBin = isWindows ? 'python.exe' : 'python';
  return path.join(projectPath, '.venv', binDir, pythonBin);
}

/**
 * 获取虚拟环境pip路径
 */
export function getVenvPipPath(projectPath: string): string {
  const isWindows = process.platform === 'win32';
  const binDir = isWindows ? 'Scripts' : 'bin';
  const pipBin = isWindows ? 'pip.exe' : 'pip';
  return path.join(projectPath, '.venv', binDir, pipBin);
}

/**
 * 确保Python项目的.gitignore包含必要条目
 */
export async function ensurePythonGitignore(projectPath: string): Promise<void> {
  const gitignorePath = path.join(projectPath, '.gitignore');

  const requiredEntries = [
    '.venv/',
    '__pycache__/',
    '*.pyc',
    '*.pyo',
    '*.pyd',
    '.Python',
    '*.db',
    '*.sqlite',
    '*.sqlite3',
    '.env',
    '.env.local',
  ];

  let content = '';

  try {
    content = await fs.readFile(gitignorePath, 'utf8');
  } catch {
    // 文件不存在，创建新的
    content = '# Python\n';
  }

  let modified = false;
  const lines = content.split('\n');

  for (const entry of requiredEntries) {
    // 检查是否已存在（忽略注释和空行）
    const exists = lines.some((line) => {
      const trimmed = line.trim();
      return trimmed === entry || trimmed === entry.replace('/', '');
    });

    if (!exists) {
      lines.push(entry);
      modified = true;
    }
  }

  if (modified) {
    await fs.writeFile(gitignorePath, lines.join('\n'), 'utf8');
  }
}
