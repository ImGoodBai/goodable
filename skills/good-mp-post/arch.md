# Good 公众号发布 - 技术架构与实施方案

## 项目背景

### 当前状态
good-mp-post 是一个符合 Claude Code skills 规范的可用 skill，包含三个核心 Python 脚本：
- `upload_media.py` - 上传图片到微信公众号素材库
- `create_draft.py` - 创建文章草稿
- `publish_article.py` - 发布文章

AI 通过 SKILL.md 指令调用这些脚本完成公众号文章发布。

### 升级目标
扩展为 **Hybrid 模式**（Skill + App），增加 Web UI：
1. 提供图形化编辑器，降低使用门槛
2. 管理历史发布记录（SQLite 数据库）
3. 实时预览公众号样式
4. 与 Skill 脚本模式数据互通

## 核心流程：Markdown 到微信 HTML

### 完整转换链路

```
用户输入 Markdown
  ↓
前端 EasyMDE 编辑器
  ↓
保存时触发后端 API
  ↓
Step 1: markdown.markdown() 转标准 HTML
  ↓
Step 2: wechat_html_converter.convert_to_wechat_html() 添加内联样式
  ↓
content_html 存入数据库（微信格式）
  ↓
发布时：
  - 上传所有正文图片到微信（获取 media_id）
  - 调用 create_draft API（内容图片由微信处理）
  ↓
微信公众号展示（样式完全一致）
```

### 图片处理流程

**封面图（thumb）：**
```
用户选择封面图
  ↓
立即上传到微信（永久素材）
  ↓
获得 thumb_media_id
  ↓
保存到数据库
```

**正文图片（image）：**
```
用户粘贴/拖拽图片到编辑器
  ↓
前端拦截事件（paste/drop）
  ↓
上传到本地服务器（data/images/）
  ↓
返回本地 URL（/data/images/xxx.jpg）
  ↓
插入到 Markdown：![](本地URL)
  ↓
前端预览显示本地图片
  ↓
【发布时】遍历 HTML 中的本地图片
  ↓
逐个上传到微信（临时素材，3天有效期）
  ↓
获得 media_id 记录到数据库
  ↓
微信 API 自动处理图片显示
```

**关键设计：**
- 编辑过程中使用本地图片（快速预览）
- 发布时才上传到微信（避免临时素材过期）
- 微信临时素材有效期 3 天，适合一次性发布

### 关键实现

**后端：** `app/api/articles.py`
```python
# Convert Markdown to WeChat-compatible HTML
standard_html = markdown.markdown(content_md, extensions=['extra'])
content_html = convert_to_wechat_html(standard_html)  # Add inline styles
```

**样式适配器：** `scripts/wechat_html_converter.py`
- 使用 HTMLParser 解析标准 HTML
- 为每个标签添加微信兼容的内联样式
- 移除不支持的标签（script, iframe 等）

**前端预览：** `app/static/index.html`
- EasyMDE `.editor-preview` 样式与后端生成的 HTML 样式完全一致
- 用户看到的预览 = 微信最终显示效果

### 样式规范

参考微信公众号 HTML 白名单规范：
- 只支持内联样式（style 属性）
- 不支持 `<style>` 标签和 class
- 不支持 JavaScript 和事件处理器

样式模板示例：
```python
WECHAT_STYLES = {
    'p': 'margin: 10px 0; line-height: 1.8; font-size: 16px; color: #333;',
    'h2': 'margin: 25px 0 15px; font-size: 22px; font-weight: bold;',
    'code': 'background: #f5f5f5; padding: 2px 5px; color: #d73a49;',
    # ...15+ 常用标签
}
```

### 在 Goodable 平台中的运行模式

**Goodable Skills 支持三种类型：**

| 类型 | 检测条件 | 功能 |
|------|---------|------|
| Pure Skill | 有 SKILL.md | AI 可调用，无 UI |
| App Template | 有 projectType | 可运行 Web 应用 |
| **Hybrid** | 两者都有 | AI 调用 + Web UI |

