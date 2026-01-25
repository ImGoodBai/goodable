#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Upload images to WeChat Official Account media library
Supports temporary and permanent materials
"""

import os
import sys
import argparse
import requests
from wechat_auth import get_access_token, WECHAT_API_BASE


def upload_media(image_path: str, media_type: str):
    """
    Upload image to WeChat Official Account media library

    Supported media_type:
    - thumb: Cover image (permanent material)
    - image: Content image (temporary material, valid for 3 days)

    Args:
        image_path: Image file path
        media_type: Material type (thumb or image)

    Returns:
        media_id: WeChat media ID
    """

    # 1. 获取access_token
    access_token = get_access_token()

    # 2. 验证图片文件
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"图片文件不存在: {image_path}")

    # 3. 确定API接口（直接调用微信API）
    if media_type == "thumb":
        # 上传永久素材（封面图）
        url = f"{WECHAT_API_BASE}/cgi-bin/material/add_material?access_token={access_token}&type=thumb"
    elif media_type == "image":
        # 上传临时素材（正文图片）
        url = f"{WECHAT_API_BASE}/cgi-bin/media/upload?access_token={access_token}&type=image"
    else:
        raise ValueError(f"不支持的素材类型: {media_type}，必须是 'thumb' 或 'image'")

    # Prepare upload file with context manager
    with open(image_path, 'rb') as f:
        files = {
            'media': (
                os.path.basename(image_path),
                f,
                'image/jpeg' if image_path.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
            )
        }

        # Send request
        try:
            response = requests.post(url, files=files, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Error handling
            errcode = data.get("errcode", 0)
            if errcode != 0:
                errmsg = data.get("errmsg", "Unknown error")
                raise Exception(f"WeChat API error [{errcode}]: {errmsg}")

            # Extract result
            media_id = data.get("media_id") or data.get("thumb_media_id")
            if not media_id:
                raise Exception("Upload failed: media_id not returned")

            return media_id

        except Exception as e:
            raise Exception(f"Failed to upload image: {str(e)}")


def main():
    parser = argparse.ArgumentParser(description="上传图片到微信公众号素材库")
    parser.add_argument("image_path", help="图片文件路径")
    parser.add_argument("media_type", help="素材类型: thumb(封面图) 或 image(正文图)")
    
    args = parser.parse_args()
    
    try:
        media_id = upload_media(args.image_path, args.media_type)
        print(media_id)
    except Exception as e:
        print(f"错误: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
