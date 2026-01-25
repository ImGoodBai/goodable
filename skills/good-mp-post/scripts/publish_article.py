#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Publish draft articles to WeChat Official Account
Supports publishing draft to official account
"""

import sys
import argparse
import json
import requests
from wechat_auth import get_access_token, WECHAT_API_BASE


def publish_article(media_id: str):
    """
    Publish WeChat Official Account draft

    Args:
        media_id: Draft media_id

    Returns:
        publish_id: Publishing task ID
    """
    # Get access_token
    access_token = get_access_token()

    # Build request URL
    url = f"{WECHAT_API_BASE}/cgi-bin/freepublish/submit?access_token={access_token}"

    # Build request body
    data = {
        "media_id": media_id
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
        publish_id = result.get("publish_id")
        if not publish_id:
            raise Exception("Failed to publish: publish_id not returned")

        return publish_id

    except Exception as e:
        raise Exception(f"Failed to publish draft: {str(e)}")


def main():
    parser = argparse.ArgumentParser(description="发布微信公众号草稿")
    parser.add_argument("--media_id", required=True, help="草稿的media_id")
    
    args = parser.parse_args()
    
    try:
        publish_id = publish_article(args.media_id)
        print(publish_id)
    except Exception as e:
        print(f"错误: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
