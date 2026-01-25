#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Theme loader for WeChat HTML converter
Load theme configurations from JSON files
"""

import json
from pathlib import Path
from typing import Dict


THEMES_DIR = Path(__file__).parent.parent / "themes"


def load_theme(theme_name: str) -> Dict[str, str]:
    """
    Load theme configuration from JSON file and convert to inline styles

    Args:
        theme_name: Theme name (default, business, fresh)

    Returns:
        Dictionary mapping HTML tags to inline style strings
    """
    theme_file = THEMES_DIR / f"{theme_name}.json"

    if not theme_file.exists():
        raise FileNotFoundError(f"Theme not found: {theme_name}")

    with open(theme_file, 'r', encoding='utf-8') as f:
        theme = json.load(f)

    # Convert theme config to inline styles
    styles = {}

    # Body text (p, li)
    body = theme['body']
    body_style = f"margin: {body['marginTop']} 0 {body['marginBottom']}; padding: 0; line-height: {body['lineHeight']}; font-size: {body['fontSize']}; color: {body['color']}; letter-spacing: {body['letterSpacing']}; font-weight: {body['fontWeight']}; text-align: justify;"
    styles['p'] = body_style

    # Headings
    for tag, config in theme['heading'].items():
        # Build padding (h2 has paddingBottom for border spacing)
        padding = f"0 0 {config.get('paddingBottom', '0')} 0" if 'paddingBottom' in config else '0'

        # Build base style
        style = f"margin: {config['marginTop']} 0 {config['marginBottom']}; padding: {padding}; font-size: {config['fontSize']}; font-weight: {config['fontWeight']}; color: {config['color']}; line-height: {config['lineHeight']};"

        # Add border-bottom if specified (for h2)
        if 'borderBottom' in config:
            style += f" border-bottom: {config['borderBottom']};"

        styles[tag] = style

    # Blockquote
    bq = theme['blockquote']
    styles['blockquote'] = f"margin: {bq['marginTop']} 0 {bq['marginBottom']}; padding: {bq['padding']}; border-left: {bq['borderWidth']} solid {bq['borderColor']}; background-color: {bq['bgColor']}; color: {bq['color']}; font-size: {bq['fontSize']}; line-height: {bq['lineHeight']};"

    # Lists
    lst = theme['list']
    styles['ul'] = 'margin: 10px 0; padding-left: 25px; list-style-type: disc;'
    styles['ol'] = 'margin: 10px 0; padding-left: 25px; list-style-type: decimal;'
    styles['li'] = f"margin: {lst['marginItem']} 0; line-height: {lst['lineHeight']}; font-size: {lst['fontSize']}; color: {lst['color']};"

    # Code
    code = theme['code']
    styles['code'] = f"padding: {code['padding']}; background-color: {code['bgColor']}; border-radius: {code['borderRadius']}; font-family: Consolas, Monaco, monospace; font-size: {code['fontSize']}; color: {code['color']};"

    # Pre
    pre = theme['pre']
    styles['pre'] = f"margin: {pre['marginTop']} 0 {pre['marginBottom']}; padding: {pre['padding']}; background-color: {pre['bgColor']}; border-radius: {pre['borderRadius']}; overflow-x: auto; font-family: Consolas, Monaco, monospace; font-size: {pre['fontSize']}; line-height: {pre['lineHeight']}; color: {pre['color']};"

    # Strong and em
    styles['strong'] = f"font-weight: {theme['strong']['fontWeight']}; color: {theme['strong']['color']};"
    styles['em'] = f"font-style: italic; color: {theme['em']['color']};"

    # Link
    styles['a'] = f"color: {theme['link']['color']}; text-decoration: underline;"

    # Other elements (fixed styles)
    styles['img'] = 'display: block; max-width: 100%; margin: 15px auto; border-radius: 4px;'
    styles['hr'] = 'margin: 20px 0; border: 0; border-top: 1px solid #e5e5e5;'
    styles['table'] = 'margin: 15px 0; border-collapse: collapse; width: 100%; font-size: 14px;'
    styles['th'] = 'padding: 8px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold; text-align: left;'
    styles['td'] = 'padding: 8px; border: 1px solid #ddd; text-align: left;'

    return styles


def get_available_themes():
    """Get list of available theme names"""
    if not THEMES_DIR.exists():
        return []

    return [f.stem for f in THEMES_DIR.glob('*.json')]


def get_theme_info(theme_name: str) -> dict:
    """Get theme metadata (name, description)"""
    theme_file = THEMES_DIR / f"{theme_name}.json"

    if not theme_file.exists():
        return {"name": theme_name, "description": ""}

    with open(theme_file, 'r', encoding='utf-8') as f:
        theme = json.load(f)

    return {
        "name": theme.get("name", theme_name),
        "description": theme.get("description", "")
    }


# Test
if __name__ == "__main__":
    print("Available themes:", get_available_themes())
    print("\nDefault theme styles:")
    styles = load_theme('default')
    for tag, style in list(styles.items())[:5]:
        print(f"{tag}: {style[:80]}...")
