# 模板目录使用说明

本目录用于存放项目模板。用户可以从模板快速创建新项目。

## 目录结构

每个模板是一个独立的子目录，结构如下：

```
templates/
  └─ your-template-id/          # 模板ID（目录名）
      ├─ template.json          # 模板元数据（必需）
      ├─ preview.png            # 预览图（可选，推荐 800x600）
      └─ project/               # 完整项目源文件（必需）
          ├─ app/
          ├─ package.json
          ├─ next.config.js
          └─ ...（完整的Next.js项目文件）
```

## template.json 格式

每个模板必须包含 `template.json` 文件，格式如下：

```json
{
  "id": "your-template-id",
  "name": "模板显示名称",
  "description": "模板的详细描述，会显示在模板卡片上",
  "category": "分类名称（如：游戏、工具、商城）",
  "tags": ["标签1", "标签2", "标签3"],
  "version": "1.0.0",
  "author": "作者名称",
  "createdAt": "2024-12-12",
  "preview": "preview.png",
  "projectType": "nextjs"
}
```

### 必需字段
- `id`: 模板唯一标识符（与目录名一致）
- `name`: 模板显示名称

### 可选字段
- `description`: 模板描述
- `category`: 分类
- `tags`: 标签数组（最多显示3个）
- `version`: 版本号
- `author`: 作者
- `createdAt`: 创建日期
- `preview`: 预览图文件名（默认为 preview.png）
- `projectType`: 项目类型，可选值 `"nextjs"` 或 `"python-fastapi"`，默认为 `"nextjs"`

## 技术栈约定

### Next.js 项目规范

#### ⭐ 必需文件和目录
- `package.json` - 必须包含 `dev` 脚本
- `next.config.js` 或 `next.config.ts` 或 `next.config.mjs`
- `tsconfig.json` - TypeScript 配置
- `app/` 或 `src/app/` - App Router 目录（Next.js 15 要求）

#### ⭐ 技术要求
- **框架版本**: Next.js 15+
- **路由模式**: App Router（不支持 Pages Router）
- **语言**: TypeScript 或 JavaScript
- **包管理器**: npm、pnpm、yarn、bun 均可（通过 lockfile 自动检测）

#### ✅ 推荐配置
```json
{
  "scripts": {
    "dev": "node scripts/run-dev.js",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit",
    "lint": "next lint"
  }
}
```

#### ⚠️ 环境变量和数据库
- **环境变量**: 仅提供 `.env.example`，不包含真实密钥
- **数据库路径** (Prisma): 必须使用相对路径 `file:./sub_dev.db`
- **禁止**: 绝对路径、父目录路径（`../`）、主平台数据库路径

### Python FastAPI 项目规范

#### ⭐ 必需文件和结构
```
project/
├── app/
│   ├── __init__.py
│   └── main.py          # 必须包含 FastAPI 实例和 /health 端点
├── requirements.txt     # Python 依赖
└── .env.example         # 环境变量示例
```

#### ⭐ main.py 必需内容
```python
from fastapi import FastAPI

app = FastAPI()  # 必须有此实例

@app.get("/health")
async def health_check():
    """健康检查端点（必需）"""
    return {"status": "ok"}
```

#### ⭐ 技术要求
- **Python 版本**: 3.11+
- **框架**: FastAPI + Uvicorn
- **数据库**: 仅支持 SQLite（使用相对路径 `sqlite:///./python_dev.db`）

#### ⚠️ 依赖包限制（禁止使用）
以下需要编译工具或外部服务的包**不支持**：
- numpy、pandas、scipy、matplotlib
- tensorflow、torch、keras、scikit-learn
- opencv-python、pillow
- mysql-connector、psycopg2、pymongo

#### ✅ 推荐依赖
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
aiosqlite==0.19.0
```

## 创建新模板步骤

### 方法一：从现有项目导出

1. 找到现有的成功项目（在 `data/projects/` 目录下）
2. 在 templates 目录创建新文件夹（如 `tetris`）
3. 复制项目文件到 `tetris/project/` 目录
4. 创建 `tetris/template.json` 元数据文件
5. （可选）添加 `preview.png` 预览图

**示例命令（Windows）：**
```bash
# 创建模板目录
mkdir templates\tetris
mkdir templates\tetris\project

# 复制项目文件
xcopy /E /I data\projects\project-xxx\* templates\tetris\project\

