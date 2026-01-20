/**
 * Claude Agent SDK Service - Claude Agent SDK Integration
 *
 * Interacts with projects using the Claude Agent SDK.
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeSession, ClaudeResponse } from '@/types/backend';
import { streamManager } from '../stream';
import { serializeMessage, createRealtimeMessage } from '@/lib/serializers/chat';
import { updateProject, getProjectById } from '../project';
import { createMessage } from '../message';
import { CLAUDE_DEFAULT_MODEL, normalizeClaudeModelId, getClaudeModelDisplayName } from '@/lib/constants/claudeModels';
import { previewManager } from '../preview';
import { PROJECTS_DIR_ABSOLUTE, getClaudeCodeExecutablePath, getBuiltinNodeDir, getBuiltinGitDir, getBuiltinGitBashPath } from '@/lib/config/paths';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  markUserRequestAsRunning,
  markUserRequestAsCompleted,
  markUserRequestAsFailed,
  markUserRequestAsPlanning,
  markUserRequestAsWaitingApproval,
  requestCancelForUserRequest,
} from '@/lib/services/user-requests';
import { isCancelRequested } from '@/lib/services/user-requests';
import { timelineLogger } from '@/lib/services/timeline';
import { scaffoldBasicNextApp } from '@/lib/utils/scaffold';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionMode } from '@/types/backend/project';
import { shouldAutoApprove, logPermissionDecision } from '@/lib/services/permissions';

type ToolAction = 'Edited' | 'Created' | 'Read' | 'Deleted' | 'Generated' | 'Searched' | 'Executed';

const __VERBOSE_LOG__ = (process.env.LOG_LEVEL || '').toLowerCase() === 'verbose';

// System prompts moved to lib/config/prompts/
// Import from there for hot-reloadable prompts

// 全局Map存储正在执行的query实例，用于中断
const activeQueryInstances = new Map<string, Query>();

const TOOL_NAME_ACTION_MAP: Record<string, ToolAction> = {
  read: 'Read',
  read_file: 'Read',
  'read-file': 'Read',
  write: 'Created',
  write_file: 'Created',
  'write-file': 'Created',
  create_file: 'Created',
  edit: 'Edited',
  edit_file: 'Edited',
  'edit-file': 'Edited',
  update_file: 'Edited',
  apply_patch: 'Edited',
  patch_file: 'Edited',
  remove_file: 'Deleted',
  delete_file: 'Deleted',
  delete: 'Deleted',
  remove: 'Deleted',
  list_files: 'Searched',
  list: 'Searched',
  ls: 'Searched',
  glob: 'Searched',
  glob_files: 'Searched',
  search_files: 'Searched',
  grep: 'Searched',
  bash: 'Executed',
  run: 'Executed',
  run_bash: 'Executed',
  shell: 'Executed',
  todo_write: 'Generated',
  todo: 'Generated',
  plan_write: 'Generated',
};

const normalizeAction = (value: unknown): ToolAction | undefined => {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim().toLowerCase();
  if (!candidate) return undefined;
  if (candidate.includes('edit') || candidate.includes('modify') || candidate.includes('update') || candidate.includes('patch')) {
    return 'Edited';
  }
  if (candidate.includes('write') || candidate.includes('create') || candidate.includes('add') || candidate.includes('append')) {
    return 'Created';
  }
  if (candidate.includes('read') || candidate.includes('open') || candidate.includes('view')) {
    return 'Read';
  }
  if (candidate.includes('delete') || candidate.includes('remove')) {
    return 'Deleted';
  }
  if (
    candidate.includes('search') ||
    candidate.includes('find') ||
    candidate.includes('list') ||
    candidate.includes('glob') ||
    candidate.includes('ls') ||
    candidate.includes('grep')
  ) {
    return 'Searched';
  }
  if (candidate.includes('generate') || candidate.includes('todo') || candidate.includes('plan')) {
    return 'Generated';
  }
  if (
    candidate.includes('execute') ||
    candidate.includes('exec') ||
    candidate.includes('run') ||
    candidate.includes('bash') ||
    candidate.includes('shell') ||
    candidate.includes('command')
  ) {
    return 'Executed';
  }
  return undefined;
};

const inferActionFromToolName = (toolName: unknown): ToolAction | undefined => {
  if (typeof toolName !== 'string') return undefined;
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return undefined;
  if (TOOL_NAME_ACTION_MAP[normalized]) {
    return TOOL_NAME_ACTION_MAP[normalized];
  }
  const suffix = normalized.split(':').pop() ?? normalized;
  if (suffix && TOOL_NAME_ACTION_MAP[suffix]) {
    return TOOL_NAME_ACTION_MAP[suffix];
  }
  return normalizeAction(normalized);
};

const pickFirstString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = pickFirstString(entry);
      if (candidate) return candidate;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const nestedKeys = ['path', 'filepath', 'filePath', 'file_path', 'target', 'value'];
    for (const key of nestedKeys) {
      if (key in obj) {
        const candidate = pickFirstString(obj[key]);
        if (candidate) return candidate;
      }
    }
  }
  return undefined;
};

const extractPathFromInput = (input: unknown, action?: ToolAction): string | undefined => {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const candidateKeys = [
    'filePath',
    'file_path',
    'filepath',
    'path',
    'targetPath',
    'target_path',
    'target',
    'targets',
    'fullPath',
    'full_path',
    'destination',
    'destinationPath',
    'outputPath',
    'output_path',
    'glob',
    'pattern',
    'directory',
    'dir',
    'filename',
    'name',
  ];

  for (const key of candidateKeys) {
    if (key in record) {
      const result = pickFirstString(record[key]);
      if (result) {
        return result;
      }
    }
  }

  if (Array.isArray(record.targets)) {
    for (const target of record.targets as unknown[]) {
      const candidate = pickFirstString(target);
      if (candidate) {
        return candidate;
      }
    }
  }

  if (!action || action === 'Executed') {
    const commandKeys = ['command', 'cmd', 'shellCommand', 'shell_command'];
    for (const key of commandKeys) {
      if (key in record) {
        const candidate = pickFirstString(record[key]);
        if (candidate) {
          return candidate;
        }
      }
    }
  }

  return undefined;
};

/**
 * Normalize SDK temporary paths to actual project paths
 * SDK may return paths like /tmp/tmp_xxxx/file.js which should be replaced with actual project path
 */
const normalizeSdkPath = (rawPath: string, projectPath?: string): string => {
  if (!rawPath || typeof rawPath !== 'string') {
    return rawPath;
  }

  // Match SDK temporary directory pattern: /tmp/tmp_xxxxx/...
  const tmpMatch = rawPath.match(/^\/tmp\/tmp_[a-z0-9]+\/(.+)$/i);
  if (tmpMatch && tmpMatch[1] && projectPath) {
    // Replace /tmp/tmp_xxxx/ with actual project path
    return path.join(projectPath, tmpMatch[1]);
  }

  return rawPath;
};

const buildToolMetadata = (block: Record<string, unknown>, projectPath?: string): Record<string, unknown> => {
  const metadata: Record<string, unknown> = {};
  const toolName = pickFirstString(block.name) ?? (typeof block.name === 'string' ? block.name : undefined);
  const toolInput = block.input;
  const inputRecord = toolInput && typeof toolInput === 'object' ? (toolInput as Record<string, unknown>) : undefined;

  if (toolName) {
    metadata.toolName = toolName;
  }

  if (toolInput !== undefined) {
    metadata.toolInput = toolInput;
  }

  let action =
    normalizeAction(block.action) ??
    normalizeAction(block.operation) ??
    (inputRecord ? normalizeAction(inputRecord.action) ?? normalizeAction(inputRecord.operation) : undefined) ??
    inferActionFromToolName(toolName);

  const directPath =
    pickFirstString(block.filePath) ??
    pickFirstString(block.file_path) ??
    pickFirstString(block.targetPath) ??
    pickFirstString(block.target_path) ??
    pickFirstString(block.path);

  let filePath = directPath ?? extractPathFromInput(toolInput, action);

  if (!filePath && inputRecord) {
    filePath =
      extractPathFromInput(inputRecord, action) ??
      pickFirstString(inputRecord.filePath) ??
      pickFirstString(inputRecord.file_path);
  }

  if (!filePath && inputRecord) {
    const command =
      pickFirstString(inputRecord.command) ??
      pickFirstString(inputRecord.cmd) ??
      pickFirstString(inputRecord.shellCommand) ??
      pickFirstString(inputRecord.shell_command);
    if (command) {
      metadata.command = command;
      filePath = command;
      if (!action) {
        action = 'Executed';
      }
    }
  }

  // Normalize SDK temporary paths to actual project paths
  if (filePath) {
    metadata.filePath = normalizeSdkPath(filePath, projectPath);
  }

  if (action) {
    metadata.action = action;
  }

  const summary =
    pickFirstString(block.summary) ??
    pickFirstString(block.description) ??
    pickFirstString(block.result) ??
    pickFirstString(block.resultSummary) ??
    pickFirstString(block.result_summary) ??
    (inputRecord ? pickFirstString(inputRecord.summary) ?? pickFirstString(inputRecord.description) : undefined) ??
    pickFirstString(block.diff) ??
    pickFirstString(block.diffInfo) ??
    pickFirstString(block.diff_info);

  if (summary) {
    metadata.summary = summary;
  }

  return metadata;
};

interface ToolPlaceholderDetails {
  raw: string;
  toolName?: string;
  target?: string;
  summary?: string;
  action?: ToolAction;
  isResult: boolean;
}

const parseToolPlaceholderText = (text: string): ToolPlaceholderDetails | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  let toolName: string | undefined;
  let target: string | undefined;
  let summary: string | undefined;
  let isResult = false;

  const bracketMatch = trimmed.match(/^\[Tool:\s*([^\]\n]+)\s*\](.*)$/i);
  if (bracketMatch) {
    toolName = bracketMatch[1]?.trim();
    const trailing = bracketMatch[2]?.trim();
    if (trailing) {
      target = trailing;
    }
  }

  const usingToolMatch = trimmed.match(/^Using tool:\s*([^\n]+?)(?:\s+on\s+(.+))?$/i);
  if (usingToolMatch) {
    toolName = toolName ?? usingToolMatch[1]?.trim();
    const maybeTarget = usingToolMatch[2]?.trim();
    if (maybeTarget) {
      target = maybeTarget;
    }
  }

  const toolResultMatch = trimmed.match(/^Tool result:\s*(.+)$/i);
  if (toolResultMatch) {
    summary = toolResultMatch[1]?.trim() || undefined;
    isResult = true;
  }

  if (!toolName && !target && !summary) {
    return null;
  }

  const action = inferActionFromToolName(toolName) ?? (isResult ? undefined : 'Executed');

  return {
    raw: trimmed,
    toolName,
    target,
    summary,
    action,
    isResult,
  };
};

