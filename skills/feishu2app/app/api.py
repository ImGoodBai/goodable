from fastapi import APIRouter, Response, Request, Query
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
from typing import Optional
import os
from pathlib import Path
from dotenv import load_dotenv, set_key
import requests

from app.feishu_api import FeishuAPI

# 创建路由器
router = APIRouter(prefix="/api")

# 加载环境变量
load_dotenv()

# 创建飞书API实例
feishu_api = FeishuAPI()


# ============================================
# 请求模型
# ============================================

class ConfigSaveRequest(BaseModel):
    app_id: str
    app_secret: str


# ============================================
# 辅助函数
# ============================================

def reload_config():
    """重新加载环境变量并刷新 FeishuAPI token"""
    global feishu_api
    env_file = Path(__file__).parent.parent / '.env'
    load_dotenv(str(env_file), override=True)

    # 尝试刷新 token，如果失败则重新创建实例
    if not feishu_api.refresh_token():
        feishu_api = FeishuAPI()

    print(f"配置已重新加载，使用的 token: {os.getenv('UserAccessToken', '')[:20]}...")


def mask_middle(text, keep_start=8, keep_end=8, mask_char='*', mask_length=4):
    """
    脱敏函数，保留前后部分，只遮盖中间
    """
    if not text:
        return None

    text_len = len(text)

    if text_len <= keep_start + keep_end:
        if text_len <= 4:
            return text
        return text[:2] + mask_char * mask_length + text[-2:]

    return text[:keep_start] + mask_char * mask_length + text[-keep_end:]


# ============================================
# 知识库相关 API
# ============================================

@router.get("/spaces")
async def api_get_spaces():
    """获取所有知识库列表"""
    result = feishu_api.get_spaces()
    return JSONResponse(content=result)


@router.get("/space/{space_id}/nodes")
async def api_get_space_nodes(space_id: str):
    """获取指定知识库的子节点列表"""
    result = feishu_api.get_space_nodes(space_id)
    return JSONResponse(content=result)


@router.get("/node/{node_id}")
async def api_get_node_detail(node_id: str):
    """获取指定节点的详情"""
    result = feishu_api.get_node_detail(node_id)
    return JSONResponse(content=result)


# ============================================
# 文件处理 API
# ============================================

@router.get("/file/{file_token}")
async def get_file(
    file_token: str,
    file_type: str = Query(default="other", alias="type"),
    download: Optional[str] = Query(default=None),
    filename: str = Query(default="file")
):
    """获取飞书文档中的各种文件"""
    is_download = download is not None

    # 获取文件内容
    content, content_type = feishu_api.get_file_content(
        file_token, file_type, is_download, filename
    )

    if content is None:
        return JSONResponse(
            content={"error": content_type},
            status_code=500
        )

    # 设置响应头
    headers = {
        'Cache-Control': 'max-age=86400',  # 缓存24小时
    }

    if is_download:
        headers['Content-Disposition'] = f'attachment; filename="{filename}"'

    return Response(
        content=content,
        media_type=content_type,
        headers=headers
    )


# ============================================
# 配置相关 API
# ============================================

@router.get("/config/status")
async def api_get_config_status():
    """获取配置状态"""
    try:
        app_id = os.getenv('APP_ID')
        app_secret = os.getenv('APP_SECRET')
        user_token = os.getenv('UserAccessToken')

        # 检测 token 是否有效
        token_valid = False
        token_error_msg = None
        if user_token and user_token.strip():
            try:
                test_url = "https://open.feishu.cn/open-apis/wiki/v2/spaces"
                headers = {
                    "Authorization": f"Bearer {user_token}",
                    "Content-Type": "application/json"
                }
                response = requests.get(test_url, headers=headers, timeout=5)
                result_data = response.json()

                if result_data.get('code') == 0:
                    token_valid = True
                elif result_data.get('code') in [99991677, 99991663]:
                    token_valid = False
                    token_error_msg = result_data.get('msg', 'Token 已过期或无效')
                else:
                    token_valid = True
                    token_error_msg = result_data.get('msg')
            except Exception as e:
                print(f"检测 token 有效性失败: {e}")
                token_error_msg = str(e)
                token_valid = True

        result = {
            'configured': bool(app_id),
            'app_id': mask_middle(app_id) if app_id else None,
            'app_secret': mask_middle(app_secret) if app_secret else None,
            'has_token': bool(user_token and user_token.strip()),
            'token_valid': token_valid,
            'user_token': mask_middle(user_token, keep_start=20, keep_end=10) if user_token else None,
            'token_error_msg': token_error_msg
        }

        return JSONResponse(content=result)
    except Exception as e:
        import traceback
        print(f"获取配置状态失败: {e}\n{traceback.format_exc()}")
        return JSONResponse(
            content={
                'error': True,
                'msg': f'获取配置状态失败: {str(e)}'
            },
            status_code=500
        )


