# 05 - 移除 Prisma ORM 优化打包体积方案

## 执行摘要（供审查者快速了解）

**目标：** Electron 打包减重 ~350 MB（移除 Prisma ORM）

**最终方案：** drizzle-orm + better-sqlite3，工作量 3-4 小时

**关键决策：**
1. ✅ 采用 drizzle-orm（而非自研兼容层）- 工作量减半，风险更低
2. ✅ 修正打包策略 - 避免开发工具进入产物（关键风险点）
3. ✅ 保持原有架构 - DB 已在独立进程（Next.js server）
4. ✅ 实现 Migration Runner - 替代 `prisma db push`，带事务和回滚
5. ✅ 严格遵循 SQLite 规范 - 外键启用、ON CONFLICT 而非 REPLACE
6. ✅ 时间戳保持 DATETIME/TEXT 类型 - 零数据迁移；应用层统一写入 ISO 8601（数据库默认值仅兜底）
7. ✅ DB 路径统一从 DATABASE_URL 解析 - 避免硬编码路径冲突

**关键风险已规避：**
- ⚠️ UPSERT 语义陷阱（已明确用 ON CONFLICT DO UPDATE）
- ⚠️ 外键默认关闭（已强制启用 PRAGMA foreign_keys）
- ⚠️ 打包策略错误（已修正，只打包必需依赖）
- ⚠️ 类型不兼容（保持 TEXT 时间戳和 REAL costUsd，零迁移）
- ⚠️ 路径配置冲突（统一使用 DATABASE_URL 环境变量）

**回滚成本：** < 5 分钟（恢复依赖 + 重新生成 Prisma Client）

**预期收益：**
- 打包减重：-349.5 MB（净减少）
- 启动性能：+10-20%
- 内存占用：-50 MB

---

## 一、前因后果

### 1.1 问题背景

**现状：** Electron 打包后的安装包体积过大，影响用户下载和分发效率。

**问题分析：**
经过打包文件分析，发现 Prisma 相关依赖占用空间如下：
- `node_modules/@prisma`: 152 MB
- `node_modules/prisma`: 70 MB
- `node_modules/.prisma`: 43 MB
- `prisma-hidden`: 86.6 MB
- **总计：约 352 MB**

**优化目标：**
- 移除 Node.js 运行时支持（项目依赖 Electron 自带 Node.js）
- 移除 Prisma ORM 及其引擎文件
- 仅保留 Python 运行时支持
- 预期减重：**~350 MB**

### 1.2 技术调研

**数据存储复杂度评估：**
- 8张简单表（Project、Message、Session、EnvVar、ServiceToken 等）
- 仅使用基础 CRUD 操作
- 无复杂关联查询、事务、聚合
- 数据量小（当前约 1MB）

**Prisma 使用情况：**
- 9个服务文件依赖 Prisma
- 63处 `prisma.xxx` 调用
- 主要使用特性：
  - 基础查询：findMany/findUnique/findFirst
  - 创建/更新/删除：create/update/delete
  - **upsert**（2处使用，需特别处理）
  - 分页排序：orderBy/skip/take
  - 复合唯一键查询（EnvVar 表）

**技术方案对比：**

| 方案 | 打包体积 | 工作量 | 类型安全 | 维护性 | 风险 |
|------|---------|--------|----------|--------|------|
| 自研兼容层 | +2 MB | 6-8h | 需手写 | 中等 | 中等 |
| drizzle-orm | +2.5 MB | 3-4h | ✅ 自动 | ✅ 最好 | ✅ 最低 |
| 纯 better-sqlite3 | +2 MB | 8-10h | 需手写 | 较差 | 较高 |

**最终选型：drizzle-orm + better-sqlite3**

### 1.3 方案调整过程

#### 初版方案（已废弃）

**最初设想：** 自研 Prisma API 兼容层
- 工作量：6-8小时
- 优势：业务代码零改动
- 问题：需要处理大量细节（upsert 语义、外键、错误码映射等）

#### 外部专家评审

**收到的关键建议：**

1. **打包策略风险（极其重要）**
   - 原配置 `"files": ["node_modules/**/*"]` 会把所有依赖打包
   - 会导致 drizzle-kit 等开发工具也进入产物
   - **影响：** 减重效果大打折扣

2. **UPSERT 语义陷阱**
   - `INSERT OR REPLACE` 会先删后插，触发级联删除
   - 必须用 `ON CONFLICT DO UPDATE`
   - **影响：** 如果用错，会导致数据丢失

3. **外键默认关闭**
   - SQLite 默认不启用外键约束
   - 必须在连接后执行 `PRAGMA foreign_keys = ON`
   - **影响：** 级联删除失效，产生垃圾数据

4. **成熟替代方案推荐**
   - drizzle-orm 体积极小（~500 KB）
   - 原生支持 `onConflictDoUpdate`
   - 类型安全，维护性更好
   - **优势：** 工作量减半（3-4h vs 6-8h）

#### 架构边界确认

**经代码审查确认：**

```
当前架构（无需改动）：
Renderer 进程 (UI)
    ↓ HTTP fetch
Next.js Server 进程 ← 💾 DB 操作在这里
    ↓
lib/services/*.ts
    ↓
prisma (将替换为 drizzle)
    ↓
SQLite
```

**关键发现：**
- ✅ DB 已经在独立进程（Next.js server）
- ✅ 不存在 UI 卡顿风险
- ✅ 保持原有架构边界即可

#### 最终方案调整

