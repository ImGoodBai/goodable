/**
 * TimelineLogger - 统一日志记录系统
 *
 * 核心职责：
 * 1. 所有日志统一写入 projects/<projectId>/logs/timeline.ndjson
 * 2. 按时间顺序追加，带类型前缀便于过滤
 * 3. 简单高效，易于运维排查
 */

import fs from 'fs/promises';
import path from 'path';
import { PROJECTS_DIR_ABSOLUTE } from '@/lib/config/paths';

/**
 * 日志类型
 */
export type LogType = 'preview' | 'install' | 'sdk' | 'system' | 'error' | 'api' | 'build' | 'process' | 'frontend';

/**
 * 日志级别
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * 时间线日志条目
 */
export interface TimelineEntry {
  /** 时间戳 ISO 8601 */
  ts: string;
  /** 日志类型 */
  type: LogType;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息（带类型前缀） */
  message: string;
  /** 项目 ID */
  projectId: string;
  /** 任务 ID（可选） */
  taskId?: string;
  /** 组件来源（可选） */
  component?: string;
  /** 事件名称（可选） */
  event?: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

class TimelineLogger {
  /**
   * 确保日志目录存在
   */
  private async ensureLogsDir(projectId: string): Promise<string> {
    const logsDir = path.join(PROJECTS_DIR_ABSOLUTE, projectId, 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    return logsDir;
  }

  /**
   * 获取日志文件路径
   */
  private getLogFilePath(projectId: string): string {
    return path.join(PROJECTS_DIR_ABSOLUTE, projectId, 'logs', 'timeline.ndjson');
  }

  /**
   * 添加类型前缀到消息
   */
  private addPrefix(type: LogType, message: string): string {
    const prefix = `[${type.toUpperCase()}]`;
    // 如果消息已经有前缀，不重复添加
    if (message.startsWith('[')) {
      return message;
    }
    return `${prefix} ${message}`;
  }

  /**
   * 追加日志到 timeline.ndjson
   */
  async append(entry: Omit<TimelineEntry, 'ts'>): Promise<void> {
    try {
      await this.ensureLogsDir(entry.projectId);

      const logEntry: TimelineEntry = {
        ts: new Date().toISOString(),
        ...entry,
        message: this.addPrefix(entry.type, entry.message),
      };

      const line = JSON.stringify(logEntry) + '\n';
      const logPath = this.getLogFilePath(entry.projectId);

      const rotateEnabled = String(process.env.TIMELINE_ROTATE ?? '') === '1';
      const maxSizeMbRaw = String(process.env.TIMELINE_MAX_SIZE_MB ?? '64');
      const maxSizeMb = Number(maxSizeMbRaw);
      const sizeLimit = Number.isFinite(maxSizeMb) && maxSizeMb > 1 ? maxSizeMb * 1024 * 1024 : 64 * 1024 * 1024;
      try {
        if (rotateEnabled) {
          const stat = await fs.stat(logPath).catch(() => null);
          if (stat && stat.size > sizeLimit) {
            const rotated = path.join(PROJECTS_DIR_ABSOLUTE, entry.projectId, 'logs', `timeline.ndjson.${Date.now()}`);
            await fs.rename(logPath, rotated).catch(() => {});
          }
        }
      } catch {}

      await fs.appendFile(logPath, line, { encoding: 'utf8' });

      const ts = logEntry.ts;
      const level = logEntry.level;
      const component = logEntry.component ?? logEntry.type;
      const event = logEntry.event ?? '';
      const msg = logEntry.message;
      const whitelist = ['url','port','pid','exitCode','signal','attempt','deep','manager','command','args','cwd','code','msg','requestId','phase','path','size','rel','toolName','filePath','action','metadataJsonLength','metadataPreview','text','prompt','systemPrompt','model','role','messageType','attachments'];
      const md = logEntry.metadata ?? {};
      const showPreview = String(process.env.TIMELINE_TEXT_METADATA_PREVIEW ?? '') === '1';
      const previewLimitRaw = String(process.env.TIMELINE_TEXT_METADATA_PREVIEW_LIMIT ?? '200');
      const previewLimit = (() => { const n = Number(previewLimitRaw); return Number.isFinite(n) && n > 0 ? n : 200; })();
      try {
        if (showPreview) {
          const mj = typeof (md as Record<string, unknown>)['metadataJson'] === 'string' ? ((md as Record<string, unknown>)['metadataJson'] as string) : undefined;
          if (mj) {
            const pv = mj.substring(0, previewLimit) + (mj.length > previewLimit ? '...' : '');
            (md as Record<string, unknown>)['metadataPreview'] = pv;
          }
        }
      } catch {}
      const kv = whitelist
        .filter((k) => Object.prototype.hasOwnProperty.call(md, k))
        .map((k) => {
          const v = (md as Record<string, unknown>)[k];
          const val = typeof v === 'string' ? v : Array.isArray(v) ? JSON.stringify(v) : v === undefined ? '' : String(v);
          return `${k}=${val}`;
        })
        .join(' ');
      const textLine = [ts, level, component, event, msg, kv].filter(Boolean).join(' - ') + '\n';
      const txtPath = path.join(PROJECTS_DIR_ABSOLUTE, entry.projectId, 'logs', 'timeline.txt');
      try {
        if (rotateEnabled) {
          const tstat = await fs.stat(txtPath).catch(() => null);
          if (tstat && tstat.size > sizeLimit) {
            const trotated = path.join(PROJECTS_DIR_ABSOLUTE, entry.projectId, 'logs', `timeline.txt.${Date.now()}`);
            await fs.rename(txtPath, trotated).catch(() => {});
          }
        }
      } catch {}
      await fs.appendFile(txtPath, textLine, { encoding: 'utf8' });
    } catch (error) {
      console.error('[TimelineLogger] Failed to append log:', error);
      // 不抛出错误，避免阻塞主流程
    }
  }

  /**
   * 读取最近的日志（用于查询）
   */
  async read(projectId: string, limit?: number): Promise<TimelineEntry[]> {
    try {
      const logPath = this.getLogFilePath(projectId);
      const content = await fs.readFile(logPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      const entries = lines
        .map(line => {
          try {
            return JSON.parse(line) as TimelineEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is TimelineEntry => e !== null);

      if (limit && limit > 0) {
        return entries.slice(-limit);
      }

      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 便捷方法：记录预览日志
   */
  async logPreview(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'preview',
      level,
      message,
      projectId,
      taskId,
      component: 'preview',
      event,
      metadata,
    });
  }

  /**
   * 便捷方法：记录安装日志
   */
  async logInstall(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'install',
      level,
      message,
      projectId,
      taskId,
      component: 'install',
      event,
      metadata,
    });
  }

  /**
   * 便捷方法：记录 SDK 日志
   */
  async logSDK(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'sdk',
      level,
      message,
      projectId,
      taskId,
      component: 'sdk',
      event,
      metadata,
    });
  }