**good-mp-post 采用 Hybrid 模式：**
1. **作为 Skill**：AI 通过 SKILL.md 调用 scripts/ 脚本
2. **作为 App**：用户点击"运行"启动 Web UI 编辑器
3. **数据互通**：两种方式共享同一个 SQLite 数据库

**平台集成流程：**
```
用户启动 App
  ↓
平台检测 template.json 中 projectType: "python-fastapi"
  ↓
创建虚拟环境 .venv/
  ↓
安装依赖 pip install -r requirements.txt
  ↓
启动服务 uvicorn app.main:app --port <分配的端口>
  ↓
健康检查 GET /health（60秒超时）
  ↓
打开浏览器 http://localhost:<port>
  ↓
用户在 Web UI 编辑文章 → 调用后端 API → 复用 scripts/ 逻辑 → 写入数据库
```

**同时，AI 仍可调用脚本：**
```
AI 接收用户指令"发布一篇文章"
  ↓
AI 调用 python scripts/upload_media.py
  ↓
scripts 自动检测数据库是否存在
  ↓
如果存在，记录操作到数据库（与 Web UI 共享数据）
  ↓
AI 返回结果给用户
```

---

## 一、架构设计原则

### 1.1 核心原则
- **代码复用**：Web UI 和 Skill 脚本共享同一套核心逻辑
- **数据统一**：所有操作（脚本/UI）都记录到同一个 SQLite 数据库
- **向后兼容**：保持原有 scripts/ 脚本可独立运行
- **轻量化**：前端使用纯 HTML + CDN，无需 Node.js 打包
- **规范遵循**：符合 Python FastAPI App 规范

### 1.2 运行模式对比

**模式一：Skill 脚本模式（AI 调用）**
```bash
# AI 通过 SKILL.md 调用 Python 脚本
python scripts/upload_media.py /path/to/cover.jpg thumb
python scripts/create_draft.py --title "标题" --author "作者" ...
python scripts/publish_article.py --media_id xxx
```
- 自动写入数据库（如果数据库存在）
- 可独立运行（无数据库环境）
- 适合 AI 自动化场景

**模式二：Web UI 模式（用户操作）**
```bash
# 平台自动启动 FastAPI 服务
uvicorn app.main:app --port 3100
```
- 通过 Web 界面编辑文章
- 调用后端 API → 复用 scripts/ 逻辑 → 记录数据库
- 适合手动编辑、历史管理场景

---

## 二、技术栈选择

### 2.1 后端：Python FastAPI
**理由：**
- 符合 Python FastAPI App 规范
- 与现有 scripts/ 同语言，代码复用简单
- 轻量快速，自带 Swagger UI 文档

### 2.2 前端：纯 HTML + Vanilla JavaScript
**放弃 Next.js 和框架的原因：**
- Next.js 需要 Node.js 打包，增加项目复杂度
- 混合两种语言（Python + Node）不符合平台单一项目类型规范
- Vue/React 等框架增加学习成本和体积

**采用纯前端方案：**
- **无框架**：Vanilla JavaScript（原生 DOM 操作）
- **轻量库**：
  - Marked.js（~5KB，Markdown 转 HTML）
  - Tailwind CSS CDN（样式，可选）
- **编辑器**：初期用 textarea，后续可升级为轻量 MD 编辑器
- **部署**：静态 HTML 文件，FastAPI 直接 serve

**优势：**
- 零打包，纯 HTML 文件
- FastAPI 项目单一语言
- 无框架依赖，性能最优
- 开发调试简单（直接刷新浏览器）
- 体积极小，加载快

### 2.3 数据库：SQLite
- 嵌入式，无需额外服务
- 相对路径 `sqlite:///./data/articles.db`（符合规范）
- 自动创建表结构

---

## 三、目录结构