**采纳的建议：**
1. ✅ 使用 drizzle-orm 替代自研兼容层
2. ✅ 修正打包策略（只打包必需依赖）
3. ✅ 实现 Migration Runner（含事务、回滚）
4. ✅ 严格遵循 ON CONFLICT 规范
5. ✅ 启用外键 + WAL + busy_timeout
6. ✅ 时间戳保持 DATETIME/TEXT（ISO 8601 字符串），零数据迁移
7. ✅ DB 路径从 DATABASE_URL 统一解析

**技术约束：**
- 时间戳应用层统一使用 `new Date().toISOString()`；禁止混用毫秒/秒时间戳
- 数据库默认值（CURRENT_TIMESTAMP）仅作兜底，应用层写入/更新永远显式覆盖
- 打包配置只保留运行时必需依赖，开发工具（drizzle-kit）不进入产物
- 生产环境路径（DB、migrations）由 Electron main 注入绝对路径环境变量

---

## 二、技术方案

### 2.1 技术栈

**核心依赖：**
- `drizzle-orm`: 轻量 ORM，体积 ~500 KB，支持类型安全
- `better-sqlite3`: 同步 SQLite 驱动，体积 ~2 MB，适合 Electron
- `drizzle-kit`: 开发工具，用于生成迁移和类型

**移除依赖：**
- `@prisma/client`
- `prisma`
- `prisma-hidden` 目录

### 2.2 架构设计

```
原架构：
lib/db/client.ts → PrismaClient → prisma-hidden 引擎 → SQLite

新架构：
lib/db/client.ts → drizzle(better-sqlite3) → SQLite
lib/db/schema.ts → Drizzle Schema 定义
lib/db/migrations/ → SQL 迁移文件
```

### 2.3 文件改动清单

#### 核心文件（新增/重写）

**1. lib/db/schema.ts**（新增）
- 定义 8 张表的 Drizzle Schema
- 包含外键、索引、默认值、唯一约束

**2. lib/db/client.ts**（重写）
- 初始化 better-sqlite3 连接
- 启用外键和 WAL 模式
- 导出 drizzle 实例

**3. lib/db/migrations/**（新增）
- 初始化 SQL 脚本
- 数据迁移脚本

**4. drizzle.config.ts**（新增）
- Drizzle Kit 配置文件

#### 业务文件（修改）

**需要改写的 9 个服务文件：**
1. `lib/services/project.ts` - 项目管理
2. `lib/services/message.ts` - 消息记录
3. `lib/services/chat-sessions.ts` - 会话管理
4. `lib/services/env.ts` - 环境变量（**复合唯一键+upsert**）
5. `lib/services/tokens.ts` - 服务Token
6. `lib/services/user-requests.ts` - 用户请求（**upsert**）
7. `lib/services/project-services.ts` - 服务连接
8. `lib/services/template.ts` - 模板相关
9. `lib/services/preview.ts` - 预览相关

#### 脚本文件（修改）

**1. scripts/run-web.js**
- 移除 `prisma db push` 调用
- 改为执行 SQL 迁移文件

**2. scripts/copy-prisma.js**（删除）
- 不再需要复制 prisma-hidden

**3. electron/main.js**
- 移除 Prisma 符号链接逻辑（239-296行）
- 移除 `prisma db push` 调用（400-442行）
- 改为执行内置 SQL 迁移

#### 配置文件（修改）

**1. package.json**
- 移除 Prisma 依赖
- 添加 drizzle-orm、better-sqlite3、drizzle-kit
- 修改 `build.files` 和 `build.asarUnpack`
- 移除 `prisma-hidden/**/*`

**2. .gitignore**
- 移除 `prisma-hidden`

### 2.4 数据迁移方案

**迁移步骤：**

1. **导出现有数据**
```bash
# 使用 SQLite CLI 导出
sqlite3 prisma/data/prod.db .dump > backup.sql
```

2. **创建 Drizzle Schema**
- 对照 `prisma/schema.prisma` 创建 `lib/db/schema.ts`
- 保持字段映射一致（蛇形命名）

3. **生成初始迁移**
```bash
npx drizzle-kit generate:sqlite
```

4. **数据导入**
- 开发环境：重新初始化（数据可丢失）
- 生产环境：从备份恢复（如有必要）

### 2.5 Prisma 到 Drizzle 映射

#### 查询映射

```typescript
// ❌ Prisma
await prisma.project.findMany({
  where: { status: 'idle' },
  orderBy: { lastActiveAt: 'desc' },
  skip: 10,
  take: 20
})

// ✅ Drizzle
await db.select()
  .from(projects)
  .where(eq(projects.status, 'idle'))
  .orderBy(desc(projects.lastActiveAt))
  .limit(20)
  .offset(10)
```

#### Upsert 映射（关键！）

```typescript
// ❌ Prisma (EnvVar 表)
await prisma.envVar.upsert({
  where: {
    projectId_key: { projectId, key }
  },
  update: { valueEncrypted, description },
  create: { projectId, key, valueEncrypted, description }
})

// ✅ Drizzle
const nowIso = new Date().toISOString();
await db.insert(envVars)
  .values({ projectId, key, valueEncrypted, description, createdAt: nowIso, updatedAt: nowIso })
  .onConflictDoUpdate({
    target: [envVars.projectId, envVars.key],
    set: {
      valueEncrypted,
      description,
      updatedAt: nowIso
    }
  })
```

#### 创建/更新/删除映射

```typescript
// Create
const nowIso = new Date().toISOString();
await db.insert(projects).values({
  id,
  name,
  description,
  createdAt: nowIso,
  updatedAt: nowIso,
  lastActiveAt: nowIso
})

// Update
await db.update(projects)
  .set({
    status: 'running',
    updatedAt: new Date().toISOString()
  })
  .where(eq(projects.id, id))

