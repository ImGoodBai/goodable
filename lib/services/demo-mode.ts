/**
 * Demo Mode Service - 演示模式：关键词/模板触发快速项目构建
 *
 * 两层解耦设计：
 * 1. 触发层：
 *    - 关键词匹配 → 选择模板（慢速回放）
 *    - 模板使用按钮 → 检测 mock.json 存在即触发（快速回放）
 * 2. 回放层：支持两种数据源
 *    - 模板目录 mock.json（优先）
 *    - 数据库 sourceProjectId（备选）
 */

import fs from 'fs/promises';
import path from 'path';
import { getTemplateById, extractZipTemplate } from '@/lib/services/template';
import { createMessage, getMessagesByProjectId } from '@/lib/services/message';
import { streamManager } from '@/lib/services/stream';
import { serializeMessage } from '@/lib/serializers/chat';
import { PROJECTS_DIR_ABSOLUTE, TEMPLATES_DIR_ABSOLUTE } from '@/lib/config/paths';

interface DemoConfig {
  keyword: string;
  templateId?: string;       // 模式1：新建项目 + 复制模板
  sourceProjectId?: string;  // 模式2：直接在源项目回放
  deployedUrl?: string;      // 模式2：已部署的 URL
}

interface MockMessage {
  role: 'assistant' | 'user' | 'system' | 'tool';
  messageType: 'chat' | 'tool_use' | 'tool_result' | 'error' | 'info' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

interface MockData {
  messages: MockMessage[];
}

// 回放速度类型
export type ReplaySpeed = 'slow' | 'fast';

// Cache with mtime for hot-reload support
let demoConfigCache: DemoConfig[] | null = null;
let demoConfigMtime: number = 0;
let demoConfigPath: string | null = null;

/**
 * 获取回放延迟配置
 */
function getReplayDelay(speed: ReplaySpeed): { base: number; random: number } {
  if (speed === 'fast') {
    const base = parseInt(process.env.DEMO_REPLAY_DELAY_FAST || '167', 10);
    const random = parseInt(process.env.DEMO_REPLAY_DELAY_FAST_RANDOM || '166', 10);
    return { base, random };
  } else {
    const base = parseInt(process.env.DEMO_REPLAY_DELAY_SLOW || '500', 10);
    const random = parseInt(process.env.DEMO_REPLAY_DELAY_SLOW_RANDOM || '500', 10);
    return { base, random };
  }
}

/**
 * Check if config file changed (by mtime)
 * Returns mtime for caller to update cache only after successful read
 */
async function checkConfigChanged(configPath: string): Promise<{ changed: boolean; mtime: number }> {
  try {
    const stat = await fs.stat(configPath);
    const mtime = stat.mtimeMs;
    if (demoConfigPath === configPath && mtime === demoConfigMtime) {
      return { changed: false, mtime };
    }
    return { changed: true, mtime };
  } catch {
    return { changed: true, mtime: 0 };
  }
}

/**
 * 加载演示配置
 * - 生产环境（SETTINGS_DIR 已设置）：固定从用户设置目录读取
 * - 开发环境：从 templates 目录读取
 * - 支持热重载：基于文件 mtime 自动失效缓存
 */
async function loadDemoConfig(): Promise<DemoConfig[]> {
  const settingsDir = process.env.SETTINGS_DIR;

  // 生产环境：固定从用户设置目录读取
  if (settingsDir) {
    const configPath = path.join(settingsDir, 'demo-config.json');
    const { changed, mtime } = await checkConfigChanged(configPath);
    if (!changed && demoConfigCache) {
      return demoConfigCache;
    }
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      demoConfigCache = JSON.parse(content);
      demoConfigPath = configPath;
      demoConfigMtime = mtime;
      console.log(`[DemoMode] Loaded config from ${configPath}${changed ? ' (reloaded)' : ''}`);
      return demoConfigCache || [];
    } catch {
      console.log(`[DemoMode] Config not found at ${configPath}`);
      return [];
    }
  }

  // 开发环境：从 templates 目录读取
  const configPaths = [
    path.join(TEMPLATES_DIR_ABSOLUTE, 'demo-config.json'),
    path.join(process.cwd(), 'templates', 'demo-config.json'),
    path.join(process.cwd(), 'data', 'demo-config.json'), // 兼容旧路径
  ];

  for (const configPath of configPaths) {
    try {
      const { changed, mtime } = await checkConfigChanged(configPath);
      if (!changed && demoConfigCache) {
        return demoConfigCache;
      }
      const content = await fs.readFile(configPath, 'utf-8');
      demoConfigCache = JSON.parse(content);
      demoConfigPath = configPath;
      demoConfigMtime = mtime;
      console.log(`[DemoMode] Loaded config from ${configPath}${changed ? ' (reloaded)' : ''}`);
      return demoConfigCache || [];
    } catch {
      continue;
    }
  }

