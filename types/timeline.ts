/**
 * 时间线事件日志类型定义
 */

import type { PreviewPhase, PreviewErrorType } from './realtime';

/**
 * 日志级别
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * 组件来源
 */
export type LogComponent =
  | 'frontend'
  | 'backend'
  | 'sdk'
  | 'install'
  | 'build'
  | 'preview'
  | 'api'
  | 'system';

/**
 * 事件类型
 */
export type TimelineEventType =
  // 生命周期
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'artifact.snapshot'
  | 'artifact.patch_applied'
  | 'signal.transfer'
  // 交互与聊天
  | 'chat.user_message'
  | 'chat.assistant_message'
  | 'chat.edit'
  | 'chat.undo'
  | 'ui.action'
  | 'frontend.error'
  // 安装与构建
  | 'install.detect_pm'
  | 'install.start'
  | 'install.stdout'
  | 'install.stderr'
  | 'install.retry'
  | 'install.cleanup'
  | 'install.complete'
  | 'install.error'
  | 'build.start'
  | 'build.stdout'
  | 'build.stderr'
  | 'build.complete'
  | 'build.error'
  // 预览与运行
  | 'preview.starting'
  | 'preview.running'
  | 'preview.ready'
  | 'preview.error'
  | 'preview.stopped'
  | 'preview.health_check'
  | 'process.spawn'
  | 'process.exit'
  | 'process.kill'
  // SDK
  | 'sdk.init'
  | 'sdk.query'
  | 'sdk.stream'
  | 'sdk.tool_use'
  | 'sdk.tool_result'
  | 'sdk.complete'
  | 'sdk.error'
  // API 与外部
  | 'api.request'
  | 'api.response'
  | 'external.call'
  | 'external.error';

/**
 * 时间线事件基础字段
 */
export interface TimelineEventBase {
  /** 时间戳 ISO 8601 */
  ts: string;
  /** 日志级别 */
  level: LogLevel;
  /** 组件来源 */
  component: LogComponent;
  /** 事件类型 */
  event: TimelineEventType;
  /** 人类可读消息 */
  message: string;
  /** 项目 ID */
  projectId: string;
  /** 任务 ID（等同 requestId） */
  taskId?: string;
  /** 阶段 */
  phase?: PreviewPhase;
}

/**
 * 文件操作元数据
 */
export interface FileOperationMetadata {
  /** 文件路径 */
  path: string;
  /** 操作类型 */
  op: 'add' | 'update' | 'delete';
  /** 修改前 hash */
  hashBefore?: string;
  /** 修改后 hash */
  hashAfter?: string;
}

/**
 * 预览运行元数据
 */
export interface PreviewMetadata {
  /** 端口 */
  port?: number;
  /** URL */
  url?: string;
  /** 进程 PID */
  pid?: number;
  /** 信号 */
  signal?: string;
  /** 健康检查状态 */
  health?: 'ok' | 'error';
}

/**
 * 错误元数据
 */
export interface ErrorMetadata {
  /** 错误类型 */
  errorType?: PreviewErrorType | string;
  /** 严重程度 */
  severity?: 'info' | 'warn' | 'error';
  /** 建议 */
  suggestion?: string;
  /** 堆栈（可裁剪） */
  stack?: string;
}

/**
 * SDK 工具调用元数据
 */
export interface SDKToolMetadata {
  /** 工具名称 */
  toolName?: string;
  /** 目标文件/参数 */
  target?: string;
  /** 动作 */
  action?: string;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 输出结果 */
  output?: string;
}

/**
 * 完整时间线事件
 */
export interface TimelineEvent extends TimelineEventBase {
  /** 扩展元数据 */
  metadata?: Partial<FileOperationMetadata & PreviewMetadata & ErrorMetadata & SDKToolMetadata> & Record<string, unknown>;
}

/**
 * 日志清单文件
 */
export interface LogManifest {
  /** 版本 */
  version: string;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 项目 ID */
  projectId: string;
  /** 任务 ID */
  taskId: string;
  /** 文件列表 */
  files: {
    [filename: string]: {
      /** 文件大小（字节） */
      size: number;
      /** 行数 */
      lines?: number;
      /** 内容 hash */
      hash?: string;
      /** 最后修改时间 */
      lastModified: string;
    };
  };
}