@router.post("/config/save")
async def api_save_config(config: ConfigSaveRequest):
    """保存配置"""
    try:
        app_id = config.app_id.strip()
        app_secret = config.app_secret.strip()

        if not app_id or not app_secret:
            return JSONResponse(
                content={'success': False, 'msg': '请填写完整的 App ID 和 App Secret'}
            )

        # 保存到 .env 文件
        env_file = Path(__file__).parent.parent / '.env'

        # 确保文件存在
        if not env_file.exists():
            env_file.touch()

        # 保存配置（不带引号）
        set_key(str(env_file), 'APP_ID', app_id, quote_mode='never')
        set_key(str(env_file), 'APP_SECRET', app_secret, quote_mode='never')

        # 重新加载环境变量
        load_dotenv(str(env_file), override=True)

        # 验证是否保存成功
        saved_app_id = os.getenv('APP_ID')
        if saved_app_id != app_id:
            return JSONResponse(
                content={
                    'success': False,
                    'msg': f'保存失败：验证不通过。保存的值: [{saved_app_id}], 期望值: [{app_id}]'
                }
            )

        # 重新加载配置
        reload_config()

        return JSONResponse(content={
            'success': True,
            'app_id': mask_middle(app_id)
        })
    except Exception as e:
        import traceback
        return JSONResponse(
            content={
                'success': False,
                'msg': f'保存失败: {str(e)}\n{traceback.format_exc()}'
            }
        )


@router.get("/config/start_auth")
async def api_start_auth(request: Request):
    """生成授权 URL"""
    try:
        app_id = os.getenv('APP_ID')

        if not app_id:
            return JSONResponse(
                content={'success': False, 'msg': '请先配置 App ID 和 App Secret'}
            )

        # 动态获取当前服务实际运行的端口
        # 优先从请求对象获取（最准确），如果获取不到则使用环境变量
        port = request.url.port
        if not port:
            # 备用方案：从环境变量读取
            port = int(os.getenv('PORT', '8000'))

        redirect_uri = f"http://localhost:{port}/api/config/callback"

        # 需要的权限范围
        scopes = [
            "auth:user.id:read",
            "docs:document.media:download",
            "docs:document.media:upload",
            "docx:document",
            "wiki:wiki",
            "offline_access"
        ]
        scope = " ".join(scopes)

        # 生成 state
        import time
        state = str(int(time.time()))

        # 构造授权 URL
        auth_url = (
            f"https://open.feishu.cn/open-apis/authen/v1/authorize?"
            f"app_id={app_id}&"
            f"redirect_uri={redirect_uri}&"
            f"scope={scope}&"
            f"state={state}"
        )

        return JSONResponse(content={'success': True, 'auth_url': auth_url})
    except Exception as e:
        return JSONResponse(content={'success': False, 'msg': str(e)})


