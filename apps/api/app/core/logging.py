import logging
import sys
from app.core.terminal_ui import TerminalUIHandler


def configure_logging() -> None:
    """Configure logging with clean terminal UI"""
    # Clear existing handlers
    root = logging.getLogger()
    root.handlers.clear()
    
    # Add our custom terminal UI handler
    terminal_handler = TerminalUIHandler()
    terminal_handler.setLevel(logging.INFO)
    
    # Add standard handler for file logging if needed
    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    stream_handler.setFormatter(formatter)
    stream_handler.setLevel(logging.DEBUG)
    
    root.setLevel(logging.INFO)
    root.addHandler(terminal_handler)
    
    # Add stream handler only in debug mode
    import os
    if os.getenv("DEBUG", "false").lower() == "true":
        root.addHandler(stream_handler)
