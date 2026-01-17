import type { CLIType } from './cli';

export type ProjectStatus =
  | 'idle'
  | 'preview_running'
  | 'building'
  | 'initializing'
  | 'active'
  | 'failed'
  | 'running'
  | 'stopped'
  | 'error';

export interface ServiceConnection {
  connected: boolean;
  status: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  previewUrl?: string | null;
  previewPort?: number | null;
  createdAt: string;
  updatedAt?: string;
  lastActiveAt?: string | null;
  lastMessageAt?: string | null;
  initialPrompt?: string | null;
  services?: {
    github?: ServiceConnection;
    supabase?: ServiceConnection;
    vercel?: ServiceConnection;
  };
  preferredCli?: CLIType | null;
  selectedModel?: string | null;
  fallbackEnabled?: boolean;
  planConfirmed?: boolean;
  dependenciesInstalled?: boolean;
  projectType?: string; // nextjs | python-fastapi | default
  absolutePath?: string; // 项目在服务器上的绝对路径
  mode?: 'code' | 'work'; // 项目模式
  work_directory?: string | null; // work 模式的工作目录
  employee_id?: string | null; // 关联的数字员工 ID
  latestRequestStatus?: string | null; // 最新 userRequest 的状态
  deployedUrl?: string | null; // 阿里云 FC 部署地址
}

export interface ProjectSettings {
  preferredCli: CLIType;
  fallbackEnabled: boolean;
  selectedModel?: string | null;
}
