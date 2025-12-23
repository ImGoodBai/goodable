import fs from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db/client';
import { envVars } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateId } from '@/lib/utils/id';
import { encrypt, decrypt } from '@/lib/crypto';
import type { Project } from '@/types/backend';
import { getProjectById } from '@/lib/services/project';
import { PROJECTS_DIR_ABSOLUTE } from '@/lib/config/paths';

export interface EnvVarRecord {
  id: string;
  key: string;
  value: string;
  scope: string;
  var_type: string;
  is_secret: boolean;
  description?: string | null;
}

interface CreateEnvVarInput {
  key: string;
  value: string;
  scope?: string;
  varType?: string;
  isSecret?: boolean;
  description?: string | null;
}

function resolveRepoRoot(project: Project): string {
  const repoPath = project.repoPath || path.join(PROJECTS_DIR_ABSOLUTE, project.id);
  return path.isAbsolute(repoPath) ? repoPath : path.resolve(process.cwd(), repoPath);
}

function envFilePath(project: Project): string {
  const repoRoot = resolveRepoRoot(project);
  return path.join(repoRoot, '.env');
}

async function ensureProject(projectId: string): Promise<Project> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  return project;
}

function mapEnvVar(model: any): EnvVarRecord {
  return {
    id: model.id,
    key: model.key,
    value: decrypt(model.valueEncrypted),
    scope: model.scope,
    var_type: model.varType,
    is_secret: model.isSecret,
    description: model.description,
  };
}

export async function listEnvVars(projectId: string): Promise<EnvVarRecord[]> {
  const records = await db.select()
    .from(envVars)
    .where(eq(envVars.projectId, projectId))
    .orderBy(desc(envVars.key));
  const result: EnvVarRecord[] = [];
  for (const record of records) {
    try {
      result.push(mapEnvVar(record));
    } catch (error) {
      console.warn(`[EnvService] Failed to decrypt env var ${record.key}:`, error);
    }
  }
  return result;
}