```
good-mp-post/
├── SKILL.md                    # AI skill 说明（保留）
├── template.json               # 添加 projectType: "python-fastapi"
├── requirements.txt            # Python 依赖
├── .env.example                # 环境变量模板
├── .gitignore
│
├── app/                        # FastAPI 应用
│   ├── __init__.py
│   ├── main.py                 # FastAPI 入口 + /health + 静态服务
│   ├── database.py             # SQLite 连接 + ORM 模型
│   ├── api/                    # REST API 路由
│   │   ├── __init__.py
│   │   ├── articles.py         # 文章 CRUD
│   │   └── images.py           # 图片上传
│   └── static/                 # 前端静态文件（纯 HTML）
│       ├── index.html          # 主页面（Vue CDN）
│       ├── js/
│       │   └── app.js          # Vue 应用逻辑
│       └── css/
│           └── style.css       # 自定义样式
│
├── scripts/                    # 核心脚本（可独立运行）
│   ├── wechat_auth.py          # 认证模块（已实现）
│   ├── upload_media.py         # 图片上传（已实现）
│   ├── create_draft.py         # 创建草稿（已实现）
│   ├── publish_article.py      # 发布文章（已实现）
│   └── db_logger.py            # 数据库记录（新增，可选依赖）
│
├── data/
│   ├── articles.db             # SQLite 数据库（自动创建）
│   └── images/                 # 上传图片缓存
│
├── assets/                     # 保留
│   └── templates/
└── references/                 # 保留
```

---

## 四、数据库设计

### 4.1 表结构

```sql
-- 文章表
CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    digest TEXT,
    content_md TEXT,              -- Markdown 原文
    content_html TEXT,            -- HTML 转换后
    thumb_media_id TEXT,          -- 封面图 media_id
    thumb_url TEXT,               -- 封面图本地路径
    draft_media_id TEXT,          -- 草稿 media_id
    publish_id TEXT,              -- 发布任务 ID
    status TEXT DEFAULT 'draft',  -- draft/publishing/published/failed
    error_msg TEXT,               -- 错误信息
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);

-- 图片表
CREATE TABLE images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER,           -- 关联文章 ID（可为空）
    file_path TEXT NOT NULL,      -- 本地文件路径
    media_id TEXT,                -- 微信 media_id
    media_type TEXT,              -- thumb/image
    file_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- 操作日志表（可选）
CREATE TABLE operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER,
    operation TEXT,               -- upload/create_draft/publish
    status TEXT,                  -- success/failed
    details TEXT,                 -- JSON 详情
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 状态流转

```
draft (草稿)
  ↓ 调用 create_draft
publishing (发布中)
  ↓ 调用 publish_article
published (已发布) / failed (失败)
```

---

## 五、代码复用机制（关键）

### 5.1 scripts/db_logger.py（新增）

```python
"""
Optional database logger for scripts
Auto-detects database existence and logs operations
"""
import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parents[1] / "data" / "articles.db"

def is_db_available():
    """Check if database exists"""
    return DB_PATH.exists()

def log_image_upload(file_path, media_id, media_type):
    """Log image upload to database (if available)"""
    if not is_db_available():
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO images (file_path, media_id, media_type) VALUES (?, ?, ?)",
            (file_path, media_id, media_type)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # Silent fail, don't block script execution

def log_draft_creation(title, author, thumb_media_id, draft_media_id):
    """Log draft creation to database (if available)"""
    if not is_db_available():
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO articles
               (title, author, thumb_media_id, draft_media_id, status)
               VALUES (?, ?, ?, ?, 'draft')""",
            (title, author, thumb_media_id, draft_media_id)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

def log_publish(draft_media_id, publish_id, status='publishing'):
    """Log publish operation to database (if available)"""
    if not is_db_available():
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE articles
               SET publish_id=?, status=?, published_at=?
               WHERE draft_media_id=?""",
            (publish_id, status, datetime.now(), draft_media_id)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass
