import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

export function runMigrations(db: Database.Database, migrationsDir: string) {
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

  try {
    runInTransaction(pending);
    console.log(`[Migration] Successfully applied ${pending.length} migration(s)`);
  } catch (error) {
    console.error('[Migration] Transaction rolled back due to error');
    throw error;
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
