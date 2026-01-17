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
  getSkillSettingsPath,
} from '@/lib/config/paths';

export interface SkillMeta {
  name: string;
  description: string;
  path: string;
  source: 'builtin' | 'user';
  size: number;
  enabled: boolean;
}

interface SkillSettings {
  disabled: string[];
}

/**
 * Get skill settings (disabled list)
 */
async function getSkillSettings(): Promise<SkillSettings> {
  const settingsPath = getSkillSettingsPath();
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content) as SkillSettings;
  } catch {
    return { disabled: [] };
  }
}

/**
 * Save skill settings
 */
async function saveSkillSettings(settings: SkillSettings): Promise<void> {
  const settingsPath = getSkillSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
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
 * Parse SKILL.md frontmatter
 */
async function parseSkillMd(skillPath: string): Promise<{ name: string; description: string } | null> {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  try {
    const content = await fs.readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);
    if (data.name && data.description) {
      return {
        name: String(data.name),
        description: String(data.description),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Scan skills from a directory
 */
async function scanSkillsFromDir(
  dirPath: string,
  source: 'builtin' | 'user',
  disabledList: string[]
): Promise<SkillMeta[]> {
  const skills: SkillMeta[] = [];

  try {
    if (!fsSync.existsSync(dirPath)) {
      return skills;
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(dirPath, entry.name);
      const parsed = await parseSkillMd(skillPath);

      if (parsed) {
        const size = await getDirSize(skillPath);
        skills.push({
          name: parsed.name,
          description: parsed.description,
          path: skillPath,
          source,
          size,
          enabled: !disabledList.includes(parsed.name),
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
  const settings = await getSkillSettings();
  const disabledList = settings.disabled || [];

  // Scan builtin skills
  const builtinSkills = await scanSkillsFromDir(SKILLS_DIR_ABSOLUTE, 'builtin', disabledList);

  // Scan user skills
  const userSkills = await scanSkillsFromDir(USER_SKILLS_DIR_ABSOLUTE, 'user', disabledList);

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
 */
export async function importSkill(sourcePath: string): Promise<SkillMeta> {
  const stat = await fs.stat(sourcePath);
  let skillDir: string;

  if (stat.isDirectory()) {
    // Import from folder
    const parsed = await parseSkillMd(sourcePath);
    if (!parsed) {
      throw new Error('Invalid skill: SKILL.md not found or missing name/description');
    }

    // Copy to user skills directory
    const targetDir = path.join(USER_SKILLS_DIR_ABSOLUTE, parsed.name);
    await copyDir(sourcePath, targetDir);
    skillDir = targetDir;
  } else if (sourcePath.endsWith('.zip')) {
    // Import from ZIP
    const zip = new AdmZip(sourcePath);
    const tempDir = path.join(USER_SKILLS_DIR_ABSOLUTE, `_temp_${Date.now()}`);
    zip.extractAllTo(tempDir, true);

    // Find SKILL.md in extracted contents
    const skillPath = await findSkillMdDir(tempDir);
    if (!skillPath) {
      await fs.rm(tempDir, { recursive: true, force: true });
      throw new Error('Invalid ZIP: SKILL.md not found');
    }

    const parsed = await parseSkillMd(skillPath);
    if (!parsed) {
      await fs.rm(tempDir, { recursive: true, force: true });
      throw new Error('Invalid skill: SKILL.md missing name/description');
    }

    // Move to final location
    const targetDir = path.join(USER_SKILLS_DIR_ABSOLUTE, parsed.name);
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
  const parsed = await parseSkillMd(skillDir);
  if (!parsed) {
    throw new Error('Failed to parse imported skill');
  }

  const size = await getDirSize(skillDir);
  return {
    name: parsed.name,
    description: parsed.description,
    path: skillDir,
    source: 'user',
    size,
    enabled: true,
  };
}

/**
 * Find directory containing SKILL.md (handles nested structures)
 */
async function findSkillMdDir(baseDir: string): Promise<string | null> {
  // Check if SKILL.md exists in base dir
  const directPath = path.join(baseDir, 'SKILL.md');
  if (fsSync.existsSync(directPath)) {
    return baseDir;
  }

  // Check immediate subdirectories
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(baseDir, entry.name, 'SKILL.md');
        if (fsSync.existsSync(subPath)) {
          return path.join(baseDir, entry.name);
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

  // Also remove from disabled list if present
  const settings = await getSkillSettings();
  settings.disabled = settings.disabled.filter(name => name !== skillName);
  await saveSkillSettings(settings);
}

/**
 * Set skill enabled/disabled state
 */
export async function setSkillEnabled(skillName: string, enabled: boolean): Promise<void> {
  const settings = await getSkillSettings();

  if (enabled) {
    // Remove from disabled list
    settings.disabled = settings.disabled.filter(name => name !== skillName);
  } else {
    // Add to disabled list
    if (!settings.disabled.includes(skillName)) {
      settings.disabled.push(skillName);
    }
  }

  await saveSkillSettings(settings);
}

/**
 * Get enabled skill paths for SDK plugins configuration
 * Creates plugin wrapper directories with .claude-plugin/marketplace.json
 * Uses symlinks to create correct relative path structure
 */
export async function getEnabledSkillPaths(): Promise<string[]> {
  const skills = await getAllSkills();
  const enabledSkills = skills.filter(s => s.enabled);

  if (enabledSkills.length === 0) {
    return [];
  }

  // Create plugin wrapper with skills subdirectory
  const wrapperDir = path.join(USER_SKILLS_DIR_ABSOLUTE, '.plugin-wrapper');
  const pluginDir = path.join(wrapperDir, '.claude-plugin');
  const skillsDir = path.join(wrapperDir, 'skills');

  // Ensure directories exist
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });

  // Create symlinks for each skill and collect relative paths
  const skillsRelativePaths: string[] = [];

  for (const skill of enabledSkills) {
    const linkPath = path.join(skillsDir, skill.name);

    // Remove existing symlink if present
    try {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        await fs.rm(linkPath, { recursive: true, force: true });
      }
    } catch {
      // Link doesn't exist, that's fine
    }

    // Create symlink to skill directory
    // Windows: use 'junction' (no admin required), others: use 'dir'
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await fs.symlink(skill.path, linkPath, linkType);
    skillsRelativePaths.push(`./skills/${skill.name}`);
  }

  // Create marketplace.json
  const manifest = {
    name: 'goodable-skills',
    metadata: {
      description: 'Goodable managed skills',
      version: '1.0.0'
    },
    plugins: [
      {
        name: 'skills',
        description: 'User enabled skills',
        source: './',
        strict: false,
        skills: skillsRelativePaths
      }
    ]
  };

  await fs.writeFile(
    path.join(pluginDir, 'marketplace.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  console.log(`[SkillService] Created plugin wrapper with ${enabledSkills.length} skills:`, skillsRelativePaths);

  return [wrapperDir];
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