# 手动创建 template.json 和 preview.png
```

### 方法二：手动创建

1. 在 templates 目录创建新文件夹
2. 创建 `project/` 子目录，放入完整的 Next.js 项目
3. 创建 `template.json` 文件
4. 添加预览图（可选）

## 预览图要求

- **推荐尺寸**: 800x600 像素
- **支持格式**: PNG, JPG, SVG, WebP
- **文件名**: 默认为 `preview.png`，可在 template.json 中自定义
- **如果没有预览图**: 系统会自动生成灰色背景 + 模板名称的占位图

## 注意事项

1. **完整性**: `project/` 目录应包含完整可运行的项目（包括所有依赖配置）
2. **敏感信息**: 不要包含 `.env`、数据库文件、API密钥等敏感信息
3. **node_modules**: 可以包含，但不推荐（会增加模板体积）
4. **自动处理**: 系统会自动更新创建项目的 `package.json` 中的 `name` 字段
5. **缓存**: 模板列表会缓存1分钟，修改后重启应用或等待缓存过期

## 项目清理检查清单

### ⭐ 必须删除的文件和目录

#### Next.js 项目
- ❌ `.env`、`.env.local`、`.env.*.local` - 包含敏感信息
- ❌ `node_modules/` - 依赖包（约300+MB）
- ❌ `.next/` - 构建产物
- ❌ `*.db`、`*.sqlite`、`*.db-journal` - 数据库文件
- ❌ `.pnpm-store/`、`.turbo/` - 缓存目录
- ❌ 旧版本文件（如 `app.py.bak`、`index.html.old`）

#### Python FastAPI 项目
- ❌ `.env`、`.env.local` - 包含敏感信息
- ❌ `.venv/`、`venv/`、`__pycache__/` - 虚拟环境和缓存
- ❌ `*.pyc`、`*.pyo`、`*.pyd` - Python 编译文件
- ❌ `*.db`、`*.sqlite`、`*.sqlite3` - 数据库文件

### ✅ 必须保留的文件

#### 通用
- ✅ `.env.example` - 环境变量示例模板
- ✅ `.gitignore` - 版本控制忽略文件
- ✅ `README.md` - 项目使用说明

#### Next.js
- ✅ `package.json`、`package-lock.json` - 依赖配置
- ✅ `next.config.js`、`tsconfig.json`、`tailwind.config.js` - 配置文件
- ✅ `app/`、`components/`、`lib/`、`public/` - 源代码和资源
- ✅ `prisma/schema.prisma` - Prisma 数据库模型（如有）

#### Python
- ✅ `requirements.txt` - 依赖配置
- ✅ `app/` - 源代码目录

## 安装和预览机制

### Next.js 安装流程

#### 1. 包管理器自动检测
系统按以下顺序检测：
1. 检查 `package.json` 中的 `packageManager` 字段
2. 查找 lockfile：`pnpm-lock.yaml` → `yarn.lock` → `bun.lockb` → `package-lock.json`
3. 默认使用 `npm`

#### 2. 安装重试机制
- **重试次数**: 3次
- **重试间隔**: 5秒 → 10秒 → 20秒（指数退避）
- **清理策略**:
  - 第1次重试：清理 `.next/`
  - 第2次重试：清理 `node_modules/` + `.next/`

#### 3. Prisma 自动初始化
如果检测到 `prisma/schema.prisma`：
1. 执行 `prisma generate` - 生成 Prisma Client
2. 检查数据库是否存在（`sub_dev.db`）
3. 如不存在，执行 `prisma db push` - 创建数据库表结构

#### 4. 静态检查（非阻塞）
- `npm run type-check` - TypeScript 类型检查
- `npm run lint` - ESLint 代码检查
- **注意**: 失败不会中断预览，仅记录警告

### Next.js 预览流程

#### 1. 端口分配
- **端口范围**: 环境变量 `PREVIEW_PORT_START` - `PREVIEW_PORT_END`（默认 3100-3999）
- **自动检测**: 从起始端口开始，查找可用端口

#### 2. 启动命令
```bash
npm run dev -- --port <分配的端口>
```

#### 3. 环境变量注入
- `PORT` - 端口号
- `WEB_PORT` - Web 端口号
- `NEXT_PUBLIC_APP_URL` - 预览 URL（如 `http://localhost:3100`）
- `DATABASE_URL` - 数据库路径（`file:./sub_dev.db`）
- `NODE_ENV` - 固定为 `development`

