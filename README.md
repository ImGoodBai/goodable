# Goodable - AI Web App Builder

AI 驱动的 Web 应用构建平台。通过自然语言描述需求，自动生成 Next.js 项目。

## 核心概念

### 主项目 vs 子项目
- **主项目**：Claudable 平台本身（当前目录）
- **子项目**：用户通过 AI 生成的项目，存储在 `PROJECTS_DIR` 配置的目录

### 子项目运行调试
- 每个子项目都有timeline日志，在 `PROJECTS_DIR` 目录下的 `logs` 子目录中，有json和txt两种格式。

### 子项目数据库及安全隔离
- 数据库名：sub_dev.db；路径：prisma/sub_dev.db（相对路径 ./sub_dev.db 解析到 prisma 目录）
- 初始化流程：只有走平台预览启动时自动执行生成客户端和同步表结构（prisma generate、db push），手动启动不会执行初始化
- 配置约定：DATABASE_URL 统一为 file:./sub_dev.db
- 父项目数据库： file:./data/prod.db ，仅平台使用；子项目不得读取
- 敏感变量不继承： DATABASE_URL 、密钥、项目目录等不下传到子进程
- 运行时覆盖优先：子项目启动/安装/预览/命令工具/SDK统一把 DATABASE_URL 覆盖为 file:./sub_dev.db
- 读取范围限定：子项目只读自身 .env ；不依赖父进程环境
- 执行目录限定：所有命令在子项目根执行，禁止跨目录访问平台代码
- 路径安全校验： DATABASE_URL 必须解析到子项目目录内；越界直接拒绝并纠偏为 ./sub_dev.db

### 关键配置文件
- **`lib/config/paths.ts`** - 路径配置中心，所有项目路径的单一真实来源
- **`.env`** - 环境变量配置

## 调试运行打包
启动主服务：
npm run dev
启动electron客户端：
npm run dev:electron
打包：
.\build-windows.ps1
C:\Users\admin\Documents\goodable\dist\win-unpacked\Goodable.exe


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
DATABASE_URL="file:./data/prod.db"
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
