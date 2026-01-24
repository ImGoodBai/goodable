"""
Coze2App - FastAPI Backend
使用个人访问令牌(PAT)实现Bot列表获取和对话功能
"""
from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import httpx
import requests
import time
import json
from datetime import datetime
from typing import Optional

# ==================== 配置区 ====================
COZE_API_BASE = 'https://api.coze.cn'

# API端点
WORKSPACE_LIST_URL = f'{COZE_API_BASE}/v1/workspaces'
BOT_LIST_URL = f'{COZE_API_BASE}/v1/bots'
WORKFLOW_LIST_URL = f'{COZE_API_BASE}/v1/workflows'
CHAT_URL = f'{COZE_API_BASE}/v3/chat'

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent

# 配置文件路径
CONFIG_FILE = BASE_DIR / '.coze-config.json'

# ==================== 文件存储管理 ====================

def read_config() -> dict:
    """读取配置文件"""
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        return {}
    except Exception as e:
        print(f"[WARNING] Failed to read config: {e}")
        return {}

def write_config(data: dict) -> None:
    """写入配置文件"""
    try:
        CONFIG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    except Exception as e:
        print(f"[ERROR] Failed to write config: {e}")
        raise

def get_access_token() -> Optional[str]:
    """获取 access token"""
    return read_config().get('access_token')

def set_access_token(token: str) -> None:
    """设置 access token"""
    config = read_config()
    config['access_token'] = token
    config['token_configured_at'] = int(time.time())
    write_config(config)

def get_space_id() -> Optional[str]:
    """获取 space_id"""
    return read_config().get('space_id')

def set_space_id(space_id: str) -> None:
    """设置 space_id"""
    config = read_config()
    config['space_id'] = space_id
    write_config(config)

def clear_config() -> None:
    """清除配置"""
    if CONFIG_FILE.exists():
        CONFIG_FILE.unlink()

# ==================== 辅助函数 ====================

def verify_token(token: str) -> bool:
    """验证token是否有效（通过尝试调用API）"""
    try:
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        # 使用chat端点验证token（只需token不需要其他参数）
        response = requests.post(CHAT_URL, headers=headers, json={}, timeout=10)
        # 返回码不是401/403表示token有效（可能返回4015等参数错误，但token本身有效）
        return response.status_code not in [401, 403]
    except Exception as e:
        print(f"[ERROR] Token verification failed: {e}")
        return False

# ==================== FastAPI 应用初始化 ====================

app = FastAPI(
    title="Coze2App",
    description="使用个人访问令牌(PAT)调用 Coze Bot 和 Workflow",
    version="2.0.0"
)

# 添加 CORS 支持
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录
static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# ==================== 全局错误处理 ====================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理 - 统一返回 JSON"""
    error_msg = str(exc)
    print(f"[ERROR] {error_msg}")
    return JSONResponse(
        status_code=500,
        content={"error": error_msg}
    )

# ==================== 路由 ====================

@app.get("/health")
async def health_check():
    """健康检查端点（平台必需）"""
    return {"status": "ok"}

@app.get('/')
async def index():
    """返回前端页面"""
    html_file = BASE_DIR / "static" / "index.html"
    if not html_file.exists():
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(html_file)

@app.post('/api/config/token')
async def config_token(request: Request):
    """配置PAT Token"""
    try:
        data = await request.json()
        token = data.get('token', '').strip()

        if not token:
            return JSONResponse({'error': 'Token不能为空'}, status_code=400)

        # 验证token
        if not verify_token(token):
            return JSONResponse({'error': 'Token无效或已过期'}, status_code=401)

        # 存储token到文件
        set_access_token(token)

        print(f"[INFO] Token配置成功")

        return {
            'success': True,
            'message': 'Token配置成功'
        }

    except Exception as e:
        return JSONResponse({'error': f'配置Token失败: {str(e)}'}, status_code=500)

@app.get('/api/auth/status')
async def auth_status():
    """检查Token配置状态"""
    config = read_config()
    has_token = 'access_token' in config

    result = {'configured': has_token}

    # 如果已配置，添加配置时间信息
    if has_token and 'token_configured_at' in config:
        configured_at = config['token_configured_at']
        result['configured_at'] = datetime.fromtimestamp(configured_at).strftime('%Y-%m-%d %H:%M:%S')

    return result

@app.post('/api/auth/clear')
async def clear_token():
    """清除Token配置"""
    clear_config()
    return {'success': True}

@app.post('/api/config/space_id')
async def config_space_id(request: Request):
    """配置工作空间ID"""
    data = await request.json()
    space_id = data.get('space_id', '').strip()

    if not space_id:
        return JSONResponse({'error': 'space_id不能为空'}, status_code=400)

    set_space_id(space_id)
    return {'success': True, 'message': 'space_id配置成功'}

