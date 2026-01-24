/**
 * Skill Service - Manage skills for Claude SDK
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import matter from 'gray-matter';
import AdmZip from 'adm-zip';
import {
  SKILLS_DIR_ABSOLUTE,
  USER_SKILLS_DIR_ABSOLUTE,
} from '@/lib/config/paths';

// Global singleton for initialization state (similar to DB client pattern)
const globalForSkills = global as unknown as {
  skillsInitialized: boolean | undefined;
  skillsInitPromise: Promise<void> | undefined;
};

export interface EnvVarConfig {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  default?: string;
}

export interface SkillMeta {
  name: string;
  displayName?: string;
  description: string;
  path: string;
  source: 'builtin' | 'user';
  size: number;
  // Extended fields
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  preview?: string;
  projectType?: 'nextjs' | 'python-fastapi';
  envVars?: EnvVarConfig[];
  // Capability flags
  hasSkill: boolean;   // Has SKILL.md (can be used as SDK skill)
  hasApp: boolean;     // Has projectType (can run as BS app)
}

// Plugin config interface (SDK standard fields only)
interface PluginConfig {
  name: string;
  description: string;
  version: string;
  skills: string[];
}

/**
 * Extended config file (plugin-ex.json)
 *
 * Why we need a separate extended config file:
 * - Claude SDK's plugin.json has strict schema validation and only accepts standard fields (name, description, version, skills)
 * - We need to track additional custom fields (disabledSkills, builtinVersion) for Goodable's skill management
 * - These custom fields would cause SDK validation errors if added to plugin.json
 * - Solution: Store SDK-compliant fields in plugin.json, store extended fields in plugin-ex.json
 */
interface SkillExtendedConfig {
  disabledSkills?: string[];
  builtinVersion?: string; // Track which app version initialized builtin skills
}

// Get app version (same as AppSidebar.tsx)
// In production, APP_VERSION env is set by electron/main.js
// In development, import from package.json works
function getAppVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Get plugin.json path
 */
function getPluginJsonPath(): string {
  return path.join(USER_SKILLS_DIR_ABSOLUTE, '.claude-plugin', 'plugin.json');
}

/**
 * Get skill extended config file path (separate from plugin.json)
 */
function getSkillExtendedConfigPath(): string {
  return path.join(USER_SKILLS_DIR_ABSOLUTE, '.claude-plugin', 'plugin-ex.json');
}

/**
 * Read plugin.json config
 */
async function readPluginConfig(): Promise<PluginConfig | null> {
  const configPath = getPluginJsonPath();
  try {
    if (!fsSync.existsSync(configPath)) {
      return null;
    }
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as PluginConfig;
  } catch {
    return null;
  }
}

/**
 * Write plugin.json config (SDK standard fields only)
 */