#### 4. 健康检查
- 访问预览 URL，检查是否返回正常页面
- 超时时间：30秒
- 检查间隔：1秒

### Python FastAPI 安装流程

#### 1. Python 版本检测
- 检测系统 Python 版本（要求 3.11+）
- 检测顺序：`python3` → `python`

#### 2. 虚拟环境创建
```bash
python -m venv .venv
```

#### 3. 依赖安装
使用虚拟环境中的 pip：
```bash
.venv/Scripts/pip install -r requirements.txt  # Windows
.venv/bin/pip install -r requirements.txt      # macOS/Linux
```

#### 4. 安装重试机制
- **重试次数**: 3次
- **重试间隔**: 5秒 → 10秒 → 20秒

### Python FastAPI 预览流程

#### 1. 启动命令
```bash
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port <端口> --reload
```

#### 2. 健康检查
- 访问 `/health` 端点
- 超时时间：60秒（Python 启动较慢）

#### 3. 默认预览页面
- 打开 `/docs` - Swagger UI 交互式文档

## 数据库和环境变量安全

### ⭐ 数据库路径安全约定

#### Next.js (Prisma)
```env
# ✅ 正确：相对路径，数据库在项目目录内
DATABASE_URL="file:./sub_dev.db"

# ❌ 错误：绝对路径
DATABASE_URL="file:///C:/Users/admin/db/prod.db"

# ❌ 错误：父目录路径
DATABASE_URL="file:../../../main_db/prod.db"
```

#### Python FastAPI
```env
# ✅ 正确：相对路径
DATABASE_URL="sqlite:///./python_dev.db"

# ❌ 错误：绝对路径
DATABASE_URL="sqlite:////var/db/prod.db"

# ❌ 错误：父目录路径
DATABASE_URL="sqlite:///../../../prod.db"
```

### ⭐ 环境变量清理

#### .env.example 模板示例

**Next.js:**
```env
# Database
DATABASE_URL="file:./sub_dev.db"

# App URL (auto-configured by platform)
NEXT_PUBLIC_APP_URL="http://localhost:3100"
```

**Python:**
```env
# Database
DATABASE_URL="sqlite:///./python_dev.db"

# Application
DEBUG=True
```

### ⚠️ 禁止事项
- 不要在模板中包含真实的 API 密钥、Token
- 不要包含生产环境数据库连接
- 不要包含第三方服务凭证（如 AWS、阿里云密钥）

## 常见问题

### Q1: 模板安装依赖时间太长？
**A**: 这是正常现象。首次安装依赖需要下载几百MB的包：
- Next.js 项目：约 300-500MB
- Python 项目：约 50-100MB

**建议**: 不要在模板中包含 `node_modules/` 或 `.venv/`，让系统自动安装。

### Q2: 如何让模板支持快速预览？
**A**: 目前平台自动处理安装和预览，无需特殊配置。未来可能支持：
- Standalone 模式（预构建版本，约50-80MB）
- 静态预览页（HTML + Mock 数据，几百KB）

### Q3: 模板中的 Python 项目为什么不支持 numpy？
**A**: numpy、pandas 等包需要编译工具（如 gcc、Visual Studio），平台当前不支持编译环境。

**替代方案**: 使用纯 Python 包，或者等待平台支持容器化部署。

### Q4: 模板中可以包含 Git 仓库吗？
**A**: 可以，`.git/` 目录会被保留。但建议：
- 清理 `.git/` 中的敏感信息
- 或者删除 `.git/`，让用户自己初始化

### Q5: 如何测试模板是否符合规范？
**A**: 测试步骤：
1. 将模板放入 `templates/` 目录
2. 重启平台或等待缓存过期（1分钟）
3. 在模板库中选择该模板创建项目
4. 观察安装日志和预览是否成功

**检查要点**:
- 是否自动安装依赖成功
- 是否自动启动预览服务器
- 预览 URL 是否可以访问
- 控制台是否有报错

## 模板示例

参考 `templates/example-template/` 目录结构。

## 使用流程

1. 系统启动时自动扫描 templates 目录
2. 用户在工作台"模板库"页面查看所有模板
3. 点击"使用模板"创建新项目
4. 系统复制整个 `project/` 目录到新项目ID目录
5. 自动跳转到项目聊天页面

## 打包发布

打包发布时，templates 目录会被包含在构建产物中，用户无需单独下载模板。
