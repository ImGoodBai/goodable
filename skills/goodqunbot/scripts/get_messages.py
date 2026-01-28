#!/usr/bin/env python3
"""
Get recent messages from a WeChat contact or group.
Usage: python scripts/get_messages.py "Contact Name" [count]
"""
import sys
import os
import json

# Add wxauto_lib path to sys.path
current_dir = os.path.dirname(__file__)
project_root = os.path.abspath(os.path.join(current_dir, '..'))
wxauto_lib_path = os.path.join(project_root, 'wxauto_lib')

# Load wxauto_lib using importlib
import importlib.util
try:
    spec = importlib.util.spec_from_file_location(
        "wxauto_lib",
        os.path.join(wxauto_lib_path, "__init__.pyc")
    )
    spec.submodule_search_locations = [wxauto_lib_path]
    wxauto_lib = importlib.util.module_from_spec(spec)
    sys.modules['wxauto_lib'] = wxauto_lib
    spec.loader.exec_module(wxauto_lib)
    WeChat = wxauto_lib.WeChat
except Exception as e:
    print(f"Error: Failed to load wxauto_lib: {e}", file=sys.stderr)
    print("Please ensure WeChat PC client is installed and wxauto_lib is available.", file=sys.stderr)
    sys.exit(1)


def get_messages(who: str, count: int = 15):
    """
    Get recent messages from a WeChat contact or group.

    Args:
        who: Contact or group name
        count: Number of recent messages to retrieve (default: 15)
    """
    try:
        # Initialize WeChat instance
        wx = WeChat()

        # Open chat with specified contact
        wx.ChatWith(who)

        # Get all messages (without saving files)
        msgs = wx.GetAllMessage(savepic=False, savefile=False)

        if not msgs:
            print(f"No messages found for '{who}'", file=sys.stderr)
            return

        # Get recent messages
        recent = msgs[-count:] if len(msgs) > count else msgs

        # Format output as JSON for better parsing
        result = []
        for msg in recent:
            result.append({
                "time": msg.time if hasattr(msg, 'time') else "",
                "sender": msg.sender if hasattr(msg, 'sender') else "",
                "content": msg.content if hasattr(msg, 'content') else "",
                "type": msg.type if hasattr(msg, 'type') else "text"
            })

        # Output JSON
        print(json.dumps(result, ensure_ascii=False, indent=2))

    except Exception as e:
        error_msg = str(e)
        if "WeChat window not found" in error_msg or "微信窗口" in error_msg:
            print("Error: WeChat PC client is not running or not logged in.", file=sys.stderr)
            print("Please start WeChat PC client and log in first.", file=sys.stderr)
        elif "找不到" in error_msg or "not found" in error_msg.lower():
            print(f"Error: Contact or group '{who}' not found.", file=sys.stderr)
            print("Please check the name and try again.", file=sys.stderr)
        else:
            print(f"Error: {error_msg}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/get_messages.py <Contact Name> [count]", file=sys.stderr)
        print("Example: python scripts/get_messages.py \"张三\" 10", file=sys.stderr)
        sys.exit(1)

    who = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 15

    if count < 1 or count > 100:
        print("Error: Count must be between 1 and 100", file=sys.stderr)
        sys.exit(1)

    get_messages(who, count)