export async function createEnvVar(
  projectId: string,
  input: CreateEnvVarInput,
): Promise<EnvVarRecord> {
  await ensureProject(projectId);
  try {
    const nowIso = new Date().toISOString();
    const [created] = await db.insert(envVars)
      .values({
        id: generateId(),
        projectId,
        key: input.key,
        valueEncrypted: encrypt(input.value),
        scope: input.scope ?? 'runtime',
        varType: input.varType ?? 'string',
        isSecret: input.isSecret ?? true,
        description: input.description,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning();

    await syncDbToEnvFile(projectId);
    return mapEnvVar(created);
  } catch (error: any) {
    // SQLite 唯一约束错误
    if (error?.code === 'SQLITE_CONSTRAINT' || error?.message?.includes('UNIQUE constraint failed')) {
      throw new Error(`Environment variable "${input.key}" already exists`);
    }
    throw error;
  }
}

export async function updateEnvVar(
  projectId: string,
  key: string,
  value: string,
): Promise<boolean> {
  await ensureProject(projectId);
  try {
    const result = await db.update(envVars)
      .set({
        valueEncrypted: encrypt(value),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(envVars.projectId, projectId),
          eq(envVars.key, key)
        )
      );

    await syncDbToEnvFile(projectId);
    return true;
  } catch (error: any) {
    throw error;
  }
}

export async function deleteEnvVar(projectId: string, key: string): Promise<boolean> {
  await ensureProject(projectId);
  try {
    const result = await db.delete(envVars)
      .where(
        and(
          eq(envVars.projectId, projectId),
          eq(envVars.key, key)
        )
      )
      .returning({ id: envVars.id });

    await syncDbToEnvFile(projectId);
    // 如果返回结果为空，说明记录不存在
    return result.length > 0;
  } catch (error: any) {
    throw error;
  }
}

export async function syncDbToEnvFile(projectId: string): Promise<number> {
  const project = await ensureProject(projectId);
  const repoEnvPath = envFilePath(project);

  const envVarsFromDb = await db.select()
    .from(envVars)
    .where(eq(envVars.projectId, projectId))
    .orderBy(desc(envVars.key));

  const entries = envVarsFromDb.reduce((acc: { key: string; value: string }[], envVar: any) => {
    try {
      let value = decrypt(envVar.valueEncrypted);

      // Validate DATABASE_URL to prevent path traversal
      if (envVar.key === 'DATABASE_URL' && value) {
        const validated = validateDatabaseUrl(value, projectId);
        if (validated !== value) {
          console.warn(`[EnvService] Corrected invalid DATABASE_URL for project ${projectId}: ${value} -> ${validated}`);
          value = validated;
        }
      }

      acc.push({ key: envVar.key, value });
    } catch (error) {
      console.warn(`[EnvService] Failed to decrypt env var ${envVar.key}:`, error);
    }
    return acc;
  }, []);

  const header =
    '# Environment Variables\n# This file is automatically synchronized with Project Settings\n\n';

  const contents =
    header +
    entries
      .map(({ key, value }: any) => {
        if (value === undefined || value === null) {
          return `${key}=`;
        }
        if (/[ \t#"$']/u.test(value)) {
          return `${key}="${value.replace(/"/g, '\\"')}"`;
        }
        return `${key}=${value}`;
      })
      .join('\n') +
    (entries.length > 0 ? '\n' : '');

  await fs.mkdir(path.dirname(repoEnvPath), { recursive: true });
  await fs.writeFile(repoEnvPath, contents, 'utf8');

  return entries.length;
}

/**
 * Validate DATABASE_URL to prevent path traversal attacks
 * @param url - The DATABASE_URL value to validate
 * @param projectId - The project ID for logging
 * @returns Validated DATABASE_URL
 */
function validateDatabaseUrl(url: string, projectId: string): string {
  // Only validate SQLite file URLs
  if (!url.startsWith('file:')) {
    return url; // Allow postgres://, mysql:// etc. as-is
  }

  const filePath = url.replace(/^file:/, '');

  // Check for dangerous patterns
  const dangerousPatterns = [
    '../',           // Parent directory traversal
    '..\\',          // Windows parent directory
    '/data/',        // Main project database directory
    '\\data\\',      // Windows data directory
    '/Users/',       // Absolute path (Unix)
    '/home/',        // Absolute path (Linux)
    'C:\\',          // Absolute path (Windows)
    'D:\\',          // Absolute path (Windows)
  ];

  for (const pattern of dangerousPatterns) {
    if (filePath.includes(pattern)) {
      console.error(`[EnvService] SECURITY: Blocked dangerous DATABASE_URL path for project ${projectId}: ${url}`);
      return 'file:./sub_dev.db'; // Safe default
    }
  }

  // Ensure it starts with ./ (relative to project root)
  if (!filePath.startsWith('./') && !filePath.startsWith('.\\')) {
    console.warn(`[EnvService] DATABASE_URL should start with ./: ${url}`);
    return `file:./${filePath}`;
  }

  return url;
}

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = contents.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export async function syncEnvFileToDb(projectId: string): Promise<number> {
  const project = await ensureProject(projectId);
  const repoEnvPath = envFilePath(project);

  let fileContents = '';
  try {
    fileContents = await fs.readFile(repoEnvPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  const fileVars = parseEnvFile(fileContents);
  const existingVars = await db.select()
    .from(envVars)
    .where(eq(envVars.projectId, projectId));

  const existingMap = new Map(existingVars.map((envVar: any) => [envVar.key, envVar]));
  const fileKeys = new Set(Object.keys(fileVars));
  let changes = 0;

  for (const [key, value] of Object.entries(fileVars)) {
    // Validate DATABASE_URL before storing
    let finalValue = value;
    if (key === 'DATABASE_URL') {
      finalValue = validateDatabaseUrl(value, projectId);
      if (finalValue !== value) {
        console.warn(`[EnvService] Corrected DATABASE_URL from .env file for project ${projectId}: ${value} -> ${finalValue}`);
      }
    }

    const current = existingMap.get(key);
    if (current) {
      let currentValue: string | null = null;
      try {
        currentValue = decrypt(current.valueEncrypted);
      } catch (error) {
        console.warn(`[EnvService] Failed to decrypt env var ${current.key}:`, error);
      }
      if (currentValue !== finalValue) {
        await db.update(envVars)
          .set({
            valueEncrypted: encrypt(finalValue),
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(envVars.projectId, projectId),
              eq(envVars.key, key)
            )
          );
        changes += 1;
      }
    } else {
      const nowIso = new Date().toISOString();
      await db.insert(envVars)
        .values({
          id: generateId(),
          projectId,
          key,
          valueEncrypted: encrypt(finalValue),
          scope: 'runtime',
          varType: 'string',
          isSecret: true,
          description: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      changes += 1;
    }
  }

  for (const envVar of existingVars) {
    if (!fileKeys.has(envVar.key)) {
      await db.delete(envVars)
        .where(
          and(
            eq(envVars.projectId, projectId),
            eq(envVars.key, envVar.key)
          )
        );
      changes += 1;
    }
  }

  return changes;
}

export async function detectEnvConflicts(projectId: string) {
  const project = await ensureProject(projectId);
  const repoEnvPath = envFilePath(project);

  let fileContents = '';
  try {
    fileContents = await fs.readFile(repoEnvPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      fileContents = '';
    } else {
      throw error;
    }
  }

  const fileVars = parseEnvFile(fileContents);
  const dbVars = await listEnvVars(projectId);

  const conflicts: Array<{
    key: string;
    file_value?: string;
    db_value?: string;
    conflict_type: 'file_only' | 'db_only' | 'value_mismatch';
  }> = [];

  const keys = new Set([...Object.keys(fileVars), ...dbVars.map((envVar) => envVar.key)]);

  for (const key of keys) {
    const fileValue = fileVars[key];
    const dbValue = dbVars.find((envVar) => envVar.key === key)?.value;

    if (fileValue === dbValue) {
      continue;
    }

    let conflictType: 'file_only' | 'db_only' | 'value_mismatch';
    if (fileValue !== undefined && dbValue === undefined) {
      conflictType = 'file_only';
    } else if (fileValue === undefined && dbValue !== undefined) {
      conflictType = 'db_only';
    } else {
      conflictType = 'value_mismatch';
    }

    conflicts.push({
      key,
      file_value: fileValue,
      db_value: dbValue,
      conflict_type: conflictType,
    });
  }

  return {
    conflicts,
    has_conflicts: conflicts.length > 0,
  };
}

export async function upsertEnvVar(
  projectId: string,
  input: CreateEnvVarInput,
): Promise<EnvVarRecord> {
  const existing = await db.select()
    .from(envVars)
    .where(
      and(
        eq(envVars.projectId, projectId),
        eq(envVars.key, input.key)
      )
    )
    .limit(1);

  const nowIso = new Date().toISOString();
  let result;

  if (existing[0]) {
    [result] = await db.update(envVars)
      .set({
        valueEncrypted: encrypt(input.value),
        description: input.description,
        scope: input.scope ?? 'runtime',
        varType: input.varType ?? 'string',
        isSecret: input.isSecret ?? true,
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(envVars.projectId, projectId),
          eq(envVars.key, input.key)
        )
      )
      .returning();
  } else {
    [result] = await db.insert(envVars)
      .values({
        id: generateId(),
        projectId,
        key: input.key,
        valueEncrypted: encrypt(input.value),
        description: input.description,
        scope: input.scope ?? 'runtime',
        varType: input.varType ?? 'string',
        isSecret: input.isSecret ?? true,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning();
  }

  await syncDbToEnvFile(projectId);
  return mapEnvVar(result);
}
