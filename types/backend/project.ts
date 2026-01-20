/**
 * Project-related types
 */

export type ProjectStatus = 'idle' | 'running' | 'stopped' | 'error';

export type TemplateType = 'nextjs' | 'react' | 'vue' | 'custom';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  /**
   * Preview metadata (nullable when no dev server is running).
   */
  previewUrl?: string | null;
  previewPort?: number | null;
  repoPath?: string;
  initialPrompt?: string;
  templateType?: TemplateType;
  projectType?: string; // 'nextjs' | 'python-fastapi'
  mode?: 'code' | 'work'; // 项目模式
  work_directory?: string | null; // work 模式的工作目录
  employee_id?: string | null; // 关联的数字员工 ID
  activeClaudeSessionId?: string | null;
  activeCursorSessionId?: string | null;
  preferredCli?: string;
  selectedModel?: string;
  permissionMode?: PermissionMode; // SDK permission mode
  fallbackEnabled: boolean;
  planConfirmed?: boolean;
  dependenciesInstalled?: boolean;
  settings?: string; // JSON string
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  latestRequestStatus?: string | null; // 最新 userRequest 的状态
  deployedUrl?: string | null; // 阿里云 FC 部署地址
}

export interface CreateProjectInput {
  project_id: string;
  name: string;
  initialPrompt: string;
  preferredCli?: string;
  selectedModel?: string;
  description?: string;
  projectType?: string;
  mode?: 'code' | 'work';
  work_directory?: string;
  employee_id?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  /**
   * Legacy preview metadata retained for backward compatibility.
   */
  previewUrl?: string | null;
  previewPort?: number | null;
  preferredCli?: string;
  selectedModel?: string;
  permissionMode?: PermissionMode;
  settings?: string;
  activeClaudeSessionId?: string | null;
  activeCursorSessionId?: string | null;
  repoPath?: string | null;
  planConfirmed?: boolean;
  dependenciesInstalled?: boolean;
  work_directory?: string;
}

export interface ProjectSettings {
  theme?: 'light' | 'dark' | 'system';
  autoSave?: boolean;
  [key: string]: any;
}