  /**
   * 便捷方法：记录系统日志
   */
  async logSystem(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'system',
      level,
      message,
      projectId,
      taskId,
      component: 'system',
      event,
      metadata,
    });
  }

  /**
   * 便捷方法：记录错误日志
   */
  async logError(
    projectId: string,
    message: string,
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'error',
      level: 'error',
      message,
      projectId,
      taskId,
      component: 'error',
      event,
      metadata,
    });
  }

  async logAPI(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'api',
      level,
      message,
      projectId,
      taskId,
      component: 'api',
      event,
      metadata,
    });
  }

  async logBuild(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'build',
      level,
      message,
      projectId,
      taskId,
      component: 'build',
      event,
      metadata,
    });
  }

  async logProcess(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'process',
      level,
      message,
      projectId,
      taskId,
      component: 'process',
      event,
      metadata,
    });
  }

  async logFrontend(
    projectId: string,
    message: string,
    level: LogLevel = 'info',
    taskId?: string,
    metadata?: Record<string, unknown>,
    event?: string
  ): Promise<void> {
    await this.append({
      type: 'frontend',
      level,
      message,
      projectId,
      taskId,
      component: 'frontend',
      event,
      metadata,
    });
  }
}

// 导出单例
const globalTimeline = globalThis as unknown as { __claudable_timeline_logger__?: TimelineLogger };
export const timelineLogger: TimelineLogger =
  globalTimeline.__claudable_timeline_logger__ ??
  (globalTimeline.__claudable_timeline_logger__ = new TimelineLogger());
