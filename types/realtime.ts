import type { MessageMetadata } from '@/types/backend';

export type MessageRole = 'assistant' | 'user' | 'system' | 'tool';

export type MessageKind = 'chat' | 'tool_use' | 'error' | 'info' | string;

export interface RealtimeMessage {
  id: string;
  projectId: string;
  role: MessageRole;
  messageType: MessageKind;
  content: string;
  metadata?: MessageMetadata | null;
  parentMessageId?: string | null;
  conversationId?: string | null;
  sessionId?: string | null;
  cliSource?: string | null;
  requestId?: string | null;
  createdAt: string;
  updatedAt?: string;
  isStreaming?: boolean;
  isFinal?: boolean;
  isOptimistic?: boolean; // Flag for optimistically added messages (not yet confirmed by server)
}

export type PreviewPhase =
  | 'idle'
  | 'sdk_running'
  | 'sdk_completed'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'error';

export type PreviewErrorType =
  | 'dependency'    // npm install 相关
  | 'build'         // 编译/构建错误
  | 'runtime'       // 运行时错误
  | 'network'       // 网络连接错误
  | 'port'          // 端口冲突
  | 'structure'     // 项目结构不符合要求
  | 'unknown';

export interface RealtimeStatus {
  status: string;
  message?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  phase?: PreviewPhase;
  errorType?: PreviewErrorType;
  suggestion?: string;
}

export type StreamTransport = 'sse' | 'websocket';

export interface ConnectionInfo {
  projectId: string;
  timestamp: string;
  sessionId?: string;
  transport?: StreamTransport;
  connectionStage?: 'handshake' | 'assistant';
}

export interface HeartbeatInfo {
  timestamp: string;
}

export interface PreviewEventInfo {
  message: string;
  severity?: 'info' | 'warning' | 'error';
}

export interface LogEventInfo {
  level: 'stdout' | 'stderr' | 'info' | 'error' | 'warn';
  content: string;
  source: 'preview' | 'cli' | 'build' | 'system';
  projectId: string;
  timestamp?: string;
  phase?: PreviewPhase;
  errorType?: PreviewErrorType;
  suggestion?: string;
  metadata?: Record<string, unknown>;
}

export type RealtimeEvent =
  | { type: 'message'; data: RealtimeMessage }
  | { type: 'status'; data: RealtimeStatus }
  | { type: 'error'; error: string; data?: unknown }
  | { type: 'connected'; data: ConnectionInfo }
  | { type: 'heartbeat'; data: HeartbeatInfo }
  | { type: 'preview_installing'; data: RealtimeStatus }
  | { type: 'preview_starting'; data: RealtimeStatus }
  | { type: 'preview_ready'; data: RealtimeStatus }
  | { type: 'preview_error'; data: PreviewEventInfo }
  | { type: 'preview_success'; data: PreviewEventInfo }
  | { type: 'sdk_completed'; data: RealtimeStatus }
  | { type: 'log'; data: LogEventInfo }
  | { type: 'request_status'; data: { hasActiveRequests: boolean; activeCount: number } };