async function writePluginConfig(config: PluginConfig): Promise<void> {
  const configPath = getPluginJsonPath();
  const wrapperDir = path.dirname(configPath);
  await fs.mkdir(wrapperDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Read skill extended config (internal tracking, not for SDK)
 */
async function readSkillExtendedConfig(): Promise<SkillExtendedConfig> {
  const configPath = getSkillExtendedConfigPath();
  try {
    if (!fsSync.existsSync(configPath)) {
      return {};
    }
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as SkillExtendedConfig;
  } catch {
    return {};
  }
}

/**
 * Write skill extended config (internal tracking, not for SDK)
 */
async function writeSkillExtendedConfig(config: SkillExtendedConfig): Promise<void> {
  const configPath = getSkillExtendedConfigPath();
  const wrapperDir = path.dirname(configPath);
  await fs.mkdir(wrapperDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Validate and update plugin.json based on actual directory contents
 * Preserves disabled skills list and builtin version marker (in separate config file)
 */
export async function validateAndUpdatePluginJson(builtinVersion?: string): Promise<void> {
  // Scan user-skills directory for valid skills
  const userSkillsDir = USER_SKILLS_DIR_ABSOLUTE;
  if (!fsSync.existsSync(userSkillsDir)) {
    await fs.mkdir(userSkillsDir, { recursive: true });
  }

  const entries = await fs.readdir(userSkillsDir, { withFileTypes: true });
  const validSkillNames: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillMdPath = path.join(userSkillsDir, entry.name, 'SKILL.md');
    if (fsSync.existsSync(skillMdPath)) {
      validSkillNames.push(entry.name);
    }
  }

  // Read existing config to preserve disabled list and version
  const existingConfig = await readSkillExtendedConfig();
  const disabledSkills = existingConfig.disabledSkills || [];

  // Filter out disabled skills from enabled list
  const enabledSkillPaths = validSkillNames
    .filter(name => !disabledSkills.includes(name))
    .map(name => `./${name}`);

  // Also clean up disabled list (remove skills that no longer exist)
  const validDisabledSkills = disabledSkills.filter(name => validSkillNames.includes(name));

  // Write plugin.json (SDK standard fields only)
  const config: PluginConfig = {
    name: 'goodable-skills',
    description: 'Goodable managed skills',
    version: '1.0.0',
    skills: enabledSkillPaths,
  };
  await writePluginConfig(config);

  // Write extended config file (internal tracking)
  const extendedConfig: SkillExtendedConfig = {
    disabledSkills: validDisabledSkills.length > 0 ? validDisabledSkills : undefined,
    builtinVersion: builtinVersion || existingConfig.builtinVersion,
  };
  await writeSkillExtendedConfig(extendedConfig);

  console.log(`[SkillService] Updated plugin.json: ${enabledSkillPaths.length} enabled, ${validDisabledSkills.length} disabled`);
}

/**
 * Copy directory recursively, skip node_modules
 */
async function copyDirSkipNodeModules(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    // Skip node_modules directory
    if (entry.name === 'node_modules') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirSkipNodeModules(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Copy a builtin skill to user-skills directory (overwrite if exists)
 */
async function ensureSkillInUserDir(builtinSkillPath: string, skillName: string): Promise<void> {
  const targetDir = path.join(USER_SKILLS_DIR_ABSOLUTE, skillName);

  // Always overwrite to ensure latest version
  if (fsSync.existsSync(targetDir)) {
    // Remove old files but preserve node_modules if exists
    const nodeModulesPath = path.join(targetDir, 'node_modules');
    const hasNodeModules = fsSync.existsSync(nodeModulesPath);

    if (hasNodeModules) {
      // Preserve node_modules: remove all other files/dirs first
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name !== 'node_modules') {
          await fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true });
        }
      }
    } else {
      await fs.rm(targetDir, { recursive: true, force: true });
    }
  }

  await copyDirSkipNodeModules(builtinSkillPath, targetDir);
  console.log(`[SkillService] Copied builtin skill to user-skills: ${skillName}`);
}

/**
 * Initialize all builtin skills to user-skills directory
 * Only runs on first install or when app version changes
 */
export async function initializeBuiltinSkills(): Promise<void> {
  // Check if builtin skills need to be copied (version check from extended config)
  const currentVersion = getAppVersion();
  const extendedConfig = await readSkillExtendedConfig();

  if (extendedConfig.builtinVersion === currentVersion) {
    console.log(`[SkillService] Builtin skills already initialized for version ${currentVersion}`);
    return;
  }

  if (!fsSync.existsSync(SKILLS_DIR_ABSOLUTE)) {
    console.log('[SkillService] Builtin skills directory not found, skipping initialization');
    return;
  }

  try {
    console.log(`[SkillService] Initializing builtin skills for version ${currentVersion}...`);
    const entries = await fs.readdir(SKILLS_DIR_ABSOLUTE, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(SKILLS_DIR_ABSOLUTE, entry.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      if (fsSync.existsSync(skillMdPath)) {
        await ensureSkillInUserDir(skillPath, entry.name);
      }
    }
    console.log('[SkillService] Builtin skills initialization completed');

    // Update plugin.json with version marker
    await validateAndUpdatePluginJson(currentVersion);
  } catch (error) {
    console.error('[SkillService] Error initializing builtin skills:', error);
  }
}

/**
 * Initialize skills on app startup
 * - Copy builtin skills to user directory (first time or version upgrade)
 * - Validate and update plugin.json
 * Uses global singleton to ensure only runs once per process
 */
export async function initializeSkillsOnStartup(): Promise<void> {
  // Skip during Next.js build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  // Return cached promise if already initializing
  if (globalForSkills.skillsInitPromise) {
    return globalForSkills.skillsInitPromise;
  }

  // Skip if already initialized
  if (globalForSkills.skillsInitialized) {
    return;
  }

  // Start initialization
  globalForSkills.skillsInitPromise = (async () => {
    try {
      await initializeBuiltinSkills();
      // Always validate plugin.json on startup to fix any inconsistencies
      await validateAndUpdatePluginJson();
      globalForSkills.skillsInitialized = true;
      console.log('[SkillService] Skills initialization completed');
    } catch (error) {
      console.error('[SkillService] Skills initialization failed:', error);
    } finally {
      globalForSkills.skillsInitPromise = undefined;
    }
  })();

  return globalForSkills.skillsInitPromise;
}

/**
 * Ensure skills are initialized before use
 * Call this at the start of any exported function that needs skills
 */
async function ensureInitialized(): Promise<void> {
  if (!globalForSkills.skillsInitialized) {
    await initializeSkillsOnStartup();
  }
}

/**
 * Calculate directory size recursively
 */
async function getDirSize(dirPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await getDirSize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        totalSize += stat.size;
      }
    }
  } catch {
    // Ignore errors
  }
  return totalSize;
}

