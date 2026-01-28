#!/usr/bin/env python3
"""
Send message to a WeChat contact or group.
Usage: python scripts/send_message.py "Contact Name" "Message content"
"""
import sys
import os

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


def send_message(who: str, message: str):
    """
    Send message to a WeChat contact or group.

    Args:
        who: Contact or group name
        message: Message content to send
    """
    try:
        # Initialize WeChat instance
        wx = WeChat()

        # Send message using SendMsg API
        result = wx.SendMsg(msg=message, who=who, clear=True)

        if result:
            print(f"Message sent successfully to '{who}'")
        else:
            print(f"Failed to send message to '{who}'", file=sys.stderr)
            sys.exit(1)

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
    if len(sys.argv) < 3:
        print("Usage: python scripts/send_message.py <Contact Name> <Message>", file=sys.stderr)
        print("Example: python scripts/send_message.py \"张三\" \"Hello, how are you?\"", file=sys.stderr)
        sys.exit(1)

    who = sys.argv[1]
    message = sys.argv[2]

    if not message.strip():
        print("Error: Message content cannot be empty", file=sys.stderr)
        sys.exit(1)

    send_message(who, message)