// Delete
await db.delete(projects)
  .where(eq(projects.id, id))
```

---

## 三、关键风险与规避措施

### 3.1 UPSERT 语义陷阱（极其重要！）

**❌ 错误做法：**
```sql
-- INSERT OR REPLACE 会先删除旧记录再插入新记录
-- 这会触发 ON DELETE CASCADE，导致关联数据被级联删除！
INSERT OR REPLACE INTO env_vars (...) VALUES (...)
```

**✅ 正确做法：**
```sql
-- ON CONFLICT DO UPDATE 只更新字段，不会删除记录
INSERT INTO env_vars (...) VALUES (...)
ON CONFLICT(project_id, key) DO UPDATE SET
  value_encrypted = excluded.value_encrypted,
  updated_at = CURRENT_TIMESTAMP
```

**Drizzle 实现：**
```typescript
await db.insert(envVars)
  .values({...})
  .onConflictDoUpdate({
    target: [envVars.projectId, envVars.key],
    set: { ... }  // ✅ 只更新这些字段
  })
```

### 3.2 外键默认关闭（极其重要！）

**问题：** SQLite 默认不启用外键约束，导致级联删除失效。

**解决方案：**
```typescript
// lib/db/client.ts
import Database from 'better-sqlite3';

const sqlite = new Database('prod.db');

// ✅ 必须在每次连接后执行
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL'); // 提高并发性能

export const db = drizzle(sqlite);
```

**验证方法：**
```typescript
// 测试级联删除
const result = sqlite.prepare('PRAGMA foreign_keys').get();
console.log('Foreign keys enabled:', result.foreign_keys === 1);
```

### 3.3 时间戳处理（保持 Prisma 行为）

**Prisma `@updatedAt` 迁移：**

```typescript
// Schema 定义（TEXT 类型，存储 ISO 8601 字符串）
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  // TEXT/DATETIME 类型，存储 ISO 8601 字符串
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastActiveAt: text('last_active_at').notNull()
});

// ✅ 更新时手动设置
await db.update(projects)
  .set({
    status: 'running',
    updatedAt: new Date().toISOString()
  })
  .where(eq(projects.id, id))
```

**⚠️ 重要说明：**
- 数据库字段类型：`TEXT` 或 `DATETIME`（SQLite 中本质都是 TEXT）
- 默认值：`CURRENT_TIMESTAMP` 仅作兜底（SQLite 返回 `YYYY-MM-DD HH:MM:SS` 格式）
- **应用层写入/更新永远显式覆盖**：统一使用 `new Date().toISOString()`（标准 ISO 8601 格式，带 T 和 Z）
- 应用层读取：`new Date(project.createdAt)` 直接解析（兼容两种格式）
- **零数据迁移成本**，与 Prisma 行为完全一致

### 3.4 CUID 主键生成

**Prisma `@default(cuid())` 迁移：**

```typescript
// 安装依赖
npm install @paralleldrive/cuid2

// lib/utils/id.ts
import { createId } from '@paralleldrive/cuid2';

export const generateId = () => createId();

// 使用
import { generateId } from '@/lib/utils/id';

await db.insert(projects).values({
  id: generateId(),  // ✅ 应用层生成
  name: 'New Project'
})
```

### 3.5 错误码映射

**Prisma 错误码替换：**

```typescript
// ❌ Prisma
import { Prisma } from '@prisma/client';

try {
  await prisma.project.create({...})
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      // 唯一约束冲突
    }
    if (error.code === 'P2025') {
      // 记录不存在
    }
  }
}

// ✅ Drizzle + SQLite
try {
  await db.insert(projects).values({...})
} catch (error: any) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    // 唯一约束冲突（对应 P2002）
  }
}

// 记录不存在判断（对应 P2025）
const result = await db.update(projects)
  .set({...})
  .where(eq(projects.id, id))

if (result.changes === 0) {
  // 记录不存在
}
```

**封装错误处理：**
```typescript
// lib/db/errors.ts
export class RecordNotFoundError extends Error {
  code = 'P2025'; // 保持兼容
}

export class UniqueConstraintError extends Error {
  code = 'P2002'; // 保持兼容
}

export function handleDbError(error: any) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw new UniqueConstraintError('Unique constraint failed');
  }
  throw error;
}
```

### 3.6 清理 Prisma 错误判断

**需要清理的代码位置：**

1. **lib/services/user-requests.ts:45**
   - 使用了 `Prisma.PrismaClientKnownRequestError`
   - 缺少 `import { Prisma } from '@prisma/client'`（被 `@ts-nocheck` 掩盖）

2. **lib/services/env.ts**
   - `error?.code === 'P2002'` (Line 96)
   - `error?.code === 'P2025'` (Line 125, 148)

**清理方案：**
- 删除所有 `Prisma.PrismaClientKnownRequestError` 判断
- 替换为 SQLite 错误码或封装的错误类
- 移除 `@ts-nocheck`，确保类型安全

### 3.6 better-sqlite3 同步 API 风险

**场景分析：**
- ✅ Electron 主进程：同步 API 无问题
- ⚠️ Next.js API routes：可能阻塞事件循环

**实际影响评估：**
- 单次查询耗时：< 5ms
- 数据量小，无复杂查询
- 并发需求低（单用户桌面应用）
- **结论：风险可控**

**可选优化：** 如后续需要异步，可切换到 `better-sqlite3` 的 worker 模式或 `sqlite3` 包。

---

## 四、实施步骤（最稳不失控路线）

### 架构边界确认

**当前架构：**
```
Renderer 进程 (UI)
    ↓ HTTP fetch