/**
 * Template config interface (template.json)
 */
interface TemplateConfig {
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  preview?: string;
  projectType?: 'nextjs' | 'python-fastapi';
  envVars?: EnvVarConfig[];
}

/**
 * Parsed skill/template data
 */
interface ParsedSkillData {
  displayName?: string;
  description: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  preview?: string;
  projectType?: 'nextjs' | 'python-fastapi';
  envVars?: EnvVarConfig[];
  hasSkill: boolean;
  hasApp: boolean;
}

/**
 * Parse template.json
 */
async function parseTemplateJson(skillPath: string): Promise<TemplateConfig | null> {
  const templateJsonPath = path.join(skillPath, 'template.json');
  try {
    if (!fsSync.existsSync(templateJsonPath)) {
      return null;
    }
    const content = await fs.readFile(templateJsonPath, 'utf-8');
    return JSON.parse(content) as TemplateConfig;
  } catch {
    return null;
  }
}

/**
 * Parse SKILL.md frontmatter
 */
async function parseSkillMd(skillPath: string): Promise<{
  name: string;
  displayName?: string;
  description: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  preview?: string;
  projectType?: 'nextjs' | 'python-fastapi';
} | null> {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  try {
    const content = await fs.readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);
    if (data.name && data.description) {
      return {
        name: String(data.name),
        displayName: data.displayName ? String(data.displayName) : undefined,
        description: String(data.description),
        category: data.category ? String(data.category) : undefined,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
        version: data.version ? String(data.version) : undefined,
        author: data.author ? String(data.author) : undefined,
        preview: data.preview ? String(data.preview) : undefined,
        projectType: data.projectType as 'nextjs' | 'python-fastapi' | undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse skill directory - supports both template.json and SKILL.md
 * Priority: template.json > SKILL.md
 */
async function parseSkillDir(skillPath: string, dirName: string): Promise<ParsedSkillData | null> {
  const templateConfig = await parseTemplateJson(skillPath);
  const skillMdData = await parseSkillMd(skillPath);

  const hasSkill = skillMdData !== null;
  const hasApp = !!(templateConfig?.projectType || skillMdData?.projectType);

  // Need at least one config file
  if (!templateConfig && !skillMdData) {
    return null;
  }

  // Priority: template.json > SKILL.md
  if (templateConfig) {
    return {
      displayName: templateConfig.displayName,
      description: templateConfig.description || skillMdData?.description || dirName,
      category: templateConfig.category || skillMdData?.category,
      tags: templateConfig.tags || skillMdData?.tags,
      version: templateConfig.version || skillMdData?.version,
      author: templateConfig.author || skillMdData?.author,
      preview: templateConfig.preview || skillMdData?.preview,
      projectType: templateConfig.projectType || skillMdData?.projectType,
      envVars: templateConfig.envVars,
      hasSkill,
      hasApp,
    };
  }

  // Fallback to SKILL.md only
  return {
    displayName: skillMdData!.displayName,
    description: skillMdData!.description,
    category: skillMdData!.category,
    tags: skillMdData!.tags,
    version: skillMdData!.version,
    author: skillMdData!.author,
    preview: skillMdData!.preview,
    projectType: skillMdData!.projectType,
    hasSkill,
    hasApp,
  };
}

/**
 * Scan skills from a directory
 */
async function scanSkillsFromDir(
  dirPath: string,
  source: 'builtin' | 'user'
): Promise<SkillMeta[]> {
  const skills: SkillMeta[] = [];

  try {
    if (!fsSync.existsSync(dirPath)) {
      return skills;
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip irrelevant directories
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;

      const skillPath = path.join(dirPath, entry.name);
      const parsed = await parseSkillDir(skillPath, entry.name);

      if (parsed) {
        const size = await getDirSize(skillPath);
        skills.push({
          name: entry.name,
          displayName: parsed.displayName,
          description: parsed.description,
          path: skillPath,
          source,
          size,
          category: parsed.category,
          tags: parsed.tags,
          version: parsed.version,
          author: parsed.author,
          preview: parsed.preview,
          projectType: parsed.projectType,
          envVars: parsed.envVars,
          hasSkill: parsed.hasSkill,
          hasApp: parsed.hasApp,
        });
      }
    }
  } catch (error) {
    console.error(`[SkillService] Error scanning skills from ${dirPath}:`, error);
  }

  return skills;
}

/**
 * Get all skills (builtin + user)
 * User skills override builtin skills with same name
 */
export async function getAllSkills(): Promise<SkillMeta[]> {
  await ensureInitialized();

  // Scan builtin skills
  const builtinSkills = await scanSkillsFromDir(SKILLS_DIR_ABSOLUTE, 'builtin');

  // Scan user skills
  const userSkills = await scanSkillsFromDir(USER_SKILLS_DIR_ABSOLUTE, 'user');

  // Merge: user skills override builtin with same name
  const skillMap = new Map<string, SkillMeta>();
  for (const skill of builtinSkills) {
    skillMap.set(skill.name, skill);
  }
  for (const skill of userSkills) {
    skillMap.set(skill.name, skill);
  }

  return Array.from(skillMap.values());
}

/**
 * Import skill from folder or ZIP
 * Supports both SKILL.md (pure skill) and template.json (app template)
 */
export async function importSkill(sourcePath: string): Promise<SkillMeta> {
  const stat = await fs.stat(sourcePath);
  let skillDir: string;

  if (stat.isDirectory()) {
    // Import from folder - check for SKILL.md or template.json
    if (!isValidSkillDir(sourcePath)) {
      throw new Error('Invalid skill: SKILL.md or template.json not found');
    }

    // Use directory name as skill name
    const dirName = path.basename(sourcePath);
    const targetDir = path.join(USER_SKILLS_DIR_ABSOLUTE, dirName);
    await copyDir(sourcePath, targetDir);
    skillDir = targetDir;
  } else if (sourcePath.endsWith('.zip')) {
    // Import from ZIP
    const zip = new AdmZip(sourcePath);
    const tempDir = path.join(USER_SKILLS_DIR_ABSOLUTE, `_temp_${Date.now()}`);
    zip.extractAllTo(tempDir, true);

    // Find valid skill directory (has SKILL.md or template.json)
    const skillPath = await findValidSkillDir(tempDir);
    if (!skillPath) {
      await fs.rm(tempDir, { recursive: true, force: true });
      throw new Error('Invalid ZIP: SKILL.md or template.json not found');
    }

    // Use directory name as skill name
    const dirName = path.basename(skillPath);
    const targetDir = path.join(USER_SKILLS_DIR_ABSOLUTE, dirName);
    if (fsSync.existsSync(targetDir)) {
      await fs.rm(targetDir, { recursive: true, force: true });
    }
    await fs.rename(skillPath, targetDir);

    // Cleanup temp
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    skillDir = targetDir;
  } else {
    throw new Error('Unsupported file type. Please provide a folder or ZIP file.');
  }

  // Return the imported skill meta
  const dirName = path.basename(skillDir);
  const parsedDir = await parseSkillDir(skillDir, dirName);
  if (!parsedDir) {
    throw new Error('Failed to parse imported skill');
  }

  const size = await getDirSize(skillDir);

  // Update plugin.json to include the new skill (only if hasSkill)
  await validateAndUpdatePluginJson();

  return {
    name: dirName,
    displayName: parsedDir.displayName,
    description: parsedDir.description,
    path: skillDir,
    source: 'user',
    size,
    category: parsedDir.category,
    tags: parsedDir.tags,
    version: parsedDir.version,
    author: parsedDir.author,
    preview: parsedDir.preview,
    projectType: parsedDir.projectType,
    hasSkill: parsedDir.hasSkill,
    hasApp: parsedDir.hasApp,
  };
}

/**
 * Check if directory is a valid skill (has SKILL.md or template.json)
 */
function isValidSkillDir(dirPath: string): boolean {
  const hasSkillMd = fsSync.existsSync(path.join(dirPath, 'SKILL.md'));
  const hasTemplateJson = fsSync.existsSync(path.join(dirPath, 'template.json'));
  return hasSkillMd || hasTemplateJson;
}

/**
 * Find directory containing SKILL.md or template.json (handles nested structures)
 */
async function findValidSkillDir(baseDir: string): Promise<string | null> {
  // Check if valid skill exists in base dir
  if (isValidSkillDir(baseDir)) {
    return baseDir;
  }

  // Check immediate subdirectories
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(baseDir, entry.name);
        if (isValidSkillDir(subDir)) {
          return subDir;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Copy directory recursively
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Delete a user skill (builtin skills cannot be deleted)
 */
export async function deleteSkill(skillName: string): Promise<void> {
  const skills = await getAllSkills();
  const skill = skills.find(s => s.name === skillName);

  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  if (skill.source === 'builtin') {
    throw new Error('Cannot delete builtin skills');
  }

  await fs.rm(skill.path, { recursive: true, force: true });

  // Update plugin.json to remove the deleted skill
  await validateAndUpdatePluginJson();
}

/**
 * Get skill paths for SDK plugins configuration
 * Reads from plugin.json (managed by validateAndUpdatePluginJson)
 */
export async function getEnabledSkillPaths(): Promise<string[]> {
  await ensureInitialized();

  // Read from plugin.json instead of regenerating every time
  const config = await readPluginConfig();
  if (!config || config.skills.length === 0) {
    return [];
  }

  // Return user-skills directory (parent of .claude-plugin)
  return [USER_SKILLS_DIR_ABSOLUTE];
}

/**
 * Get skill detail (read SKILL.md content)
 */
export async function getSkillDetail(skillName: string): Promise<{ meta: SkillMeta; content: string } | null> {
  const skills = await getAllSkills();
  const skill = skills.find(s => s.name === skillName);

  if (!skill) {
    return null;
  }

  try {
    const skillMdPath = path.join(skill.path, 'SKILL.md');
    const content = await fs.readFile(skillMdPath, 'utf-8');
    return { meta: skill, content };
  } catch {
    return null;
  }
}

/**
 * Toggle skill enabled/disabled status
 */
export async function toggleSkill(skillName: string, enabled: boolean): Promise<void> {
  const config = await readPluginConfig();
  if (!config) {
    throw new Error('Plugin config not found');
  }

  const extendedConfig = await readSkillExtendedConfig();
  const disabledSkills = extendedConfig.disabledSkills || [];
  const skillPath = `./${skillName}`;

  if (enabled) {
    // Enable: remove from disabled list, add to skills array
    const newDisabled = disabledSkills.filter(name => name !== skillName);
    if (!config.skills.includes(skillPath)) {
      config.skills.push(skillPath);
    }
    extendedConfig.disabledSkills = newDisabled.length > 0 ? newDisabled : undefined;
  } else {
    // Disable: add to disabled list, remove from skills array
    if (!disabledSkills.includes(skillName)) {
      disabledSkills.push(skillName);
    }
    config.skills = config.skills.filter(p => p !== skillPath);
    extendedConfig.disabledSkills = disabledSkills;
  }

  await writePluginConfig(config);
  await writeSkillExtendedConfig(extendedConfig);
  console.log(`[SkillService] Skill ${skillName} ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Check if a skill is enabled
 */
export async function isSkillEnabled(skillName: string): Promise<boolean> {
  const extendedConfig = await readSkillExtendedConfig();
  const disabledSkills = extendedConfig.disabledSkills || [];
  return !disabledSkills.includes(skillName);
}

/**
 * Get all skills with enabled status
 */
export async function getAllSkillsWithStatus(): Promise<(SkillMeta & { enabled: boolean })[]> {
  const skills = await getAllSkills();
  const extendedConfig = await readSkillExtendedConfig();
  const disabledSkills = extendedConfig.disabledSkills || [];

  return skills.map(skill => ({
    ...skill,
    enabled: !disabledSkills.includes(skill.name),
  }));
}

/**
 * Run a skill as a project (create/update project record and return projectId)
 * Only works for skills with hasApp=true
 */
export async function runSkill(skillName: string): Promise<{ projectId: string }> {
  const skills = await getAllSkills();
  const skill = skills.find(s => s.name === skillName);

  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  if (!skill.hasApp) {
    throw new Error(`Skill "${skillName}" does not support app mode (no projectType)`);
  }

  // Import db lazily to avoid circular dependency
  const { db } = await import('@/lib/db/client');
  const { projects } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const projectId = `skill-${skillName}`;
  const now = new Date().toISOString();

  // Check if project already exists
  const existing = await db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (existing) {
    // Update timestamps
    await db.update(projects)
      .set({ updatedAt: now, lastActiveAt: now })
      .where(eq(projects.id, projectId));
  } else {
    // Create new project record
    await db.insert(projects).values({
      id: projectId,
      name: skill.displayName || skill.name,
      description: skill.description,
      status: 'idle',
      mode: 'code',
      repoPath: skill.path,
      projectType: skill.projectType || 'python-fastapi',
      planConfirmed: true,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
  }

  return { projectId };
}

/**
 * Generate a short project ID (8 chars, same as frontend)
 */
function generateProjectId(): string {
  return `p-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Fork a skill to create a new project for customization
 * Copies skill files to projects directory and creates a new project record
 */
export async function forkSkill(skillName: string): Promise<{ projectId: string }> {
  const skills = await getAllSkills();
  const skill = skills.find(s => s.name === skillName);

  if (!skill) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  // Import db lazily to avoid circular dependency
  const { db } = await import('@/lib/db/client');
  const { projects } = await import('@/lib/db/schema');
  const { PROJECTS_DIR_ABSOLUTE } = await import('@/lib/config/paths');

  const projectId = generateProjectId();
  const now = new Date().toISOString();
  const targetPath = path.join(PROJECTS_DIR_ABSOLUTE, projectId);

  // Copy skill files to projects directory (skip .venv and node_modules)
  await copyDirSkipVenv(skill.path, targetPath);

  // Create project record
  await db.insert(projects).values({
    id: projectId,
    name: `${skill.displayName || skill.name} (Fork)`,
    description: skill.description,
    status: 'idle',
    mode: 'code',
    repoPath: targetPath,
    projectType: skill.projectType || 'python-fastapi',
    planConfirmed: true,
    fromTemplate: `skill:${skillName}`,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  });

  return { projectId };
}

/**
 * Copy directory recursively, skip .venv and node_modules
 */
async function copyDirSkipVenv(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    // Skip .venv and node_modules directories
    if (entry.name === '.venv' || entry.name === 'node_modules' || entry.name === '__pycache__') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirSkipVenv(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Get skill path by name
 */
function getSkillPathByName(skillName: string): string | null {
  // Priority: user-skills > builtin skills
  const userSkillPath = path.join(USER_SKILLS_DIR_ABSOLUTE, skillName);
  if (fsSync.existsSync(userSkillPath)) {
    return userSkillPath;
  }

  const builtinSkillPath = path.join(SKILLS_DIR_ABSOLUTE, skillName);
  if (fsSync.existsSync(builtinSkillPath)) {
    return builtinSkillPath;
  }

  return null;
}

/**
 * Read skill .env file
 */
export async function getSkillEnvVars(skillName: string): Promise<Record<string, string>> {
  const skillPath = getSkillPathByName(skillName);
  if (!skillPath) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  const envPath = path.join(skillPath, '.env');
  const result: Record<string, string> = {};

  try {
    if (!fsSync.existsSync(envPath)) {
      return result;
    }
    const content = await fs.readFile(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        result[key] = value;
      }
    }
  } catch (error) {
    console.error(`[SkillService] Error reading .env for ${skillName}:`, error);
  }

  return result;
}

/**
 * Save skill .env file
 */
export async function saveSkillEnvVars(skillName: string, vars: Record<string, string>): Promise<void> {
  const skillPath = getSkillPathByName(skillName);
  if (!skillPath) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  const envPath = path.join(skillPath, '.env');

  // Build .env content
  const lines: string[] = [];
  for (const [key, value] of Object.entries(vars)) {
    if (key && value !== undefined) {
      // Quote value if it contains special characters
      const needsQuotes = value.includes(' ') || value.includes('#') || value.includes('=');
      const quotedValue = needsQuotes ? `"${value}"` : value;
      lines.push(`${key}=${quotedValue}`);
    }
  }

  await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
  console.log(`[SkillService] Saved .env for ${skillName}`);
}

/**
 * File tree node interface
 */
export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

/**
 * Get skill file tree
 */
export async function getSkillFileTree(skillName: string): Promise<FileTreeNode> {
  const skillPath = getSkillPathByName(skillName);
  if (!skillPath) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  async function buildTree(dirPath: string, dirName: string): Promise<FileTreeNode> {
    const node: FileTreeNode = {
      name: dirName,
      type: 'directory',
      children: [],
    };

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      // Skip hidden files/dirs and large directories
      if (entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === '__pycache__' ||
          entry.name === '.venv') {
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const child = await buildTree(entryPath, entry.name);
        node.children!.push(child);
      } else {
        node.children!.push({
          name: entry.name,
          type: 'file',
        });
      }
    }

    return node;
  }

  return buildTree(skillPath, skillName);
}

/**
 * Get skill SKILL.md content
 */
export async function getSkillMdContent(skillName: string): Promise<string | null> {
  const skillPath = getSkillPathByName(skillName);
  if (!skillPath) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  const skillMdPath = path.join(skillPath, 'SKILL.md');
  try {
    if (!fsSync.existsSync(skillMdPath)) {
      return null;
    }
    return await fs.readFile(skillMdPath, 'utf-8');
  } catch {
    return null;
  }
}