```

**关键设计：**
- `is_db_available()` 检查数据库是否存在
- 所有函数静默失败（不影响脚本主功能）
- scripts/ 可在无数据库环境独立运行

### 5.2 修改 scripts/ 集成数据库

**scripts/upload_media.py 末尾添加：**
```python
def upload_media(image_path: str, media_type: str):
    # ... 原有上传逻辑 ...
    media_id = ...

    # Log to database (optional)
    try:
        from db_logger import log_image_upload
        log_image_upload(image_path, media_id, media_type)
    except ImportError:
        pass  # db_logger not available, skip

    return media_id
```

**scripts/create_draft.py 末尾添加：**
```python
def create_draft(title, author, digest, thumb_media_id, content, media_ids=None):
    # ... 原有创建逻辑 ...
    draft_media_id = ...

    # Log to database (optional)
    try:
        from db_logger import log_draft_creation
        log_draft_creation(title, author, thumb_media_id, draft_media_id)
    except ImportError:
        pass

    return draft_media_id
```

**scripts/publish_article.py 末尾添加：**
```python
def publish_article(media_id: str):
    # ... 原有发布逻辑 ...
    publish_id = ...

    # Log to database (optional)
    try:
        from db_logger import log_publish
        log_publish(media_id, publish_id)
    except ImportError:
        pass

    return publish_id
```

### 5.3 app/ 复用 scripts/

```python
# app/api/articles.py
import sys
from pathlib import Path

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parents[2] / 'scripts'))

from upload_media import upload_media
from create_draft import create_draft
from publish_article import publish_article

@router.post("/articles/publish")
async def publish_article_api(article_id: int):
    # Get article from database
    article = get_article(article_id)

    # Call script function (with db logging)
    publish_id = publish_article(article.draft_media_id)

    # Update database status
    update_article_status(article_id, 'publishing', publish_id)

    return {"publish_id": publish_id}
```

**数据流：**
```
Web UI 点击发布
  ↓
POST /articles/:id/publish
  ↓
调用 scripts/publish_article.py 函数
  ↓
publish_article() 内部调用 db_logger.log_publish()
  ↓
数据库更新状态
  ↓
返回 publish_id 给前端
```

**AI 调用脚本：**
```
AI 调用 python scripts/publish_article.py --media_id xxx
  ↓
publish_article() 内部调用 db_logger.log_publish()
  ↓
数据库自动更新（如果存在）
  ↓
