-- Initial schema migration from Prisma
-- All timestamp fields use DATETIME type with DEFAULT CURRENT_TIMESTAMP
-- Application layer should explicitly set timestamps using new Date().toISOString()

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  preview_url TEXT,
  preview_port INTEGER,
  repo_path TEXT,
  initial_prompt TEXT,
  template_type TEXT,
  from_template TEXT,
  project_type TEXT NOT NULL DEFAULT 'nextjs',
  active_claude_session_id TEXT,
  active_cursor_session_id TEXT,
  preferred_cli TEXT,
  selected_model TEXT,
  fallback_enabled INTEGER NOT NULL DEFAULT 0,
  plan_confirmed INTEGER NOT NULL DEFAULT 0,
  settings TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  parent_message_id TEXT,
  session_id TEXT,
  conversation_id TEXT,
  duration_ms INTEGER,
  token_count INTEGER,
  cost_usd REAL,
  commit_sha TEXT,
  cli_source TEXT,
  request_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_type TEXT NOT NULL,
  cli_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  model_name TEXT,
  context_tokens INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- EnvVars table
CREATE TABLE IF NOT EXISTS env_vars (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'runtime',
  var_type TEXT NOT NULL DEFAULT 'string',
  is_secret INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, key)
);

-- ProjectServiceConnections table
CREATE TABLE IF NOT EXISTS project_service_connections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  service_data TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sync_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Commits table
CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sha TEXT NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  committed_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ToolUsages table
CREATE TABLE IF NOT EXISTS tool_usages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  message_id TEXT,
  tool_name TEXT NOT NULL,
  tool_input TEXT NOT NULL,
  tool_output TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

-- UserRequests table
CREATE TABLE IF NOT EXISTS user_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  instruction TEXT NOT NULL,
  cli_preference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  cancel_requested_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ServiceTokens table
CREATE TABLE IF NOT EXISTS service_tokens (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME
);

-- Indexes for Messages
CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_cli_source ON messages(cli_source);
CREATE INDEX IF NOT EXISTS idx_messages_request_id ON messages(request_id);

-- Indexes for Sessions
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cli_type ON sessions(cli_type);

-- Indexes for EnvVars
CREATE INDEX IF NOT EXISTS idx_env_vars_project_id ON env_vars(project_id);

-- Indexes for ProjectServiceConnections
CREATE INDEX IF NOT EXISTS idx_connections_project_id ON project_service_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_connections_provider ON project_service_connections(provider);

-- Indexes for Commits
CREATE INDEX IF NOT EXISTS idx_commits_project_id ON commits(project_id);
CREATE INDEX IF NOT EXISTS idx_commits_committed_at ON commits(committed_at);

-- Indexes for ToolUsages
CREATE INDEX IF NOT EXISTS idx_tool_usages_project_id ON tool_usages(project_id);
CREATE INDEX IF NOT EXISTS idx_tool_usages_message_id ON tool_usages(message_id);
CREATE INDEX IF NOT EXISTS idx_tool_usages_tool_name ON tool_usages(tool_name);

-- Indexes for UserRequests
CREATE INDEX IF NOT EXISTS idx_user_requests_project_id ON user_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status);

-- Indexes for ServiceTokens
CREATE INDEX IF NOT EXISTS idx_service_tokens_provider ON service_tokens(provider);
