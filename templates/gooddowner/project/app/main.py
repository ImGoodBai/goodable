#!/usr/bin/env python3
"""
yt-dlp WebUI - 简单的视频下载 Web 界面
"""
from fastapi import FastAPI, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from pathlib import Path
import yt_dlp
import os
from typing import Dict
import uuid
from datetime import datetime
from shutil import which

app = FastAPI(title="yt-dlp WebUI", version="1.0.0")

# 配置路径 - 调整为模板规范
BASE_DIR = Path(__file__).resolve().parent.parent  # 项目根目录
STATIC_DIR = BASE_DIR / "static"
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", str(BASE_DIR / "downloads")))

# 确保目录存在
STATIC_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 挂载静态文件
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 挂载下载目录用于预览播放
app.mount("/downloads", StaticFiles(directory=str(DOWNLOAD_DIR)), name="downloads")

# 下载任务状态存储
download_tasks: Dict[str, dict] = {}


class DownloadRequest(BaseModel):
    url: str
    quality: str = "best"
    format_type: str = "video"  # video 或 audio
    raw_input: str = ""  # 原始输入内容


def progress_hook(d: dict):
    """下载进度回调"""
    task_id = d.get('info_dict', {}).get('__task_id')
    if task_id and task_id in download_tasks:
        task = download_tasks[task_id]

        if d['status'] == 'downloading':
            task['status'] = 'downloading'
            task['progress'] = d.get('_percent_str', '0%').strip()
            task['speed'] = d.get('_speed_str', 'N/A')
            task['eta'] = d.get('_eta_str', 'N/A')
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            if total > 0:
                task['downloaded'] = f"{downloaded / 1024 / 1024:.1f}MB"
                task['total_size'] = f"{total / 1024 / 1024:.1f}MB"

        elif d['status'] == 'finished':
            task['status'] = 'processing'
            task['progress'] = '100%'

def has_ffmpeg() -> bool:
    try:
        return which('ffmpeg') is not None
    except Exception:
        return False


def download_video_task(task_id: str, url: str, quality: str, format_type: str):
    """执行下载任务"""
    try:
        # 配置 yt-dlp 选项
        ydl_opts = {
            'outtmpl': str(DOWNLOAD_DIR / '%(title)s.%(ext)s'),
            'progress_hooks': [progress_hook],
            'quiet': True,
            'no_warnings': True,
        }

        # 根据类型设置格式
        ffmpeg_available = has_ffmpeg()
        if format_type == 'audio':
            ydl_opts['format'] = 'bestaudio/best'
            if ffmpeg_available:
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
        else:
            if ffmpeg_available:
                if quality == 'best':
                    ydl_opts['format'] = 'bestvideo+bestaudio/best'
                elif quality == '1080p':
                    ydl_opts['format'] = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
                elif quality == '720p':
                    ydl_opts['format'] = 'bestvideo[height<=720]+bestaudio/best[height<=720]'
                elif quality == '480p':
                    ydl_opts['format'] = 'bestvideo[height<=480]+bestaudio/best[height<=480]'
                else:
                    ydl_opts['format'] = 'bestvideo+bestaudio/best'
            else:
                if quality == '1080p':
                    base = 'best[height<=1080]'
                elif quality == '720p':
                    base = 'best[height<=720]'
                elif quality == '480p':
                    base = 'best[height<=480]'
                else:
                    base = 'best'
                ydl_opts['format'] = (
                    f"{base}[vcodec!=none][acodec!=none][ext=mp4]/"
                    f"{base}[vcodec!=none][acodec!=none][ext=webm]/"
                    f"{base}[vcodec!=none][acodec!=none]/best"
                )

        download_tasks[task_id]['status'] = 'downloading'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # 获取视频信息
            info = ydl.extract_info(url, download=False)
            if info:
                info['__task_id'] = task_id  # 注入 task_id
                download_tasks[task_id]['title'] = info.get('title', 'Unknown')
                download_tasks[task_id]['duration'] = info.get('duration', 0)

            # 下载视频
            ydl.download([url])

        download_tasks[task_id]['status'] = 'completed'
        download_tasks[task_id]['progress'] = '100%'
        download_tasks[task_id]['finished_at'] = datetime.now().isoformat()

    except Exception as e:
        download_tasks[task_id]['status'] = 'error'
        download_tasks[task_id]['error'] = str(e)


@app.get("/")
async def root():
    """首页"""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
async def health_check():
    """健康检查端点（必需）"""
    return {"status": "ok"}


@app.post("/api/download")
async def start_download(request: DownloadRequest, background_tasks: BackgroundTasks):
    """开始下载"""
    task_id = str(uuid.uuid4())

    # 创建任务记录
    download_tasks[task_id] = {
        'id': task_id,
        'url': request.url,
        'raw_input': request.raw_input or request.url,  # 保存原始输入
        'quality': request.quality,
        'format_type': request.format_type,
        'status': 'pending',
        'progress': '0%',
        'speed': 'N/A',
        'eta': 'N/A',
        'downloaded': '0MB',
        'total_size': 'N/A',
        'title': 'Unknown',
        'duration': 0,
        'created_at': datetime.now().isoformat(),
        'error': None
    }

    # 添加后台任务
    background_tasks.add_task(
        download_video_task,
        task_id,
        request.url,
        request.quality,
        request.format_type
    )

    return {"task_id": task_id, "status": "queued"}


@app.get("/api/tasks")
async def get_tasks():
    """获取所有任务"""
    return {"tasks": list(download_tasks.values())}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    """获取单个任务状态"""
    if task_id not in download_tasks:
        return JSONResponse(
            status_code=404,
            content={"error": "Task not found"}
        )
    return download_tasks[task_id]


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    """删除任务"""
    if task_id in download_tasks:
        del download_tasks[task_id]
        return {"message": "Task deleted"}
    return JSONResponse(
        status_code=404,
        content={"error": "Task not found"}
    )


if __name__ == "__main__":
    import uvicorn
    print("🚀 启动 yt-dlp WebUI...")
    print("📍 访问地址: http://localhost:8000")
    print("💡 按 Ctrl+C 停止服务\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
