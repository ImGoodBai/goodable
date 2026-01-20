/**
 * Permission management service for Claude SDK integration
 * Quick version: auto-approve all requests with logging
 */

import type { PermissionMode } from '@/types/backend/project';

export interface PermissionRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: string;
  projectId: string;
  requestId: string;
}

export interface PermissionDecision {
  approved: boolean;
  reason?: string;
  timestamp: string;
}

// Read-only tools that are always safe to auto-approve
const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'Task',
  'TodoRead',
  'WebFetch',
  'WebSearch',
]);

// File editing tools
const EDIT_TOOLS = new Set([
  'Write',
  'Edit',
  'NotebookEdit',
]);

/**
 * Determine if a tool should be auto-approved based on permission mode
 */
export function shouldAutoApprove(
  toolName: string,
  permissionMode: PermissionMode
): boolean {
  switch (permissionMode) {
    case 'bypassPermissions':
      // All tools auto-approved
      return true;

    case 'acceptEdits':
      // Read-only and edit tools auto-approved
      return READ_ONLY_TOOLS.has(toolName) || EDIT_TOOLS.has(toolName);

    case 'default':
    default:
      // Only read-only tools auto-approved
      return READ_ONLY_TOOLS.has(toolName);
  }
}

/**
 * Get human-readable description for permission mode
 */
export function getPermissionModeLabel(mode: PermissionMode): string {
  switch (mode) {
    case 'default':
      return '默认模式';
    case 'acceptEdits':
      return '接受编辑';
    case 'bypassPermissions':
      return '全放行';
    default:
      return mode;
  }
}

/**
 * Get description for permission mode
 */
export function getPermissionModeDescription(mode: PermissionMode): string {
  switch (mode) {
    case 'default':
      return '只读工具自动放行，写入需确认';
    case 'acceptEdits':
      return '文件编辑自动放行，其他需确认';
    case 'bypassPermissions':
      return '所有工具自动放行';
    default:
      return '';
  }
}

/**
 * Log permission decision for debugging and auditing
 */
export function logPermissionDecision(
  projectId: string,
  toolName: string,
  permissionMode: PermissionMode,
  autoApproved: boolean,
  toolInput?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const inputSummary = toolInput
    ? JSON.stringify(toolInput).slice(0, 200)
    : 'N/A';

  console.log(
    `[Permission] ${timestamp} | project=${projectId} | tool=${toolName} | mode=${permissionMode} | auto=${autoApproved} | input=${inputSummary}`
  );
}