@app.get('/api/config/space_id')
async def get_space_id_route():
    """获取已配置的space_id"""
    space_id = get_space_id()
    if not space_id:
        return JSONResponse({'error': 'space_id未配置'}, status_code=404)
    return {'space_id': space_id}

@app.get('/api/workspaces')
async def get_workspaces():
    """获取工作空间列表"""
    access_token = get_access_token()
    if not access_token:
        return JSONResponse({'error': 'Token未配置'}, status_code=401)

    try:
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        response = requests.get(WORKSPACE_LIST_URL, headers=headers, timeout=30)

        if response.status_code != 200:
            return JSONResponse({'error': f'获取工作空间列表失败: {response.text}'}, status_code=response.status_code)

        return response.json()

    except Exception as e:
        return JSONResponse({'error': f'获取工作空间列表失败: {str(e)}'}, status_code=500)

@app.get('/api/bots')
async def get_bots(request: Request):
    """获取Bot列表"""
    access_token = get_access_token()
    if not access_token:
        return JSONResponse({'error': 'Token未配置'}, status_code=401)

    space_id = get_space_id()
    if not space_id:
        return JSONResponse({'error': 'space_id未配置，请先配置工作空间ID'}, status_code=400)

    try:
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        # 获取查询参数
        params = {
            'workspace_id': space_id,
            'page_index': request.query_params.get('page_index', 1),
            'page_size': request.query_params.get('page_size', 50)
        }

        response = requests.get(BOT_LIST_URL, headers=headers, params=params, timeout=30)

        if response.status_code != 200:
            return JSONResponse({'error': f'获取Bot列表失败: {response.text}'}, status_code=response.status_code)

        return response.json()

    except Exception as e:
        return JSONResponse({'error': f'获取Bot列表失败: {str(e)}'}, status_code=500)

@app.get('/api/workflows')
async def get_workflows(request: Request):
    """获取工作流列表"""
    access_token = get_access_token()
    if not access_token:
        return JSONResponse({'error': 'Token未配置'}, status_code=401)

    space_id = get_space_id()
    if not space_id:
        return JSONResponse({'error': 'space_id未配置，请先配置工作空间ID'}, status_code=400)

    try:
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        params = {
            'workspace_id': space_id,
            'page_num': request.query_params.get('page_num', 1),
            'page_size': request.query_params.get('page_size', 50)
        }

        response = requests.get(WORKFLOW_LIST_URL, headers=headers, params=params, timeout=30)

        if response.status_code != 200:
            return JSONResponse({'error': f'获取工作流列表失败: {response.text}'}, status_code=response.status_code)

        return response.json()

    except Exception as e:
        return JSONResponse({'error': f'获取工作流列表失败: {str(e)}'}, status_code=500)

@app.post('/api/files/upload')
async def upload_file(file: UploadFile = File(...)):
    """上传文件到Coze"""
    access_token = get_access_token()
    if not access_token:
        return JSONResponse({'error': 'Token未配置'}, status_code=401)

    try:
        if not file.filename:
            return JSONResponse({'error': '文件名为空'}, status_code=400)

        # 转发到Coze API
        headers = {'Authorization': f'Bearer {access_token}'}
        files = {'file': (file.filename, file.file, file.content_type)}

        upload_url = f'{COZE_API_BASE}/v1/files/upload'
        response = requests.post(upload_url, headers=headers, files=files, timeout=60)

        if response.status_code != 200:
            return JSONResponse({'error': f'上传失败: {response.text}'}, status_code=response.status_code)

        return response.json()

    except Exception as e:
        print(f"[ERROR] File upload failed: {str(e)}")
        return JSONResponse({'error': f'文件上传失败: {str(e)}'}, status_code=500)

@app.post('/api/workflow/run')
async def run_workflow(request: Request):
    """执行工作流"""
    access_token = get_access_token()
    if not access_token:
        return JSONResponse({'error': 'Token未配置'}, status_code=401)

    try:
        data = await request.json()
        workflow_id = data.get('workflow_id')
        parameters = data.get('parameters', {})
        file_ids = data.get('file_ids', [])

        if not workflow_id:
            return JSONResponse({'error': '缺少workflow_id参数'}, status_code=400)

        # 如果有file_ids,添加到parameters中
        if file_ids:
            parameters['file_ids'] = file_ids

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        # 构建工作流执行URL
        workflow_run_url = f'{COZE_API_BASE}/v1/workflow/run'

        workflow_data = {
            'workflow_id': workflow_id,
            'parameters': parameters
        }

        response = requests.post(workflow_run_url, headers=headers, json=workflow_data, timeout=120)

        if response.status_code != 200:
            return JSONResponse({'error': f'执行工作流失败: {response.text}'}, status_code=response.status_code)

        return response.json()

    except Exception as e:
        print(f"[ERROR] Workflow run failed: {str(e)}")
        return JSONResponse({'error': f'执行工作流失败: {str(e)}'}, status_code=500)

