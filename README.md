# Goodable - AI Web App Builder

AI 驱动的 Web 应用构建平台。通过自然语言描述需求，自动生成 Next.js 项目。

## 核心概念

### 主项目 vs 子项目
- **主项目**：Claudable 平台本身（当前目录）
- **子项目**：用户通过 AI 生成的项目，存储在 `PROJECTS_DIR` 配置的目录

### 关键配置文件
- **`lib/config/paths.ts`** - 路径配置中心，所有项目路径的单一真实来源
- **`.env`** - 环境变量配置

## 环境变量

```bash
# 子项目存储目录（必需）
PROJECTS_DIR="./data/projects"

# 主应用端口
PORT=3006
WEB_PORT=3006

# 子项目预览端口范围
PREVIEW_PORT_START=3100
PREVIEW_PORT_END=3999

# 数据库
DATABASE_URL="file:./data/cc.db"
```

## 目录结构

```
Claudable/                      # 主项目
├── app/                        # Next.js App Router
│   ├── page.tsx               # 主页（项目列表）
│   ├── [project_id]/chat/     # 子项目聊天界面
│   └── api/                   # API 路由
├── lib/
│   ├── config/paths.ts        # ⭐ 路径配置中心
│   ├── services/              # 业务逻辑
│   │   ├── project.ts         # 项目管理
│   │   ├── cli/               # AI CLI 集成
│   │   └── preview.ts         # 预览服务器
│   └── constants/cliModels.ts # AI 模型配置
├── data/
│   ├── cc.db                  # SQLite 数据库
│   └── projects/              # 默认子项目目录
└── prisma/
    └── schema.prisma          # 数据库模型

[PROJECTS_DIR]/                 # 子项目目录（可配置）
├── project-xxx-xxx/            # 生成的项目1
├── project-yyy-yyy/            # 生成的项目2
└── ...
```

## 工作流程

1. 用户在主应用输入需求
2. 系统调用 Claude Code/Cursor CLI
3. 在 `PROJECTS_DIR` 创建新子项目目录
4. AI 生成代码到子项目目录
5. 启动预览服务器（端口自动分配）
6. 用户可在聊天界面继续迭代

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问
http://localhost:3000
```

## 常见问题

### ❌ 子项目创建到错误目录
**原因**：`PROJECTS_DIR` 未正确配置  
**解决**：检查 `.env` 文件，确保 `PROJECTS_DIR` 指向正确的绝对或相对路径

### ❌ 端口冲突
**原因**：预览端口范围与其他服务冲突  
**解决**：调整 `.env` 中的 `PREVIEW_PORT_START` 和 `PREVIEW_PORT_END`

### ❌ 路径权限问题
**原因**：`PROJECTS_DIR` 目录无读写权限  
**解决**：
```bash
chmod -R 755 /path/to/projects
```

## 支持的 AI 

- **Claude Code** (推荐) - Anthropic （通过claude code sdk调用）
- **Cursor CLI** - Cursor
- **Codex CLI** - OpenAI
- **Qwen Code** - Alibaba
- **Z.AI GLM-4.6** - Zhipu AI

配置位置：`lib/constants/cliModels.ts`

## 关键代码位置

| 功能 | 文件路径 |
|------|---------|
| 路径配置 | `lib/config/paths.ts` |
| 项目创建 | `lib/services/project.ts` |
| Claude CLI | `lib/services/cli/claude.ts` |
| 预览服务器 | `lib/services/preview.ts` |
| API 路由 | `app/api/` |
| 数据库模型 | `prisma/schema.prisma` |

## 技术栈

- **框架**: Next.js 15 (App Router)
- **数据库**: Prisma + SQLite
- **样式**: Tailwind CSS
- **动画**: Framer Motion
- **AI SDK**: @anthropic-ai/claude-agent-sdk

## License

MIT