const buildMetadataFromPlaceholder = (details: ToolPlaceholderDetails): Record<string, unknown> => {
  const metadata: Record<string, unknown> = {};

  if (details.toolName) {
    metadata.toolName = details.toolName;
    metadata.tool_name = details.toolName;
  }

  if (details.target) {
    metadata.filePath = details.target;
    metadata.file_path = details.target;
  }

  if (details.summary) {
    metadata.summary = details.summary;
  }

  const action = details.action ?? inferActionFromToolName(details.toolName);
  if (action) {
    metadata.action = action;
  }

  metadata.placeholderType = details.isResult ? 'result' : 'start';

  return metadata;
};

const mergeMetadata = (
  base: Record<string, unknown> | undefined,
  extension: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(extension)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

const normalizeSignatureValue = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : '';
};

const computeToolMessageSignature = (
  metadata: Record<string, unknown>,
  content: string,
  messageType: 'tool_use' | 'tool_result' = 'tool_use'
): string => {
  const meta = metadata ?? {};
  const toolName =
    pickFirstString(meta.toolName) ?? pickFirstString(meta.tool_name);
  const filePath =
    pickFirstString(meta.filePath) ??
    pickFirstString(meta.file_path) ??
    pickFirstString(meta.targetPath) ??
    pickFirstString(meta.target_path);
  const summary =
    pickFirstString(meta.summary) ??
    pickFirstString(meta.resultSummary) ??
    pickFirstString(meta.result_summary) ??
    pickFirstString(meta.description);
  const command = pickFirstString(meta.command);
  const action = pickFirstString(meta.action);

  return [
    normalizeSignatureValue(messageType),
    normalizeSignatureValue(toolName),
    normalizeSignatureValue(filePath),
    normalizeSignatureValue(summary),
    normalizeSignatureValue(command),
    normalizeSignatureValue(action),
    normalizeSignatureValue(content),
  ].join('|');
};

const createToolMessageContent = (details: ToolPlaceholderDetails): string => {
  if (details.isResult && details.summary) {
    return `Tool result: ${details.summary}`;
  }
  if (details.toolName) {
    const targetSegment = details.target ? ` on ${details.target}` : '';
    return `Using tool: ${details.toolName}${targetSegment}`;
  }
  return details.raw;
};

const dispatchToolMessage = async ({
  projectId,
  metadata,
  content,
  requestId,
  persist = true,
  isStreaming = false,
  messageType = 'tool_use',
  dedupeKey,
  dedupeStore,
}: {
  projectId: string;
  metadata: Record<string, unknown>;
  content: string;
  requestId?: string;
  persist?: boolean;
  isStreaming?: boolean;
  messageType?: 'tool_use' | 'tool_result';
  dedupeKey?: string;
  dedupeStore?: Set<string>;
}): Promise<void> => {
  let trimmedContent = content.trim();
  if (!trimmedContent) {
    return;
  }

  // Enrich content with file path and command details for better visibility
  const action = pickFirstString(metadata.action);
  const filePath = pickFirstString(metadata.filePath);
  const command = pickFirstString(metadata.command);

  if (filePath && action) {
    const actionMap: Record<string, string> = {
      'Created': '已创建',
      'Edited': '已编辑',
      'Read': '正在读取',
      'Deleted': '已删除',
      'Searched': '正在搜索',
      'Generated': '已生成',
      'Executed': '执行命令'
    };
    const chineseAction = actionMap[action] || action;

    if (action === 'Executed' && command) {
      trimmedContent = `${chineseAction}：${command}`;
    } else {
      trimmedContent = `${chineseAction}：${filePath}`;
    }
  } else if (command) {
    trimmedContent = `执行命令：${command}`;
  }

  const enrichedMetadata = {
    ...(metadata ?? {}),
  };

  if (requestId && !enrichedMetadata.requestId) {
    enrichedMetadata.requestId = requestId;
  }

  if (persist && dedupeStore && dedupeKey) {
    const normalizedKey = dedupeKey.trim();
    if (normalizedKey.length > 0) {
      if (dedupeStore.has(normalizedKey)) {
        return;
      }
      dedupeStore.add(normalizedKey);
    }
  }

  if (!persist) {
    const transientMetadata = {
      ...enrichedMetadata,
      isTransientToolMessage: true,
    };
    streamManager.publish(projectId, {
      type: 'message',
      data: createRealtimeMessage({
        projectId,
        role: 'tool',
        content: trimmedContent,
        messageType,
        metadata: transientMetadata,
        requestId,
        isStreaming,
      }),
    });
    return;
  }

  try {
    const savedMessage = await createMessage({
      projectId,
      role: 'tool',
      messageType,
      content: trimmedContent,
      metadata: enrichedMetadata,
      cliSource: 'claude',
      requestId,
    });

    streamManager.publish(projectId, {
      type: 'message',
      data: serializeMessage(savedMessage, {
        requestId,
        isStreaming,
        isFinal: !isStreaming,
      }),
    });
  } catch (error) {
    console.error('[ClaudeService] Failed to persist tool message:', error);
  }
};

const handleToolPlaceholderMessage = async (
  projectId: string,
  placeholderText: string,
  requestId: string | undefined,
  baseMetadata?: Record<string, unknown>,
  options?: { dedupeStore?: Set<string> }
): Promise<boolean> => {
  const details = parseToolPlaceholderText(placeholderText);
  if (!details) {
    return false;
  }

  const metadata = mergeMetadata(baseMetadata, buildMetadataFromPlaceholder(details));
  const content = createToolMessageContent(details);
  const messageType: 'tool_use' | 'tool_result' = details.isResult ? 'tool_result' : 'tool_use';
  const signature = computeToolMessageSignature(metadata, content, messageType);

  await dispatchToolMessage({
    projectId,
    metadata,
    content,
    requestId,
    persist: true,
    isStreaming: false,
    messageType,
    dedupeKey: signature,
    dedupeStore: options?.dedupeStore,
  });

  try {
    const action = pickFirstString(metadata.action) ?? 'Executed';
    const filePath = pickFirstString(metadata.filePath) ?? pickFirstString(metadata.command) ?? '';
    const text = `${action}${filePath ? `: ${filePath}` : ''}`;
    await timelineLogger.logSDK(projectId, 'Command summary', 'info', requestId, { action, filePath, text }, 'sdk.command.summary');
  } catch { }

  return true;
};

function resolveModelId(model?: string | null): string {
  return normalizeClaudeModelId(model);
}

/**
 * 加载并应用 Claude 配置到环境变量
 * 从 Global Settings 读取 apiUrl 和 apiKey，设置到 process.env
 */
async function loadAndApplyClaudeConfig(): Promise<void> {
  console.log('[ClaudeService] 🔧 开始加载 Claude 配置...');
  try {
    const { loadGlobalSettings } = await import('@/lib/services/settings');
    const globalSettings = await loadGlobalSettings();
    const claudeSettings = globalSettings.cli_settings?.claude;

    if (claudeSettings) {
      // 配置 Base URL
      if (typeof claudeSettings.apiUrl === 'string' && claudeSettings.apiUrl.trim()) {
        const customBaseUrl = claudeSettings.apiUrl.trim();
        process.env.ANTHROPIC_BASE_URL = customBaseUrl;
        console.log(`[ClaudeService] ✅ 使用配置的 API Base URL: ${customBaseUrl}`);
      } else if (process.env.ANTHROPIC_BASE_URL) {
        console.log(`[ClaudeService] ✅ 使用环境变量的 API Base URL: ${process.env.ANTHROPIC_BASE_URL}`);
      } else {
        // URL 为空时使用默认值，与设置界面测试逻辑保持一致
        const defaultBaseUrl = 'https://api.100agent.co';
        process.env.ANTHROPIC_BASE_URL = defaultBaseUrl;
        console.log(`[ClaudeService] ✅ 使用默认 API Base URL: ${defaultBaseUrl}`);
      }

      // 配置 Auth Token
      if (typeof claudeSettings.apiKey === 'string' && claudeSettings.apiKey.trim()) {
        const customAuthToken = claudeSettings.apiKey.trim();
        process.env.ANTHROPIC_AUTH_TOKEN = customAuthToken;
        console.log(`[ClaudeService] ✅ 使用配置的 API Auth Token (前20字符): ${customAuthToken.substring(0, 20)}...`);
      } else if (process.env.ANTHROPIC_AUTH_TOKEN) {
        console.log(`[ClaudeService] ✅ 使用环境变量的 API Auth Token (前20字符): ${process.env.ANTHROPIC_AUTH_TOKEN.substring(0, 20)}...`);
      } else if (process.env.ANTHROPIC_API_KEY) {
        console.log(`[ClaudeService] ✅ 使用环境变量的 API Key (前20字符): ${process.env.ANTHROPIC_API_KEY.substring(0, 20)}...`);
      } else {
        console.log(`[ClaudeService] ⚠️  未配置 API Key/Token`);
      }
    } else {
      console.log('[ClaudeService] ⚠️  Claude 配置项为空，使用默认环境变量');
    }
  } catch (error) {
    console.error('[ClaudeService] ❌ 无法加载 Claude 配置，将使用系统环境变量:', error);
  }
}

/**
 * Execute command using Claude Agent SDK
 *
 * @param projectId - Project ID
 * @param projectPath - Project directory path
 * @param instruction - Command to pass to AI
 * @param model - Claude model to use (default: claude-sonnet-4-5-20250929)
 * @param sessionId - Previous session ID (maintains conversation context)
 * @param requestId - (Optional) User request tracking ID
 */
