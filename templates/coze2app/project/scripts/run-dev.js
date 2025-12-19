#!/usr/bin/env node
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
    } else if (/^d+$/.test(arg)) {
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
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    try {
      srv.listen(port, '127.0.0.1');
    } catch {
      resolve(false);
    }
  });
}
async function resolvePort(preferredPort) {
  const candidates = [preferredPort, process.env.PORT, process.env.WEB_PORT, process.env.PREVIEW_PORT_START, 3100];
  let start = 3100;
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
  const url = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
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
