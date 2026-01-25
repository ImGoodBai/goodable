#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WeChat Official Account authentication module
Handles access token retrieval and caching
"""

import os
import time
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from skill's .env file (cwd-independent)
SKILL_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = SKILL_DIR / ".env"
load_dotenv(ENV_PATH, override=True)

# WeChat official API base URL
WECHAT_API_BASE = "https://api.weixin.qq.com"

# Token cache
_access_token_cache = None
_token_expire_time = 0


def get_access_token():
    """
    Get access_token with caching support
    Token is cached and automatically refreshed 5 minutes before expiration

    Returns:
        str: WeChat API access token

    Raises:
        Exception: If credentials are not configured or API request fails
    """
    global _access_token_cache, _token_expire_time

    # Check if token is still valid (refresh 5 minutes before expiration)
    current_time = time.time()
    if _access_token_cache and current_time < _token_expire_time - 300:
        return _access_token_cache

    # Read credentials from environment variables
    app_id = os.getenv("WECHAT_APP_ID")
    app_secret = os.getenv("WECHAT_APP_SECRET")

    if not app_id or not app_secret:
        raise Exception(
            "WeChat credentials not configured. "
            "Please set WECHAT_APP_ID and WECHAT_APP_SECRET in .env file"
        )

    url = f"{WECHAT_API_BASE}/cgi-bin/token"
    params = {
        "grant_type": "client_credential",
        "appid": app_id,
        "secret": app_secret
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        access_token = data.get("access_token")
        expires_in = data.get("expires_in", 7200)

        if not access_token:
            errcode = data.get("errcode", 0)
            errmsg = data.get("errmsg", "Unknown error")
            raise Exception(f"Failed to get access_token [{errcode}]: {errmsg}")

        # Cache token
        _access_token_cache = access_token
        _token_expire_time = current_time + expires_in

        return access_token

    except Exception as e:
        raise Exception(f"Error getting access_token: {str(e)}")
