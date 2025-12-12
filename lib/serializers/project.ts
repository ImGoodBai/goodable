import type { Project as ProjectEntity } from '@/types/backend';
import type { Project } from '@/types';
import path from 'path';
import { PROJECTS_DIR_ABSOLUTE } from '@/lib/config/paths';

export function serializeProject(project: ProjectEntity): Project {
  // 计算项目绝对路径（跨平台兼容）
  const absolutePath = path.normalize(path.join(PROJECTS_DIR_ABSOLUTE, project.id));

  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    status: project.status,
    previewUrl: project.previewUrl ?? null,
    previewPort: project.previewPort ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    lastActiveAt: project.lastActiveAt ? project.lastActiveAt.toISOString() : null,
    initialPrompt: project.initialPrompt ?? null,
    preferredCli: (project.preferredCli ?? null) as Project['preferredCli'],
    selectedModel: project.selectedModel ?? null,
    fallbackEnabled: project.fallbackEnabled,
    planConfirmed: (project as any).planConfirmed ?? false,
    absolutePath, // 添加项目绝对路径
  };
}

export function serializeProjects(projects: ProjectEntity[]): Project[] {
  return projects.map((project) => serializeProject(project));
}
