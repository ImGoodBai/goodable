import fs from 'fs/promises';
import path from 'path';
import { timelineLogger } from '@/lib/services/timeline';

async function writeFileIfMissing(filePath: string, contents: string, projectId?: string) {
  try {
    await fs.access(filePath);
    if (projectId) {
      try {
        await timelineLogger.append({
          type: 'system',
          level: 'info',
          message: `File exists: ${filePath}`,
          projectId,
          component: 'artifact',
          event: 'artifact.exists',
          metadata: { path: filePath }
        });
      } catch {}
    }
    return;
  } catch {
    // continue
  }
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
  if (projectId) {
    try {
      const stats = await fs.stat(filePath);
      await timelineLogger.append({
        type: 'system',
        level: 'info',
        message: `Created file: ${filePath}`,
        projectId,
        component: 'artifact',
        event: 'artifact.create',
        metadata: { path: filePath, size: stats.size }
      });
    } catch {}
  }
}

export async function scaffoldBasicNextApp(
  projectPath: string,
  projectId: string
) {
  await fs.mkdir(projectPath, { recursive: true });
  try {
    await timelineLogger.append({
      type: 'system',
      level: 'info',
      message: 'Scaffold project',
      projectId,
      component: 'artifact',
      event: 'artifact.scaffold',
      metadata: { projectPath }
    });
  } catch {}

  const packageJson = {
    name: projectId,
    private: true,
    version: '0.1.0',
    scripts: {
      dev: 'node scripts/run-dev.js',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
      'type-check': 'tsc --noEmit',
    },
    dependencies: {
      next: '15.1.0',
      react: '19.0.0',
      'react-dom': '19.0.0',
    },
    devDependencies: {
      typescript: '^5.7.2',
      '@types/react': '^19.0.0',
      '@types/node': '^22.10.0',
      eslint: '^9.17.0',
      'eslint-config-next': '15.1.0',
      tailwindcss: '^3.4.1',
      postcss: '^8.4.35',
      autoprefixer: '^10.4.17',
    },
  };

  await writeFileIfMissing(
    path.join(projectPath, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    projectId
  );

  await writeFileIfMissing(
    path.join(projectPath, 'next.config.js'),
    `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
`,
    projectId
  );

  await writeFileIfMissing(
    path.join(projectPath, 'tsconfig.json'),
    `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`,
    projectId
  );

  await writeFileIfMissing(
    path.join(projectPath, 'next-env.d.ts'),
    `/// <reference types="next" />
/// <reference types="next/navigation-types/navigation" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.
`,
    projectId
  );

  await writeFileIfMissing(
    path.join(projectPath, 'app/layout.tsx'),
    `import type { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    projectId
  );

  await writeFileIfMissing(
    path.join(projectPath, 'app/page.tsx'),
    `export default function Home() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: '20px 1fr 20px',
      alignItems: 'center',
      justifyItems: 'center',
      minHeight: '100vh',
      padding: '80px',
      gap: '64px',
      fontFamily: 'var(--font-geist-sans)',
    }}>
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        gridRow: 2,
        alignItems: 'center',
      }}>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          Get started by editing
        </h1>
        <code style={{
          fontFamily: 'monospace',
          fontSize: '1rem',
          padding: '12px 20px',
          background: 'rgba(0, 0, 0, 0.05)',
          borderRadius: '8px',
        }}>
          app/page.tsx
        </code>
      </main>
      <footer style={{
        gridRow: 3,
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <a
          href="https://nextjs.org/learn"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Learn →
        </a>
        <a
          href="https://vercel.com/templates"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Examples →
        </a>
        <a
          href="https://nextjs.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Next.js →
        </a>
      </footer>
    </div>
  );
}
`,
    projectId
  );

  await writeFileIfMissing(
    path.join(projectPath, 'app/globals.css'),
    `:root {
  color-scheme: light;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}
`,
    projectId
  );

  await writeFileIfMissing(
    path.join(projectPath, 'scripts/run-dev.js'),
    `#!/usr/bin/env node
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
    `,
    projectId
  );

  // Prisma schema template
  await writeFileIfMissing(
    path.join(projectPath, 'prisma/schema.prisma'),
    `// This is your Prisma schema file
// Learn more: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Example model - modify or delete as needed
// Uncomment and customize for your application

// model User {
//   id        String   @id @default(cuid())
//   email     String   @unique
//   name      String?
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
// }
`,
    projectId
  );

  // .env.example template
  await writeFileIfMissing(
    path.join(projectPath, '.env.example'),
    `# Database
DATABASE_URL="file:./sub_dev.db"

# App URL (auto-configured by platform)
NEXT_PUBLIC_APP_URL="http://localhost:3100"
`,
    projectId
  );

  // .gitignore
  await writeFileIfMissing(
    path.join(projectPath, '.gitignore'),
    `# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# prisma
*.db
*.db-journal
/prisma/migrations/
`,
    projectId
  );
}

/**
 * 生成FastAPI项目脚手架
 */
export async function scaffoldBasicFastAPIApp(
  projectPath: string,
  projectId: string
) {
  await fs.mkdir(projectPath, { recursive: true });
  try {
    await timelineLogger.append({
      type: 'system',
      level: 'info',
      message: 'Scaffold Python FastAPI project',
      projectId,
      component: 'artifact',
      event: 'artifact.scaffold',
      metadata: { projectPath },
    });
  } catch {}

  // 创建app目录
  await fs.mkdir(path.join(projectPath, 'app'), { recursive: true });

  // requirements.txt
  const requirements = `fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
aiosqlite==0.19.0
`;
  await writeFileIfMissing(
    path.join(projectPath, 'requirements.txt'),
    requirements,
    projectId
  );

  // app/main.py
  const mainPy = `from fastapi import FastAPI

app = FastAPI(
    title="Generated Project",
    description="Auto-generated FastAPI project",
    version="1.0.0"
)

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok"}

@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "Welcome to the API",
        "docs": "/docs",
        "health": "/health"
    }
`;
  await writeFileIfMissing(path.join(projectPath, 'app', 'main.py'), mainPy, projectId);

  // app/__init__.py
  await writeFileIfMissing(path.join(projectPath, 'app', '__init__.py'), '', projectId);

  // .env.example
  const envExample = `# Database
DATABASE_URL=sqlite:///./python_dev.db

# Application
DEBUG=True
`;
  await writeFileIfMissing(path.join(projectPath, '.env.example'), envExample, projectId);

  // .gitignore
  const gitignore = `# Python
.venv/
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.so

# Database
*.db
*.sqlite
*.sqlite3

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;
  await writeFileIfMissing(path.join(projectPath, '.gitignore'), gitignore, projectId);

  // README.md
  const readme = `# ${projectId}

FastAPI 项目

## 功能

- ✅ RESTful API
- ✅ 自动生成 API 文档（/docs）
- ✅ SQLite 数据库
- ✅ 健康检查端点（/health）

## API 文档

启动项目后访问 \`/docs\` 查看交互式 API 文档（Swagger UI）

## 项目结构

\`\`\`
app/
  main.py          # 应用入口
requirements.txt   # Python 依赖
.env.example       # 环境变量模板
\`\`\`
`;
  await writeFileIfMissing(path.join(projectPath, 'README.md'), readme, projectId);
}
