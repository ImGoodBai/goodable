/**
 * Project Type Definitions
 */

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'idle' | 'preview_running' | 'building' | 'initializing' | 'active' | 'failed';
  preview_url?: string;
  created_at: string;
  last_active_at?: string;
  last_message_at?: string;
  initial_prompt?: string;
  services?: {
    github?: ServiceConnection;
    supabase?: ServiceConnection;
    vercel?: ServiceConnection;
  };
}

export interface ServiceConnection {
  connected: boolean;
  status: string;
}

export interface ProjectSettings {
  preferred_cli: CLIType;
  fallback_enabled: boolean;
  selected_model?: string;
}

export type CLIType = 'claude' | 'cursor' | 'qwen' | 'gemini' | 'codex';