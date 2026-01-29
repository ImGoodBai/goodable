/**
 * 系统提示词配置类型定义
 */

/**
 * 提示词键名
 */
export type PromptKey =
  | 'nextjs-execution'      // Next.js 执行阶段
  | 'nextjs-planning'       // Next.js 规划阶段
  | 'python-execution'      // Python 执行阶段
  | 'python-planning'       // Python 规划阶段
  | 'work-mode'             // Work 文件操作模式
  | 'boss-mode';            // Boss 员工管理模式

/**
 * 提示词配置
 */
export interface PromptConfig {
  /** 提示词键名 */
  key: PromptKey;
  /** 显示名称 */
  label: string;
  /** 描述 */
  description: string;
  /** 提示词内容 */
  content: string;
}

/**
 * 所有提示词配置
 */
export interface PromptsConfig {
  'nextjs-execution': string;
  'nextjs-planning': string;
  'python-execution': string;
  'python-planning': string;
  'work-mode': string;
  'boss-mode': string;
}

/**
 * 提示词元数据（用于前端显示）
 */
export const PROMPT_METADATA: Record<PromptKey, { label: string; description: string }> = {
  'nextjs-execution': {
    label: 'Next.js 执行提示词',
    description: '控制 AI 在执行 Next.js 项目代码生成时的行为规范',
  },
  'nextjs-planning': {
    label: 'Next.js 规划提示词',
    description: '控制 AI 在规划 Next.js 项目方案时的沟通方式',
  },
  'python-execution': {
    label: 'Python 执行提示词',
    description: '控制 AI 在执行 Python FastAPI 项目代码生成时的行为规范',
  },
  'python-planning': {
    label: 'Python 规划提示词',
    description: '控制 AI 在规划 Python FastAPI 项目方案时的沟通方式',
  },
  'work-mode': {
    label: 'Work 模式操作提示词',
    description: '控制 AI 在 Work 模式下进行文件操作时的行为规范',
  },
  'boss-mode': {
    label: 'Boss 模式管理提示词',
    description: '控制 AI 在 Boss 模式下管理数字员工和分配任务时的行为规范',
  },
};
