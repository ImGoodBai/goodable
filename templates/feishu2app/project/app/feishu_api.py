import os
import json
import html
import requests
import lark_oapi as lark
from lark_oapi.api.docx.v1 import *
from lark_oapi.api.wiki.v2 import *
from dotenv import load_dotenv

# 加载.env文件
load_dotenv()

# 飞书应用凭证
APP_ID = os.getenv('APP_ID')
APP_SECRET = os.getenv('APP_SECRET')
UserAccessToken = os.getenv('UserAccessToken')

# 飞书API封装类
class FeishuAPI:
    def __init__(self):
        # 创建client
        self.client = lark.Client.builder() \
            .app_id(APP_ID) \
            .app_secret(APP_SECRET) \
            .enable_set_token(True) \
            .log_level(lark.LogLevel.ERROR) \
            .build()

        # 用户访问令牌
        self.token = UserAccessToken
        print(f"使用的 token: {self.token[:50]}..." if self.token else "Token 为空！")
        self.option = lark.RequestOption.builder().user_access_token(self.token).build()

    # 刷新 token（当环境变量中的 token 更新后调用）
    def refresh_token(self):
        """重新加载环境变量并刷新 token"""
        from dotenv import load_dotenv
        load_dotenv(override=True)
        new_token = os.getenv('UserAccessToken')
        if new_token and new_token != self.token:
            self.token = new_token
            self.option = lark.RequestOption.builder().user_access_token(self.token).build()
            print(f"Token 已刷新: {self.token[:50]}...")
            return True
        return False
    
    # 获取租户访问令牌
    def get_tenant_access_token(self):
        """获取飞书访问令牌"""
        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        headers = {
            "Content-Type": "application/json"
        }
        data = {
            "app_id": APP_ID,
            "app_secret": APP_SECRET
        }
        
        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 0:
                return result.get("tenant_access_token")
        
        return None
    
    # 获取文件内容
    def get_file_content(self, file_token, file_type='other', is_download=False, filename=None):
        """获取飞书文档中的各种文件"""
        # 获取访问令牌
        token = self.token
        if not token:
            return None, "获取访问令牌失败"
        
        # 根据文件类型设置内容类型
        content_type_map = {
            'video': 'video/mp4',
            'audio': 'audio/mpeg',
            'image': 'image/jpeg',
            'document': 'application/octet-stream',
            'other': 'application/octet-stream'
        }
        default_content_type = content_type_map.get(file_type, 'application/octet-stream')
        
        # 使用文档服务的媒体接口下载文件
        file_url = f"https://open.feishu.cn/open-apis/drive/v1/medias/{file_token}/download"
        headers = {
            "Authorization": f"Bearer {token}"
        }
        
        try:
            # 请求文件内容
            response = requests.get(file_url, headers=headers, stream=True, allow_redirects=True)
            
            if response.status_code != 200:
                # 尝试直接使用另一个接口
                alt_file_url = f"https://open.feishu.cn/open-apis/drive/v1/medias/{file_token}"
                alt_response = requests.get(alt_file_url, headers=headers, stream=True)
                
                if alt_response.status_code == 200:
                    # 设置内容类型
                    content_type = alt_response.headers.get('content-type', default_content_type)
                    return alt_response.content, content_type
                else:
                    return None, f"{file_type}文件下载失败"
            
            # 设置内容类型
            content_type = response.headers.get('content-type', default_content_type)
            return response.content, content_type
            
        except Exception as e:
            return None, f"获取文件时发生错误: {str(e)}"
    
    # 获取所有知识库列表
    def get_spaces(self):
        try:
            # 构造请求对象
            request = ListSpaceRequest.builder() \
                .page_size(20) \
                .build()

            # 发起请求
            response = self.client.wiki.v2.space.list(request, self.option)

            # 添加调试信息
            print(f"API Response - success: {response.success()}, code: {response.code}, msg: {response.msg}")

            # 处理失败返回
            if not response.success():
                error_msg = f"获取知识库列表失败, code: {response.code}, msg: {response.msg}"
                return {"code": 1, "msg": error_msg, "data": None}

            # 处理业务结果
            spaces = []
            if response.data and response.data.items:
                print(f"找到 {len(response.data.items)} 个知识库")
                for item in response.data.items:
                    spaces.append({
                        "space_id": item.space_id,
                        "name": item.name,
                        "description": item.description or "",
                        "space_type": item.space_type,
                        "visibility": item.visibility
                    })
            else:
                print("响应中没有知识库数据")

            return {
                "code": 0,
                "msg": "success",
                "data": {
                    "spaces": spaces
                }
            }
        except Exception as e:
            print(f"获取知识库列表异常: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"code": 1, "msg": f"获取知识库列表异常: {str(e)}", "data": None}
    
    # 获取指定知识库的子节点列表
    def get_space_nodes(self, space_id):
        try:
            # 构造请求对象
            request = ListSpaceNodeRequest.builder() \
                .space_id(space_id) \
                .build()
            
            # 发起请求
            response = self.client.wiki.v2.space_node.list(request, self.option)
            
            # 处理失败返回
            if not response.success():
                error_msg = f"获取知识库节点列表失败, code: {response.code}, msg: {response.msg}"
                return {"code": 1, "msg": error_msg, "data": None}
            
            # 处理业务结果
            nodes = []
            for item in response.data.items:
                nodes.append({
                    "node_token": item.node_token,
                    "title": item.title,
                    "obj_token": item.obj_token,
                    "obj_type": item.obj_type,
                    "has_child": item.has_child
                })
            
            return {
                "code": 0,
                "msg": "success",
                "data": {
                    "nodes": nodes
                }
            }
        except Exception as e:
            return {"code": 1, "msg": f"获取知识库节点列表异常: {str(e)}", "data": None}
    
    # 获取指定文档的详情
    def get_node_detail(self, document_id):
        try:
            # 构造请求对象
            request = ListDocumentBlockRequest.builder() \
                .document_id(document_id) \
                .page_size(500) \
                .document_revision_id(-1) \
                .build()
            
            # 发起请求
            response = self.client.docx.v1.document_block.list(request, self.option)
            
            # 处理失败返回
            if not response.success():
                error_msg = f"获取文档详情失败, code: {response.code}, msg: {response.msg}"
                return {"code": 1, "msg": error_msg, "data": None}
            
            # 将响应数据转换为可序列化的字典
            response_json = json.loads(lark.JSON.marshal(response.data))
            
            # 解析为HTML
            html_content = self.parse_document_content(response_json)
            
            # 返回HTML内容
            return {
                "code": 0,
                "msg": "success",
                "data": {
                    "block_id": document_id,
                    "content": html_content
                }
            }
        except Exception as e:
            return {"code": 1, "msg": f"获取文档详情异常: {str(e)}", "data": None}

    # 解析文档内容为HTML
    def parse_document_content(self, doc_content):
        """解析飞书文档内容为HTML"""
        if not doc_content or "items" not in doc_content:
            return "<p>无法解析文档内容</p>"
        
        blocks = doc_content.get("items", [])
        
        html_content = ""
        
        try:
            # 尝试找到文档标题（通常在第一个块中）
            if blocks and blocks[0].get("block_type") == 1 and "page" in blocks[0]:
                title_elements = blocks[0].get("page", {}).get("elements", [])
                title = ""
                for element in title_elements:
                    if "text_run" in element:
                        title += element["text_run"].get("content", "")
                if title:
                    html_content += f"<h1>{html.escape(title)}</h1>"
                else:
                    html_content += "<h1>飞书文档</h1>"
            else:
                html_content += "<h1>飞书文档</h1>"
            
            # 遍历文档块
            for block in blocks:
                # 根据实际API返回结构判断块类型
                block_type = block.get("block_type")
                
                # 跳过文档根块（通常是block_type=1）
                if block_type == 1:
                    continue
                
                # 文本块 (Text Block) - block_type=2
                if block_type == 2:
                    text_block = block.get("text", {})
                    elements = text_block.get("elements", [])
                    text_content = ""
                    
                    for element in elements:
                        if "text_run" in element:
                            text_run = element.get("text_run", {})
                            content = text_run.get("content", "")
                            style = text_run.get("text_element_style", {})
                            
                            # 处理文本样式
                            if style.get("bold"):
                                content = f"<strong>{html.escape(content)}</strong>"
                            elif style.get("italic"):
                                content = f"<em>{html.escape(content)}</em>"
                            elif style.get("underline"):
                                content = f"<u>{html.escape(content)}</u>"
                            elif style.get("strikethrough"):
                                content = f"<del>{html.escape(content)}</del>"
                            elif style.get("inline_code"):
                                content = f"<code>{html.escape(content)}</code>"
                            else:
                                content = html.escape(content)
                                
                            text_content += content
                    
                    if text_content:
                        html_content += f"<p>{text_content}</p>"
                
                # 标题块 (Heading Block) - block_type=3~9
                elif 3 <= block_type <= 9:
                    # 标题级别对应关系：3=h1, 4=h2, 5=h3...
                    level = block_type - 2
                    heading_key = f"heading{level}"
                    
                    if heading_key in block:
                        heading_block = block.get(heading_key, {})
                        elements = heading_block.get("elements", [])
                        heading_text = ""
                        
                        for element in elements:
                            if "text_run" in element:
                                text_run = element.get("text_run", {})
                                heading_text += html.escape(text_run.get("content", ""))
                        
                        if heading_text:
                            html_content += f"<h{level}>{heading_text}</h{level}>"
                
                # 无序列表块 (Bullet List) - block_type=15
                elif block_type == 15:
                    bullet_block = block.get("bullet", {})
                    elements = bullet_block.get("elements", [])
                    bullet_content = ""
                    
                    for element in elements:
                        if "text_run" in element:
                            text_run = element.get("text_run", {})
                            bullet_content += html.escape(text_run.get("content", ""))
                    
                    if bullet_content:
                        html_content += f"<li>{bullet_content}</li>"
                
                # 有序列表块 (Ordered List) - block_type=16
                elif block_type == 16:
                    ordered_block = block.get("ordered", {})
                    elements = ordered_block.get("elements", [])
                    ordered_content = ""
                    
                    for element in elements:
                        if "text_run" in element:
                            text_run = element.get("text_run", {})
                            ordered_content += html.escape(text_run.get("content", ""))
                    
                    if ordered_content:
                        html_content += f"<li class=\"ordered\">{ordered_content}</li>"
                
                # 图片块 (Image Block) - block_type=27
                elif block_type == 27 and "image" in block:
                    image_block = block.get("image", {})
                    image_token = image_block.get("token", "")
                    
                    if image_token:
                        image_url = f"/api/file/{image_token}?type=image"
                        html_content += f"""
                        <div class="image-container">
                            <img src="{image_url}" alt="图片" />
                            <p><a href="{image_url}&download=true&filename=image.jpg" target="_blank">下载图片</a></p>
                        </div>
                        """
                    else:
                        html_content += "<p>[图片无法显示]</p>"
                
                # 文件块 (File Block) - block_type=23
                elif block_type == 23 and "file" in block:
                    file_block = block.get("file", {})
                    file_token = file_block.get("token", "")
                    file_name = file_block.get("name", "文件")
                    file_extension = ""
                    
                    # 获取文件扩展名
                    if "." in file_name:
                        file_extension = file_name.split(".")[-1].lower()
                    
                    # 根据文件名或扩展名判断文件类型
                    if file_token:
                        # 视频文件类型
                        video_extensions = ["mp4", "mov", "avi", "wmv", "flv", "mkv", "webm"]
                        # 图片文件类型
                        image_extensions = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "tiff"]
                        # 音频文件类型
                        audio_extensions = ["mp3", "wav", "ogg", "m4a", "flac", "aac"]
                        # 文档文件类型
                        doc_extensions = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "rtf"]
                        
                        # 判断文件类型并显示相应的内容
                        if any(file_extension == ext for ext in video_extensions) or "video" in file_name.lower():
                            # 视频文件处理
                            video_url = f"/api/file/{file_token}?type=video"
                            html_content += f"""
                            <div class="file-container video-container">
                                <h4><i class="file-icon video-icon"></i> {html.escape(file_name)}</h4>
                                <div class="video-placeholder" data-video-url="{video_url}">
                                    <div class="video-placeholder-inner">
                                        <div class="play-button">▶</div>
                                        <div class="video-info">点击加载视频</div>
                                    </div>
                                </div>
                                <p><a href="{video_url}&download=true&filename={html.escape(file_name)}" target="_blank">下载视频</a></p>
                            </div>
                            """
                        elif any(file_extension == ext for ext in audio_extensions) or "audio" in file_name.lower():
                            # 音频文件处理
                            audio_url = f"/api/file/{file_token}?type=audio"
                            html_content += f"""
                            <div class="file-container audio-container">
                                <h4><i class="file-icon audio-icon"></i> {html.escape(file_name)}</h4>
                                <audio controls>
                                    <source src="{audio_url}" type="audio/mpeg">
                                    您的浏览器不支持音频标签。
                                </audio>
                                <p><a href="{audio_url}&download=true&filename={html.escape(file_name)}" target="_blank">下载音频</a></p>
                            </div>
                            """
                        elif any(file_extension == ext for ext in image_extensions) or "image" in file_name.lower() or "photo" in file_name.lower():
                            # 图片文件处理（与图片块类似）
                            image_url = f"/api/file/{file_token}?type=image"
                            html_content += f"""
                            <div class="file-container image-container">
                                <h4><i class="file-icon image-icon"></i> {html.escape(file_name)}</h4>
                                <img src="{image_url}" alt="{html.escape(file_name)}" />
                                <p><a href="{image_url}&download=true&filename={html.escape(file_name)}" target="_blank">下载图片</a></p>
                            </div>
                            """
                        elif any(file_extension == ext for ext in doc_extensions):
                            # 文档文件处理
                            doc_url = f"/api/file/{file_token}?type=document"
                            html_content += f"""
                            <div class="file-container document-container">
                                <h4><i class="file-icon document-icon"></i> {html.escape(file_name)}</h4>
                                <p>文档文件: {html.escape(file_name)}</p>
                                <p><a href="{doc_url}&download=true&filename={html.escape(file_name)}" target="_blank">下载文档</a></p>
                            </div>
                            """
                        else:
                            # 其他类型文件处理
                            file_url = f"/api/file/{file_token}?type=other"
                            html_content += f"""
                            <div class="file-container other-file-container">
                                <h4><i class="file-icon file-icon"></i> {html.escape(file_name)}</h4>
                                <p>文件: {html.escape(file_name)}</p>
                                <p><a href="{file_url}&download=true&filename={html.escape(file_name)}" target="_blank">下载文件</a></p>
                            </div>
                            """
                    else:
                        html_content += f"<p>[文件无法显示: {html.escape(file_name)}]</p>"
                
                # 代码块 (Code Block) - block_type=22
                elif block_type == 22 and "code" in block:
                    code_block = block.get("code", {})
                    elements = code_block.get("elements", [])
                    code_content = ""
                    
                    for element in elements:
                        if "text_run" in element:
                            text_run = element.get("text_run", {})
                            code_content += html.escape(text_run.get("content", ""))
                    
                    if code_content:
                        html_content += f"<pre><code>{code_content}</code></pre>"
            
            return html_content
        
        except Exception as e:
            return f"<p>解析文档内容出错: {str(e)}</p>"