@app.post('/api/chat/stream')
async def chat_stream(request: Request):
    """发送消息到Bot（流式响应）"""
    access_token = get_access_token()
    if not access_token:
        return JSONResponse({'error': 'Token未配置'}, status_code=401)

    try:
        data = await request.json()
        bot_id = data.get('bot_id')
        message = data.get('message')
        conversation_id = data.get('conversation_id')
        file_ids = data.get('file_ids', [])

        if not bot_id or not message:
            return JSONResponse({'error': '缺少bot_id或message参数'}, status_code=400)

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        # 构建消息
        if file_ids:
            content_list = [{'type': 'text', 'text': message}]
            for file_id in file_ids:
                content_list.append({'type': 'image', 'file_id': file_id})
            additional_messages = [{
                'role': 'user',
                'content': json.dumps(content_list),
                'content_type': 'object_string'
            }]
        else:
            additional_messages = [{
                'role': 'user',
                'content': message,
                'content_type': 'text'
            }]

        chat_data = {
            'bot_id': bot_id,
            'user_id': 'demo_user',
            'stream': True,
            'auto_save_history': False,
            'additional_messages': additional_messages
        }

        if conversation_id:
            chat_data['conversation_id'] = conversation_id

        # 流式生成器函数（使用 httpx 异步）
        async def generate():
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream('POST', CHAT_URL, headers=headers, json=chat_data) as response:
                    response.raise_for_status()

                    # 逐字节读取以保证真实流式
                    buffer = b''
                    async for chunk in response.aiter_bytes(chunk_size=1):
                        if not chunk:
                            continue

                        buffer += chunk

                        # 检查是否有完整的行（以\n结尾）
                        if chunk == b'\n':
                            line = buffer.decode('utf-8')
                            buffer = b''

                            # 立即yield，不等待累积
                            if line.strip():
                                yield line
                            else:
                                yield '\n'  # 保持空行分隔

        return StreamingResponse(generate(), media_type='text/event-stream')

    except Exception as e:
        print(f"[ERROR] Chat stream failed: {str(e)}")
        return JSONResponse({'error': f'对话失败: {str(e)}'}, status_code=500)

@app.post('/api/chat')
async def chat(request: Request):
    """发送消息到Bot（非流式API，保持向后兼容）"""
    access_token = get_access_token()
    if not access_token:
        return JSONResponse({'error': 'Token未配置'}, status_code=401)

    try:
        data = await request.json()
        bot_id = data.get('bot_id')
        message = data.get('message')
        conversation_id = data.get('conversation_id')
        file_ids = data.get('file_ids', [])

        if not bot_id or not message:
            return JSONResponse({'error': '缺少bot_id或message参数'}, status_code=400)

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        # 构建消息
        if file_ids:
            content_list = [{'type': 'text', 'text': message}]
            for file_id in file_ids:
                content_list.append({'type': 'image', 'file_id': file_id})
            additional_messages = [{
                'role': 'user',
                'content': json.dumps(content_list),
                'content_type': 'object_string'
            }]
        else:
            additional_messages = [{
                'role': 'user',
                'content': message,
                'content_type': 'text'
            }]

        chat_data = {
            'bot_id': bot_id,
            'user_id': 'demo_user',
            'stream': True,
            'auto_save_history': False,
            'additional_messages': additional_messages
        }

        if conversation_id:
            chat_data['conversation_id'] = conversation_id

        response = requests.post(CHAT_URL, headers=headers, json=chat_data, stream=True, timeout=120)
        response.raise_for_status()

        # 解析流式响应并累积
        reply = ''
        new_conversation_id = conversation_id
        current_event = None

        for line in response.iter_lines():
            if not line:
                continue

            line_str = line.decode('utf-8')

            if line_str.startswith('event:'):
                current_event = line_str[6:].strip()
            elif line_str.startswith('data:'):
                try:
                    data_str = line_str[5:].strip()
                    event_data = json.loads(data_str)

                    if 'conversation_id' in event_data:
                        new_conversation_id = event_data['conversation_id']

                    if current_event == 'conversation.message.delta':
                        if event_data.get('role') == 'assistant' and event_data.get('type') == 'answer':
                            reply += event_data.get('content', '')
                except Exception as e:
                    print(f"[DEBUG] Parse line error: {e}, line: {line_str[:100]}")
                    pass

        return {
            'success': True,
            'reply': reply,
            'conversation_id': new_conversation_id
        }

    except Exception as e:
        print(f"[ERROR] Chat failed: {str(e)}")
        return JSONResponse({'error': f'对话失败: {str(e)}'}, status_code=500)
