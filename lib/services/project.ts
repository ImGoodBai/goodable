/**
 * Project Service - Project management logic
 */

import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/backend';
import fs from 'fs/promises';
import path from 'path';
import { normalizeModelId, getDefaultModelForCli } from '@/lib/constants/cliModels';
import { PROJECTS_DIR_ABSOLUTE } from '@/lib/config/paths';

/**
 * Retrieve all projects
 */
export async function getAllProjects(): Promise<Project[]> {
  const result = await db.select()
    .from(projects)
    .orderBy(desc(projects.lastActiveAt));

  return result.map(project => ({
    ...project,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
  })) as Project[];
}

/**
 * Retrieve project by ID
 */
export async function getProjectById(id: string): Promise<Project | null> {
  const result = await db.select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!result[0]) return null;

  return {
    ...result[0],
    selectedModel: normalizeModelId(result[0].preferredCli ?? 'claude', result[0].selectedModel ?? undefined),
  } as Project;
}

/**
 * Create new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  // Create project directory
  const projectPath = path.join(PROJECTS_DIR_ABSOLUTE, input.project_id);
  await fs.mkdir(projectPath, { recursive: true });

  const nowIso = new Date().toISOString();

  // Create project in database
  const [project] = await db.insert(projects)
    .values({
      id: input.project_id,
      name: input.name,
      description: input.description ?? null,
      initialPrompt: input.initialPrompt ?? null,
      repoPath: projectPath,
      preferredCli: input.preferredCli || 'claude',
      selectedModel: normalizeModelId(input.preferredCli || 'claude', input.selectedModel ?? getDefaultModelForCli(input.preferredCli || 'claude')),
      status: 'idle',
      templateType: 'nextjs',
      projectType: input.projectType || 'nextjs',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastActiveAt: nowIso,
      previewUrl: null,
      previewPort: null,
    })
    .returning();

  console.log(`[ProjectService] Created project: ${project.id}`);
  return {
    ...project,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
  } as Project;
}

/**
 * Update project
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput
): Promise<Project> {
  const existing = await db.select({ preferredCli: projects.preferredCli })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  const targetCli = input.preferredCli ?? existing[0]?.preferredCli ?? 'claude';
  const normalizedModel = input.selectedModel
    ? normalizeModelId(targetCli, input.selectedModel)
    : undefined;

  const [project] = await db.update(projects)
    .set({
      ...input,
      ...(input.selectedModel
        ? { selectedModel: normalizedModel }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, id))
    .returning();

  console.log(`[ProjectService] Updated project: ${id}`);
  return {
    ...project,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
  } as Project;
}

/**
 * Delete project
 */
export async function deleteProject(id: string): Promise<void> {
  // Delete project directory
  const project = await getProjectById(id);
  if (project?.repoPath) {
    try {
      await fs.rm(project.repoPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[ProjectService] Failed to delete project directory:`, error);
    }
  }

  // Delete project from database (related data automatically deleted via Cascade)
  await db.delete(projects)
    .where(eq(projects.id, id));

  console.log(`[ProjectService] Deleted project: ${id}`);
}

/**
 * Update project activity time
 */
export async function updateProjectActivity(id: string): Promise<void> {
  await db.update(projects)
    .set({
      lastActiveAt: new Date().toISOString(),
    })
    .where(eq(projects.id, id));
}

/**
 * Update project status
 */
export async function updateProjectStatus(
  id: string,
  status: 'idle' | 'running' | 'stopped' | 'error'
): Promise<void> {
  await db.update(projects)
    .set({
      status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, id));
  console.log(`[ProjectService] Updated project status: ${id} -> ${status}`);
}

export interface ProjectCliPreference {
  preferredCli: string;
  fallbackEnabled: boolean;
  selectedModel: string | null;
}

export async function getProjectCliPreference(projectId: string): Promise<ProjectCliPreference | null> {
  const result = await db.select({
    preferredCli: projects.preferredCli,
    fallbackEnabled: projects.fallbackEnabled,
    selectedModel: projects.selectedModel,
  })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!result[0]) {
    return null;
  }

  return {
    preferredCli: result[0].preferredCli ?? 'claude',
    fallbackEnabled: result[0].fallbackEnabled ?? false,
    selectedModel: normalizeModelId(result[0].preferredCli ?? 'claude', result[0].selectedModel ?? undefined),
  };
}

export async function updateProjectCliPreference(
  projectId: string,
  input: Partial<ProjectCliPreference>
): Promise<ProjectCliPreference> {
  const existing = await db.select({ preferredCli: projects.preferredCli })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const targetCli = input.preferredCli ?? existing[0]?.preferredCli ?? 'claude';

  const [result] = await db.update(projects)
    .set({
      ...(input.preferredCli ? { preferredCli: input.preferredCli } : {}),
      ...(typeof input.fallbackEnabled === 'boolean'
        ? { fallbackEnabled: input.fallbackEnabled }
        : {}),
      ...(input.selectedModel
        ? { selectedModel: normalizeModelId(targetCli, input.selectedModel) }
        : input.selectedModel === null
          ? { selectedModel: null }
          : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, projectId))
    .returning({
      preferredCli: projects.preferredCli,
      fallbackEnabled: projects.fallbackEnabled,
      selectedModel: projects.selectedModel,
    });

  return {
    preferredCli: result.preferredCli ?? 'claude',
    fallbackEnabled: result.fallbackEnabled ?? false,
    selectedModel: normalizeModelId(result.preferredCli ?? 'claude', result.selectedModel ?? undefined),
  };
}