@router.get("/config/callback", response_class=HTMLResponse)
async def api_config_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None)
):
    """OAuth 回调处理"""
    try:
        if not code:
            error_msg = error or '授权失败'
            return f"""
                <html>
                <head><title>授权失败</title></head>
                <body>
                    <h1>授权失败</h1>
                    <p>{error_msg}</p>
                    <script>
                        if (window.opener) {{
                            window.opener.postMessage({{
                                type: 'auth_error',
                                message: '{error_msg}'
                            }}, '*');
                            window.close();
                        }}
                    </script>
                </body>
                </html>
            """

        app_id = os.getenv('APP_ID')
        app_secret = os.getenv('APP_SECRET')

        if not app_id or not app_secret:
            return f"""
                <html>
                <head><title>配置错误</title></head>
                <body>
                    <h1>配置错误</h1>
                    <p>APP_ID 或 APP_SECRET 未配置</p>
                    <script>
                        if (window.opener) {{
                            window.opener.postMessage({{
                                type: 'auth_error',
                                message: 'APP_ID 或 APP_SECRET 未配置'
                            }}, '*');
                            window.close();
                        }}
                    </script>
                </body>
                </html>
            """

        # 1. 获取 app_access_token
        app_token_url = "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal"
        app_token_data = {
            "app_id": app_id,
            "app_secret": app_secret
        }

        app_token_response = requests.post(app_token_url, json=app_token_data)
        app_token_result = app_token_response.json()

        if app_token_result.get('code') != 0:
            error_msg = f"获取 app_access_token 失败: {app_token_result.get('msg', '未知错误')}"
            return f"""
                <html>
                <head><title>授权失败</title></head>
                <body>
                    <h1>授权失败</h1>
                    <p>{error_msg}</p>
                    <script>
                        if (window.opener) {{
                            window.opener.postMessage({{
                                type: 'auth_error',
                                message: '{error_msg}'
                            }}, '*');
                            window.close();
                        }}
                    </script>
                </body>
                </html>
            """

        app_access_token = app_token_result.get('app_access_token')

        # 2. 使用授权码换取 User Access Token
        token_url = "https://open.feishu.cn/open-apis/authen/v1/access_token"

        token_data = {
            "grant_type": "authorization_code",
            "code": code
        }

        headers = {
            "Authorization": f"Bearer {app_access_token}",
            "Content-Type": "application/json"
        }

        token_response = requests.post(token_url, json=token_data, headers=headers)
        token_result = token_response.json()

        if token_result.get('code') == 0:
            user_access_token = token_result['data']['access_token']
            refresh_token = token_result['data'].get('refresh_token', '')

            # 3. 保存到 .env 文件
            env_file = Path(__file__).parent.parent / '.env'
            set_key(str(env_file), 'UserAccessToken', user_access_token, quote_mode='never')
            if refresh_token:
                set_key(str(env_file), 'RefreshToken', refresh_token, quote_mode='never')

            # 重新加载环境变量
            reload_config()

            # 返回成功页面
            return """
                <html>
                <head>
                    <title>授权成功</title>
                    <style>
                        body {
                            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background-color: #f0f7ff;
                        }
                        .container {
                            text-align: center;
                            padding: 2rem;
                            background-color: white;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                        }
                        h1 {
                            color: #52c41a;
                            margin-bottom: 1rem;
                        }
                        p {
                            color: #666;
                            margin: 0.5rem 0;
                        }
                        .success-icon {
                            font-size: 3rem;
                            margin-bottom: 1rem;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">✓</div>
                        <h1>授权成功！</h1>
                        <p>User Access Token 已保存</p>
                        <p>此窗口将自动关闭...</p>
                    </div>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'auth_success'
                            }, '*');

                            setTimeout(() => {
                                window.close();
                            }, 2000);
                        }
                    </script>
                </body>
                </html>
            """
        else:
            error_msg = token_result.get('msg', '未知错误')
            return f"""
                <html>
                <head><title>授权失败</title></head>
                <body>
                    <h1>授权失败</h1>
                    <p>错误信息: {error_msg}</p>
                    <script>
                        if (window.opener) {{
                            window.opener.postMessage({{
                                type: 'auth_error',
                                message: '{error_msg}'
                            }}, '*');
                            window.close();
                        }}
                    </script>
                </body>
                </html>
            """
    except Exception as e:
        error_msg = str(e)
        return f"""
            <html>
            <head><title>系统错误</title></head>
            <body>
                <h1>系统错误</h1>
                <p>{error_msg}</p>
                <script>
                    if (window.opener) {{
                        window.opener.postMessage({{
                            type: 'auth_error',
                            message: '{error_msg}'
                        }}, '*');
                        window.close();
                    }}
                </script>
            </body>
            </html>
        """