  console.log('[DemoMode] No demo config found');
  return [];
}

/**
 * 检测是否匹配演示关键词
 */
export async function matchDemoKeyword(instruction: string): Promise<DemoConfig | null> {
  const configs = await loadDemoConfig();
  const trimmed = instruction.trim();

  for (const config of configs) {
    if (trimmed === config.keyword) {
      return config;
    }
  }
  return null;
}

/**
 * 检测模板是否有 mock.json（用于模板使用时判断是否触发回放）
 */
export async function checkTemplateHasMock(templateId: string): Promise<boolean> {
  const template = await getTemplateById(templateId);
  if (!template) return false;

  const mockPath = path.join(template.templatePath, 'mock.json');
  try {
    await fs.access(mockPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证文件路径是否安全（防止路径遍历攻击）
 */
function isValidFilePath(filePath: string): boolean {
  // 禁止绝对路径
  if (path.isAbsolute(filePath)) return false;
  // 禁止路径遍历
  const normalized = path.normalize(filePath);
  if (normalized.startsWith('..') || normalized.includes('..')) return false;
  return true;
}

/**
 * 判断文件是否为文本文件（可读取内容展示）
 */
function isTextFile(filePath: string): boolean {
  const textExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.scss', '.less',
    '.md', '.txt', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
    '.sh', '.bash', '.zsh', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
    '.xml', '.svg', '.vue', '.svelte', '.astro', '.prisma', '.graphql', '.sql',
    '.env', '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc',
    '.eslintrc', '.babelrc', 'Dockerfile', 'Makefile', 'requirements.txt',
    'package.json', 'tsconfig.json', 'vite.config.ts', 'next.config.js',
  ];
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return textExtensions.includes(ext) || textExtensions.includes(basename);
}

/**
 * 从模板目录加载 mock.json，支持从真实文件读取内容
 */
async function loadMockFromTemplate(templateId: string, projectPath: string): Promise<MockMessage[] | null> {
  const template = await getTemplateById(templateId);
  if (!template) return null;

  const mockPath = path.join(template.templatePath, 'mock.json');
  try {
    const content = await fs.readFile(mockPath, 'utf-8');
    const data: MockData = JSON.parse(content);
    if (!Array.isArray(data.messages) || data.messages.length === 0) {
      return null;
    }

    // 处理消息，如果需要从真实文件读取内容
    const processedMessages: MockMessage[] = [];
    for (const msg of data.messages) {
      if (msg.role === 'tool' && msg.messageType === 'tool_use' && msg.metadata) {
        const meta = msg.metadata as Record<string, unknown>;
        const toolName = (meta.toolName as string || '').toLowerCase();
        const filePath = meta.filePath as string;
        const hasContent = meta.fileContent !== undefined && meta.fileContent !== null;

        // 如果是 write 操作且没有 fileContent，从真实文件读取内容
        if (toolName === 'write' && filePath && !hasContent && isTextFile(filePath) && isValidFilePath(filePath)) {
          try {
            // 构建真实文件路径（相对于项目目录）
            const realFilePath = path.join(projectPath, filePath);
            const fileContent = await fs.readFile(realFilePath, 'utf-8');
            // 创建新的 metadata，添加 fileContent
            const newMeta = { ...meta, fileContent };
            processedMessages.push({
              ...msg,
              metadata: newMeta,
            });
            console.log(`[DemoMode] Auto-read file content: ${filePath}`);
            continue;
          } catch (err) {
            console.warn(`[DemoMode] Failed to read file ${filePath}:`, err);
            // fallback: 使用原始 metadata（没有 fileContent）
          }
        }
      }
      processedMessages.push(msg);
    }

    console.log(`[DemoMode] Loaded ${processedMessages.length} messages from mock.json`);
    return processedMessages;
  } catch {
    // mock.json 不存在或格式错误
  }
  return null;
}

/**
 * 从数据库加载消息（复用现有服务）
 * 适配数据库 metadata 格式到回放格式
 */
async function loadMessagesFromDatabase(sourceProjectId: string): Promise<MockMessage[] | null> {
  const sourceMessages = await getMessagesByProjectId(sourceProjectId, 1000, 0);

  if (sourceMessages.length === 0) return null;

  console.log(`[DemoMode] Loaded ${sourceMessages.length} messages from database`);

  return sourceMessages.map(msg => {
    let metadata: Record<string, unknown> | undefined;
    if (msg.metadataJson) {
      try {
        metadata = JSON.parse(msg.metadataJson);
      } catch {}
    }

    // 适配数据库格式：toolInput.file_path → filePath, toolInput.content → fileContent
    if (metadata && metadata.toolInput && typeof metadata.toolInput === 'object') {
      const toolInput = metadata.toolInput as Record<string, unknown>;

      // 提取文件路径
      if (toolInput.file_path && !metadata.filePath) {
        metadata.filePath = toolInput.file_path;
      }

      // 提取文件内容（Write工具）
      if (toolInput.content && !metadata.fileContent) {
        metadata.fileContent = toolInput.content;
      }

      // 提取旧字符串（Edit工具）
      if (toolInput.old_string && !metadata.oldString) {
        metadata.oldString = toolInput.old_string;
      }

      // 提取新字符串（Edit工具）
      if (toolInput.new_string && !metadata.newString) {
        metadata.newString = toolInput.new_string;
      }
    }

    return {
      role: msg.role as MockMessage['role'],
      messageType: msg.messageType as MockMessage['messageType'],
      content: msg.content,
      metadata,
    };
  });
}

/**
 * 复制目录（递归）
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 复制模板代码到项目目录
 */
async function copyTemplateToProject(templateId: string, projectId: string): Promise<boolean> {
  const template = await getTemplateById(templateId);
  if (!template) {
    console.error(`[DemoMode] Template not found: ${templateId}`);
    return false;
  }

  const targetPath = path.join(PROJECTS_DIR_ABSOLUTE, projectId);

  try {
    if (template.format === 'zip') {
      const zipPath = path.join(template.templatePath, 'project.zip');
      await extractZipTemplate(zipPath, targetPath);
      console.log(`[DemoMode] Extracted zip template to ${projectId}`);
    } else {
      await copyDirectory(template.projectPath, targetPath);
      console.log(`[DemoMode] Copied source template to ${projectId}`);
    }
    return true;
  } catch (error) {
    console.error(`[DemoMode] Failed to copy template:`, error);
    return false;
  }
}

/**
 * 回放消息（核心函数，解耦的第二层）
 * 支持 plan 模式自动确认和速度配置
 */
export async function replayMessages(
  messagesToReplay: MockMessage[],
  projectId: string,
  requestId: string,
  speed: ReplaySpeed = 'slow'
): Promise<void> {
  const delayConfig = getReplayDelay(speed);
  console.log(`[DemoMode] Replay speed: ${speed}, delay: ${delayConfig.base}-${delayConfig.base + delayConfig.random}ms`);

  // 找到最后一条 planning 消息的索引
  let lastPlanningIndex = -1;
  for (let i = messagesToReplay.length - 1; i >= 0; i--) {
    const meta = messagesToReplay[i].metadata;
    if (meta && (meta as Record<string, unknown>).planning === true) {
      lastPlanningIndex = i;
      break;
    }
  }

  for (let i = 0; i < messagesToReplay.length; i++) {
    const msg = messagesToReplay[i];

    // 跳过用户消息
    if (msg.role === 'user') continue;

    // 根据速度配置模拟延迟
    const delay = delayConfig.base + Math.random() * delayConfig.random;
    await new Promise(resolve => setTimeout(resolve, delay));

    // 创建新消息并保存到数据库
    const newMessage = await createMessage({
      projectId,
      role: msg.role,
      messageType: msg.messageType,
      content: msg.content,
      metadata: msg.metadata,
      cliSource: 'claude',
      requestId,
    });

    // 推送 SSE
    streamManager.publish(projectId, {
      type: 'message',
      data: serializeMessage(newMessage, { requestId }),
    });

    // 检测 write/edit 工具并推送 file_change 事件
    if (msg.role === 'tool' && msg.messageType === 'tool_use' && msg.metadata) {
      const meta = msg.metadata as Record<string, unknown>;
      const toolName = (meta.toolName as string || '').toLowerCase();
      const filePath = meta.filePath as string;

      if ((toolName === 'write' || toolName === 'edit') && filePath) {
        const isWrite = toolName === 'write';
        streamManager.publish(projectId, {
          type: 'file_change',
          data: {
            type: isWrite ? 'write' : 'edit',
            filePath,
            content: isWrite ? (meta.fileContent as string) : undefined,
            oldString: !isWrite ? (meta.oldString as string) : undefined,
            newString: !isWrite ? (meta.newString as string) : undefined,
            timestamp: new Date().toISOString(),
            requestId,
          }
        });
      }
    }

    // 如果是最后一条 planning 消息，发送 planning_completed 并等待
    if (i === lastPlanningIndex) {
      console.log(`[DemoMode] Sending planning_completed for auto-confirm`);

      // 发送 planning_completed 状态（前端会显示确认按钮）
      streamManager.publish(projectId, {
        type: 'status',
        data: {
          status: 'planning_completed',
          planMd: msg.content,
          requestId,
        },
      });

      // 延迟让前端短暂显示确认按钮（快速模式缩短等待）
      const planDelay = speed === 'fast' ? 500 : 1500;
      await new Promise(resolve => setTimeout(resolve, planDelay));

      // 发送 plan_approved 状态，前端会清除确认按钮
      streamManager.publish(projectId, {
        type: 'status',
        data: {
          status: 'plan_approved',
          requestId,
        },
      });

      console.log(`[DemoMode] Auto-confirmed plan, continuing replay`);
    }
  }
}

/**
 * 执行演示模式（关键词触发，慢速）
 * 新建项目 + 复制模板 + 回放消息并保存
 */
export async function executeDemoMode(
  config: DemoConfig,
  projectId: string,
  requestId: string
): Promise<void> {
  // 如果是 sourceProjectId 模式，不应该调用这个函数
  if (!config.templateId) {
    console.error(`[DemoMode] executeDemoMode called without templateId`);
    return;
  }

  console.log(`[DemoMode] Starting demo mode (keyword trigger, slow) for project ${projectId}`);

  // 1. 发送 ai_thinking 状态
  streamManager.publish(projectId, {
    type: 'status',
    data: { status: 'ai_thinking', requestId },
  });

  // 2. 复制模板代码到项目目录
  const copied = await copyTemplateToProject(config.templateId!, projectId);
  if (!copied) {
    streamManager.publish(projectId, {
      type: 'status',
      data: { status: 'ai_completed', requestId },
    });
    return;
  }

  const projectPath = path.join(PROJECTS_DIR_ABSOLUTE, projectId);

  // 3. 加载消息（优先 mock.json，备选数据库）
  let messagesToReplay = await loadMockFromTemplate(config.templateId!, projectPath);

  if (!messagesToReplay && config.sourceProjectId) {
    messagesToReplay = await loadMessagesFromDatabase(config.sourceProjectId);
  }

  if (!messagesToReplay || messagesToReplay.length === 0) {
    console.error(`[DemoMode] No messages to replay for template: ${config.templateId!}`);
    streamManager.publish(projectId, {
      type: 'status',
      data: { status: 'ai_completed', requestId },
    });
    return;
  }

  // 4. 回放消息（保存到数据库），关键词触发使用慢速
  await replayMessages(messagesToReplay, projectId, requestId, 'slow');

  // 5. 发送完成状态
  streamManager.publish(projectId, {
    type: 'status',
    data: { status: 'ai_completed', requestId },
  });

  // 注意：不再自动触发预览，由用户手动点击预览按钮

  console.log(`[DemoMode] Demo mode completed for project ${projectId}`);
}

/**
 * 执行演示模式（模板使用触发，快速）
 * 用于模板卡片"使用"按钮触发的回放
 */
export async function executeDemoModeForTemplate(
  templateId: string,
  projectId: string,
  requestId: string
): Promise<void> {
  console.log(`[DemoMode] Starting demo mode (template trigger, fast) for project ${projectId}`);

  // 1. 发送 ai_thinking 状态
  streamManager.publish(projectId, {
    type: 'status',
    data: { status: 'ai_thinking', requestId },
  });

  const projectPath = path.join(PROJECTS_DIR_ABSOLUTE, projectId);

  // 2. 加载消息（从 mock.json）
  const messagesToReplay = await loadMockFromTemplate(templateId, projectPath);

  if (!messagesToReplay || messagesToReplay.length === 0) {
    console.log(`[DemoMode] No mock.json or empty messages for template: ${templateId}`);
    streamManager.publish(projectId, {
      type: 'status',
      data: { status: 'ai_completed', requestId },
    });
    return;
  }

  // 3. 回放消息（保存到数据库），模板触发使用快速
  await replayMessages(messagesToReplay, projectId, requestId, 'fast');

  // 4. 发送完成状态
  streamManager.publish(projectId, {
    type: 'status',
    data: { status: 'ai_completed', requestId },
  });

  console.log(`[DemoMode] Demo mode (template trigger) completed for project ${projectId}`);
}

/**
 * 清除配置缓存（开发用）
 */
export function invalidateDemoConfigCache(): void {
  demoConfigCache = null;
}
