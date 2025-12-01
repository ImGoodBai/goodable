/**
 * PreviewManager - Handles per-project development servers (live preview)
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import kill from 'tree-kill';
import { findAvailablePort } from '@/lib/utils/ports';
import { getProjectById, updateProject, updateProjectStatus } from './project';
import { scaffoldBasicNextApp } from '@/lib/utils/scaffold';
import { PREVIEW_CONFIG } from '@/lib/config/constants';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun';

type PackageManagerId = 'npm' | 'pnpm' | 'yarn' | 'bun';

const PACKAGE_MANAGER_COMMANDS: Record<
  PackageManagerId,
  { command: string; installArgs: string[] }
> = {
  npm: { command: npmCommand, installArgs: ['install'] },
  pnpm: { command: pnpmCommand, installArgs: ['install'] },
  yarn: { command: yarnCommand, installArgs: ['install'] },
  bun: { command: bunCommand, installArgs: ['install'] },
};

const LOG_LIMIT = PREVIEW_CONFIG.LOG_LIMIT;
const PREVIEW_FALLBACK_PORT_START = PREVIEW_CONFIG.FALLBACK_PORT_START;
const PREVIEW_FALLBACK_PORT_END = PREVIEW_CONFIG.FALLBACK_PORT_END;
const PREVIEW_MAX_PORT = 65_535;
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

async function runInstallWithPreferredManager(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void
): Promise<void> {
  const manager = await detectPackageManager(projectPath);
  const { command, installArgs } = PACKAGE_MANAGER_COMMANDS[manager];

  logger(`[PreviewManager] ========================================`);
  logger(`[PreviewManager] Working Directory: ${projectPath}`);
  logger(`[PreviewManager] Installing dependencies using ${manager}.`);
  logger(`[PreviewManager] Command: ${command} ${installArgs.join(' ')}`);
  logger(`[PreviewManager] ========================================`);
  try {
    await appendCommandLogs(command, installArgs, projectPath, env, logger);
  } catch (error) {
    if (manager !== 'npm' && isCommandNotFound(error)) {
      logger(
        `[PreviewManager] ${command} unavailable. Falling back to npm install.`
      );
      await appendCommandLogs(
        PACKAGE_MANAGER_COMMANDS.npm.command,
        PACKAGE_MANAGER_COMMANDS.npm.installArgs,
        projectPath,
        env,
        logger
      );
      return;
    }
    throw error;
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
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        log(
          Buffer.from(
            `[PreviewManager] Preview server responded after ${attempts} attempt(s).`
          )
        );
        return true;
      }
      if (response.status === 405 || response.status === 501) {
        const getResponse = await fetch(url, { method: 'GET' });
        if (getResponse.ok) {
          log(
            Buffer.from(
              `[PreviewManager] Preview server responded to GET after ${attempts} attempt(s).`
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
  logger: (chunk: Buffer | string) => void
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', logger);
    child.stderr?.on('data', logger);

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
  logger: (chunk: Buffer | string) => void
) {
  try {
    await fs.access(path.join(projectPath, 'node_modules'));
    return;
  } catch {
    // node_modules missing, fall back to npm install
  }

  await runInstallWithPreferredManager(projectPath, env, logger);
}

export interface PreviewInfo {
  port: number | null;
  url: string | null;
  status: PreviewStatus;
  logs: string[];
  pid?: number;
}

class PreviewManager {
  private processes = new Map<string, PreviewProcess>();
  private installing = new Map<string, Promise<void>>();

  private getLogger(processInfo: PreviewProcess, projectId: string, level: 'stdout' | 'stderr' = 'stdout') {
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

  public async installDependencies(projectId: string): Promise<{ logs: string[] }> {
    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

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
              { ...process.env },
              collectFromChunk
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

    return { logs };
  }

  public async start(projectId: string): Promise<PreviewInfo> {
    const existing = this.processes.get(projectId);
    if (existing && existing.status !== 'error') {
      return this.toInfo(existing);
    }

    // Publish preview starting status
    const { streamManager } = require('./stream');
    streamManager.publish(projectId, {
      type: 'status',
      data: {
        status: 'preview_starting',
        message: 'Starting preview server...',
      },
    });

    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const projectPath = project.repoPath
      ? path.resolve(project.repoPath)
      : path.join(process.cwd(), 'projects', projectId);

    await fs.mkdir(projectPath, { recursive: true });

  const pendingLogs: string[] = [];
  const queueLog = (message: string) => {
    const formatted = `[PreviewManager] ${message}`;
    console.log(formatted);
    pendingLogs.push(formatted);
  };

    await ensureProjectRootStructure(projectPath, queueLog);

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

    const previewBounds = resolvePreviewBounds();
    const preferredPort = await findAvailablePort(
      previewBounds.start,
      previewBounds.end
    );
    queueLog(`[PreviewManager] Planned Working Directory: ${projectPath}`);
    queueLog(`[PreviewManager] Planned Command: ${npmCommand} run dev -- --port ${preferredPort}`);
    queueLog(`[PreviewManager] Parent NODE_ENV: ${String(process.env.NODE_ENV ?? '')}`);

    const initialUrl = `http://localhost:${preferredPort}`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(preferredPort),
      WEB_PORT: String(preferredPort),
      NEXT_PUBLIC_APP_URL: initialUrl,
      NODE_ENV: 'development',
    };
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
    }
    passthrough.push(arg);
  }
  return { preferredPort, passthrough };
}
function resolvePort(preferredPort) {
  const candidates = [preferredPort, process.env.PORT, process.env.WEB_PORT, process.env.PREVIEW_PORT_START, 3100];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const numeric = typeof candidate === 'number' ? candidate : Number.parseInt(String(candidate), 10);
    if (!Number.isNaN(numeric) && numeric > 0 && numeric <= 65535) return numeric;
  }
  return 3100;
}
(async () => {
  const argv = process.argv.slice(2);
  const { preferredPort, passthrough } = parseCliArgs(argv);
  const port = resolvePort(preferredPort);
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
    };

    const log = this.getLogger(previewProcess, projectId);
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
      // If node_modules exists, skip
      if (await directoryExists(path.join(projectPath, 'node_modules'))) {
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
          // Double-check just before install
          if (!(await directoryExists(path.join(projectPath, 'node_modules')))) {
            await runInstallWithPreferredManager(projectPath, env, log);
          }
        } finally {
          this.installing.delete(projectId);
        }
      })();
      this.installing.set(projectId, installPromise);
      await installPromise;
    };

    await ensureWithLock();

    const packageJson = await readPackageJson(projectPath);
    const hasPredev = Boolean(packageJson?.scripts?.predev);

    if (hasPredev) {
      await appendCommandLogs(npmCommand, ['run', 'predev'], projectPath, env, log);
    }

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

    // Log working directory and command for debugging
    log(Buffer.from(`[PreviewManager] ========================================`));
    log(Buffer.from(`[PreviewManager] Working Directory: ${projectPath}`));
    log(Buffer.from(`[PreviewManager] Command: ${npmCommand} run dev -- --port ${effectivePort}`));
    log(Buffer.from(`[PreviewManager] ========================================`));

    const child = spawn(
      npmCommand,
      ['run', 'dev', '--', '--port', String(effectivePort)],
      {
        cwd: projectPath,
        env,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    previewProcess.process = child;
    this.processes.set(projectId, previewProcess);

    const logStderr = this.getLogger(previewProcess, projectId, 'stderr');

    child.stdout?.on('data', (chunk) => {
      log(chunk);
      if (previewProcess.status === 'starting') {
        previewProcess.status = 'running';
        // Publish preview running status
        const { streamManager } = require('./stream');
        streamManager.publish(projectId, {
          type: 'status',
          data: {
            status: 'preview_running',
            message: `Preview server running at ${previewProcess.url}`,
            metadata: { url: previewProcess.url, port: previewProcess.port },
          },
        });
      }
    });

    child.stderr?.on('data', (chunk) => {
      logStderr(chunk);
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
      updateProjectStatus(projectId, 'idle').catch((error) => {
        console.error('[PreviewManager] Failed to reset project status:', error);
      });
      log(
        Buffer.from(
          `Preview process exited (code: ${code ?? 'null'}, signal: ${
            signal ?? 'null'
          })`
        )
      );

      // Publish preview stopped/error status
      const { streamManager } = require('./stream');
      streamManager.publish(projectId, {
        type: 'status',
        data: {
          status: code === 0 ? 'preview_stopped' : 'preview_error',
          message: code === 0 ? 'Preview server stopped' : `Preview server error (exit code: ${code})`,
          metadata: { exitCode: code, signal },
        },
      });
    });

    child.on('error', (error) => {
      previewProcess.status = 'error';
      log(Buffer.from(`Preview process failed: ${error.message}`));
    });

    await waitForPreviewReady(previewProcess.url, log).catch(() => {
      // wait function already logged; ignore errors
    });

    await updateProject(projectId, {
      previewUrl: previewProcess.url,
      previewPort: previewProcess.port,
      status: 'running',
    });

    return this.toInfo(previewProcess);
  }

  public async stop(projectId: string): Promise<PreviewInfo> {
    const processInfo = this.processes.get(projectId);
    if (!processInfo) {
      const project = await getProjectById(projectId);
      if (project) {
        await updateProject(projectId, {
          previewUrl: null,
          previewPort: null,
        });
        await updateProjectStatus(projectId, 'idle');
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
        } catch (killError) {
          console.error('[PreviewManager] Failed to force kill process:', killError);
        }
      }
    }

    // Clean up .next directory
    const project = await getProjectById(projectId);
    if (project) {
      const projectPath = project.repoPath
        ? path.resolve(project.repoPath)
        : path.join(process.cwd(), 'projects', projectId);
      const nextDir = path.join(projectPath, '.next');

      // Clean .next directory asynchronously (don't wait)
      fs.rm(nextDir, { recursive: true, force: true })
        .then(() => console.log('[PreviewManager] Cleaned .next directory'))
        .catch((error) => console.error('[PreviewManager] Failed to clean .next directory:', error));
    }

    this.processes.delete(projectId);
    await updateProject(projectId, {
      previewUrl: null,
      previewPort: null,
    });
    await updateProjectStatus(projectId, 'idle');

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
    };
  }
}

const globalPreviewManager = globalThis as unknown as {
  __claudable_preview_manager__?: PreviewManager;
};

export const previewManager: PreviewManager =
  globalPreviewManager.__claudable_preview_manager__ ??
  (globalPreviewManager.__claudable_preview_manager__ = new PreviewManager());