export async function executeClaude(
  projectId: string,
  projectPath: string,
  instruction: string,
  model: string = CLAUDE_DEFAULT_MODEL,
  sessionId?: string,
  requestId?: string
): Promise<void> {
  console.log(`\n========================================`);
  console.log(`[ClaudeService] 🚀 Starting Claude Agent SDK`);
  console.log(`[ClaudeService] Project: ${projectId}`);
  const resolvedModel = resolveModelId(model);
  const modelLabel = getClaudeModelDisplayName(resolvedModel);
  const aliasNote = resolvedModel !== model ? ` (alias for ${model})` : '';
  console.log(`[ClaudeService] Model: ${modelLabel} [${resolvedModel}]${aliasNote}`);
  console.log(`[ClaudeService] Session ID: ${sessionId || 'new session'}`);
  console.log(`[ClaudeService] Instruction: ${instruction.substring(0, 100)}...`);
  console.log(`========================================\n`);

  const configuredMaxTokens = Number(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0
    ? configuredMaxTokens
    : 4000;

  let hasMarkedTerminalStatus = false;
  let emittedCompletedStatus = false;
  let hasAnnouncedInterrupt = false;

  const safeMarkRunning = async () => {
    if (!requestId) return;
    try {
      await markUserRequestAsRunning(requestId);
    } catch (error) {
      console.error(`[ClaudeService] Failed to mark request ${requestId} as running:`, error);
    }
  };

  const safeMarkCompleted = async () => {
    if (!requestId || hasMarkedTerminalStatus) return;
    try {
      await markUserRequestAsCompleted(requestId);
    } catch (error) {
      console.error(`[ClaudeService] Failed to mark request ${requestId} as completed:`, error);
    } finally {
      hasMarkedTerminalStatus = true;
    }
  };

  const safeMarkFailed = async (message?: string) => {
    if (!requestId || hasMarkedTerminalStatus) return;
    try {
      await markUserRequestAsFailed(requestId, message);
    } catch (error) {
      console.error(`[ClaudeService] Failed to mark request ${requestId} as failed:`, error);
    } finally {
      hasMarkedTerminalStatus = true;
    }
  };

  const publishStatus = (status: string, message?: string) => {
    if (__VERBOSE_LOG__) {
      try { console.log('[ClaudeService][VERBOSE] publishStatus', { status, message, requestId }); } catch { }
      try { console.log('############ status_publish', JSON.stringify({ status, requestId }, null, 0)); } catch { }
    }
    streamManager.publish(projectId, {
      type: 'status',
      data: {
        status,
        ...(message ? { message } : {}),
        ...(requestId ? { requestId } : {}),
      },
    });
  };

  // Send start notification via SSE
  publishStatus('starting', 'Initializing Claude Agent SDK...');

  try {
    await timelineLogger.logSDK(projectId, '================== SDK 准备 START ==================', 'info', requestId, undefined, 'separator.sdk.prepare.start');
    await timelineLogger.logSDK(projectId, 'SDK prepare start', 'info', requestId, { projectPath }, 'sdk.prepare.start');
  } catch { }

  await safeMarkRunning();

  // Collect stderr from SDK process for better diagnostics
  const stderrBuffer: string[] = [];
  const placeholderHistory = new Map<string, Set<string>>();
  const persistedToolMessageSignatures = new Set<string>();
  const markPlaceholderHandled = (sessionKey: string, placeholder: string): boolean => {
    const normalized = placeholder.trim();
    if (!normalized) {
      return false;
    }
    let entries = placeholderHistory.get(sessionKey);
    if (!entries) {
      entries = new Set<string>();
      placeholderHistory.set(sessionKey, entries);
    }
    if (entries.has(normalized)) {
      return false;
    }
    entries.add(normalized);
    return true;
  };

  // 双保险：注入内置 Node.js 和 Git 到 PATH（同时修改 process.env 和传入 env 参数）
  // 声明在 try 外部以便 catch 块可以访问
  const builtinNodeDir = getBuiltinNodeDir();
  const builtinGitDir = getBuiltinGitDir();
  const builtinGitBashPath = getBuiltinGitBashPath();
  // 兼容 Windows PATH 环境变量大小写问题
  const originalPath = process.env.PATH || process.env.Path || '';

  try {
    // 加载并应用 Claude 配置
    await loadAndApplyClaudeConfig();

    // Verify project exists (prevents foreign key constraint errors)
    console.log(`[ClaudeService] 🔍 Verifying project exists...`);
    const project = await getProjectById(projectId);
    if (!project) {
      const errorMessage = `Project not found: ${projectId}. Cannot create messages for non-existent project.`;
      console.error(`[ClaudeService] ❌ ${errorMessage}`);

      streamManager.publish(projectId, {
        type: 'error',
        error: errorMessage,
        data: requestId ? { requestId } : undefined,
      });

      throw new Error(errorMessage);
    }

    console.log(`[ClaudeService] ✅ Project verified: ${project.name}`);

    // Prepare project path
    const absoluteProjectPath = path.isAbsolute(projectPath)
      ? path.resolve(projectPath)
      : path.resolve(process.cwd(), projectPath);

    console.log(`[ClaudeService] 📁 Project path: ${absoluteProjectPath}`);

    // Check project directory exists and create if needed
    try {
      await fs.access(absoluteProjectPath);
      console.log(`[ClaudeService] ✅ Project directory exists: ${absoluteProjectPath}`);
    } catch {
      console.log(`[ClaudeService] 📁 Creating project directory: ${absoluteProjectPath}`);
      await fs.mkdir(absoluteProjectPath, { recursive: true });
    }

    // Send ready notification via SSE
    publishStatus('ready', 'Project verified. Starting AI...');
    try {
      await timelineLogger.logSDK(projectId, 'SDK prepare end', 'info', requestId, { cwd: absoluteProjectPath }, 'sdk.prepare.end');
      await timelineLogger.logSDK(projectId, '================== SDK 准备 END ==================', 'info', requestId, undefined, 'separator.sdk.prepare.end');
    } catch { }

    // Start Claude Agent SDK query
    console.log(`[ClaudeService] 🤖 Querying Claude Agent SDK...`);
    console.log(`[ClaudeService] 📁 Working Directory: ${absoluteProjectPath}`);
    timelineLogger.logSDK(projectId, 'Query Claude Agent SDK', 'info', requestId, { cwd: absoluteProjectPath, model: resolvedModel }, 'sdk.start').catch(() => { });

    // 平台检测：Windows下使用简化权限模式
    const isWindows = process.platform === 'win32';
    console.log(`[ClaudeService] 🖥️  Platform: ${process.platform} (Windows: ${isWindows})`);

    // Get permission mode from project settings, default to 'default'
    const projectPermissionMode = ((project as any).permissionMode as PermissionMode) || 'default';
    console.log(`[ClaudeService] 🔐 Permission Mode: ${projectPermissionMode}`);

    // 获取项目类型和模式
    const projectType = (project as any).projectType as string | undefined;
    const projectMode = (project as any).mode as string | undefined;

    // 关键调试日志：模式检测
    console.log(`[ClaudeService] 🔍 Mode Detection (Execution):`);
    console.log(`  - projectId: ${projectId}`);
    console.log(`  - projectMode: ${projectMode}`);
    console.log(`  - projectType: ${projectType}`);
    console.log(`  - absoluteProjectPath: ${absoluteProjectPath}`);

    // 写入 Timeline 日志
    try {
      await timelineLogger.logSDK(projectId, `Mode Detection | mode: ${projectMode} | type: ${projectType}`, 'info', requestId, { mode: projectMode, projectType, path: absoluteProjectPath }, 'sdk.mode_detection');
    } catch {}

    // work 模式不需要检查 projectType
    if (projectMode !== 'work' && !projectType) {
      throw new Error('项目类型未定义：projectType 字段缺失');
    }

    // work 模式使用专用提示词（复用 Code 模式安全前缀）
    let systemPromptText: string;
    if (projectMode === 'work') {
      console.log(`[ClaudeService] ✅ Using WORK mode prompt with security prefix`);
      console.log(`[ClaudeService] 📁 Work Directory: ${absoluteProjectPath}`);

      // Check if project has employee_id and use employee's system_prompt
      const employeeId = (project as any).employee_id as string | undefined;
      let employeePrompt: string | undefined;

      if (employeeId) {
        const { getEmployeeById } = await import('@/lib/services/employee-service');
        const employee = await getEmployeeById(employeeId);
        if (employee && employee.system_prompt && employee.system_prompt.trim()) {
          employeePrompt = employee.system_prompt;
          console.log(`[ClaudeService] 👤 Using employee prompt for: ${employee.name}`);
        }
      }

      // Use buildExecutionSystemPrompt (same as Code mode) + no-delete rule
      const { buildExecutionSystemPrompt, getPrompt } = await import('@/lib/config/prompts');
      const basePrompt = employeePrompt || await getPrompt('work-mode');
      const noDeleteRule = `\n\n## 删除操作限制\n\n**禁止执行任何删除操作。** 如用户要求清理文件，请使用移动到指定文件夹（如 _trash）的方式替代删除。`;
      systemPromptText = buildExecutionSystemPrompt(absoluteProjectPath, basePrompt + noDeleteRule);
    } else {
      // code 模式使用项目类型对应的提示词
      if (projectType !== 'nextjs' && projectType !== 'python-fastapi') {
        throw new Error(`不支持的项目类型: ${projectType}`);
      }

      console.log(`[ClaudeService] 📋 Project Type: ${projectType}`);
      console.log(`[ClaudeService] 🎯 Using ${projectType === 'python-fastapi' ? 'Python FastAPI' : 'Next.js'} System Prompt`);

      // 从配置模块加载提示词（支持热更新）
      const { getExecutionSystemPrompt } = await import('@/lib/config/prompts');
      systemPromptText = await getExecutionSystemPrompt(projectType, absoluteProjectPath);
    }

    try {
      const promptPreview = instruction.substring(0, 500) + (instruction.length > 500 ? '...' : '');
      const systemPreview = systemPromptText.substring(0, 500) + (systemPromptText.length > 500 ? '...' : '');
      await timelineLogger.logSDK(projectId, '================== SDK 生成 START ==================', 'info', requestId, undefined, 'separator.sdk.generate.start');
      await timelineLogger.logSDK(projectId, 'SDK generate start', 'info', requestId, { prompt: promptPreview, systemPrompt: systemPreview, model: resolvedModel }, 'sdk.generate.start');
    } catch { }

    // 注意：不要修改 process.env.DATABASE_URL！
    // 平台数据库应始终连接到 prod.db
    // 子项目数据库通过子项目自己的 .env 文件配置

    // 构建 PATH
    const pathParts: string[] = [];
    if (builtinNodeDir) {
      pathParts.push(builtinNodeDir);
    }
    if (builtinGitDir) {
      pathParts.push(path.join(builtinGitDir, 'cmd'));        // git.exe
      pathParts.push(path.join(builtinGitDir, 'usr', 'bin')); // unix tools
      pathParts.push(path.join(builtinGitDir, 'bin'));        // bash.exe
    }

    // 进程级别 PATH 修改（兜底，防止 SDK 不使用传入的 env）
    if (pathParts.length > 0) {
      process.env.PATH = pathParts.join(path.delimiter) + (originalPath ? path.delimiter + originalPath : '');
      console.log(`[ClaudeService] 🔧 Prepended builtin runtimes to PATH: ${pathParts.join(', ')}`);
    }

    // 构建 env（仅传给 Claude 子进程，不影响主进程）
    const envWithBuiltinNode: NodeJS.ProcessEnv = {
      ...process.env,
    };

    if (pathParts.length > 0) {
      envWithBuiltinNode.PATH = pathParts.join(path.delimiter) + (originalPath ? path.delimiter + originalPath : '');
    }

    // 注入 CLAUDE_CODE_GIT_BASH_PATH（SDK 硬依赖）
    if (builtinGitBashPath) {
      envWithBuiltinNode.CLAUDE_CODE_GIT_BASH_PATH = builtinGitBashPath;
      console.log(`[ClaudeService] 🔧 Set CLAUDE_CODE_GIT_BASH_PATH: ${builtinGitBashPath}`);
    }

    // Load enabled skills as plugins
    const { getEnabledSkillPaths, initializeBuiltinSkills } = await import('@/lib/services/skill-service');
    // Ensure builtin skills are copied to user-skills directory
    await initializeBuiltinSkills();
    const enabledSkillPaths = await getEnabledSkillPaths();
    const plugins = enabledSkillPaths.map(p => ({ type: 'local' as const, path: p }));
    if (plugins.length > 0) {
      console.log(`[ClaudeService] 🧩 Loading ${plugins.length} skill plugins:`, enabledSkillPaths);
    }

    // Build canUseTool callback for permission control
    const canUseTool = projectPermissionMode !== 'bypassPermissions'
      ? async (toolName: string, toolInput: Record<string, unknown>) => {
          const autoApprove = shouldAutoApprove(toolName, projectPermissionMode);
          logPermissionDecision(projectId, toolName, projectPermissionMode, autoApprove, toolInput);

          if (autoApprove) {
            return true;
          }

          // For now, auto-approve everything but log it (quick verification phase)
          // In the future, this will return false and wait for user confirmation
          console.log(`[ClaudeService] 🔐 Permission required for ${toolName}, auto-approving for verification`);
          logPermissionDecision(projectId, toolName, projectPermissionMode, true, toolInput);
          return true;
        }
      : undefined;

    // Build PreToolUse hook for logging (SDK format: hooks.PreToolUse[].hooks[])
    const preToolUseHook = async (input: any, toolUseID: string) => {
      if (input.hook_event_name !== 'PreToolUse') {
        return {};
      }
      const toolName = input.tool_name || 'unknown';
      console.log(`[ClaudeService] 🔧 PreToolUse: ${toolName} | mode=${projectPermissionMode} | id=${toolUseID}`);
      timelineLogger.logSDK(
        projectId,
        `PreToolUse: ${toolName}`,
        'info',
        requestId,
        { toolName, mode: projectPermissionMode, toolUseID },
        'sdk.permission.pre_tool'
      ).catch(() => {});
      return {};
    };

    const hooks = projectPermissionMode !== 'bypassPermissions'
      ? {
          PreToolUse: [{
            hooks: [preToolUseHook]
          }]
        }
      : undefined;

    const response = query({
      prompt: instruction,
      options: {
        cwd: absoluteProjectPath,
        additionalDirectories: [absoluteProjectPath],
        model: resolvedModel,
        resume: sessionId,
        permissionMode: projectPermissionMode,
        systemPrompt: systemPromptText,
        maxOutputTokens,
        pathToClaudeCodeExecutable: getClaudeCodeExecutablePath(),
        env: envWithBuiltinNode,
        plugins: plugins.length > 0 ? plugins : undefined,
        allowedTools: plugins.length > 0 ? ['Skill', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'] : undefined,
        settingSources: plugins.length > 0 ? ['project'] : undefined,
        canUseTool,
        hooks,
        stderr: (data: string) => {
          const line = String(data).trimEnd();
          if (!line) return;
          // Keep only the last ~200 lines to avoid memory bloat
          if (stderrBuffer.length > 200) stderrBuffer.shift();
          stderrBuffer.push(line);
          // Also mirror to server logs for live debugging
          console.error(`[ClaudeSDK][stderr] ${line}`);

          // 写入统一日志文件
          if (requestId) {
            timelineLogger.logSDK(projectId, line, 'error', requestId).catch(err => {
              console.error('[ClaudeService] Failed to write timeline:', err);
            });
          }

          // Push stderr to frontend via SSE
          streamManager.publish(projectId, {
            type: 'log',
            data: {
              level: 'stderr',
              content: line,
              source: 'cli',
              projectId,
              timestamp: new Date().toISOString(),
              metadata: { cliType: 'claude' },
            },
          });
        },
      } as any,
    });

    // 保存query实例到全局Map，用于中断
    if (requestId) {
      activeQueryInstances.set(requestId, response);
      console.log(`[ClaudeService] Stored query instance for requestId: ${requestId}`);
    }

    // 发送任务开始事件到前端
    streamManager.publish(projectId, {
      type: 'task_started',
      data: {
        projectId,
        requestId,
        timestamp: new Date().toISOString(),
        message: 'AI任务开始执行'
      }
    });
    console.log(`[ClaudeService] 🚀 Published task_started event for requestId: ${requestId}`);

    let currentSessionId: string | undefined = sessionId;

    interface AssistantStreamState {
      messageId: string;
      content: string;
      hasSentUpdate: boolean;
      finalized: boolean;
    }

    const assistantStreamStates = new Map<string, AssistantStreamState>();
    const completedStreamSessions = new Set<string>();

    // Handle streaming response
    for await (const message of response) {
      if (__VERBOSE_LOG__) {
        try {
          if (message.type === 'stream_event') {
            const ev: any = (message as any).event ?? {};
            let textChunk = '';
            const d: any = ev?.delta;
            if (typeof d === 'string') {
              textChunk = d;
            } else if (d && typeof d === 'object') {
              if (typeof d.text === 'string') textChunk = d.text;
              else if (typeof d.delta === 'string') textChunk = d.delta;
              else if (typeof d.partial === 'string') textChunk = d.partial;
            }
            if (textChunk && textChunk.length > 0) {
              console.log('[ClaudeService][VERBOSE] stream text:', textChunk);
            } else {
              //console.log('[ClaudeService][VERBOSE] stream event:', ev?.type ?? 'unknown');
            }
          } else {
            // 简化日志：只打印消息类型和角色，不打印完整内容
            const msgType = message?.type || 'unknown';
            const msgRole = (message as any)?.role || '';
            console.log(`[ClaudeService][VERBOSE] SDK message: type=${msgType}, role=${msgRole}, requestId=${requestId}`);
          }
        } catch { }
      }
      // Check cancel flag proactively
      if (requestId) {
        try {
          const cancel = await isCancelRequested(requestId);
          if (__VERBOSE_LOG__) {
            try { console.log('############ interrupt_check', JSON.stringify({ requestId, cancel, hasAnnouncedInterrupt }, null, 0)); } catch { }
          }
          if (cancel && !hasAnnouncedInterrupt) {
            console.log(`[ClaudeService] 检测到中断标记，调用SDK中断: ${requestId}`);
            try { await response.interrupt(); } catch { }

            // Announce interrupt immediately to frontend
            streamManager.publish(projectId, {
              type: 'task_interrupted',
              data: {
                projectId,
                requestId,
                timestamp: new Date().toISOString(),
                message: '任务已被用户中断'
              }
            });
            console.log(`[ClaudeService] 🛑 Published task_interrupted event for requestId: ${requestId}`);

            await safeMarkFailed('任务已被用户中断');
            publishStatus('cancelled', '任务已被用户中断');
            activeQueryInstances.delete(requestId);
            hasAnnouncedInterrupt = true;
            break;
          }
        } catch { }
      }
      console.log('[ClaudeService] Message type:', message.type);

      if (message.type === 'stream_event') {
        const event: any = (message as any).event ?? {};
        const sessionKey = (message.session_id ?? message.uuid ?? 'default').toString();
        console.log('[ClaudeService] Stream event type:', event.type);

        let streamState = assistantStreamStates.get(sessionKey);

        switch (event.type) {
          case 'message_start': {
            const newState: AssistantStreamState = {
              messageId: randomUUID(),
              content: '',
              hasSentUpdate: false,
              finalized: false,
            };
            assistantStreamStates.set(sessionKey, newState);
            break;
          }
          case 'content_block_start': {
            const contentBlock = event.content_block;
            if (contentBlock && typeof contentBlock === 'object' && contentBlock.type === 'tool_use') {
              const metadata = buildToolMetadata(contentBlock as Record<string, unknown>, absoluteProjectPath);
              const name = contentBlock.name;

              // 检测TodoWrite工具并格式化展示(流式)
              if (name && (name.toLowerCase() === 'todowrite' || name.toLowerCase() === 'todo_write')) {
                try {
                  const toolInput = metadata.toolInput as any;
                  if (toolInput && Array.isArray(toolInput.todos)) {
                    const todos = toolInput.todos;
                    const statusEmoji: Record<string, string> = {
                      'in_progress': '🔄',
                      'pending': '⏳',
                      'completed': '✅'
                    };

                    const todoLines = todos.map((todo: any) => {
                      const emoji = statusEmoji[todo.status] || '📌';
                      const content = todo.content || todo.activeForm || '未命名任务';
                      return `${emoji} ${content}`;
                    });

                    const todoText = `📋 任务列表更新：\n${todoLines.join('\n')}`;

                    // 发送格式化的todo列表到聊天框(流式)
                    await dispatchToolMessage({
                      projectId,
                      metadata: {
                        ...metadata,
                        action: 'Generated',
                        summary: '任务列表已更新'
                      },
                      content: todoText,
                      requestId,
                      persist: false,
                      isStreaming: true,
                      dedupeKey: `todo_stream_${Date.now()}`,
                      dedupeStore: persistedToolMessageSignatures,
                    });

                    console.log('[ClaudeService] TodoWrite detected (streaming):', todoLines.length, 'tasks');
                  }
                } catch (error) {
                  console.error('[ClaudeService] Failed to format TodoWrite (streaming):', error);
                }
              }

              // 检测 Write/Edit 工具并推送 file_change 事件
              if (name && (name.toLowerCase() === 'write' || name.toLowerCase() === 'edit')) {
                try {
                  const toolInput = metadata.toolInput as any;
                  if (toolInput && toolInput.file_path) {
                    const isWrite = name.toLowerCase() === 'write';
                    streamManager.publish(projectId, {
                      type: 'file_change',
                      data: {
                        type: isWrite ? 'write' : 'edit',
                        filePath: toolInput.file_path,
                        content: isWrite ? toolInput.content : undefined,
                        oldString: !isWrite ? toolInput.old_string : undefined,
                        newString: !isWrite ? toolInput.new_string : undefined,
                        timestamp: new Date().toISOString(),
                        requestId,
                      }
                    });
                    console.log('[ClaudeService] file_change event pushed:', name, toolInput.file_path);
                  }
                } catch (error) {
                  console.error('[ClaudeService] Failed to push file_change event:', error);
                }
              }

              await dispatchToolMessage({
                projectId,
                metadata,
                content: `Using tool: ${contentBlock.name ?? 'tool'}`,
                requestId,
                persist: false,
                isStreaming: true,
              });
            }
            break;
          }
          case 'content_block_delta': {
            const delta = event.delta;
            let textChunk = '';

            if (typeof delta === 'string') {
              textChunk = delta;
            } else if (delta && typeof delta === 'object') {
              if (typeof delta.text === 'string') {
                textChunk = delta.text;
              } else if (typeof delta.delta === 'string') {
                textChunk = delta.delta;
              } else if (typeof delta.partial === 'string') {
                textChunk = delta.partial;
              }
            }

            if (typeof textChunk !== 'string' || textChunk.length === 0) {
              break;
            }

            if (!streamState || streamState.finalized) {
              streamState = {
                messageId: randomUUID(),
                content: '',
                hasSentUpdate: false,
                finalized: false,
              };
              assistantStreamStates.set(sessionKey, streamState);
            }

            streamState.content += textChunk;
            const trimmedContent = streamState.content.trim();
            const isPlaceholderLine =
              trimmedContent.length > 0 &&
              ((/^\[Tool:\s*.+\]$/i.test(trimmedContent) && !trimmedContent.includes('\n')) ||
                /^Using tool:/i.test(trimmedContent) ||
                /^Tool result:/i.test(trimmedContent));

            if (trimmedContent.length === 0) {
              streamState.content = '';
              streamState.hasSentUpdate = false;
              break;
            }

            if (isPlaceholderLine) {
              const shouldHandle = markPlaceholderHandled(sessionKey, trimmedContent);
              if (shouldHandle) {
                try {
                  await handleToolPlaceholderMessage(
                    projectId,
                    trimmedContent,
                    requestId,
                    undefined,
                    { dedupeStore: persistedToolMessageSignatures }
                  );
                } catch (error) {
                  console.error('[ClaudeService] Failed to handle streaming tool placeholder:', error);
                }
              }
              streamState.content = '';
              streamState.hasSentUpdate = false;
              break;
            }

            streamState.hasSentUpdate = true;

            streamManager.publish(projectId, {
              type: 'message',
              data: createRealtimeMessage({
                id: streamState.messageId,
                projectId,
                role: 'assistant',
                content: streamState.content,
                messageType: 'chat',
                requestId,
                isStreaming: true,
              }),
            });
            break;
          }
          case 'message_stop': {
            if (streamState && streamState.hasSentUpdate && !streamState.finalized) {
              const trimmedContent = streamState.content.trim();
              const isPlaceholderLine =
                trimmedContent.length > 0 &&
                ((/^\[Tool:\s*.+\]$/i.test(trimmedContent) && !trimmedContent.includes('\n')) ||
                  /^Using tool:/i.test(trimmedContent) ||
                  /^Tool result:/i.test(trimmedContent));

              if (isPlaceholderLine) {
                const shouldHandle = markPlaceholderHandled(sessionKey, trimmedContent);
                if (shouldHandle) {
                  try {
                    await handleToolPlaceholderMessage(
                      projectId,
                      trimmedContent,
                      requestId,
                      undefined,
                      { dedupeStore: persistedToolMessageSignatures }
                    );
                  } catch (error) {
                    console.error('[ClaudeService] Failed to handle tool placeholder on stop:', error);
                  }
                }
              }

              if (
                trimmedContent.length === 0 ||
                isPlaceholderLine
              ) {
                streamState.hasSentUpdate = false;
              }

              if (!streamState.hasSentUpdate) {
                streamState.content = '';
                assistantStreamStates.delete(sessionKey);
                break;
              }

              streamState.finalized = true;

              const savedMessage = await createMessage({
                id: streamState.messageId,
                projectId,
                role: 'assistant',
                messageType: 'chat',
                content: streamState.content,
                cliSource: 'claude',
              });

              streamManager.publish(projectId, {
                type: 'message',
                data: serializeMessage(savedMessage, {
                  isStreaming: false,
                  isFinal: true,
                  requestId,
                }),
              });

              completedStreamSessions.add(sessionKey);
            }

            assistantStreamStates.delete(sessionKey);
            break;
          }
          default:
            break;
        }

        continue;
      }

      // Handle by message type
      if (message.type === 'user') {
        // 处理 slash 命令输出（如 /context, /compact）
        const userRecord = (message as any).message as Record<string, unknown> | undefined;
        const contentValue = userRecord?.content;

        let extractedText = '';

        // 处理字符串内容
        if (typeof contentValue === 'string') {
          extractedText = contentValue;
        }
        // 处理数组内容
        else if (Array.isArray(contentValue)) {
          for (const block of contentValue) {
            if (!block || typeof block !== 'object') continue;
            const blockRecord = block as Record<string, unknown>;

            // 提取文本内容
            if (blockRecord.type === 'text' && typeof blockRecord.text === 'string') {
              extractedText += blockRecord.text;
            }
          }
        }

        // 提取 <local-command-stdout> 标签内的内容
        const stdoutMatch = extractedText.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
        if (stdoutMatch && stdoutMatch[1]) {
          const commandOutput = stdoutMatch[1].trim();

          if (commandOutput) {
            console.log('[ClaudeService] Slash command output detected:', commandOutput.substring(0, 100));

            // 保存为系统消息显示在聊天区
            try {
              const savedMessage = await createMessage({
                projectId,
                role: 'system',
                messageType: 'chat',
                content: commandOutput,
                metadata: {
                  source: 'slash_command',
                  isCommandOutput: true
                },
                cliSource: 'claude',
                requestId,
              });

              // 发送到前端
              streamManager.publish(projectId, {
                type: 'message',
                data: serializeMessage(savedMessage, { requestId }),
              });

              console.log('[ClaudeService] Slash command output saved and published');
            } catch (error) {
              console.error('[ClaudeService] Failed to save slash command output:', error);
            }
          }
        }
        continue;
      } else if (message.type === 'system' && message.subtype === 'init') {
        // Initialize session
        currentSessionId = message.session_id;
        console.log(`[ClaudeService] Session initialized: ${currentSessionId}`);

        // Save session ID to project
        if (currentSessionId) {
          await updateProject(projectId, {
            activeClaudeSessionId: currentSessionId,
          });
        }

        // Send connection notification via SSE
        streamManager.publish(projectId, {
          type: 'connected',
          data: {
            projectId,
            sessionId: currentSessionId,
            timestamp: new Date().toISOString(),
            connectionStage: 'assistant',
          },
        });
      } else if (message.type === 'assistant') {
        const sessionKey = (message.session_id ?? message.uuid ?? 'default').toString();
        if (completedStreamSessions.has(sessionKey)) {
          completedStreamSessions.delete(sessionKey);
          continue;
        }

        // Assistant message
        const assistantMessage = message.message;
        let content = '';

        // Extract content
        if (typeof assistantMessage.content === 'string') {
          content = assistantMessage.content;
        } else if (Array.isArray(assistantMessage.content)) {
          const parts: string[] = [];
          for (const block of assistantMessage.content as unknown[]) {
            if (!block || typeof block !== 'object') {
              continue;
            }

            const safeBlock = block as any;

            if (safeBlock.type === 'text') {
              const text = typeof safeBlock.text === 'string' ? safeBlock.text : '';
              const trimmed = text.trim();
              if (!trimmed) {
                continue;
              }

              const isPlaceholderLine =
                /^\[Tool:\s*/i.test(trimmed) ||
                /^Using tool:/i.test(trimmed) ||
                /^Tool result:/i.test(trimmed);

              if (isPlaceholderLine) {
                const shouldHandle = markPlaceholderHandled(sessionKey, trimmed);
                if (shouldHandle) {
                  try {
                    await handleToolPlaceholderMessage(
                      projectId,
                      trimmed,
                      requestId,
                      undefined,
                      { dedupeStore: persistedToolMessageSignatures }
                    );
                  } catch (error) {
                    console.error('[ClaudeService] Failed to handle assistant tool placeholder:', error);
                  }
                }
                continue;
              }

              parts.push(text);
              continue;
            }

            if (safeBlock.type === 'tool_use') {
              const metadata = buildToolMetadata(safeBlock as Record<string, unknown>, absoluteProjectPath);
              const name = typeof safeBlock.name === 'string' ? safeBlock.name : pickFirstString(safeBlock.name);
              const toolContent = `Using tool: ${name ?? 'tool'}`;

              // Windows 环境下标记文件操作为 PATH-NOSAFE
              const fileOperationTools = ['Read', 'Write', 'Edit', 'Glob', 'NotebookEdit'];
              const isFileOperation = name && fileOperationTools.includes(name);
              const logLevel = (isWindows && isFileOperation) ? 'warn' : 'info';
              const logPrefix = (isWindows && isFileOperation) ? '### PATH-NOSAFE: ' : '';

              timelineLogger.logSDK(
                projectId,
                `${logPrefix}${toolContent}`,
                logLevel,
                requestId,
                {
                  name,
                  metadata,
                  // bypassPermissions 模式下所有文件操作均无安全检查
                  ...(isFileOperation ? { noSafetyCheck: true, bypassMode: true } : {})
                },
                // 文件操作标记为 path_bypass，便于审计追溯
                isFileOperation ? 'sdk.path_bypass' : 'sdk.tool_use'
              ).catch(() => { });

              // 检测TodoWrite工具并格式化展示
              if (name && (name.toLowerCase() === 'todowrite' || name.toLowerCase() === 'todo_write')) {
                try {
                  const toolInput = metadata.toolInput as any;
                  if (toolInput && Array.isArray(toolInput.todos)) {
                    const todos = toolInput.todos;
                    const statusEmoji: Record<string, string> = {
                      'in_progress': '🔄',
                      'pending': '⏳',
                      'completed': '✅'
                    };

                    const todoLines = todos.map((todo: any) => {
                      const emoji = statusEmoji[todo.status] || '📌';
                      const content = todo.content || todo.activeForm || '未命名任务';
                      return `${emoji} ${content}`;
                    });

                    const todoText = `📋 任务列表更新：\n${todoLines.join('\n')}`;

                    // 发送格式化的todo列表到聊天框
                    await dispatchToolMessage({
                      projectId,
                      metadata: {
                        ...metadata,
                        action: 'Generated',
                        summary: '任务列表已更新'
                      },
                      content: todoText,
                      requestId,
                      persist: true,
                      isStreaming: false,
                      messageType: 'tool_use',
                      dedupeKey: `todo_${Date.now()}`, // 使用时间戳避免去重
                      dedupeStore: persistedToolMessageSignatures,
                    });

                    console.log('[ClaudeService] TodoWrite detected and formatted:', todoLines.length, 'tasks');
                  }
                } catch (error) {
                  console.error('[ClaudeService] Failed to format TodoWrite:', error);
                }
              }

              // 检测 Write/Edit 工具并推送 file_change 事件（非流式）
              if (name && (name.toLowerCase() === 'write' || name.toLowerCase() === 'edit')) {
                try {
                  const toolInput = metadata.toolInput as any;
                  if (toolInput && toolInput.file_path) {
                    const isWrite = name.toLowerCase() === 'write';
                    streamManager.publish(projectId, {
                      type: 'file_change',
                      data: {
                        type: isWrite ? 'write' : 'edit',
                        filePath: toolInput.file_path,
                        content: isWrite ? toolInput.content : undefined,
                        oldString: !isWrite ? toolInput.old_string : undefined,
                        newString: !isWrite ? toolInput.new_string : undefined,
                        timestamp: new Date().toISOString(),
                        requestId,
                      }
                    });
                    console.log('[ClaudeService] file_change event pushed (non-streaming):', name, toolInput.file_path);
                  }
                } catch (error) {
                  console.error('[ClaudeService] Failed to push file_change event:', error);
                }
              }

              await dispatchToolMessage({
                projectId,
                metadata,
                content: toolContent,
                requestId,
                persist: true,
                isStreaming: false,
                messageType: 'tool_use',
                dedupeKey: computeToolMessageSignature(metadata, toolContent, 'tool_use'),
                dedupeStore: persistedToolMessageSignatures,
              });
              continue;
            }
          }

          content = parts.join('\n');
        }

        console.log('[ClaudeService] Assistant message:', content.substring(0, 100));

        // Save message to DB
        if (content) {
          const savedMessage = await createMessage({
            projectId,
            role: 'assistant',
            messageType: 'chat',
            content,
            // sessionId is Session table foreign key, so don't store Claude SDK session ID
            // Claude SDK session ID is stored in project.activeClaudeSessionId
            cliSource: 'claude',
          });

          // Send via SSE in real-time
          streamManager.publish(projectId, {
            type: 'message',
            data: serializeMessage(savedMessage, { requestId }),
          });
        }
      } else if (message.type === 'result') {
        // Final result
        console.log('[ClaudeService] Task completed:', message.subtype);
        console.log('[ClaudeService] 📊 Raw result message:', JSON.stringify(message, null, 2));
        try {
          await timelineLogger.logSDK(projectId, 'SDK generate end', 'info', requestId, { subtype: message.subtype }, 'sdk.generate.end');
          await timelineLogger.logSDK(projectId, '================== SDK 生成 END ==================', 'info', requestId, undefined, 'separator.sdk.generate.end');
        } catch { }
        timelineLogger.logSDK(projectId, 'SDK execution completed', 'info', requestId, { subtype: message.subtype }, 'sdk.completed').catch(() => { });

        // 提取并发送对话统计信息
        const resultMsg = message as any;
        const statsData: Record<string, unknown> = {
          projectId,
          requestId,
          timestamp: new Date().toISOString(),
        };

        if (typeof resultMsg.duration_ms === 'number') {
          statsData.duration_ms = resultMsg.duration_ms;
        }
        if (typeof resultMsg.duration_api_ms === 'number') {
          statsData.duration_api_ms = resultMsg.duration_api_ms;
        }
        if (typeof resultMsg.total_cost_usd === 'number') {
          statsData.total_cost_usd = resultMsg.total_cost_usd;
        }
        if (resultMsg.usage && typeof resultMsg.usage === 'object') {
          statsData.usage = resultMsg.usage;
        }
        if (resultMsg.modelUsage && typeof resultMsg.modelUsage === 'object') {
          statsData.modelUsage = resultMsg.modelUsage;
        }
        if (typeof resultMsg.num_turns === 'number') {
          statsData.num_turns = resultMsg.num_turns;
        }

        // 只有当存在有效统计字段时才发送事件
        const hasStats = statsData.duration_ms !== undefined ||
          statsData.total_cost_usd !== undefined ||
          statsData.usage !== undefined ||
          statsData.num_turns !== undefined;

        if (hasStats) {
          console.log('[ClaudeService] 📊 Conversation stats:', statsData);
          streamManager.publish(projectId, {
            type: 'conversation_stats',
            data: statsData as any,
          });
        }

        // 发送 SDK 完成事件
        streamManager.publish(projectId, {
          type: 'sdk_completed',
          data: {
            status: 'sdk_completed',
            message: 'SDK execution completed. Please click the preview button to start.',
            requestId,
            phase: 'sdk_completed',
          },
        });
      }
    }

    console.log('[ClaudeService] Streaming completed');

    // 清理query实例
    if (requestId) {
      activeQueryInstances.delete(requestId);
      console.log(`[ClaudeService] Cleaned up query instance for requestId: ${requestId}`);
    }

    // 发送任务完成事件到前端
    streamManager.publish(projectId, {
      type: 'task_completed',
      data: {
        projectId,
        requestId,
        timestamp: new Date().toISOString(),
        message: 'AI任务执行完成'
      }
    });
    console.log(`[ClaudeService] ✅ Published task_completed event for requestId: ${requestId}`);
    try {
      await timelineLogger.logSDK(projectId, 'SDK generate end', 'info', requestId, undefined, 'sdk.generate.end');
      await timelineLogger.logSDK(projectId, '================== SDK 生成 END ==================', 'info', requestId, undefined, 'separator.sdk.generate.end');
    } catch { }
    timelineLogger.logSDK(projectId, 'SDK streaming completed', 'info', requestId, undefined, 'sdk.completed').catch(() => { });
    await safeMarkCompleted();
    if (!emittedCompletedStatus) {
      publishStatus('completed');
      emittedCompletedStatus = true;

      // 发送 SDK 完成事件
      streamManager.publish(projectId, {
        type: 'sdk_completed',
        data: {
          status: 'sdk_completed',
          message: 'SDK execution completed. Please click the preview button to start.',
          requestId,
          phase: 'sdk_completed',
        },
      });
    }

    // 正常结束时恢复 PATH
    if (builtinNodeDir && originalPath !== undefined) {
      process.env.PATH = originalPath;
    }
  } catch (error) {
    // 恢复 PATH（放在 catch 最前面确保执行）
    if (builtinNodeDir && originalPath !== undefined) {
      process.env.PATH = originalPath;
    }

    console.error(`[ClaudeService] Failed to execute Claude:`, error);

    // 清理query实例
    if (requestId) {
      activeQueryInstances.delete(requestId);
      console.log(`[ClaudeService] Cleaned up query instance on error for requestId: ${requestId}`);
    }

    let errorMessage = 'Unknown error';
    let isInterrupted = false;

    if (error instanceof Error) {
      errorMessage = error.message;

      // 检测中断错误
      if (errorMessage.includes('aborted') || errorMessage.includes('Request was aborted')) {
        errorMessage = '任务已被用户取消';
        isInterrupted = true;
        console.log('[ClaudeService] Task interrupted by user');

        // 发送任务中断事件到前端
        streamManager.publish(projectId, {
          type: 'task_interrupted',
          data: {
            projectId,
            requestId,
            timestamp: new Date().toISOString(),
            message: '任务已被用户中断'
          }
        });
        console.log(`[ClaudeService] 🛑 Published task_interrupted event for requestId: ${requestId}`);

        await safeMarkFailed(errorMessage);
        publishStatus('cancelled', errorMessage);
        throw error;
      }

      // Detect Claude Code CLI not installed
      if (errorMessage.includes('command not found') || errorMessage.includes('not found: claude')) {
        errorMessage = `Claude Code CLI is not installed.\n\nInstallation instructions:\n1. npm install -g @anthropic-ai/claude-code\n2. claude auth login`;
      }
      // Detect authentication failure
      else if (errorMessage.includes('not authenticated') || errorMessage.includes('authentication')) {
        errorMessage = `Claude Code CLI authentication required.\n\nAuthentication method:\nclaude auth login`;
      }
      // Permission error
      else if (errorMessage.includes('permission') || errorMessage.includes('EACCES')) {
        errorMessage = `No file access permission. Please check project directory permissions.`;
      }
      // Token limit exceeded
      else if (errorMessage.includes('max_tokens')) {
        errorMessage = `Generation length is too long. Please shorten the prompt or split the request into smaller parts.`;
      }
      // Generic process exit without details – attempt to surface last stderr lines
      else if (/process exited with code \d+/.test(errorMessage) && stderrBuffer.length > 0) {
        // Heuristics: extract likely actionable hints from stderr
        const tail = stderrBuffer.slice(-15).join('\n');
        // Common auth hints
        if (/auth\s+login|not\s+logged\s+in|sign\s+in/i.test(tail)) {
          errorMessage = `Claude Code CLI authentication required.\n\nAuthentication method:\nclaude auth login\n\nDetailed log:\n${tail}`;
        } else if (/network|ENOTFOUND|ECONN|timeout/i.test(tail)) {
          errorMessage = `Failed to run Claude Code due to network error. Please check your network connection and try again.\n\nDetailed log:\n${tail}`;
        } else if (/permission|EACCES|EPERM|denied/i.test(tail) && !/No conversation found/i.test(tail)) {
          errorMessage = `Execution interrupted due to file access permission error. Please check project directory permissions.\n\nDetailed log:\n${tail}`;
        } else if (/No conversation found|session.*not found/i.test(tail)) {
          // Session file not found - clear invalid session ID so next request starts fresh
          try {
            await updateProject(projectId, { activeClaudeSessionId: null });
            console.log(`[ClaudeService] Cleared invalid session ID for project: ${projectId}`);
          } catch {}
          errorMessage = `会话记录不存在，已自动清理。请重新发送消息。\n\nDetailed log:\n${tail}`;
        } else if (/model|unsupported|invalid\s+model/i.test(tail)) {
          errorMessage = `There is a problem with the model settings. Please try changing the model.\n\nDetailed log:\n${tail}`;
        } else {
          errorMessage = `${errorMessage}\n\nDetailed log:\n${tail}`;
        }
      }
    }

    await safeMarkFailed(errorMessage);
    publishStatus('error', errorMessage);

    // 发送任务失败事件到前端（仅非中断错误）
    if (!isInterrupted) {
      streamManager.publish(projectId, {
        type: 'task_error',
        data: {
          projectId,
          requestId,
          timestamp: new Date().toISOString(),
          message: '任务执行失败',
          error: errorMessage
        }
      });
      console.log(`[ClaudeService] ❌ Published task_error event for requestId: ${requestId}`);
    }

    // Send error via SSE
    streamManager.publish(projectId, {
      type: 'error',
      error: errorMessage,
      data: requestId ? { requestId } : undefined,
    });

    throw new Error(errorMessage);
  }
}

/**
 * Initialize Next.js project with Claude Code
 *
 * @param projectId - Project ID
 * @param projectPath - Project directory path
 * @param initialPrompt - Initial prompt
 * @param model - Claude model to use (default: claude-sonnet-4-5-20250929)
 * @param requestId - (Optional) User request tracking ID
 */
export async function initializeNextJsProject(
  projectId: string,
  projectPath: string,
  initialPrompt: string,
  model: string = CLAUDE_DEFAULT_MODEL,
  requestId?: string
): Promise<void> {
  console.log(`[ClaudeService] Initializing Next.js project: ${projectId}`);
  try {
    await scaffoldBasicNextApp(projectPath, projectId);
    await timelineLogger.append({
      type: 'system',
      level: 'info',
      message: 'Baseline scaffold applied',
      projectId,
      component: 'artifact',
      event: 'artifact.scaffold.baseline',
      metadata: { projectPath }
    });
  } catch (error) {
    console.warn('[ClaudeService] Scaffold baseline failed:', error);
  }

  // Next.js project creation command
  const fullPrompt = `
Create a new Next.js 15 application with the following requirements:
${initialPrompt}

IMPORTANT: Use the following exact dependencies in package.json:

dependencies:
- react: ^19.0.0
- react-dom: ^19.0.0
- next: ^15.0.3

devDependencies:
- typescript: ^5
- @types/node: ^20
- @types/react: ^19
- @types/react-dom: ^19
- tailwindcss: ^3.4
- postcss: ^8
- autoprefixer: ^10
- eslint: ^8
- eslint-config-next: 15.0.3

Use App Router, TypeScript, and Tailwind CSS.
Set up the basic project structure and implement the requested features.
`.trim();

  await executeClaude(projectId, projectPath, fullPrompt, model, undefined, requestId);
}

/**
 * Apply changes to project
 *
 * @param projectId - Project ID
 * @param projectPath - Project directory path
 * @param instruction - Change request command
 * @param model - Claude model to use (default: claude-sonnet-4-5-20250929)
 * @param sessionId - Session ID
 * @param requestId - (Optional) User request tracking ID
 */
export async function applyChanges(
  projectId: string,
  projectPath: string,
  instruction: string,
  model: string = CLAUDE_DEFAULT_MODEL,
  sessionId?: string,
  requestId?: string
): Promise<void> {
  console.log(`[ClaudeService] Applying changes to project: ${projectId}`);
  await executeClaude(projectId, projectPath, instruction, model, sessionId, requestId);
}

export async function generatePlan(
  projectId: string,
  projectPath: string,
  instruction: string,
  model: string = CLAUDE_DEFAULT_MODEL,
  sessionId?: string,
  requestId?: string
): Promise<void> {
  console.log(`\n========================================`);
  console.log(`[ClaudeService] 🚀 Starting Planning`);
  console.log(`[ClaudeService] Project: ${projectId}`);
  const resolvedModel = resolveModelId(model);
  const modelLabel = getClaudeModelDisplayName(resolvedModel);
  const aliasNote = resolvedModel !== model ? ` (alias for ${model})` : '';
  console.log(`[ClaudeService] Model: ${modelLabel} [${resolvedModel}]${aliasNote}`);
  console.log(`[ClaudeService] Session ID: ${sessionId || 'new session'}`);
  console.log(`[ClaudeService] Instruction: ${instruction.substring(0, 100)}...`);
  console.log(`========================================\n`);

  const configuredMaxTokens = Number(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0 ? configuredMaxTokens : 2000;

  const publishStatus = (status: string, message?: string) => {
    streamManager.publish(projectId, {
      type: 'status',
      data: { status, ...(message ? { message } : {}), ...(requestId ? { requestId } : {}) },
    });
  };

  publishStatus('planning_start');

  try {
    // 加载并应用 Claude 配置
    await loadAndApplyClaudeConfig();

    try {
      await timelineLogger.logSDK(projectId, 'SDK prepare start', 'info', requestId, { projectPath }, 'sdk.prepare.start');
    } catch { }

    if (requestId) {
      try { await markUserRequestAsPlanning(requestId); } catch { }
    }

    try {
      await fs.access(projectPath);
    } catch {
      await fs.mkdir(projectPath, { recursive: true });
    }

    // 获取项目信息并根据类型/模式选择规划Prompt
    const project = await getProjectById(projectId);
    const projectType = (project as any)?.projectType as string | undefined;
    const projectMode = (project as any)?.mode as string | undefined;

    // 关键调试日志：模式检测
    console.log(`[ClaudeService] 🔍 Mode Detection (Planning):`);
    console.log(`  - projectId: ${projectId}`);
    console.log(`  - projectMode: ${projectMode}`);
    console.log(`  - projectType: ${projectType}`);
    console.log(`  - projectPath: ${projectPath}`);

    // 写入 Timeline 日志
    try {
      await timelineLogger.logSDK(projectId, `Mode Detection (Planning) | mode: ${projectMode} | type: ${projectType}`, 'info', requestId, { mode: projectMode, projectType, path: projectPath }, 'sdk.mode_detection.planning');
    } catch {}

    // work 模式不需要检查 projectType
    if (projectMode !== 'work' && !projectType) {
      throw new Error('项目类型未定义：projectType 字段缺失');
    }

    // work 模式使用专用提示词（复用 Code 模式安全前缀）
    let systemPromptText: string;
    if (projectMode === 'work') {
      console.log(`[ClaudeService] ✅ Using WORK mode prompt with security prefix`);
      console.log(`[ClaudeService] 📁 Work Directory: ${projectPath}`);

      // Check if project has employee_id and use employee's system_prompt
      const employeeId = (project as any).employee_id as string | undefined;
      let employeePrompt: string | undefined;

      if (employeeId) {
        const { getEmployeeById } = await import('@/lib/services/employee-service');
        const employee = await getEmployeeById(employeeId);
        if (employee && employee.system_prompt && employee.system_prompt.trim()) {
          employeePrompt = employee.system_prompt;
          console.log(`[ClaudeService] 👤 Using employee prompt for: ${employee.name}`);
        }
      }

      // Use buildExecutionSystemPrompt (same as Code mode) + no-delete rule
      const { buildExecutionSystemPrompt, getPrompt } = await import('@/lib/config/prompts');
      const basePrompt = employeePrompt || await getPrompt('work-mode');
      const noDeleteRule = `\n\n## 删除操作限制\n\n**禁止执行任何删除操作。** 如用户要求清理文件，请使用移动到指定文件夹（如 _trash）的方式替代删除。`;
      systemPromptText = buildExecutionSystemPrompt(projectPath, basePrompt + noDeleteRule);
    } else {
      // code 模式使用项目类型对应的规划提示词
      if (projectType !== 'nextjs' && projectType !== 'python-fastapi') {
        throw new Error(`不支持的项目类型: ${projectType}`);
      }

      console.log(`[ClaudeService] 📋 Project Type (Planning): ${projectType}`);
      console.log(`[ClaudeService] 🎯 Using ${projectType === 'python-fastapi' ? 'Python FastAPI' : 'Next.js'} Planning Prompt`);

      // 从配置模块加载规划提示词（支持热更新）
      const { getPlanningSystemPrompt } = await import('@/lib/config/prompts');
      systemPromptText = await getPlanningSystemPrompt(projectType);
    }

    // 注意：不要修改 process.env.DATABASE_URL！
    // 平台数据库应始终连接到 prod.db
    // 子项目数据库通过子项目自己的 .env 文件配置

    let hasAnnouncedInterrupt = false;
    const response = query({
      prompt: instruction,
      options: {
        cwd: projectPath,
        additionalDirectories: [projectPath],
        model: resolvedModel,
        resume: sessionId,
        permissionMode: 'plan',
        systemPrompt: systemPromptText,
        maxOutputTokens,
        pathToClaudeCodeExecutable: getClaudeCodeExecutablePath(),
        includePartialMessages: true,
      } as any,
    });

    if (requestId) {
      activeQueryInstances.set(requestId, response);
      try { console.log(`[ClaudeService] Stored planning query instance for requestId: ${requestId}`); } catch { }
    }

    // 发送任务开始事件到前端（Plan 模式）
    streamManager.publish(projectId, {
      type: 'task_started',
      data: {
        projectId,
        requestId,
        timestamp: new Date().toISOString(),
        message: 'AI规划任务开始'
      }
    });
    console.log(`[ClaudeService] 🚀 Published task_started event (planning) for requestId: ${requestId}`);

    let exitPlanDetected = false;
    for await (const message of response) {
      if (__VERBOSE_LOG__) {
        try {
          if (message.type === 'stream_event') {
            const ev: any = (message as any).event ?? {};
            let textChunk = '';
            const d: any = ev?.delta;
            if (typeof d === 'string') {
              textChunk = d;
            } else if (d && typeof d === 'object') {
              if (typeof d.text === 'string') textChunk = d.text;
              else if (typeof d.delta === 'string') textChunk = d.delta;
              else if (typeof d.partial === 'string') textChunk = d.partial;
            }
            // stream text 日志已禁用，减少干扰
            // if (textChunk && textChunk.length > 0) {
            //   console.log('[ClaudeService][VERBOSE] stream text (planning):', textChunk);
            // }
          } else {
            // 简化日志：只打印消息类型和角色，不打印完整内容
            const msgType = message?.type || 'unknown';
            const msgRole = (message as any)?.role || '';
            console.log(`[ClaudeService][VERBOSE] SDK message (planning): type=${msgType}, role=${msgRole}, requestId=${requestId}`);
          }
        } catch { }
      }
      if (requestId) {
        try {
          const cancel = await isCancelRequested(requestId);
          if (cancel && !hasAnnouncedInterrupt) {
            try { await response.interrupt(); } catch { }
            streamManager.publish(projectId, {
              type: 'task_interrupted',
              data: {
                projectId,
                requestId,
                timestamp: new Date().toISOString(),
                message: '任务已被用户中断'
              }
            });
            try { await markUserRequestAsFailed(requestId, '任务已被用户中断'); } catch { }
            publishStatus('cancelled', '任务已被用户中断');
            activeQueryInstances.delete(requestId);
            hasAnnouncedInterrupt = true;
            break;
          }
        } catch { }
      }
      if (message.type === 'user') {
        // 处理 slash 命令输出（规划模式）
        const userRecord = (message as any).message as Record<string, unknown> | undefined;
        const contentValue = userRecord?.content;

        let extractedText = '';
        if (typeof contentValue === 'string') {
          extractedText = contentValue;
        } else if (Array.isArray(contentValue)) {
          for (const block of contentValue) {
            if (!block || typeof block !== 'object') continue;
            const blockRecord = block as Record<string, unknown>;
            if (blockRecord.type === 'text' && typeof blockRecord.text === 'string') {
              extractedText += blockRecord.text;
            }
          }
        }

        const stdoutMatch = extractedText.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
        if (stdoutMatch && stdoutMatch[1]) {
          const commandOutput = stdoutMatch[1].trim();
          if (commandOutput) {
            try {
              const savedMessage = await createMessage({
                projectId,
                role: 'system',
                messageType: 'chat',
                content: commandOutput,
                metadata: { source: 'slash_command', isCommandOutput: true },
                cliSource: 'claude',
                requestId,
              });
              streamManager.publish(projectId, { type: 'message', data: serializeMessage(savedMessage, { requestId }) });
            } catch { }
          }
        }
        continue;
      }

      if (message.type === 'system' && message.subtype === 'init') {
        const currentSessionId = message.session_id;
        if (currentSessionId) {
          await updateProject(projectId, { activeClaudeSessionId: currentSessionId });
        }
        streamManager.publish(projectId, {
          type: 'connected',
          data: { projectId, sessionId: currentSessionId, timestamp: new Date().toISOString(), connectionStage: 'assistant' },
        });
        continue;
      }

      if (message.type === 'assistant') {
        const assistantMessage = message.message;
        let content = '';
        if (typeof assistantMessage.content === 'string') {
          content = assistantMessage.content;
        } else if (Array.isArray(assistantMessage.content)) {
          const parts: string[] = [];
          for (const block of assistantMessage.content as unknown[]) {
            if (!block || typeof block !== 'object') continue;
            const safeBlock = block as any;
            if (safeBlock.type === 'text') {
              const text = typeof safeBlock.text === 'string' ? safeBlock.text : '';
              if (text.trim()) parts.push(text);
            } else if (safeBlock.type === 'tool_use') {
              try {
                const name = typeof safeBlock.name === 'string' ? safeBlock.name : pickFirstString(safeBlock.name);
                const lowerName = (name ?? '').toString().toLowerCase();
                const toolInput = (safeBlock.input ?? safeBlock.tool_input ?? null) as any;
                const planText = typeof toolInput?.plan === 'string' ? toolInput.plan.trim() : '';
                if (__VERBOSE_LOG__) {
                  try {
                    const willShowApproval = lowerName === 'exitplanmode';
                    console.log('############ plan_check_assistant_tool', JSON.stringify({ requestId, name, hit: willShowApproval, planLen: planText.length }, null, 0));
                  } catch { }
                }
                if (lowerName === 'exitplanmode' && !exitPlanDetected) {
                  if (__VERBOSE_LOG__) {
                    try { console.log('[ClaudeService][VERBOSE] ExitPlanMode detected (assistant tool_use)', { requestId, planTextLength: planText.length }); } catch { }
                  }
                  const planMd = planText && planText.length > 0 ? planText : '（暂无方案正文，已检测到退出规划工具）';
                  try {
                    const metadata: Record<string, unknown> = { toolName: 'ExitPlanMode', toolInput: { plan: planMd } };
                    await dispatchToolMessage({
                      projectId,
                      metadata,
                      content: 'Using tool: ExitPlanMode',
                      requestId,
                      persist: true,
                      isStreaming: false,
                      messageType: 'tool_use',
                    });
                  } catch { }
                  // 先保存助手规划消息，避免前端在状态到达时找不到该消息
                  try {
                    const intro = `规划内容如下：\n\n${planMd}`;
                    const savedIntro = await createMessage({
                      projectId,
                      role: 'assistant',
                      messageType: 'chat',
                      content: intro,
                      metadata: { planning: true },
                      cliSource: 'claude',
                      requestId,
                    });
                    streamManager.publish(projectId, { type: 'message', data: serializeMessage(savedIntro, { requestId }) });
                    console.log('[ClaudeService] ✅ Plan intro message saved', { requestId, messageId: savedIntro.id });
                  } catch (err) {
                    console.error('[ClaudeService] ❌ Failed to save plan intro message', { requestId, error: err });
                  }
                  streamManager.publish(projectId, { type: 'status', data: { status: 'planning_completed', planMd, ...(requestId ? { requestId } : {}) } });
                  console.log('🎯🎯🎯 [PLAN_DEBUG] planning_completed 状态事件已发送', { requestId, planMdLength: planMd?.length, type: 'status' });
                  if (__VERBOSE_LOG__) {
                    try { console.log('[ClaudeService][VERBOSE] planning_completed published (assistant tool_use)', { requestId }); } catch { }
                  }
                  if (requestId) {
                    try { await markUserRequestAsWaitingApproval(requestId); } catch { }
                    activeQueryInstances.delete(requestId);
                  }
                  exitPlanDetected = true;
                }
              } catch { }
            }
          }
          content = parts.join('\n');
        }

        // 如果已检测到 ExitPlanMode 并保存了规划消息，跳过通用消息保存，避免重复
        if (content && !exitPlanDetected) {
          const savedMessage = await createMessage({
            projectId,
            role: 'assistant',
            messageType: 'chat',
            content,
            metadata: { planning: true },
            cliSource: 'claude',
            requestId,
          });
          streamManager.publish(projectId, { type: 'message', data: serializeMessage(savedMessage, { requestId }) });
          if (__VERBOSE_LOG__) {
            try { console.log('[ClaudeService][VERBOSE] assistant message persisted', { requestId, length: content.length }); } catch { }
          }
        }
        continue;
      }

      if (message.type === 'result') {
        if (__VERBOSE_LOG__) {
          // 简化日志：只打印result类型，不打印完整JSON
          console.log(`[ClaudeService][VERBOSE] SDK result message: requestId=${requestId}`);
        }
        if (!exitPlanDetected) {
          const denials = (message as any)?.permission_denials;
          if (Array.isArray(denials)) {
            for (const d of denials) {
              const name = ((d?.tool_name ?? d?.toolName) || '').toString().toLowerCase();
              const input = d?.tool_input ?? d?.toolInput ?? null;
              const planText = typeof input?.plan === 'string' ? input.plan.trim() : '';
              if (__VERBOSE_LOG__) {
                try {
                  const willShowApproval = name === 'exitplanmode';
                  console.log('############ plan_check_result_denial', JSON.stringify({ requestId, name, hit: willShowApproval, planLen: planText.length }, null, 0));
                } catch { }
              }
              if (name === 'exitplanmode') {
                if (__VERBOSE_LOG__) {
                  try { console.log('[ClaudeService][VERBOSE] ExitPlanMode detected (result.permission_denials)', { requestId, planTextLength: planText.length }); } catch { }
                }
                const planMd = planText && planText.length > 0 ? planText : '（暂无方案正文，已检测到退出规划工具）';
                const metadata: Record<string, unknown> = { toolName: 'ExitPlanMode', toolInput: { plan: planMd } };
                try {
                  await dispatchToolMessage({
                    projectId,
                    metadata,
                    content: 'Using tool: ExitPlanMode',
                    requestId,
                    persist: true,
                    isStreaming: false,
                    messageType: 'tool_use',
                  });
                } catch { }
                // 先保存助手规划消息
                try {
                  const intro = `规划内容如下：\n\n${planMd}`;
                  const savedIntro = await createMessage({
                    projectId,
                    role: 'assistant',
                    messageType: 'chat',
                    content: intro,
                    metadata: { planning: true },
                    cliSource: 'claude',
                    requestId,
                  });
                  streamManager.publish(projectId, { type: 'message', data: serializeMessage(savedIntro, { requestId }) });
                } catch { }
                streamManager.publish(projectId, { type: 'status', data: { status: 'planning_completed', planMd, ...(requestId ? { requestId } : {}) } });
                console.log('🎯🎯🎯 [PLAN_DEBUG] planning_completed 状态事件已发送 (result.permission_denials)', { requestId, planMdLength: planMd?.length, type: 'status' });
                if (__VERBOSE_LOG__) {
                  try { console.log('[ClaudeService][VERBOSE] planning_completed published (result.permission_denials)', { requestId }); } catch { }
                }
                if (requestId) {
                  try { await markUserRequestAsWaitingApproval(requestId); } catch { }
                  activeQueryInstances.delete(requestId);
                }
                exitPlanDetected = true;
                break;
              }
            }
          }
          if (!exitPlanDetected) {
            if (__VERBOSE_LOG__) {
              try { console.log('[ClaudeService][VERBOSE] planning idle fallback', { requestId }); } catch { }
              try { console.log('############ plan_idle_fallback', JSON.stringify({ requestId, exitPlanDetected }, null, 0)); } catch { }
            }
            publishStatus('idle');
            if (requestId) {
              activeQueryInstances.delete(requestId);
            }
          }
        }
        break;
      }
    }

  } catch (error: any) {
    if (requestId) {
      try { await markUserRequestAsFailed(requestId, error?.message); } catch { }
    }
    streamManager.publish(projectId, { type: 'error', error: error?.message || 'Unknown error', data: requestId ? { requestId } : undefined });
    throw error;
  }
}

/**
 * 中断正在执行的任务
 */
export async function interruptTask(requestId: string, projectId?: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[ClaudeService] 🛑 Interrupting task: ${requestId}`);

  // 写入timeline日志
  if (projectId) {
    try {
      await timelineLogger.logSDK(projectId, '用户触发任务中断', 'warn', requestId, { action: 'interrupt' }, 'user.interrupt');
    } catch (err) {
      console.error('[ClaudeService] Failed to log interrupt to timeline:', err);
    }
  }

  const queryInstance = activeQueryInstances.get(requestId);

  if (!queryInstance) {
    console.warn(`[ClaudeService] ❌ No active query found for requestId: ${requestId}`);
    if (projectId) {
      try {
        await timelineLogger.logSDK(projectId, '中断失败：任务未找到或已完成', 'error', requestId, undefined, 'interrupt.notfound');
      } catch { }
    }
    return { success: false, error: 'Task not found or already completed' };
  }

  try {
    console.log(`[ClaudeService] 🔄 Calling SDK interrupt()...`);
    await queryInstance.interrupt();
    console.log(`[ClaudeService] ✅ Successfully interrupted task: ${requestId}`);

    try { await requestCancelForUserRequest(requestId); } catch { }
    if (projectId) {
      try {
        streamManager.publish(projectId, {
          type: 'task_interrupted',
          data: { projectId, requestId, timestamp: new Date().toISOString(), message: '任务已被用户中断' }
        });
      } catch { }
    }

    if (projectId) {
      try {
        await timelineLogger.logSDK(projectId, '✅ 任务已成功中断', 'info', requestId, undefined, 'interrupt.success');
      } catch { }
    }

    return { success: true };
  } catch (error: any) {
    console.error(`[ClaudeService] ❌ Failed to interrupt task: ${requestId}`, error);

    if (projectId) {
      try {
        await timelineLogger.logSDK(projectId, `中断失败: ${error.message}`, 'error', requestId, { error: error.message }, 'interrupt.error');
      } catch { }
    }

    return { success: false, error: error.message };
  }
}