Web UI 刷新列表可看到最新状态
```

---

## 六、前端实现（纯 HTML + Vanilla JS）

### 6.1 app/static/index.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Good 公众号发布</title>

  <!-- Tailwind CSS CDN (optional, can use custom CSS) -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Marked.js for Markdown preview -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

  <style>
    /* Custom styles */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

    /* WeChat preview styles */
    .wechat-preview p { font-size: 16px; line-height: 1.8; color: #333; }
    .wechat-preview h2 { font-size: 20px; font-weight: bold; margin: 20px 0 10px; }
    .wechat-preview h3 { font-size: 18px; font-weight: bold; margin: 15px 0 8px; }
    .wechat-preview img { max-width: 100%; display: block; margin: 15px auto; }
    .wechat-preview ul, .wechat-preview ol { padding-left: 20px; margin: 10px 0; }
    .wechat-preview li { margin: 5px 0; }
    .wechat-preview code { background: #f5f5f5; padding: 2px 5px; border-radius: 3px; }
    .wechat-preview pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }

    /* Status colors */
    .status-draft { color: #9CA3AF; }
    .status-publishing { color: #F59E0B; }
    .status-published { color: #07C160; }
    .status-failed { color: #EF4444; }
  </style>
</head>
<body class="bg-white">
  <div class="min-h-screen">
    <!-- Header -->
    <header class="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
      <h1 class="text-xl font-bold">● Good 公众号发布</h1>
      <div class="space-x-2">
        <button id="btnNew" class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800">新建</button>
        <button class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800">设置</button>
      </div>
    </header>

    <!-- Main content -->
    <div class="flex flex-col md:flex-row">
      <!-- Sidebar: Article list -->
      <aside class="w-full md:w-80 border-r border-gray-200 p-4 h-screen overflow-y-auto">
        <h2 class="text-lg font-bold mb-4">文章列表</h2>
        <div id="articleList"></div>
      </aside>

      <!-- Main: Editor -->
      <main class="flex-1 p-6">
        <div id="editorContainer" class="max-w-4xl mx-auto" style="display: none;">
          <!-- Title & Author -->
          <div class="mb-4 flex gap-4">
            <input id="inputTitle" placeholder="文章标题"
                   class="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500">
            <input id="inputAuthor" placeholder="作者" maxlength="8"
                   class="w-32 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500">
          </div>

          <!-- Digest -->
          <input id="inputDigest" placeholder="摘要（可选）" maxlength="120"
                 class="w-full px-3 py-2 border border-gray-300 rounded mb-4 focus:outline-none focus:border-gray-500">

          <!-- Markdown Editor -->
          <div class="border border-gray-300 rounded p-4 mb-4">
            <textarea id="inputContent" placeholder="# 开始写作..."
                      class="w-full h-96 border-none outline-none resize-none font-mono"></textarea>
          </div>

          <!-- Cover image -->
          <div class="mb-4">
            <label class="block text-sm font-medium mb-2">封面图（900×383px 推荐）</label>
            <input id="inputCover" type="file" accept="image/*" class="text-sm">
            <div id="coverPreview" class="mt-2"></div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-2">
            <button id="btnSave" class="px-6 py-2 bg-black text-white rounded hover:bg-gray-800">保存草稿</button>
            <button id="btnPreview" class="px-6 py-2 border border-black rounded hover:bg-gray-50">预览</button>
            <button id="btnPublish" class="px-6 py-2 bg-black text-white rounded hover:bg-gray-800">发布</button>
          </div>
        </div>

        <!-- Empty state -->
        <div id="emptyState" class="text-center py-20 text-gray-400">
          <p>选择文章或点击"新建"开始编辑</p>
        </div>
      </main>
    </div>
  </div>

  <!-- Preview Modal -->
  <div id="previewModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style="z-index: 1000;">
    <div class="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <button id="btnClosePreview" class="text-gray-600 hover:text-black">← 返回编辑</button>
        <h2 class="font-bold">预览</h2>
        <button id="btnPublishFromPreview" class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800">发布</button>
      </div>
      <div id="previewContent" class="wechat-preview p-6"></div>
    </div>
  </div>

  <script src="/static/js/app.js"></script>
</body>
</html>
```

### 6.2 app/static/js/app.js

