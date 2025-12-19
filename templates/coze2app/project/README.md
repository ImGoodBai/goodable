# Coze2App

让 Coze 工作流一键变软件，可一键发布到阿里云。

## 功能特性

- ✅ **Bot 聊天**：支持 Coze Bot 对话，流式响应
- ✅ **工作流执行**：支持 Coze Workflow 运行
- ✅ **文件上传**：支持对话中上传文件
- ✅ **多工作区**：支持切换多个 Coze 工作区
- ✅ **响应式设计**：适配 PC 和移动端
- ✅ **Next.js 15**：基于最新 Next.js + React 19 + TypeScript

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置 Coze API：

```env
COZE_API_BASE=https://api.coze.cn
SESSION_SECRET=your-secret-key-here
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 4. 配置 Coze Token

在应用界面右上角点击设置按钮，输入你的 Coze Access Token。

## 技术栈

- **框架**: Next.js 15 + React 19
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **API**: Coze API (Bot + Workflow)

## 项目结构

```
project/
├── app/                  # Next.js App Router
│   ├── api/             # API 路由
│   └── page.tsx         # 主页面
├── components/          # React 组件
├── lib/                 # 工具库
│   ├── coze-api.ts     # Coze API 封装
│   └── session.ts      # Session 管理
└── package.json
```

## 部署到阿里云

参考阿里云 Serverless 部署文档进行一键部署。

## License

MIT
