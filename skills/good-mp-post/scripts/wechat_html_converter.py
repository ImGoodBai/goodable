#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WeChat Official Account HTML Converter
Convert standard HTML to WeChat-compatible HTML with inline styles
Now supports theme system via JSON configuration files
"""

import re
from typing import Dict
from html.parser import HTMLParser
from io import StringIO
from theme_loader import load_theme, get_available_themes


# Legacy themes (for backward compatibility)
# Use theme_loader.load_theme() instead for customizable themes
WECHAT_THEMES = {
    'default': {
        'p': 'margin: 10px 0; padding: 0; line-height: 1.8; font-size: 15px; color: #333; text-align: justify;',
        'h1': 'margin: 30px 0 20px; padding: 0; font-size: 22px; font-weight: bold; color: #000; line-height: 1.4;',
        'h2': 'margin: 53px 0 30px; padding: 0 0 8px 0; font-size: 19px; font-weight: bold; color: #000; line-height: 1.4; border-bottom: 2px solid #e5e5e5;',
        'h3': 'margin: 20px 0 12px; padding: 0; font-size: 17px; font-weight: bold; color: #000; line-height: 1.4;',
        'h4': 'margin: 18px 0 10px; padding: 0; font-size: 16px; font-weight: bold; color: #000; line-height: 1.4;',
        'h5': 'margin: 16px 0 8px; padding: 0; font-size: 15px; font-weight: bold; color: #000; line-height: 1.4;',
        'h6': 'margin: 14px 0 6px; padding: 0; font-size: 14px; font-weight: bold; color: #000; line-height: 1.4;',
        'blockquote': 'margin: 15px 0; padding: 10px 15px; border-left: 3px solid #d0d0d0; background-color: #f5f5f5; color: #666; font-size: 14px; line-height: 1.6;',
        'ul': 'margin: 10px 0; padding-left: 28px; list-style-type: disc;',
        'ol': 'margin: 10px 0; padding-left: 28px; list-style-type: decimal;',
        'li': 'margin: 0; line-height: 1.8; font-size: 15px; color: #333;',
        'strong': 'font-weight: bold; color: #000;',
        'em': 'font-style: italic; color: #333;',
        'code': 'padding: 2px 5px; background-color: #f5f5f5; border-radius: 3px; font-family: Consolas, Monaco, monospace; font-size: 13px; color: #d73a49;',
        'pre': 'margin: 15px 0; padding: 12px; background-color: #f6f8fa; border-radius: 5px; overflow-x: auto; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; color: #24292e;',
        'a': 'color: #576b95; text-decoration: underline;',
        'img': 'display: block; max-width: 100%; margin: 15px auto; border-radius: 4px;',
        'hr': 'margin: 20px 0; border: 0; border-top: 1px solid #e5e5e5;',
        'table': 'margin: 15px 0; border-collapse: collapse; width: 100%; font-size: 14px;',
        'th': 'padding: 8px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold; text-align: left;',
        'td': 'padding: 8px; border: 1px solid #ddd; text-align: left;',
    },
    'business': {
        'p': 'margin: 10px 0; padding: 0; line-height: 1.8; font-size: 15px; color: #3f3f46; text-align: justify;',
        'h1': 'margin: 30px 0 20px; padding: 0; font-size: 22px; font-weight: bold; color: #1e3a8a; line-height: 1.4;',
        'h2': 'margin: 53px 0 30px; padding: 0 0 8px 0; font-size: 19px; font-weight: bold; color: #1e3a8a; line-height: 1.4; border-bottom: 2px solid #bfdbfe;',
        'h3': 'margin: 20px 0 12px; padding: 0; font-size: 17px; font-weight: bold; color: #1e40af; line-height: 1.4;',
        'h4': 'margin: 18px 0 10px; padding: 0; font-size: 16px; font-weight: bold; color: #1e40af; line-height: 1.4;',
        'h5': 'margin: 16px 0 8px; padding: 0; font-size: 15px; font-weight: bold; color: #1e40af; line-height: 1.4;',
        'h6': 'margin: 14px 0 6px; padding: 0; font-size: 14px; font-weight: bold; color: #1e40af; line-height: 1.4;',
        'blockquote': 'margin: 15px 0; padding: 10px 15px; border-left: 3px solid #3b82f6; background-color: #eff6ff; color: #1e40af; font-size: 14px; line-height: 1.6;',
        'ul': 'margin: 10px 0; padding-left: 28px; list-style-type: disc;',
        'ol': 'margin: 10px 0; padding-left: 28px; list-style-type: decimal;',
        'li': 'margin: 0; line-height: 1.8; font-size: 15px; color: #3f3f46;',
        'strong': 'font-weight: bold; color: #1e3a8a;',
        'em': 'font-style: italic; color: #3f3f46;',
        'code': 'padding: 2px 5px; background-color: #eff6ff; border-radius: 3px; font-family: Consolas, Monaco, monospace; font-size: 13px; color: #1e40af;',
        'pre': 'margin: 15px 0; padding: 12px; background-color: #eff6ff; border-radius: 5px; overflow-x: auto; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; color: #1e40af;',
        'a': 'color: #2563eb; text-decoration: underline;',
        'img': 'display: block; max-width: 100%; margin: 15px auto; border-radius: 4px;',
        'hr': 'margin: 20px 0; border: 0; border-top: 1px solid #bfdbfe;',
        'table': 'margin: 15px 0; border-collapse: collapse; width: 100%; font-size: 14px;',
        'th': 'padding: 8px; border: 1px solid #bfdbfe; background-color: #eff6ff; font-weight: bold; text-align: left;',
        'td': 'padding: 8px; border: 1px solid #bfdbfe; text-align: left;',
    },
    'fresh': {
        'p': 'margin: 10px 0; padding: 0; line-height: 1.8; font-size: 15px; color: #3f3f46; text-align: justify;',
        'h1': 'margin: 30px 0 20px; padding: 0; font-size: 22px; font-weight: bold; color: #059669; line-height: 1.4;',
        'h2': 'margin: 53px 0 30px; padding: 0 0 8px 0; font-size: 19px; font-weight: bold; color: #059669; line-height: 1.4; border-bottom: 2px solid #bbf7d0;',
        'h3': 'margin: 20px 0 12px; padding: 0; font-size: 17px; font-weight: bold; color: #10b981; line-height: 1.4;',
        'h4': 'margin: 18px 0 10px; padding: 0; font-size: 16px; font-weight: bold; color: #10b981; line-height: 1.4;',
        'h5': 'margin: 16px 0 8px; padding: 0; font-size: 15px; font-weight: bold; color: #10b981; line-height: 1.4;',
        'h6': 'margin: 14px 0 6px; padding: 0; font-size: 14px; font-weight: bold; color: #10b981; line-height: 1.4;',
        'blockquote': 'margin: 15px 0; padding: 10px 15px; border-left: 3px solid #10b981; background-color: #f0fdf4; color: #065f46; font-size: 14px; line-height: 1.6;',
        'ul': 'margin: 10px 0; padding-left: 28px; list-style-type: disc;',
        'ol': 'margin: 10px 0; padding-left: 28px; list-style-type: decimal;',
        'li': 'margin: 0; line-height: 1.8; font-size: 15px; color: #3f3f46;',
        'strong': 'font-weight: bold; color: #059669;',
        'em': 'font-style: italic; color: #3f3f46;',
        'code': 'padding: 2px 5px; background-color: #f0fdf4; border-radius: 3px; font-family: Consolas, Monaco, monospace; font-size: 13px; color: #065f46;',
        'pre': 'margin: 15px 0; padding: 12px; background-color: #f0fdf4; border-radius: 5px; overflow-x: auto; font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; color: #065f46;',
        'a': 'color: #10b981; text-decoration: underline;',
        'img': 'display: block; max-width: 100%; margin: 15px auto; border-radius: 4px;',
        'hr': 'margin: 20px 0; border: 0; border-top: 1px solid #bbf7d0;',
        'table': 'margin: 15px 0; border-collapse: collapse; width: 100%; font-size: 14px;',
        'th': 'padding: 8px; border: 1px solid #bbf7d0; background-color: #f0fdf4; font-weight: bold; text-align: left;',
        'td': 'padding: 8px; border: 1px solid #bbf7d0; text-align: left;',
    }
}

# Default theme (for backward compatibility)
WECHAT_STYLES = WECHAT_THEMES['default']


class WeChatHTMLParser(HTMLParser):
    """HTML parser that adds WeChat inline styles"""

    def __init__(self, theme_styles=None):
        super().__init__()
        self.output = StringIO()
        self.processed_tags = set()
        self.theme_styles = theme_styles or WECHAT_STYLES

    def handle_starttag(self, tag, attrs):
        # Get WeChat style for this tag
        wechat_style = self.theme_styles.get(tag.lower(), '')

        # Build attributes dict
        attrs_dict = dict(attrs)

        # Add or merge style attribute
        if wechat_style:
            existing_style = attrs_dict.get('style', '')
            if existing_style:
                attrs_dict['style'] = f"{existing_style}; {wechat_style}"
            else:
                attrs_dict['style'] = wechat_style

        # Rebuild tag
        attrs_str = ' '.join(f'{k}="{v}"' for k, v in attrs_dict.items())
        if attrs_str:
            self.output.write(f'<{tag} {attrs_str}>')
        else:
            self.output.write(f'<{tag}>')

    def handle_endtag(self, tag):
        self.output.write(f'</{tag}>')

    def handle_data(self, data):
        self.output.write(data)

    def handle_startendtag(self, tag, attrs):
        # Get WeChat style for this tag
        wechat_style = self.theme_styles.get(tag.lower(), '')

        # Build attributes dict
        attrs_dict = dict(attrs)

        # Add or merge style attribute
        if wechat_style:
            existing_style = attrs_dict.get('style', '')
            if existing_style:
                attrs_dict['style'] = f"{existing_style}; {wechat_style}"
            else:
                attrs_dict['style'] = wechat_style

        # Rebuild self-closing tag
        attrs_str = ' '.join(f'{k}="{v}"' for k, v in attrs_dict.items())
        if attrs_str:
            self.output.write(f'<{tag} {attrs_str} />')
        else:
            self.output.write(f'<{tag} />')

    def get_html(self):
        return self.output.getvalue()


def convert_to_wechat_html(html: str, theme: str = 'default') -> str:
    """
    Convert standard HTML to WeChat-compatible HTML with inline styles

    Args:
        html: Standard HTML string
        theme: Theme name ('default', 'business', 'fresh')

    Returns:
        WeChat-compatible HTML with inline styles
    """
    if not html:
        return ''

    # Load theme styles from JSON config
    try:
        theme_styles = load_theme(theme)
    except Exception as e:
        print(f"Warning: Failed to load theme '{theme}', using default: {e}")
        theme_styles = WECHAT_THEMES.get('default', {})

    # Remove unsupported tags first
    unsupported_tags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']
    for tag in unsupported_tags:
        html = re.sub(f'<{tag}[^>]*>.*?</{tag}>', '', html, flags=re.IGNORECASE | re.DOTALL)
        html = re.sub(f'<{tag}[^>]*/?>', '', html, flags=re.IGNORECASE)

    # Parse and add inline styles
    parser = WeChatHTMLParser(theme_styles)
    try:
        parser.feed(html)
        result = parser.get_html()
        return result.strip()
    except Exception as e:
        # Fallback to original HTML if parsing fails
        print(f"Warning: Failed to parse HTML: {e}")
        return html.strip()


def validate_wechat_html(html: str) -> tuple[bool, str]:
    """
    Validate if HTML is compatible with WeChat Official Account

    Args:
        html: HTML string to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not html:
        return False, "HTML content is empty"

    # Check for unsupported tags
    unsupported_patterns = [
        (r'<script', 'Contains <script> tag'),
        (r'<style', 'Contains <style> tag'),
        (r'<iframe', 'Contains <iframe> tag'),
        (r'<form', 'Contains <form> tag'),
        (r'onclick=', 'Contains event handlers (onclick)'),
        (r'javascript:', 'Contains javascript: protocol'),
    ]

    for pattern, message in unsupported_patterns:
        if re.search(pattern, html, re.IGNORECASE):
            return False, message

    return True, ""


# Test function
def test_converter():
    """Test the converter with sample HTML"""
    test_html = """
    <h2>Test Heading</h2>
    <p>This is a paragraph with <strong>bold text</strong> and <em>italic text</em>.</p>
    <blockquote>This is a quote</blockquote>
    <ul>
        <li>Item 1</li>
        <li>Item 2</li>
    </ul>
    <p>Inline code: <code>print("hello")</code></p>
    <pre><code>def hello():
    print("world")</code></pre>
    """

    result = convert_to_wechat_html(test_html)
    print("=" * 60)
    print("Original HTML:")
    print(test_html)
    print("=" * 60)
    print("Converted HTML:")
    print(result)
    print("=" * 60)

    is_valid, error = validate_wechat_html(result)
    print(f"Validation: {'PASS' if is_valid else 'FAIL'}")
    if not is_valid:
        print(f"Error: {error}")


if __name__ == "__main__":
    test_converter()