```javascript
// State
let articles = [];
let currentArticle = null;

// API base URL
const API_BASE = '/api';

// DOM elements
const articleList = document.getElementById('articleList');
const editorContainer = document.getElementById('editorContainer');
const emptyState = document.getElementById('emptyState');
const previewModal = document.getElementById('previewModal');
const previewContent = document.getElementById('previewContent');

const inputTitle = document.getElementById('inputTitle');
const inputAuthor = document.getElementById('inputAuthor');
const inputDigest = document.getElementById('inputDigest');
const inputContent = document.getElementById('inputContent');
const inputCover = document.getElementById('inputCover');
const coverPreview = document.getElementById('coverPreview');

const btnNew = document.getElementById('btnNew');
const btnSave = document.getElementById('btnSave');
const btnPreview = document.getElementById('btnPreview');
const btnPublish = document.getElementById('btnPublish');
const btnClosePreview = document.getElementById('btnClosePreview');
const btnPublishFromPreview = document.getElementById('btnPublishFromPreview');

// Utility: HTTP request
async function request(url, options = {}) {
  try {
    const response = await fetch(API_BASE + url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Request failed:', error);
    alert('请求失败：' + error.message);
    throw error;
  }
}

// Load articles
async function loadArticles() {
  articles = await request('/articles');
  renderArticleList();
}

// Render article list
function renderArticleList() {
  articleList.innerHTML = articles.map(article => `
    <div class="article-item p-3 mb-2 cursor-pointer hover:bg-gray-50 rounded ${currentArticle?.id === article.id ? 'bg-gray-100' : ''}"
         onclick="selectArticle(${article.id})">
      <div class="flex items-center gap-2">
        <span class="status-${article.status}">${article.status === 'published' ? '●' : '○'}</span>
        <span class="font-medium">${escapeHtml(article.title || '无标题')}</span>
      </div>
      <div class="text-sm text-gray-500 mt-1">
        ${article.status} · ${formatDate(article.created_at)}
      </div>
    </div>
  `).join('');
}

// Select article
function selectArticle(id) {
  currentArticle = articles.find(a => a.id === id);
  if (currentArticle) {
    showEditor();
    fillEditor(currentArticle);
  }
}

// New article
function newArticle() {
  currentArticle = {
    id: null,
    title: '',
    author: '',
    digest: '',
    content_md: '',
    thumb_media_id: null,
    thumb_url: null,
    status: 'draft'
  };
  showEditor();
  fillEditor(currentArticle);
}

// Show/hide editor
function showEditor() {
  editorContainer.style.display = 'block';
  emptyState.style.display = 'none';
}

// Fill editor with article data
function fillEditor(article) {
  inputTitle.value = article.title || '';
  inputAuthor.value = article.author || '';
  inputDigest.value = article.digest || '';
  inputContent.value = article.content_md || '';

  if (article.thumb_url) {
    coverPreview.innerHTML = `<img src="${article.thumb_url}" class="max-w-xs border border-gray-300 rounded">`;
  } else {
    coverPreview.innerHTML = '';
  }
}

// Get editor data
function getEditorData() {
  return {
    ...currentArticle,
    title: inputTitle.value.trim(),
    author: inputAuthor.value.trim(),
    digest: inputDigest.value.trim(),
    content_md: inputContent.value
  };
}

// Save draft
async function saveDraft() {
  const data = getEditorData();

  if (!data.title) {
    alert('请输入标题');
    return;
  }

  if (!data.author) {
    alert('请输入作者名称');
    return;
  }

  if (data.id) {
    // Update
    await request(`/articles/${data.id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  } else {
    // Create
    const result = await request('/articles', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    currentArticle.id = result.id;
  }

  alert('保存成功');
  await loadArticles();
}

// Upload cover
async function uploadCover(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', 'thumb');

  try {
    const response = await fetch(API_BASE + '/images/upload', {
      method: 'POST',
      body: formData
    });
    const result = await response.json();

    currentArticle.thumb_media_id = result.media_id;
    currentArticle.thumb_url = result.url;

    coverPreview.innerHTML = `<img src="${result.url}" class="max-w-xs border border-gray-300 rounded">`;
    alert('封面上传成功');
  } catch (error) {
    alert('上传失败：' + error.message);
  }
}

// Preview
function showPreview() {
  const data = getEditorData();

  // Convert Markdown to HTML using marked.js
  const html = marked.parse(data.content_md || '# 空白内容');

  previewContent.innerHTML = `
    <div class="mb-6">
      ${data.thumb_url ? `<img src="${data.thumb_url}" class="w-full mb-4">` : ''}
      <h1 class="text-2xl font-bold mb-2">${escapeHtml(data.title || '无标题')}</h1>
      <p class="text-sm text-gray-500">作者：${escapeHtml(data.author || '未知')}</p>
      ${data.digest ? `<p class="text-gray-600 mt-2">${escapeHtml(data.digest)}</p>` : ''}
      <hr class="my-4">
    </div>
    <div class="prose">${html}</div>
  `;

  previewModal.classList.remove('hidden');
}

// Close preview
function closePreview() {
  previewModal.classList.add('hidden');
}

