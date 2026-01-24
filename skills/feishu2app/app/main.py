from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
from pathlib import Path

# 导入 API 路由
from app.api import router as api_router

# 创建 FastAPI 应用
app = FastAPI(
    title="飞书知识库文档查看器",
    description="基于 FastAPI 的飞书知识库文档查看和展示应用",
    version="1.0.0"
)

# 添加 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 获取项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent

# 挂载静态文件
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# 注册 API 路由
app.include_router(api_router)


@app.get("/health")
async def health_check():
    """健康检查端点（必需）"""
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
async def index():
    """首页 - 知识库列表"""
    html_file = BASE_DIR / "static" / "index.html"
    with open(html_file, "r", encoding="utf-8") as f:
        return f.read()


@app.get("/space/{space_id}", response_class=HTMLResponse)
async def space(space_id: str):
    """知识库详情页"""
    html_file = BASE_DIR / "static" / "space.html"
    with open(html_file, "r", encoding="utf-8") as f:
        return f.read()
