/**
 * Fixed templates (non-editable)
 *
 * These templates contain placeholders that are replaced at runtime
 */

import { buildAIServicesPrompt, type AIServicesConfig } from './ai-services';

/**
 * 执行阶段前缀模板
 *
 * 占位符：
 * - {{PROJECT_PATH}} - 项目路径
 */
export const EXECUTION_PREFIX_TEMPLATE = `## 重要：当前工作环境

**你当前正在此项目目录中工作：**
\`{{PROJECT_PATH}}\`

**严格要求：**
- 所有文件操作必须在此目录内进行
- **所有新生成的文件（Excel、Word、PDF、PPT等）必须保存到当前工作目录**
- 优先使用相对路径（如 \`output.xlsx\`、\`报告.docx\`、\`演示.pptx\`、\`app/page.tsx\`）
- 如需使用绝对路径，必须是此目录内的路径
- 严禁访问父级目录（\`../\`）或其他项目目录
- 严禁使用指向项目外的绝对路径
- **禁止在技能安装目录（如 user-skills/）或系统临时目录生成输出文件**
`;

/**
 * 安全警告模板（bypassPermissions 模式）
 */
export const SECURITY_WARNING_TEMPLATE = `
⚠️ 【路径安全警告】
- 当前环境路径检查已禁用
- 你的所有文件操作都会被审计日志记录
- 严格遵守以下规则，否则操作会被标记为安全违规：
  1. 禁止使用绝对路径（如 C:\\、D:\\、/Users/）
  2. 禁止使用 ../ 跳出项目目录
  3. 仅使用项目内相对路径（如 app/page.tsx）
- 违规操作将被记录并可能导致项目暂停
`;

/**
 * Build execution system prompt with AI services
 *
 * @param projectPath - Project path
 * @param basePrompt - Base prompt (editable part)
 * @param aiServicesConfig - Optional AI services configuration
 * @returns Complete system prompt
 */
export function buildExecutionSystemPrompt(
  projectPath: string,
  basePrompt: string,
  aiServicesConfig?: AIServicesConfig
): string {
  const prefix = EXECUTION_PREFIX_TEMPLATE.replace('{{PROJECT_PATH}}', projectPath);
  const aiServicesPrompt = buildAIServicesPrompt(aiServicesConfig);

  return `${prefix}${SECURITY_WARNING_TEMPLATE}
${aiServicesPrompt ? '\n' + aiServicesPrompt + '\n' : ''}
${basePrompt}`;
}

/**
 * Build planning system prompt with AI services
 *
 * @param basePrompt - Base prompt (editable part)
 * @param aiServicesConfig - Optional AI services configuration
 * @returns Complete system prompt
 */
export function buildPlanningSystemPrompt(
  basePrompt: string,
  aiServicesConfig?: AIServicesConfig
): string {
  const aiServicesPrompt = buildAIServicesPrompt(aiServicesConfig);
  if (aiServicesPrompt) {
    return `${aiServicesPrompt}\n${basePrompt}`;
  }
  return basePrompt;
}