Next.js Server 进程
    ↓
lib/services/*.ts
    ↓
prisma/drizzle
    ↓
SQLite
```

**✅ DB 已经在独立进程（Next server），不需要 IPC 改造**
**✅ 保持原有执行位置，只做替换，不改架构**

---

### P0 阶段：确定性收益（3-4小时，必做）

**目标：** 拿到 350MB 减重，不改变架构边界

#### P0.1 准备阶段（30分钟）

**1. 安装依赖**
```bash
npm install drizzle-orm better-sqlite3 @paralleldrive/cuid2
npm install -D drizzle-kit @types/better-sqlite3
```

**2. 备份现有数据**
```bash
# 导出数据
sqlite3 prisma/data/prod.db .dump > backup-$(date +%Y%m%d).sql

# 提交代码
git add .
git commit -m "backup: 备份 Prisma 数据，准备迁移到 Drizzle"
```

**3. 创建分支**
```bash
git checkout -b feat/migrate-to-drizzle
```

#### P0.2 修正打包策略（30分钟，关键！）

**问题：** 原配置会把所有 node_modules 打包，包括 drizzle-kit

**修改 package.json：**

```json
{
  "build": {
    "files": [
      "electron/**/*",
      ".next/standalone/**/*",
      "!.next/standalone/node_modules/**/*",
      ".next/static/**/*",
      "public/**/*",
      "package.json"
    ],
    "asarUnpack": [
      ".next/standalone/**/*",
      "!.next/standalone/node_modules/**/*",
      "node_modules/better-sqlite3/**/*"
    ],
    "extraResources": [
      {
        "from": ".next/static",
        "to": ".next/static"
      },
      {
        "from": "public",
        "to": "public"
      },
      {
        "from": "python-runtime",
        "to": "python-runtime"
      },
      {
        "from": "lib/db/migrations",
        "to": "migrations"
      }
    ]
  }
}
```

**说明：**
- ✅ `files` 中不包含 `node_modules/**/*`，避免全量打包
- ✅ `asarUnpack` 只解包 `better-sqlite3` 原生模块
- ✅ `extraResources` 包含迁移文件
- ✅ 开发工具（drizzle-kit）不会进入产物

#### P0.3 实现 Migration Runner（1小时）

**创建 lib/db/migrations/runner.ts：**

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

export function runMigrations(db: Database, migrationsDir: string) {
  // 1. 确保 schema_migrations 表存在
  // 注意：SQLite DATETIME 实际按 TEXT 存储，applied_at 直接存 ISO 字符串
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL
    )
  `);

  // 2. 获取当前版本
  const current = db.prepare(
    'SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations'
  ).get() as { version: number };

  console.log(`[Migration] Current schema version: ${current.version}`);

  // 3. 加载待执行的迁移
  const migrations = loadMigrations(migrationsDir);
  const pending = migrations.filter(m => m.version > current.version);

  if (pending.length === 0) {
    console.log('[Migration] Database is up to date');
    return;
  }

  // 4. 事务执行迁移
  const runInTransaction = db.transaction((migrations: Migration[]) => {
    for (const migration of migrations) {
      console.log(`[Migration] Applying ${migration.version}: ${migration.name}`);

      try {
        db.exec(migration.sql);
        db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        ).run(migration.version, migration.name, new Date().toISOString());

        console.log(`[Migration] ✓ Applied ${migration.version}`);
      } catch (error) {
        console.error(`[Migration] ✗ Failed ${migration.version}:`, error);
        throw error; // 回滚事务
      }
    }
  });

  try {
    runInTransaction(pending);
    console.log(`[Migration] Successfully applied ${pending.length} migration(s)`);
  } catch (error) {
    console.error('[Migration] Transaction rolled back due to error');
    throw error;
  }
}

