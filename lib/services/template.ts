/**
 * Template Service - Template management and project creation from templates
 */

import fs from 'fs/promises';
import path from 'path';
import { TEMPLATES_DIR_ABSOLUTE, PROJECTS_DIR_ABSOLUTE } from '@/lib/config/paths';
import { prisma } from '@/lib/db/client';

/**
 * Template Metadata Interface
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  createdAt?: string;
  preview?: string;
}

/**
 * Template with full path info
 */
export interface Template extends TemplateMetadata {
  templatePath: string;
  projectPath: string;
  hasPreview: boolean;
}

/**
 * In-memory cache for scanned templates
 */
let templatesCache: Template[] | null = null;
let lastScanTime: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Scan templates directory and load all templates
 */
export async function scanTemplates(): Promise<Template[]> {
  const now = Date.now();

  // Return cached results if still valid
  if (templatesCache && (now - lastScanTime) < CACHE_TTL) {
    return templatesCache;
  }

  const templates: Template[] = [];

  try {
    // Check if templates directory exists
    const dirExists = await fs.access(TEMPLATES_DIR_ABSOLUTE).then(() => true).catch(() => false);
    if (!dirExists) {
      console.log('[TemplateService] Templates directory not found:', TEMPLATES_DIR_ABSOLUTE);
      templatesCache = [];
      lastScanTime = now;
      return [];
    }

    // Read all subdirectories
    const entries = await fs.readdir(TEMPLATES_DIR_ABSOLUTE, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const templateId = entry.name;
      const templatePath = path.join(TEMPLATES_DIR_ABSOLUTE, templateId);
      const metadataPath = path.join(templatePath, 'template.json');
      const projectPath = path.join(templatePath, 'project');

      // Check if template.json exists
      const hasMetadata = await fs.access(metadataPath).then(() => true).catch(() => false);
      if (!hasMetadata) {
        console.warn(`[TemplateService] Skipping ${templateId}: missing template.json`);
        continue;
      }

      // Check if project directory exists
      const hasProject = await fs.access(projectPath).then(() => true).catch(() => false);
      if (!hasProject) {
        console.warn(`[TemplateService] Skipping ${templateId}: missing project/ directory`);
        continue;
      }

      // Read and parse metadata
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata: TemplateMetadata = JSON.parse(metadataContent);

        // Validate required fields
        if (!metadata.id || !metadata.name) {
          console.warn(`[TemplateService] Skipping ${templateId}: missing required fields (id, name)`);
          continue;
        }

        // Check if preview image exists
        const previewPath = metadata.preview
          ? path.join(templatePath, metadata.preview)
          : path.join(templatePath, 'preview.png');
        const hasPreview = await fs.access(previewPath).then(() => true).catch(() => false);

        templates.push({
          ...metadata,
          templatePath,
          projectPath,
          hasPreview,
        });

        console.log(`[TemplateService] ✅ Loaded template: ${metadata.name} (${templateId})`);
      } catch (error) {
        console.error(`[TemplateService] Failed to parse ${templateId}/template.json:`, error);
        continue;
      }
    }

    console.log(`[TemplateService] Scanned ${templates.length} templates`);
    templatesCache = templates;
    lastScanTime = now;

    return templates;
  } catch (error) {
    console.error('[TemplateService] Failed to scan templates:', error);
    templatesCache = [];
    lastScanTime = now;
    return [];
  }
}

/**
 * Get all available templates
 */
export async function getAllTemplates(): Promise<Template[]> {
  return await scanTemplates();
}

/**
 * Get template by ID
 */
export async function getTemplateById(templateId: string): Promise<Template | null> {
  const templates = await scanTemplates();
  return templates.find(t => t.id === templateId) || null;
}

/**
 * Copy directory recursively (including all files)
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Create project from template
 */
export async function createProjectFromTemplate(
  templateId: string,
  projectName?: string
): Promise<{ projectId: string; name: string }> {
  // Get template
  const template = await getTemplateById(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Generate project ID
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const projectId = `project-${timestamp}-${randomStr}`;

  // Use template name as default project name
  const finalProjectName = projectName || template.name;

  // Target project path
  const targetPath = path.join(PROJECTS_DIR_ABSOLUTE, projectId);

  try {
    // Copy entire project directory
    console.log(`[TemplateService] Copying template ${templateId} to ${projectId}...`);
    await copyDirectory(template.projectPath, targetPath);

    // Update package.json name if exists
    const packageJsonPath = path.join(targetPath, 'package.json');
    const hasPackageJson = await fs.access(packageJsonPath).then(() => true).catch(() => false);

    if (hasPackageJson) {
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        packageJson.name = projectId;
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        console.log(`[TemplateService] Updated package.json name to ${projectId}`);
      } catch (error) {
        console.warn(`[TemplateService] Failed to update package.json:`, error);
      }
    }

    // Create project record in database
    await prisma.project.create({
      data: {
        id: projectId,
        name: finalProjectName,
        description: `从模板创建: ${template.name}`,
        repoPath: targetPath,
        status: 'idle',
        templateType: 'nextjs',
        fromTemplate: templateId,
        lastActiveAt: new Date(),
      },
    });

    // Create welcome message
    const welcomeMessage = `🎉 **${template.name}** 项目已经复制成功！

您现在可以：
- 点击右侧 **▶ 启动** 按钮预览项目效果
- 在下方输入框中继续与 AI 对话，修改和完善代码
- 查看右侧项目文件，了解项目结构

开始探索和定制您的项目吧！`;

    await prisma.message.create({
      data: {
        projectId,
        role: 'assistant',
        messageType: 'chat',
        content: welcomeMessage,
        cliSource: 'system',
      },
    });

    console.log(`[TemplateService] ✅ Created project ${projectId} from template ${templateId}`);

    return {
      projectId,
      name: finalProjectName,
    };
  } catch (error) {
    // Cleanup on failure
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch {}

    console.error(`[TemplateService] Failed to create project from template:`, error);
    throw new Error(`Failed to create project from template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Invalidate templates cache (useful for development)
 */
export function invalidateTemplatesCache(): void {
  templatesCache = null;
  lastScanTime = 0;
  console.log('[TemplateService] Cache invalidated');
}
