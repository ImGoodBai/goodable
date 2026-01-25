#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Create draft articles for WeChat Official Account
Supports creating article materials
"""

import sys
import argparse
import json
import requests
from wechat_auth import get_access_token, WECHAT_API_BASE


def create_draft(title: str, author: str, digest: str, thumb_media_id: str, content: str, media_ids: list = None):
    """
    Create WeChat Official Account article draft

    Args:
        title: Article title
        author: Author name (max 8 Chinese characters)
        digest: Summary (optional)
        thumb_media_id: Cover image thumb_media_id
        content: HTML formatted article content
        media_ids: List of media_ids for content images (optional)

    Returns:
        media_id: Draft media_id
    """
    if media_ids is None:
        media_ids = []

    # Get access_token
    access_token = get_access_token()

    # Build request URL
    url = f"{WECHAT_API_BASE}/cgi-bin/draft/add?access_token={access_token}"

    # Build article data
    article = {
        "title": title,
        "author": author,
        "thumb_media_id": thumb_media_id,
        "content": content,
        "show_cover_pic": 1,
        "need_open_comment": 1,
        "only_fans_can_comment": 0
    }

    # Add digest if provided
    if digest:
        article["digest"] = digest

    # Build request body
    data = {
        "articles": [article]
    }

    # Send request
    try:
        # Serialize JSON without escaping Chinese characters
        json_data = json.dumps(data, ensure_ascii=False)
        response = requests.post(
            url,
            data=json_data,
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=30
        )
        response.raise_for_status()
        result = response.json()

        # Error handling
        errcode = result.get("errcode", 0)
        if errcode != 0:
            errmsg = result.get("errmsg", "Unknown error")
            raise Exception(f"WeChat API error [{errcode}]: {errmsg}")

        # Extract result
        media_id = result.get("media_id")
        if not media_id:
            raise Exception("Failed to create draft: media_id not returned")

        return media_id

    except Exception as e:
        raise Exception(f"Failed to create draft: {str(e)}")

   
def main():
    parser = argparse.ArgumentParser(description="创建微信公众号图文草稿")
    parser.add_argument("--title", required=True, help="文章标题")
    parser.add_argument("--author", required=True, help="作者名称")
    parser.add_argument("--digest", default="", help="文章摘要（可选）")
    parser.add_argument("--thumb_media_id", required=True, help="封面图的thumb_media_id")
    parser.add_argument("--content", required=True, help="HTML格式的正文内容")
    parser.add_argument("--media_ids", required=True, help="正文插图的media_id列表（JSON数组字符串）")
    
    args = parser.parse_args()
    
    try:
        # 解析media_ids JSON数组
        media_ids = json.loads(args.media_ids)
        if not isinstance(media_ids, list):
            raise ValueError("media_ids必须是JSON数组格式")
        
        media_id = create_draft(
            title=args.title,
            author=args.author,
            digest=args.digest,
            thumb_media_id=args.thumb_media_id,
            content=args.content,
            media_ids=media_ids
        )
        print(media_id)
    except Exception as e:
        print(f"错误: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
