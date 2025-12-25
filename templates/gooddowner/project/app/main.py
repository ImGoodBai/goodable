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
from typing import Dict, Optional
import uuid
from datetime import datetime
from shutil import which
import json
import subprocess

app = FastAPI(title="yt-dlp WebUI", version="1.0.0")

# 配置路径 - 调整为模板规范
BASE_DIR = Path(__file__).resolve().parent.parent  # 项目根目录
STATIC_DIR = BASE_DIR / "static"
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", str(BASE_DIR / "downloads")))
CONFIG_DIR = BASE_DIR / "config"
CONFIG_FILE = CONFIG_DIR / "settings.json"

# 确保目录存在
STATIC_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

# 挂载静态文件
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 挂载下载目录用于预览播放
app.mount("/downloads", StaticFiles(directory=str(DOWNLOAD_DIR)), name="downloads")

# 配置管理
def load_config() -> dict:
    """加载配置文件"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_config(config: dict) -> bool:
    """保存配置文件"""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False

def get_ffmpeg_path() -> Optional[str]:
    """获取ffmpeg路径（优先自定义路径）"""
    config = load_config()
    custom_path = config.get('ffmpeg_path', '').strip()

    # 优先使用用户配置的路径
    if custom_path:
        ffmpeg_exe = Path(custom_path) / 'ffmpeg.exe'
        if ffmpeg_exe.exists():
            return str(ffmpeg_exe)

    # 其次检查系统PATH
    system_ffmpeg = which('ffmpeg')
    if system_ffmpeg:
        return system_ffmpeg

    return None

def verify_ffmpeg_path(path: str) -> bool:
    """验证ffmpeg路径是否有效"""
    if not path:
        return False

    try:
        ffmpeg_exe = Path(path) / 'ffmpeg.exe'
        if not ffmpeg_exe.exists():
            return False

        # 尝试执行ffmpeg -version
        result = subprocess.run(
            [str(ffmpeg_exe), '-version'],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False

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
    """检测ffmpeg是否可用"""
    return get_ffmpeg_path() is not None


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

        # 设置ffmpeg路径
        ffmpeg_path = get_ffmpeg_path()
        if ffmpeg_path:
            ffmpeg_dir = str(Path(ffmpeg_path).parent)
            ydl_opts['ffmpeg_location'] = ffmpeg_dir

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


# FFmpeg 配置相关 API
class FFmpegPathRequest(BaseModel):
    path: str


@app.get("/api/ffmpeg/status")
async def get_ffmpeg_status():
    """获取ffmpeg状态"""
    config = load_config()
    custom_path = config.get('ffmpeg_path', '')
    ffmpeg_path = get_ffmpeg_path()

    return {
        "installed": ffmpeg_path is not None,
        "path": ffmpeg_path,
        "custom_path": custom_path,
        "source": "custom" if custom_path and ffmpeg_path else ("system" if ffmpeg_path else "none")
    }


@app.post("/api/ffmpeg/verify-path")
async def verify_path(request: FFmpegPathRequest):
    """验证ffmpeg路径"""
    path = request.path.strip()

    # 路径安全性检查
    if not path or '..' in path:
        return JSONResponse(
            status_code=400,
            content={"valid": False, "error": "无效的路径"}
        )

    is_valid = verify_ffmpeg_path(path)
    if is_valid:
        return {"valid": True, "message": "路径有效"}
    else:
        return {"valid": False, "error": "未找到ffmpeg.exe或无法执行"}


@app.post("/api/ffmpeg/set-path")
async def set_ffmpeg_path(request: FFmpegPathRequest):
    """设置ffmpeg路径"""
    path = request.path.strip()

    # 验证路径
    if not verify_ffmpeg_path(path):
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "路径无效或ffmpeg不可用"}
        )

    # 保存配置
    config = load_config()
    config['ffmpeg_path'] = path
    if save_config(config):
        return {"success": True, "message": "FFmpeg路径已保存"}
    else:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "保存配置失败"}
        )


if __name__ == "__main__":
    import uvicorn
    print("Starting yt-dlp WebUI...")
    print("Access at: http://localhost:8000")
    print("Press Ctrl+C to stop\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