// Publish
async function publish() {
  if (!currentArticle.id) {
    alert('请先保存草稿');
    return;
  }

  if (!currentArticle.thumb_media_id) {
    alert('请先上传封面图');
    return;
  }

  if (!confirm('确认发布到微信公众号？')) {
    return;
  }

  try {
    await request(`/articles/${currentArticle.id}/publish`, {
      method: 'POST'
    });
    alert('发布成功！文章正在审核中');
    await loadArticles();
    closePreview();
  } catch (error) {
    alert('发布失败：' + error.message);
  }
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Utility: Format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
}

// Event listeners
btnNew.addEventListener('click', newArticle);
btnSave.addEventListener('click', saveDraft);
btnPreview.addEventListener('click', showPreview);
btnPublish.addEventListener('click', publish);
btnClosePreview.addEventListener('click', closePreview);
btnPublishFromPreview.addEventListener('click', publish);
inputCover.addEventListener('change', uploadCover);

// Initialize
loadArticles();
```

---

### 6.3 轻量级依赖说明

**Marked.js（~5KB）：**
- 功能：Markdown 转 HTML
- CDN：`https://cdn.jsdelivr.net/npm/marked/marked.min.js`
- 用途：前端实时预览

**Tailwind CSS CDN（可选）：**
- 功能：CSS 工具类
- 可替换为自定义 CSS（约 2KB）

**无其他依赖：**
- 原生 `fetch` API（HTTP 请求）
- 原生 DOM 操作
- 原生 `FormData`（文件上传）

---

## 七、实施步骤

### 阶段一：基础架构（1天）

