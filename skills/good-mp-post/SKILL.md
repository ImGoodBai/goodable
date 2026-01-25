---
name: good-mp-post
displayName: Good 公众号发布
description: 微信公众号文章发布完整流程管理，包括AI辅助创作、图片生成、排版和发布。
version: 1.0.0
license: MIT
---

# Good 公众号发布

## 任务目标
通过AI辅助完成微信公众号文章的创作、排版和发布全流程。

**能力：** 文章创作、图片生成与上传、草稿创建、文章发布

**触发：** 用户需要创建或发布微信公众号文章

## 前置准备
**依赖：** requests>=2.28.0, python-dotenv>=1.0.0

**凭证配置：**
- 在 .env 文件配置 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`
- 获取方式：微信公众平台 → 开发 → 基本配置
- 需配置IP白名单

## 标准流程

### 1. 创作文章内容
- 根据用户需求创作文章（Markdown格式）
- 参考 `assets/templates/article-template.md` 了解格式建议

### 2. 生成图片
- 生成封面图（建议 900×383px，<5MB）
- 生成插图（宽度≤900px）

### 3. 上传图片
调用 `scripts/upload_media.py`:
```bash
python scripts/upload_media.py /path/to/cover.jpg thumb    # 封面图
python scripts/upload_media.py /path/to/image.png image    # 正文图
```

### 4. 创建草稿
调用 `scripts/create_draft.py`:
```bash
python scripts/create_draft.py \
  --title "文章标题" \
  --author "作者名" \
  --thumb_media_id <封面图ID> \
  --content "<p>HTML正文</p>" \
  --media_ids '[]'
```

**注意：** 作者名最长8个中文字符

### 5. 发布文章
调用 `scripts/publish_article.py`:
```bash
python scripts/publish_article.py --media_id <草稿ID>
```

## 资源索引
- `scripts/upload_media.py` - 上传图片到素材库
- `scripts/create_draft.py` - 创建图文草稿
- `scripts/publish_article.py` - 发布草稿
- `references/api-guide.md` - API详细说明
- `assets/templates/article-template.md` - 文章格式模板

## 关键注意事项
1. **作者名限制：** 最长8个中文字符
2. **图片有效期：** 封面图永久，正文图3天
3. **HTML要求：** 使用简单标签（p/h1-h3/ul/li/img/a），避免复杂CSS
4. **发布审核：** 发布后需微信审核才能展示
5. **调用频率：** 上传1000次/天，创建草稿100次/天，发布10次/天
