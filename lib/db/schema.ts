import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('idle'),
  previewUrl: text('preview_url'),
  previewPort: integer('preview_port'),
  repoPath: text('repo_path'),
  initialPrompt: text('initial_prompt'),
  templateType: text('template_type'),
  fromTemplate: text('from_template'),
  projectType: text('project_type').notNull().default('nextjs'),
  activeClaudeSessionId: text('active_claude_session_id'),
  activeCursorSessionId: text('active_cursor_session_id'),
  preferredCli: text('preferred_cli'),
  selectedModel: text('selected_model'),
  fallbackEnabled: integer('fallback_enabled', { mode: 'boolean' }).notNull().default(false),
  planConfirmed: integer('plan_confirmed', { mode: 'boolean' }).notNull().default(false),
  settings: text('settings'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastActiveAt: text('last_active_at').notNull()
});

// Messages table
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  messageType: text('message_type').notNull(),
  content: text('content').notNull(),
  metadataJson: text('metadata_json'),
  parentMessageId: text('parent_message_id'),
  sessionId: text('session_id'),
  conversationId: text('conversation_id'),
  durationMs: integer('duration_ms'),
  tokenCount: integer('token_count'),
  costUsd: real('cost_usd'),
  commitSha: text('commit_sha'),
  cliSource: text('cli_source'),
  requestId: text('request_id'),
  createdAt: text('created_at').notNull()
}, (table) => ({
  projectIdIdx: index('idx_messages_project_id').on(table.projectId),
  sessionIdIdx: index('idx_messages_session_id').on(table.sessionId),
  createdAtIdx: index('idx_messages_created_at').on(table.createdAt),
  cliSourceIdx: index('idx_messages_cli_source').on(table.cliSource),
  requestIdIdx: index('idx_messages_request_id').on(table.requestId)
}));

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionType: text('session_type').notNull(),
  cliType: text('cli_type').notNull(),
  sessionId: text('session_id').notNull(),
  modelName: text('model_name'),
  contextTokens: integer('context_tokens'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  endedAt: text('ended_at')
}, (table) => ({
  projectIdIdx: index('idx_sessions_project_id').on(table.projectId),
  cliTypeIdx: index('idx_sessions_cli_type').on(table.cliType)
}));

// EnvVars table
export const envVars = sqliteTable('env_vars', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  valueEncrypted: text('value_encrypted').notNull(),
  scope: text('scope').notNull().default('runtime'),
  varType: text('var_type').notNull().default('string'),
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(true),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (table) => ({
  projectIdIdx: index('idx_env_vars_project_id').on(table.projectId),
  projectIdKeyUnique: uniqueIndex('env_vars_project_id_key_unique').on(table.projectId, table.key)
}));

// ProjectServiceConnections table
export const projectServiceConnections = sqliteTable('project_service_connections', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  status: text('status').notNull().default('connected'),
  serviceData: text('service_data').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastSyncAt: text('last_sync_at')
}, (table) => ({
  projectIdIdx: index('idx_connections_project_id').on(table.projectId),
  providerIdx: index('idx_connections_provider').on(table.provider)
}));

// Commits table
export const commits = sqliteTable('commits', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sha: text('sha').notNull(),
  message: text('message').notNull(),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull(),
  committedAt: text('committed_at').notNull(),
  createdAt: text('created_at').notNull()
}, (table) => ({
  projectIdIdx: index('idx_commits_project_id').on(table.projectId),
  committedAtIdx: index('idx_commits_committed_at').on(table.committedAt)
}));

// ToolUsages table
export const toolUsages = sqliteTable('tool_usages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  messageId: text('message_id').references(() => messages.id),
  toolName: text('tool_name').notNull(),
  toolInput: text('tool_input').notNull(),
  toolOutput: text('tool_output'),
  error: text('error'),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').notNull()
}, (table) => ({
  projectIdIdx: index('idx_tool_usages_project_id').on(table.projectId),
  messageIdIdx: index('idx_tool_usages_message_id').on(table.messageId),
  toolNameIdx: index('idx_tool_usages_tool_name').on(table.toolName)
}));

// UserRequests table
export const userRequests = sqliteTable('user_requests', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  instruction: text('instruction').notNull(),
  cliPreference: text('cli_preference'),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
  cancelRequestedAt: text('cancel_requested_at'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at')
}, (table) => ({
  projectIdIdx: index('idx_user_requests_project_id').on(table.projectId),
  statusIdx: index('idx_user_requests_status').on(table.status)
}));

// ServiceTokens table
export const serviceTokens = sqliteTable('service_tokens', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  token: text('token').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastUsed: text('last_used')
}, (table) => ({
  providerIdx: index('idx_service_tokens_provider').on(table.provider)
}));
