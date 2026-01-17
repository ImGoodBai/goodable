/**
 * Employee types - Digital employee management
 */

/**
 * Employee category key (stable, for code use)
 */
export type EmployeeCategoryKey =
  | 'growth'      // 市场与增长
  | 'research'    // 研究与情报
  | 'content'     // 内容与品牌
  | 'sales'       // 销售与商务
  | 'support'     // 客服与运营支持
  | 'admin'       // 行政与财务
  | 'legal'       // 法务与人事
  | 'engineering' // 工程与自动化
  | 'other';      // 其他

/**
 * Employee category config (from JSON)
 */
export interface EmployeeCategoryConfig {
  key: EmployeeCategoryKey;
  name: string;
}

/**
 * Employee mode
 */
export type EmployeeMode = 'code' | 'work';

/**
 * Employee entity
 */
export interface Employee {
  id: string;
  name: string;
  description?: string;
  category: EmployeeCategoryKey;
  mode: EmployeeMode;
  system_prompt: string;
  system_prompt_plan?: string;
  system_prompt_execution?: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Employee creation input
 */
export interface CreateEmployeeInput {
  name: string;
  description?: string;
  category: EmployeeCategoryKey;
  mode: EmployeeMode;
  system_prompt: string;
  system_prompt_plan?: string;
  system_prompt_execution?: string;
}

/**
 * Employee update input
 */
export interface UpdateEmployeeInput {
  name?: string;
  description?: string;
  category?: EmployeeCategoryKey;
  mode?: EmployeeMode;
  system_prompt?: string;
  system_prompt_plan?: string;
  system_prompt_execution?: string;
}

/**
 * Default employee categories config
 */
export const DEFAULT_EMPLOYEE_CATEGORIES: EmployeeCategoryConfig[] = [
  { key: 'engineering', name: '工程与自动化' },
  { key: 'growth', name: '市场与增长' },
  { key: 'research', name: '研究与情报' },
  { key: 'content', name: '内容与品牌' },
  { key: 'sales', name: '销售与商务' },
  { key: 'support', name: '客服与运营支持' },
  { key: 'admin', name: '行政与财务' },
  { key: 'legal', name: '法务与人事' },
];

/**
 * All employee category keys
 */
export const EMPLOYEE_CATEGORY_KEYS: EmployeeCategoryKey[] = [
  'growth',
  'research',
  'content',
  'sales',
  'support',
  'admin',
  'legal',
  'engineering',
  'other',
];
