/**
 * 系统提示词配置模块
 *
 * 提供提示词的加载、获取、更新功能
 * 支持热读取（每次调用从 settings 读取最新值）
 */

import type { PromptKey, PromptsConfig } from './types';
import { DEFAULT_PROMPTS } from './defaults';
import { buildExecutionSystemPrompt, buildPlanningSystemPrompt } from './templates';

export * from './types';
export * from './defaults';
export * from './templates';
export * from './ai-services';

/**
 * 获取提示词（热读取）
 *
 * 每次调用都从 settings 读取最新配置，优先使用用户自定义，否则使用默认值
 *
 * @param key - 提示词键名
 * @returns 提示词内容
 */
export async function getPrompt(key: PromptKey): Promise<string> {
  try {
    // 动态导入避免循环依赖
    const { loadGlobalSettings } = await import('@/lib/services/settings');
    const settings = await loadGlobalSettings();

    // 从 cli_settings.claude.prompts 获取用户自定义提示词
    const claudeSettings = settings.cli_settings?.claude as Record<string, unknown> | undefined;
    const customPrompts = claudeSettings?.prompts as Partial<PromptsConfig> | undefined;

    if (customPrompts && typeof customPrompts[key] === 'string' && customPrompts[key].trim()) {
      return customPrompts[key];
    }
  } catch (error) {
    console.error('[Prompts] Failed to load custom prompts, using defaults:', error);
  }

  // 返回默认值
  return DEFAULT_PROMPTS[key];
}

/**
 * 获取所有提示词（热读取）
 *
 * @returns 所有提示词配置
 */
export async function getAllPrompts(): Promise<PromptsConfig> {
  try {
    const { loadGlobalSettings } = await import('@/lib/services/settings');
    const settings = await loadGlobalSettings();

    const claudeSettings = settings.cli_settings?.claude as Record<string, unknown> | undefined;
    const customPrompts = claudeSettings?.prompts as Partial<PromptsConfig> | undefined;

    // 合并默认值和自定义值
    return {
      'nextjs-execution': customPrompts?.['nextjs-execution']?.trim() || DEFAULT_PROMPTS['nextjs-execution'],
      'nextjs-planning': customPrompts?.['nextjs-planning']?.trim() || DEFAULT_PROMPTS['nextjs-planning'],
      'python-execution': customPrompts?.['python-execution']?.trim() || DEFAULT_PROMPTS['python-execution'],
      'python-planning': customPrompts?.['python-planning']?.trim() || DEFAULT_PROMPTS['python-planning'],
      'work-mode': customPrompts?.['work-mode']?.trim() || DEFAULT_PROMPTS['work-mode'],
      'boss-mode': customPrompts?.['boss-mode']?.trim() || DEFAULT_PROMPTS['boss-mode'],
    };
  } catch (error) {
    console.error('[Prompts] Failed to load prompts, using defaults:', error);
    return { ...DEFAULT_PROMPTS };
  }
}

/**
 * 更新提示词
 *
 * @param key - 提示词键名
 * @param content - 新的提示词内容
 */
export async function updatePrompt(key: PromptKey, content: string): Promise<void> {
  const { loadGlobalSettings, updateGlobalSettings } = await import('@/lib/services/settings');
  const settings = await loadGlobalSettings();

  const claudeSettings = (settings.cli_settings?.claude ?? {}) as Record<string, unknown>;
  const currentPrompts = (claudeSettings.prompts ?? {}) as Partial<PromptsConfig>;

  const newPrompts: Partial<PromptsConfig> = {
    ...currentPrompts,
    [key]: content,
  };

  await updateGlobalSettings({
    cli_settings: {
      ...settings.cli_settings,
      claude: {
        ...claudeSettings,
        prompts: newPrompts,
      },
    },
  });
}

/**
 * 批量更新提示词
 *
 * @param prompts - 要更新的提示词
 */
export async function updatePrompts(prompts: Partial<PromptsConfig>): Promise<void> {
  const { loadGlobalSettings, updateGlobalSettings } = await import('@/lib/services/settings');
  const settings = await loadGlobalSettings();

  const claudeSettings = (settings.cli_settings?.claude ?? {}) as Record<string, unknown>;
  const currentPrompts = (claudeSettings.prompts ?? {}) as Partial<PromptsConfig>;

  const newPrompts: Partial<PromptsConfig> = {
    ...currentPrompts,
    ...prompts,
  };

  await updateGlobalSettings({
    cli_settings: {
      ...settings.cli_settings,
      claude: {
        ...claudeSettings,
        prompts: newPrompts,
      },
    },
  });
}

/**
 * 重置提示词为默认值
 *
 * @param key - 提示词键名，如果不传则重置所有
 */
export async function resetPrompt(key?: PromptKey): Promise<void> {
  const { loadGlobalSettings, updateGlobalSettings } = await import('@/lib/services/settings');
  const settings = await loadGlobalSettings();

  const claudeSettings = (settings.cli_settings?.claude ?? {}) as Record<string, unknown>;
  const currentPrompts = (claudeSettings.prompts ?? {}) as Partial<PromptsConfig>;

  let newPrompts: Partial<PromptsConfig>;

  if (key) {
    // 重置单个：删除该 key，让它回退到默认值
    newPrompts = { ...currentPrompts };
    delete newPrompts[key];
  } else {
    // 重置所有：清空 prompts 对象
    newPrompts = {};
  }

  await updateGlobalSettings({
    cli_settings: {
      ...settings.cli_settings,
      claude: {
        ...claudeSettings,
        prompts: newPrompts,
      },
    },
  });
}

/**
 * Get execution system prompt with dynamic prefix and AI services
 *
 * @param projectType - Project type
 * @param projectPath - Project path
 * @returns Complete system prompt
 */
export async function getExecutionSystemPrompt(
  projectType: 'nextjs' | 'python-fastapi',
  projectPath: string
): Promise<string> {
  const key: PromptKey = projectType === 'python-fastapi' ? 'python-execution' : 'nextjs-execution';
  const basePrompt = await getPrompt(key);

  // Load AI services config
  const { loadGlobalSettings } = await import('@/lib/services/settings');
  const settings = await loadGlobalSettings();
  const aiServicesConfig = settings.ai_services;

  return buildExecutionSystemPrompt(projectPath, basePrompt, aiServicesConfig);
}

/**
 * Get planning system prompt with AI services
 *
 * @param projectType - Project type
 * @returns Complete system prompt
 */
export async function getPlanningSystemPrompt(
  projectType: 'nextjs' | 'python-fastapi'
): Promise<string> {
  const key: PromptKey = projectType === 'python-fastapi' ? 'python-planning' : 'nextjs-planning';
  const basePrompt = await getPrompt(key);

  // Load AI services config
  const { loadGlobalSettings } = await import('@/lib/services/settings');
  const settings = await loadGlobalSettings();
  const aiServicesConfig = settings.ai_services;

  return buildPlanningSystemPrompt(basePrompt, aiServicesConfig);
}
