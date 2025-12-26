/**
 * Mock data for online template marketplace
 * These are simulated online templates not yet downloaded locally
 */

export interface OnlineTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  category?: string;
  tags: string[];
  icon?: string;
  isDownloaded: boolean;
}

export const ONLINE_TEMPLATES: OnlineTemplate[] = [
  {
    id: 'online-shop',
    name: '电商小店',
    description: '帮你快速搭建在线商店，支持商品展示、购物车、在线支付。适合个人创业者和小商家。',
    author: 'Goodable 官方',
    category: '电商',
    tags: ['在线销售', '支付', '库存管理'],
    isDownloaded: false,
  },
  {
    id: 'appointment-system',
    name: '预约助手',
    description: '专业的预约管理系统，客户可以在线预约时间，自动提醒。适合美容院、诊所、咨询服务等。',
    author: 'Goodable 官方',
    category: '服务',
    tags: ['预约', '日程管理', '客户管理'],
    isDownloaded: false,
  },
  {
    id: 'survey-tool',
    name: '问卷调查',
    description: '轻松创建各种调查问卷，收集反馈意见，自动统计分析结果。适合市场调研、客户满意度调查。',
    author: 'Goodable 社区',
    category: '调研',
    tags: ['问卷', '数据收集', '统计分析'],
    isDownloaded: false,
  },
  {
    id: 'task-manager',
    name: '任务管理',
    description: '简洁高效的待办事项管理工具，支持任务分类、优先级设置、进度跟踪。适合个人和小团队。',
    author: 'Goodable 社区',
    category: '效率',
    tags: ['待办清单', '项目管理', '团队协作'],
    isDownloaded: false,
  },
];