#### 1. 更新配置文件
- [x] template.json 已有 projectType（已完成）
- [ ] 更新 requirements.txt 添加 FastAPI 依赖
- [ ] 更新 .env.example 添加 DATABASE_URL
- [ ] 更新 .gitignore 添加 .venv/, data/*.db

#### 2. 创建 app/ 目录结构
```bash
mkdir -p app/api app/static/js app/static/css
touch app/__init__.py app/main.py app/database.py
touch app/api/__init__.py app/api/articles.py app/api/images.py
touch app/static/index.html app/static/js/app.js app/static/css/style.css
```

#### 3. 实现 app/main.py + /health
- FastAPI 实例
- `/health` 健康检查
- 静态文件挂载 `app.mount("/static", StaticFiles(directory="app/static"))`
- CORS 配置

#### 4. 实现 app/database.py
- SQLAlchemy ORM 模型
- 自动创建 data/articles.db 和表结构

### 阶段二：后端 API（1-2天）

#### 5. 实现 scripts/db_logger.py
- 可选依赖的数据库记录
- 静默失败机制

#### 6. 修改 scripts/ 集成数据库
- 在三个核心脚本函数末尾添加 db_logger 调用
- 保持向后兼容

#### 7. 实现 app/api/articles.py
- GET /api/articles - 列表
- GET /api/articles/:id - 详情
- POST /api/articles - 创建
- PUT /api/articles/:id - 更新
- POST /api/articles/:id/publish - 发布
- DELETE /api/articles/:id - 删除

#### 8. 实现 app/api/images.py
- POST /api/images/upload - 图片上传

### 阶段三：前端开发（2天）

#### 9. 实现 index.html 基础布局
- 顶部栏
- 左侧列表
- 右侧编辑区
- 响应式适配

#### 10. 实现 app.js Vue 应用
- 文章列表加载
- 表单双向绑定
- API 调用
- 图片上传

#### 11. 样式完善
- Tailwind 配色（黑白 + 微信绿）
- 公众号预览样式
- 扁平化设计

### 阶段四：测试（1天）

#### 12. 集成测试
- 测试 Skill 脚本模式
- 测试 Web UI 模式
- 验证数据库互通
- 测试发布流程

#### 13. 文档更新
- 更新 SKILL.md（说明双模式）
- 添加 README.md

---

## 八、依赖清单

### requirements.txt
```txt
# Web Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0

# Database
sqlalchemy==2.0.23

# WeChat API (existing)
requests>=2.28.0
python-dotenv>=1.0.0

# Markdown processing
markdown==3.5.1
```

---

## 九、关键技术点

### 9.1 FastAPI 静态文件服务

```python
# app/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Root route serves index.html
@app.get("/")
async def root():
    return FileResponse("app/static/index.html")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

### 9.2 Markdown 转 HTML（后端）

```python
import markdown

def md_to_wechat_html(md_text: str) -> str:
    """Convert Markdown to WeChat-compatible HTML"""
    html = markdown.markdown(md_text, extensions=['extra'])
    # Filter unsupported tags if needed
    return html
```

### 9.3 前端 Markdown 预览（可选升级）

如果需要更好的编辑体验，可后续引入 Tiptap：
```html
<script src="https://cdn.jsdelivr.net/npm/@tiptap/core@2.1.0"></script>
```

---

## 十、预期效果

### Skill 模式（AI 调用）
```
用户：帮我写一篇关于AI的公众号文章并发布

AI：
1. 生成文章内容（Markdown）
2. 生成封面图 → 保存到本地
3. 调用 python scripts/upload_media.py cover.jpg thumb
   → 返回 thumb_media_id
   → db_logger 自动记录到 images 表
4. 调用 python scripts/create_draft.py ...
   → 返回 draft_media_id
   → db_logger 自动记录到 articles 表
5. 调用 python scripts/publish_article.py ...
   → 返回 publish_id
   → db_logger 自动更新 articles 表状态

Web UI 实时同步显示这篇文章
```

### Web UI 模式
```
1. 打开 http://localhost:3100
2. 左侧列表显示所有文章（包括 AI 创建的）
3. 点击"新建" → 编辑器输入 Markdown
4. 上传封面图 → 调用后端 API → 复用 scripts/upload_media.py
5. 点击"保存" → 存入数据库
6. 点击"发布" → 调用后端 API → 复用 scripts/publish_article.py
7. 状态自动更新：草稿 → 发布中 → 已发布
```

---

## 十一、部署检查清单

### 开发环境
- [ ] Python 3.11+ 已安装
- [ ] 虚拟环境已创建 `.venv/`
- [ ] 依赖已安装 `pip install -r requirements.txt`
- [ ] `.env` 文件已配置
- [ ] 数据库自动初始化（首次运行）

### 运行测试
```bash
# 测试健康检查
curl http://localhost:3100/health

# 测试脚本模式（有数据库记录）
python scripts/upload_media.py test.jpg thumb

# 测试 Web UI
open http://localhost:3100
```

### 打包交付
- [ ] 删除 `.env`（保留 `.env.example`）
- [ ] 删除 `.venv/`、`__pycache__/`
- [ ] 删除 `data/*.db`（用户数据）
- [ ] Git 忽略文件已配置

---

## 十二、常见问题

### Q1: 为什么不用 Next.js 或 Vue/React？
A:
- Next.js 需要 Node.js 打包，增加项目复杂度
- Vue/React 等框架增加体积和学习成本
- 采用纯 HTML + Vanilla JS 更轻量，符合 Python 单一项目类型规范
- 原生 JavaScript 性能最优，无框架依赖

### Q2: 前端编辑器如何实现？
A: 初期使用原生 textarea + Marked.js 预览。后续可升级为轻量 Markdown 编辑器（如 SimpleMDE）。

### Q3: AI 调用脚本时如何写入数据库？
A: scripts/ 集成 db_logger，自动检测数据库是否存在。存在则记录，不存在不影响运行。

### Q4: 数据库文件路径？
A: `data/articles.db`（相对路径），符合 Python FastAPI App 规范。

### Q5: 如何确保 scripts 和 Web UI 数据互通？
A: 两者共用：
- 同一套 scripts/ 函数
- 同一个 SQLite 数据库
- scripts/ 通过 db_logger 写入
- Web UI 通过 SQLAlchemy ORM 读写

---

**预计总工时：5-7 天**
- 后端：2-3 天
- 前端：2-3 天
- 测试：1 天
