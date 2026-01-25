# 微信公众号API使用指南

## 目录

- [概览](#概览)
- [凭证配置](#凭证配置)
- [核心接口说明](#核心接口说明)
  - [上传图片素材](#上传图片素材)
  - [创建图文草稿](#创建图文草稿)
  - [发布草稿](#发布草稿)
- [数据格式规范](#数据格式规范)
- [错误码说明](#错误码说明)
- [注意事项](#注意事项)

## 概览

本文档介绍微信公众号相关API的使用方式，包括素材管理、草稿创建和文章发布功能。

**适用范围**：
- 微信公众号已认证的订阅号或服务号
- 需要开发者权限才能调用API

## 凭证配置

微信公众号API使用WeChatOfficialAccount授权类型。

### 凭证获取方式

1. 登录微信公众平台（mp.weixin.qq.com）
2. 进入"开发" → "基本配置"
3. 获取以下信息：
   - AppID: 微信公众号的唯一标识
   - AppSecret: 密钥（需要管理员扫码授权才能查看）

### Skill配置

首次使用时，系统会自动弹出配置窗口，要求填写：
- `APP_ID`: 微信公众号AppID
- `APP_SECRET`: 微信公众号AppSecret

配置完成后，Skill会自动管理 access_token 的获取和刷新。

### 代理服务器配置

本Skill使用Nginx透明代理，无需配置IP白名单。

**代理地址**：`https://mp.100agent.co/api`

**工作原理**：
- 所有微信API请求通过代理服务器转发
- 代理服务器自动转发到微信官方API
- 使用代理服务器的固定IP地址
- 无需担心客户端IP变化问题

## 核心接口说明

### 上传图片素材

#### 接口说明
支持上传两种类型的图片素材：
- **thumb（封面图）**：永久素材，用于文章封面，建议尺寸900*383，大小不超过5MB
- **image（正文图）**：临时素材，有效期3天，用于正文插图

#### 调用方式

**脚本路径**：`scripts/upload_media.py`

**参数**：
- `image_path`：图片文件的完整路径（必填）
- `media_type`：素材类型，可选值为 "thumb" 或 "image"（必填）

**返回值**：
- 成功：返回 media_id（字符串）
- 失败：抛出异常，返回错误信息

**示例**：
```bash
# 上传封面图
python scripts/upload_media.py /tmp/cover.jpg thumb

# 上传正文插图
python scripts/upload_media.py /tmp/image1.jpg image
```

#### 返回数据格式

成功时返回：
```json
{
  "type": "thumb" | "image",
  "media_id": "RrNmr2S9G7l3f1K3m8g5a3x2",
  "created_at": 1234567890
}
```

### 创建图文草稿

#### 接口说明
创建一篇图文素材草稿，可在公众号后台编辑或直接发布。

#### 调用方式

**脚本路径**：`scripts/create_draft.py`

**参数**：
- `--title`：文章标题（必填）
- `--author`：作者名称（必填）
- `--digest`：文章摘要，不填则自动提取（可选）
- `--thumb_media_id`：封面图的thumb_media_id（必填）
- `--content`：HTML格式的正文内容（必填）
- `--media_ids`：正文插图的media_id列表，JSON数组字符串（必填）

**返回值**：
- 成功：返回 media_id（字符串）
- 失败：抛出异常，返回错误信息

**示例**：
```bash
python scripts/create_draft.py \
  --title "测试文章" \
  --author "作者名" \
  --thumb_media_id "RrNmr2S9G7l3f1K3m8g5a3x2" \
  --content "<p>正文内容</p>" \
  --media_ids '["media_id_1", "media_id_2"]'
```

#### HTML正文格式要求

正文的`content`字段必须是有效的HTML格式，包含以下要求：

1. **基本标签**：使用 `<p>` 标签表示段落
2. **图片插入**：使用 `<img>` 标签，`src` 属性使用微信CDN格式
3. **样式限制**：不支持外部CSS，使用内联样式

**示例**：
```html
<p>这是第一段正文内容。</p>
<p>这是第二段，包含图片：</p>
<img src="https://mmbiz.qpic.cn/mmbiz_jpg/xxx/0?wx_fmt=jpeg" />
<p>这是第三段内容。</p>
```

**注意**：正文中的图片URL应使用微信素材库返回的media_id，通过微信公众号CDN生成。

### 发布草稿

#### 接口说明
将已创建的草稿发布到公众号。发布后需要经过微信审核才能展示给用户。

#### 调用方式

**脚本路径**：`scripts/publish_article.py`

**参数**：
- `--media_id`：草稿的media_id（必填）

**返回值**：
- 成功：返回 publish_id（字符串）
- 失败：抛出异常，返回错误信息

**示例**：
```bash
python scripts/publish_article.py --media_id "RrNmr2S9G7l3f1K3m8g5a3x2"
```

#### 发布状态说明

发布后可通过 `publish_id` 查询发布状态：
- 0: 成功
- 1: 审核中
- 2: 审核失败

## 数据格式规范

### 封面图要求

- **格式**：JPG、JPEG、PNG
- **尺寸**：建议 900 * 383 像素
- **大小**：不超过 5MB
- **比例**：2.35:1

### 正文图要求

- **格式**：JPG、JPEG、PNG、GIF
- **尺寸**：宽度不大于 900 像素，高度不限
- **大小**：不超过 5MB

### HTML正文规范

1. **段落标签**：必须使用 `<p>` 标签，不能用 `<div>`
2. **图片标签**：必须包含 `src` 属性
3. **特殊字符**：需要HTML转义（如 `<` 转为 `&lt;`）
4. **编码**：使用UTF-8编码

## 错误码说明

微信公众号API常见错误码：

| 错误码 | 说明 | 解决方案 |
|-------|------|---------|
| 40001 | AppSecret错误 | 检查AppSecret是否正确 |
| 40002 | 不合法的凭证类型 | 检查access_token格式 |
| 40013 | 不合法的AppID | 检查AppID是否正确 |
| 41001 | 缺少access_token参数 | 检查环境变量配置 |
| 42001 | access_token超时 | 系统会自动刷新，稍后重试 |
| 40004 | 不合法的媒体文件类型 | 检查图片格式 |
| 40005 | 不合法的文件类型 | 检查上传的文件类型 |
| 45009 | 接口调用超过限制 | 等待一段时间后重试 |
| 48008 | 接口调用次数受限 | 检查调用频率 |
| 63104 | 非法的media_id | 检查media_id是否正确 |
| 45110 | author size out of limit | 作者名称过长，最长8个中文字符 |
| 40164 | IP地址不在白名单 | 代理服务器的IP未添加到微信公众号IP白名单 |

## 网络配置

### Nginx透明代理

本Skill使用Nginx透明代理转发请求到微信官方API。

**代理地址**：`https://mp.100agent.co/api`

**优点**：
- 使用代理服务器的固定IP地址
- 客户端IP变化不影响使用
- 无需配置微信公众号IP白名单
- 代理服务器透明转发，无需额外处理

**Nginx配置示例**：
```nginx
location /api/ {
    proxy_pass https://api.weixin.qq.com/;
    proxy_set_header Host api.weixin.qq.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## 中文编码处理

### 正确方法

✅ **在Python脚本中直接处理中文**：
```python
# Correct: Use UTF-8 encoding in Python
with open('article.md', 'r', encoding='utf-8') as f:
    content = f.read()

create_draft(
    title="代码配图",
    content="<p>正文内容</p>"
)
```

❌ **不要在命令行参数中传递中文**：
```bash
# Wrong: May cause encoding issues
--title "代码配图"
--content "<p>正文内容</p>"
```

❌ **不要在Python字符串中使用Unicode转义**：
```python
# Wrong: Will display as escape sequences
title = "\u4ee3\u7801\u914d\u56fe"
```

### Markdown转HTML工具脚本

可以使用以下脚本将Markdown转换为HTML：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re

def markdown_to_html(markdown_text):
    """
    将Markdown文本转换为HTML格式
    支持中文内容
    """
    html = markdown_text
    
    # 处理代码块（```）
    def code_block_replace(match):
        code = match.group(2)
        return f'<pre><code>{code}</code></pre>'
    html = re.sub(r'```(\w*)\n([\s\S]*?)```', code_block_replace, html)
    
    # 处理行内代码（`）
    html = re.sub(r'`([^`]+)`', r'<code>\1</code>', html)
    
    # 处理标题
    html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
    html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
    html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)
    
    # 处理无序列表
    lines = html.split('\n')
    result = []
    in_ul = False
    for line in lines:
        if line.strip().startswith('- '):
            if not in_ul:
                result.append('<ul>')
                in_ul = True
            result.append(f'<li>{line.strip()[2:]}</li>')
        else:
            if in_ul:
                result.append('</ul>')
                in_ul = False
            if line.strip():
                result.append(f'<p>{line}</p>')
    if in_ul:
        result.append('</ul>')
    html = '\n'.join(result)
    
    # 处理链接
    def link_replace(match):
        text = match.group(1)
        url = match.group(2)
        return f'<a href="{url}">{text}</a>'
    html = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link_replace, html)
    
    return html

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            content = f.read()
        print(markdown_to_html(content))
```

使用方法：
```bash
# 转换Markdown到HTML
python md_to_html.py article.md > article.html

# 在脚本中使用
with open('article.md', 'r', encoding='utf-8') as f:
    markdown_content = f.read()

html_content = markdown_to_html(markdown_content)
```

### 关键要点

1. **始终使用UTF-8编码**：文件读取、写入、处理都指定 `encoding='utf-8'`
2. **避免命令行传递中文**：直接在Python脚本中处理中文内容
3. **不要手动转义中文**：让Python自动处理编码
4. **测试显示效果**：创建草稿后在公众号后台预览，确认中文显示正常

**完整错误码参考**：https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Global_Return_Code.html

## 注意事项

### 调用频率限制

- 图片上传接口：每个公众号每天最多调用1000次
- 创建草稿接口：每个公众号每天最多调用100次
- 发布接口：每个公众号每天最多调用10次

### 素材有效期

- thumb（封面图）：永久有效
- image（正文图）：临时素材，有效期3天，到期后自动删除

### 审核说明

- 文章发布后需要经过微信人工审核
- 审核通过后才能展示给粉丝
- 审核时间通常在24小时内
- 如审核失败，可在公众号后台查看原因并修改

### 安全建议

1. 不要在代码中硬编码AppID和AppSecret
2. 定期更换AppSecret
3. 限制API调用权限
4. 监控API调用日志，发现异常及时处理

### 最佳实践

1. **测试流程**：先在测试号环境验证流程
2. **错误处理**：捕获并记录所有API错误
3. **重试机制**：对于可重试的错误（如网络超时），实现自动重试
4. **日志记录**：记录关键操作（上传、创建、发布）的结果
5. **幂等性**：避免重复发布同一篇文章
