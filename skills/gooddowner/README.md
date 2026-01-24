# GoodDowner

视频万能下载器，支持全球1000+视频网站。

## 功能特性

- 📎 视频/音频下载
- 🎞️ 多画质选择（最佳/1080p/720p/480p）
- 📊 实时进度显示
- 📋 任务管理
- ⚡ 异步后台下载
- 🌐 支持 B站、YouTube、抖音等 1000+ 网站

## 技术栈

- **后端**: FastAPI + yt-dlp
- **前端**: 纯 HTML + CSS + JavaScript
- **部署**: Python 3.11+

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量（可选）

```bash
cp .env.example .env
# 编辑 .env 文件配置下载目录等
```

### 3. 启动服务

```bash
# 方式1: 使用 uvicorn
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 方式2: 直接运行
python app/main.py
```

### 4. 访问

打开浏览器访问: http://localhost:8000

## 使用说明

### 下载视频

1. 在输入框中粘贴视频 URL
2. 选择下载类型（视频/音频）
3. 选择画质
4. 点击"开始下载"按钮
5. 实时查看下载进度

### 支持的网站

- ✅ **Bilibili** (B站) - 无需额外配置
- ✅ **YouTube** - 需要 JavaScript 运行时（deno/node）
- ✅ **抖音** - 需要登录 cookies
- ✅ **Twitter/X** - 直接支持
- ✅ **Instagram** - 直接支持
- ✅ **TikTok** - 直接支持
- ✅ 以及 1000+ 其他网站

## API 接口

### 开始下载
```http
POST /api/download
Content-Type: application/json

{
  "url": "视频URL",
  "quality": "best",
  "format_type": "video"
}
```

### 获取所有任务
```http
GET /api/tasks
```

### 健康检查
```http
GET /health
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DOWNLOAD_DIR` | 下载文件保存目录 | `./downloads` |

## 项目结构

```
.
├── app/
│   ├── __init__.py
│   └── main.py           # FastAPI 主程序
├── static/
│   └── index.html        # 前端页面
├── downloads/            # 下载文件目录
├── requirements.txt      # Python 依赖
├── .env.example          # 环境变量示例
└── README.md
```

## 许可证

Unlicense
