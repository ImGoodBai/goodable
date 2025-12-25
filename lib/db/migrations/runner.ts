import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

export function runMigrations(db: Database.Database, migrationsDir: string) {
  // 0. 文件锁机制：防止并发执行迁移（Next.js 构建时多进程问题）
  // 使用数据库文件所在目录存放锁文件（兼容开发和生产环境）
  const dbPath = db.name; // better-sqlite3 的 Database.name 返回数据库文件路径
  const dataDir = path.dirname(dbPath);
  const lockFile = path.join(dataDir, '.migration.lock');
  let lockAcquired = false;
  let lockFd: number | null = null;

  try {
    // 尝试原子性地创建锁文件（wx 标志：只在文件不存在时创建）
    let attempts = 0;
    const maxAttempts = 20; // 最多尝试 20 次，共 10 秒

    while (attempts < maxAttempts && !lockAcquired) {
      try {
        // 原子操作：只有在文件不存在时才能创建成功
        lockFd = fs.openSync(lockFile, 'wx');

        // 成功创建锁文件
        const lockData = {
          pid: process.pid,
          timestamp: new Date().toISOString(),
          hostname: require('os').hostname()
        };
        fs.writeSync(lockFd, JSON.stringify(lockData, null, 2));
        lockAcquired = true;
        console.log(`[Migration] Lock acquired by PID ${process.pid}`);

      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // 锁文件已存在，说明其他进程正在执行迁移
          if (attempts === 0) {
            console.log('[Migration] Another process is running migrations, waiting...');
          }

          // 检查锁文件是否过期
          try {
            const lockStat = fs.statSync(lockFile);
            const lockAge = Date.now() - lockStat.mtimeMs;

            if (lockAge > 180000) { // 3分钟过期
              console.warn(`[Migration] Stale lock file detected (age: ${Math.round(lockAge/1000)}s), removing...`);
              fs.unlinkSync(lockFile);
              continue; // 重新尝试获取锁
            }
          } catch {
            // 锁文件可能被删除了，重试
            continue;
          }

          // 等待 500ms 后重试
          const start = Date.now();
          while (Date.now() - start < 500) {
            // Busy wait
          }

          attempts++;
          if (attempts % 5 === 0) {
            console.log(`[Migration] Still waiting... (${attempts}/${maxAttempts})`);
          }
        } else {
          // 其他错误（如权限问题）
          throw error;
        }
      }
    }

    if (!lockAcquired) {
      console.warn('[Migration] Timeout waiting for lock, assuming migrations are handled by other process');
      return;
    }

    // 1. 确保 schema_migrations 表存在
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

    // 3. 加载待执行的迁移
    const migrations = loadMigrations(migrationsDir);
    const pending = migrations.filter(m => m.version > current.version);

    if (pending.length === 0) {
      console.log('[Migration] No pending migrations');
      return;
    }

    console.log(`[Migration] Current schema version: ${current.version}, pending: ${pending.length}`);

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

    runInTransaction(pending);
    console.log(`[Migration] Successfully applied ${pending.length} migration(s)`);

  } catch (error) {
    console.error('[Migration] Error during migration:',  error);
    throw error;
  } finally {
    // 释放锁文件（无论成功或失败）
    if (lockAcquired) {
      try {
        // 先关闭文件描述符
        if (lockFd !== null) {
          fs.closeSync(lockFd);
        }
        // 然后删除锁文件
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
          console.log(`[Migration] Lock released by PID ${process.pid}`);
        }
      } catch (unlinkError) {
        console.warn('[Migration] Failed to remove lock file:', unlinkError);
      }
    }
  }
}

function loadMigrations(migrationsDir: string): Migration[] {
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`[Migration] Migrations directory not found: ${migrationsDir}`);
    return [];
  }

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