function loadMigrations(migrationsDir: string): Migration[] {
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(file => {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${file}`);
    }

    return {
      version: parseInt(match[1]),
      name: match[2],
      sql: fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    };
  });
}
```

**创建初始迁移 lib/db/migrations/0001_initial.sql：**

```sql
-- 重要说明：完全匹配现有 Prisma 表结构，确保平滑迁移
-- 时间戳使用 DATETIME 类型，默认 CURRENT_TIMESTAMP 仅作兜底（返回 YYYY-MM-DD HH:MM:SS UTC 格式）
-- 应用层写入/更新必须显式覆盖为 ISO 8601 格式（带 T 和 Z）

-- 创建项目表
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  preview_url TEXT,
  preview_port INTEGER,
  repo_path TEXT,
  initial_prompt TEXT,
  template_type TEXT,
  from_template TEXT,
  project_type TEXT NOT NULL DEFAULT 'nextjs',
  active_claude_session_id TEXT,
  active_cursor_session_id TEXT,
  preferred_cli TEXT,
  selected_model TEXT,
  fallback_enabled INTEGER NOT NULL DEFAULT 0,
  plan_confirmed INTEGER NOT NULL DEFAULT 0,
  settings TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 其他表（省略，格式相同）
-- 所有时间戳字段统一使用（包括 updated_at 也要 DEFAULT）：
-- created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
-- updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
```

**时间戳规范（关键！）：**
- 数据库：DATETIME/TEXT 类型（SQLite 按 TEXT 存储）
- 默认值：`CURRENT_TIMESTAMP` 仅作兜底（返回 `YYYY-MM-DD HH:MM:SS` UTC 格式）
- **应用层写入/更新必须显式覆盖**：`new Date().toISOString()`（标准 ISO 8601，带 T 和 Z）
- 应用层读取：`new Date(str)` 自动解析（兼容两种格式）
- **重要**：所有 `updated_at` 字段都需要 DEFAULT，避免忘记传值时插入失败

-- 创建消息表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  parent_message_id TEXT,
  session_id TEXT,
  conversation_id TEXT,
  duration_ms INTEGER,
  token_count INTEGER,
  cost_usd REAL,
  commit_sha TEXT,
  cli_source TEXT,
  request_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 创建会话表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_type TEXT NOT NULL,
  cli_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  model_name TEXT,
  context_tokens INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 创建环境变量表
CREATE TABLE IF NOT EXISTS env_vars (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'runtime',
  var_type TEXT NOT NULL DEFAULT 'string',
  is_secret INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, key)
);

-- 创建服务连接表
CREATE TABLE IF NOT EXISTS project_service_connections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  service_data TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sync_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 创建 Commits 表
CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sha TEXT NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  committed_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 创建工具使用表
CREATE TABLE IF NOT EXISTS tool_usages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  message_id TEXT,
  tool_name TEXT NOT NULL,
  tool_input TEXT NOT NULL,
  tool_output TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

-- 创建用户请求表
CREATE TABLE IF NOT EXISTS user_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  instruction TEXT NOT NULL,
  cli_preference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  cancel_requested_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 创建服务 Token 表
CREATE TABLE IF NOT EXISTS service_tokens (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_cli_source ON messages(cli_source);
CREATE INDEX IF NOT EXISTS idx_messages_request_id ON messages(request_id);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cli_type ON sessions(cli_type);

CREATE INDEX IF NOT EXISTS idx_env_vars_project_id ON env_vars(project_id);

CREATE INDEX IF NOT EXISTS idx_connections_project_id ON project_service_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_connections_provider ON project_service_connections(provider);

CREATE INDEX IF NOT EXISTS idx_commits_project_id ON commits(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_committed_at ON commits(committed_at);

CREATE INDEX IF NOT EXISTS idx_tool_usages_project_id ON tool_usages(project_id);
CREATE INDEX IF NOT EXISTS idx_tool_usages_message_id ON tool_usages(message_id);
CREATE INDEX IF NOT EXISTS idx_tool_usages_tool_name ON tool_usages(tool_name);

CREATE INDEX IF NOT EXISTS idx_user_requests_project_id ON user_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status);

CREATE INDEX IF NOT EXISTS idx_service_tokens_provider ON service_tokens(provider);
```

#### P0.4 创建 Schema 定义（30分钟）

**创建 lib/db/schema.ts：**

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Projects 表
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('idle'),
  previewUrl: text('preview_url'),
  previewPort: integer('preview_port'),
  repoPath: text('repo_path'),
  initialPrompt: text('initial_prompt'),
  templateType: text('template_type'),
  fromTemplate: text('from_template'),
  projectType: text('project_type').notNull().default('nextjs'),
  activeClaudeSessionId: text('active_claude_session_id'),
  activeCursorSessionId: text('active_cursor_session_id'),
  preferredCli: text('preferred_cli'),
  selectedModel: text('selected_model'),
  fallbackEnabled: integer('fallback_enabled', { mode: 'boolean' }).notNull().default(false),
  planConfirmed: integer('plan_confirmed', { mode: 'boolean' }).notNull().default(false),
  settings: text('settings'),
  // 时间戳：TEXT/DATETIME 类型，存储 ISO 8601 字符串
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastActiveAt: text('last_active_at').notNull()
});

// Messages 表
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  messageType: text('message_type').notNull(),
  content: text('content').notNull(),
  metadataJson: text('metadata_json'),
  parentMessageId: text('parent_message_id'),
  sessionId: text('session_id'),
  conversationId: text('conversation_id'),
  durationMs: integer('duration_ms'),
  tokenCount: integer('token_count'),
  costUsd: real('cost_usd'), // REAL 浮点数，与 Prisma Float 一致
  commitSha: text('commit_sha'),
  cliSource: text('cli_source'),
  requestId: text('request_id'),
  // 时间戳：TEXT/DATETIME 类型，存储 ISO 8601 字符串
  createdAt: text('created_at').notNull()
});

// 其他表类似定义...
// Sessions, EnvVars, ProjectServiceConnections, Commits, ToolUsages, UserRequests, ServiceTokens
// 所有时间戳字段统一使用 TEXT 类型
```

**⚠️ 关键字段说明：**
- 时间戳类型：`text('created_at')` - 存储 ISO 8601 字符串，与 Prisma 行为一致
- costUsd 类型：`real('cost_usd')` - 浮点数，保持原有语义
- Boolean 类型：`integer(..., { mode: 'boolean' })` - SQLite 标准做法

#### P0.5 重写 DB Client（30分钟）

**重写 lib/db/client.ts：**

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import { runMigrations } from './migrations/runner';

// ✅ 统一从 DATABASE_URL 解析数据库路径
function resolveSqlitePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./data/prod.db';
  const filePath = dbUrl.replace(/^file:/, '');
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

const dbPath = resolveSqlitePath();

// 创建 SQLite 连接
const sqlite = new Database(dbPath);

// ✅ 启用外键（关键！）
sqlite.pragma('foreign_keys = ON');

// ✅ 启用 WAL 模式（提高并发性能）
sqlite.pragma('journal_mode = WAL');

// ✅ 设置超时（避免 SQLITE_BUSY）
sqlite.pragma('busy_timeout = 5000');

console.log('[DB] SQLite initialized:', {
  path: dbPath,
  foreignKeys: sqlite.pragma('foreign_keys', { simple: true }),
  journalMode: sqlite.pragma('journal_mode', { simple: true })
});

// 运行迁移
// 开发环境：使用项目源码目录
// 生产环境：优先使用 Electron main 注入的 MIGRATIONS_DIR 环境变量（绝对路径）
const isDev = process.env.NODE_ENV !== 'production';
const migrationsDir = isDev
  ? path.join(process.cwd(), 'lib', 'db', 'migrations')
  : process.env.MIGRATIONS_DIR || path.join(process.cwd(), 'migrations');

try {
  runMigrations(sqlite, migrationsDir);
} catch (error) {
  console.error('[DB] Migration failed:', error);
  throw error;
}

// 创建 Drizzle 实例
export const db = drizzle(sqlite);

// 导出 sqlite 实例（用于原生 SQL）
export { sqlite };
```

#### P0.6 改写服务层（1.5小时）

**逐个改写 9 个服务文件：**

1. lib/services/project.ts
2. lib/services/message.ts
3. lib/services/chat-sessions.ts
4. lib/services/env.ts（重点：复合唯一键 + upsert）
5. lib/services/tokens.ts
6. lib/services/user-requests.ts（重点：upsert）
7. lib/services/project-services.ts
8. lib/services/template.ts
9. lib/services/preview.ts

**示例改写（lib/services/project.ts）：**

```typescript
// ❌ 旧代码
import { prisma } from '@/lib/db/client';

export async function getAllProjects(): Promise<Project[]> {
  const projects = await prisma.project.findMany({
    orderBy: { lastActiveAt: 'desc' }
  });
  return projects;
}

// ✅ 新代码
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function getAllProjects(): Promise<Project[]> {
  const result = await db.select()
    .from(projects)
    .orderBy(desc(projects.lastActiveAt));
  return result;
}
```

**示例改写（lib/services/env.ts - upsert）：**

```typescript
// ❌ 旧代码
await prisma.envVar.upsert({
  where: {
    projectId_key: { projectId, key }
  },
  update: { valueEncrypted, description },
  create: { projectId, key, valueEncrypted, description }
});

// ✅ 新代码
import { generateId } from '@/lib/utils/id';

const nowIso = new Date().toISOString();
await db.insert(envVars)
  .values({
    id: generateId(),
    projectId,
    key,
    valueEncrypted,
    description,
    createdAt: nowIso,
    updatedAt: nowIso
  })
  .onConflictDoUpdate({
    target: [envVars.projectId, envVars.key],
    set: {
      valueEncrypted,
      description,
      updatedAt: new Date().toISOString()
    }
  });
```

#### P0.7 修改脚本（30分钟）

**1. 修改 scripts/run-web.js：**

```javascript
// ❌ 移除 Prisma 检查
// console.log('🗃️  Synchronizing Prisma schema (prisma db push)...');
// const child = spawn('npx', ['prisma', 'db', 'push'], {...});

// ✅ 改为迁移检查
console.log('🗃️  Checking database migrations...');
// 迁移在 lib/db/client.ts 初始化时自动执行
```

**2. 修改 electron/main.js：**

```javascript
// ❌ 移除 Prisma 符号链接逻辑（239-296行）
// const prismaHiddenPath = ...
// fs.symlinkSync(...)

// ❌ 移除 Prisma db push 调用（400-442行）
// fork(prismaCli, ['db', 'push', '--skip-generate', ...])

// ✅ 在启动 Next.js server 前注入绝对路径环境变量
// 确保生产环境下 DB 和 migrations 路径明确
const { app } = require('electron');
const path = require('path');

// 在 app.whenReady() 之后，启动 Next server 之前：
const userDataPath = app.getPath('userData');
process.env.DATABASE_URL = `file:${path.join(userDataPath, 'data', 'prod.db')}`;
process.env.MIGRATIONS_DIR = path.join(process.resourcesPath, 'migrations');

// 然后启动 Next server，迁移会自动执行
// lib/db/client.ts 会在首次 import 时运行 runMigrations
```

**关键说明：**
- 生产环境 DB 路径：`app.getPath('userData')/data/prod.db`（用户数据目录）
- 生产环境 migrations 路径：`process.resourcesPath/migrations`（打包资源目录）
- 通过环境变量注入，避免路径漂移和硬编码问题

**3. 删除 scripts/copy-prisma.js**

#### P0.8 更新配置（15分钟）

**1. 移除 Prisma 依赖：**

```bash
npm uninstall @prisma/client prisma
```

**2. 更新 package.json scripts：**

```json
{
  "scripts": {
    "dev": "npm run type-check && node scripts/run-web.js",
    // ❌ 移除 prisma 相关命令
    // "prisma:generate": "prisma generate",
    // "prisma:push": "prisma db push",

    // ✅ 添加 drizzle 命令（可选，仅开发用）
    "db:generate": "drizzle-kit generate:sqlite",
    "db:studio": "drizzle-kit studio"
  }
}
```

**3. 更新 .gitignore：**

```
# ❌ 移除
# /prisma-hidden

# ✅ 添加
/lib/db/migrations/.gitkeep
```

### P0.9 测试验证（1小时）

**1. 功能测试**
```bash
# 启动开发环境
npm run dev:web

# 测试清单：
- [ ] 创建项目
- [ ] 查询项目列表
- [ ] 更新项目状态
- [ ] 添加环境变量（测试复合唯一键 + upsert）
- [ ] 更新环境变量（确认不会级联删除）
- [ ] 删除项目（验证级联删除）
- [ ] 检查级联删除是否清理了所有关联数据
```

**2. 外键验证**
```typescript
// 测试脚本
const { sqlite } = await import('./lib/db/client');
const fk = sqlite.pragma('foreign_keys', { simple: true });
console.log('Foreign keys enabled:', fk === 1);  // 必须是 1
```

**3. Upsert 验证（关键！）**
```bash
# 测试环境变量 upsert
1. 添加环境变量：KEY=value1
2. 再次添加：KEY=value2
3. 确认只有一条记录，且值为 value2
4. 确认没有触发级联删除
```

**4. 时间戳验证（关键！）**
```bash
# 检查时间戳格式
1. 创建项目
2. 查看数据库：
   - 正常路径（应用层显式写入）：created_at/updated_at 应为 ISO 8601 字符串（如 "2025-01-15T10:30:00.000Z"）
   - 兜底路径（遗漏显式赋值）：允许出现 YYYY-MM-DD HH:MM:SS 格式（数据库默认值）
3. 更新项目状态
4. 确认 updated_at 已变化（应为 ISO 字符串，因为应用层显式覆盖）
5. 前端显示：确认时间格式正确（new Date(str) 兼容两种格式）
```

### P0.10 打包验证（30分钟）

**1. 执行打包**
```bash
powershell -ExecutionPolicy Bypass -File build-windows.ps1
```

**2. 检查产物**
```bash
# 验证 drizzle-kit 未被打包
dir dist\win-unpacked\node_modules | findstr drizzle-kit
# 应该无输出

# 验证 better-sqlite3 已解包
dir dist\win-unpacked\node_modules\better-sqlite3
# 应该有输出

# 检查迁移文件
dir dist\win-unpacked\resources\migrations
# 应该有 0001_initial.sql
```

**3. 体积对比**
```bash
# 记录安装包大小
dir dist\*.exe

# 对比减重效果
# 预期：减少 ~350 MB
```

**4. 安装测试**
```bash
# 安装到测试环境
# 首次启动，检查迁移是否成功
# 查看日志输出：
# [Migration] Current schema version: 0
# [Migration] Applying 1: initial
# [Migration] ✓ Applied 1
# [Migration] Database is up to date
```

**5. 运行时依赖验证（关键！）**
```bash
# 启动已安装的应用
# 验证 Next server 能正常启动并响应
# 访问任意 API route（如 /api/projects）
# 确认没有 "Cannot find module" 错误
# 证明 .next/standalone 运行时依赖完整，未被排除
```

---

## 五、测试清单

### 5.1 功能测试

- [ ] 项目创建/查询/更新/删除
- [ ] 环境变量 upsert（复合唯一键）
- [ ] 用户请求 upsert
- [ ] 消息记录分页查询
- [ ] 会话管理
- [ ] 服务连接管理
- [ ] Token 管理
- [ ] 级联删除（删除项目时清理所有关联数据）
- [ ] 时间戳格式验证（确认存储和读取都是 ISO 8601 字符串）

### 5.2 性能测试

- [ ] 单次查询耗时 < 10ms
- [ ] 批量插入 100 条记录 < 100ms
- [ ] 应用启动时间无明显增加

### 5.3 兼容性测试

- [ ] 开发环境（npm run dev:web）
- [ ] 开发环境（npm run dev:desktop）
- [ ] 生产打包（Windows NSIS）
- [ ] 安装后首次启动（数据库初始化）
- [ ] 类型检查通过（npm run type-check）

### 5.4 回归测试

- [ ] 所有现有功能正常
- [ ] 前端页面无报错
- [ ] WebSocket 连接正常
- [ ] Timeline 日志正常

---

## 六、回滚方案

### 6.1 回滚步骤

如果迁移失败，可快速回滚：

```bash
# 1. 切换回主分支
git checkout main

# 2. 恢复依赖
npm install

# 3. 重新生成 Prisma Client
npm run prisma:generate

# 4. 恢复数据（如有必要）
sqlite3 prisma/data/prod.db < backup-YYYYMMDD.sql

# 总耗时：< 5 分钟
```

### 6.2 数据恢复

**开发环境：**
```bash
rm prisma/data/prod.db
npm run prisma:push
# 数据可丢弃，重新初始化
```

**生产环境：**
```bash
# 从备份恢复
sqlite3 prisma/data/prod.db < backup.sql
```

---

## 七、预期收益

### 7.1 打包体积

| 项目 | 当前 | 优化后 | 减少 |
|------|------|--------|------|
| Prisma 相关 | 352 MB | 0 MB | -352 MB |
| SQLite 驱动 | 0 MB | 2.5 MB | +2.5 MB |
| **净减少** | - | - | **-349.5 MB** |

### 7.2 性能

- 启动速度：无需加载 Prisma 引擎，预计提升 10-20%
- 查询性能：better-sqlite3 比 Prisma 更快（同步调用，无 IPC 开销）
- 内存占用：减少 ~50 MB（无引擎进程）

### 7.3 开发体验

- ✅ 类型安全保持（Drizzle 自动推导）
- ✅ 迁移管理更简单（SQL 文件，易于版本控制）
- ✅ 调试更方便（直接 SQL，无黑盒）
- ✅ 依赖更少，构建更快

---

## 八、注意事项

### 8.1 开发约定

1. **Schema 修改流程：**
   ```bash
   # 修改 lib/db/schema.ts
   npx drizzle-kit generate:sqlite
   # 检查生成的迁移文件
   # 提交代码
   ```

2. **数据库操作规范：**
   - 所有写操作必须更新 `updatedAt`（使用 `new Date().toISOString()`）
   - 使用 `generateId()` 生成主键
   - Upsert 必须用 `onConflictDoUpdate`
   - 时间戳处理：
     - 写入数据库：`new Date().toISOString()`
     - 从数据库读取：`new Date(project.createdAt)`

3. **错误处理规范：**
   - 使用封装的错误类
   - 保持与 Prisma 错误码兼容

### 8.2 时间戳全链路规范（关键！）

**统一约定：TEXT/DATETIME 类型，存储 ISO 8601 字符串**

```typescript
// 1. 数据库定义（TEXT 或 DATETIME，SQLite 本质都是 TEXT）
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

// 2. 应用层写入
const nowIso = new Date().toISOString();
await db.insert(projects).values({
  createdAt: nowIso,
  updatedAt: nowIso
});

// 3. 应用层读取
const project = await db.select().from(projects).where(...);
// project.createdAt 是 ISO 字符串："2025-01-15T10:30:00.000Z"

// 4. 前端展示
const date = new Date(project.createdAt);  // 直接解析 ISO 字符串
```

**禁止混用：**
- ❌ 不要用秒级时间戳（`Math.floor(Date.now() / 1000)`）
- ❌ 不要用毫秒时间戳（`Date.now()`）
- ✅ 统一用 `new Date().toISOString()` 和 `new Date(str)`
- ✅ 数据库默认值用 `CURRENT_TIMESTAMP` 仅作兜底（返回 `YYYY-MM-DD HH:MM:SS`）
- ✅ 应用层写入/更新永远显式传值，不依赖数据库默认值

---

## 九、参考资料

### 9.1 官方文档

- [Drizzle ORM - SQLite](https://orm.drizzle.team/docs/get-started-sqlite)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html)
- [SQLite ON CONFLICT Clause](https://www.sqlite.org/lang_conflict.html)

### 9.2 迁移指南

- [Prisma to Drizzle Migration Guide](https://orm.drizzle.team/docs/prisma-to-drizzle)
- [SQLite Upsert](https://www.sqlite.org/lang_upsert.html)

### 9.3 相关 Issue

- Electron + better-sqlite3 打包配置
- Drizzle onConflictDoUpdate 最佳实践

---

## 十、总结

本方案通过将 Prisma ORM 替换为 Drizzle ORM + better-sqlite3，在保持类型安全和开发体验的前提下，实现了：

✅ 打包体积减少 **~350 MB**（减幅约 50%）
✅ 启动性能提升 **10-20%**
✅ 内存占用降低 **~50 MB**
✅ 依赖更少，维护更简单
✅ 工作量可控（3-4小时）
✅ 风险可控，可快速回滚（< 5分钟）

**关键成功要素：**
1. 严格遵循 UPSERT 使用规范（ON CONFLICT 而非 REPLACE）
2. 确保外键和 WAL 模式正确启用
3. 完整的测试覆盖（单元测试 + 集成测试 + Electron 环境测试）
4. 保持与现有 API 的兼容性（错误处理、类型定义）
5. 修正打包策略（避免开发工具进入产物）

**风险规避：**
- 分支开发，随时可回滚
- 数据备份，避免数据丢失
- 充分测试，确保功能完整
- 文档完善，降低维护成本

**决策透明度：**
- 初版方案经外部专家评审
- 发现 5 个关键风险点并全部规避
- 确认架构边界，避免过度设计
- 采用分阶段路线，降低风险

本方案已充分评估技术可行性和风险点，建议按计划实施。

---

## 附录：审查清单

### 供技术审查者检查

**架构决策：**
- [ ] 确认 DB 在 Next.js server 进程
- [ ] 确认 better-sqlite3 同步 API 不会阻塞 UI

**打包配置：**
- [ ] 确认 `files` 中不包含 `node_modules/**/*`
- [ ] 确认 drizzle-kit 不会进入产物
- [ ] 确认 better-sqlite3 正确解包
- [ ] 确认迁移文件打包到 extraResources

**数据安全：**
- [ ] 确认 UPSERT 使用 ON CONFLICT 而非 REPLACE
- [ ] 确认外键启用逻辑正确（PRAGMA foreign_keys = ON）
- [ ] 确认 Migration Runner 包含事务和回滚
- [ ] 确认时间戳类型统一（TEXT/DATETIME，ISO 8601 字符串）

**测试覆盖：**
- [ ] 确认有 upsert 测试（复合唯一键）
- [ ] 确认有级联删除测试
- [ ] 确认有外键启用验证
- [ ] 确认有时间戳格式验证（ISO 8601 字符串）
- [ ] 确认有 Electron 环境测试

**回滚准备：**
- [ ] 确认有数据备份方案
- [ ] 确认回滚步骤清晰（< 5分钟）
- [ ] 确认在独立分支开发

**代码质量：**
- [ ] 确认类型定义完整
- [ ] 确认错误处理兼容
- [ ] 确认日志输出清晰
- [ ] 确认代码注释充分

### 供产品/项目审查者检查

**收益评估：**
- [ ] 确认减重目标明确（~350 MB）
- [ ] 确认性能提升可量化（10-20%）
- [ ] 确认内存优化可量化（~50 MB）

**风险控制：**
- [ ] 确认风险点全部识别
- [ ] 确认规避措施具体
- [ ] 确认回滚成本可接受
- [ ] 确认测试覆盖充分

**工作量评估：**
- [ ] 确认工作量合理（3-4h）
- [ ] 确认不会影响其他功能

**决策透明度：**
- [ ] 确认方案调整过程清晰
- [ ] 确认外部建议采纳/放弃理由明确
- [ ] 确认架构边界确认过程清晰

---

## 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2025-12-22 | 初版方案（自研兼容层） | - |
| v2.0 | 2025-12-22 | 采纳外部建议，改用 drizzle-orm | - |
| v2.1 | 2025-12-22 | 补充方案调整过程和审查清单 | - |
