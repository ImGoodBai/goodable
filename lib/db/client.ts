import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import { runMigrations } from './migrations/runner';
import * as schema from './schema';

// 全局单例模式（类似 Prisma 的做法，防止 Next.js 热重载时创建多个连接）
const globalForDb = global as unknown as {
  sqlite: Database.Database | undefined;
  db: BetterSQLite3Database<typeof schema> | undefined;
  migrationRan: boolean | undefined;
};

// 统一从 DATABASE_URL 解析数据库路径
function resolveSqlitePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./data/prod.db';
  const filePath = dbUrl.replace(/^file:/, '');
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

// 初始化数据库连接（只执行一次）
if (!globalForDb.sqlite) {
  const dbPath = resolveSqlitePath();

  // 创建 SQLite 连接
  globalForDb.sqlite = new Database(dbPath);

  // 启用外键（关键！）
  globalForDb.sqlite.pragma('foreign_keys = ON');

  // 启用 WAL 模式（提高并发性能）
  globalForDb.sqlite.pragma('journal_mode = WAL');

  // 设置超时（避免 SQLITE_BUSY）
  globalForDb.sqlite.pragma('busy_timeout = 5000');

  console.log('[DB] SQLite initialized:', {
    path: dbPath,
    foreignKeys: globalForDb.sqlite.pragma('foreign_keys', { simple: true }),
    journalMode: globalForDb.sqlite.pragma('journal_mode', { simple: true })
  });

  // 运行迁移（只执行一次）
  if (!globalForDb.migrationRan) {
    // 优先使用 Electron main 注入的 MIGRATIONS_DIR（生产环境打包后的绝对路径）
    // 未设置时统一使用源码目录（适用于开发环境和 Next.js build）
    const migrationsDir = process.env.MIGRATIONS_DIR || path.join(process.cwd(), 'lib', 'db', 'migrations');

    try {
      runMigrations(globalForDb.sqlite, migrationsDir);
      globalForDb.migrationRan = true;
    } catch (error) {
      console.error('[DB] Migration failed:', error);
      throw error;
    }
  }

  // 创建 Drizzle 实例
  globalForDb.db = drizzle(globalForDb.sqlite, { schema });
}

// 导出单例实例
export const sqlite = globalForDb.sqlite!;
export const db = globalForDb.db!;

// 兼容旧代码：导出为 prisma（仅用于过渡期）
export const prisma = db;
