"""
Optional database logger for scripts
Auto-detects database existence and logs operations
Silent fail to maintain backward compatibility
"""
import sqlite3
from pathlib import Path
from datetime import datetime

# Database path (relative to scripts directory)
DB_PATH = Path(__file__).parents[1] / "data" / "articles.db"


def is_db_available():
    """Check if database exists"""
    return DB_PATH.exists()


def log_image_upload(file_path: str, media_id: str, media_type: str):
    """
    Log image upload to database (if available)

    Args:
        file_path: Local file path
        media_id: WeChat media_id
        media_type: thumb or image
    """
    if not is_db_available():
        return

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO images (file_path, media_id, media_type, created_at) VALUES (?, ?, ?, ?)",
            (file_path, media_id, media_type, datetime.now())
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # Silent fail, don't block script execution


def log_draft_creation(title: str, author: str, thumb_media_id: str, draft_media_id: str,
                       digest: str = None, content_md: str = None):
    """
    Log draft creation to database (if available)

    Args:
        title: Article title
        author: Author name
        thumb_media_id: Cover image media_id
        draft_media_id: Draft media_id from WeChat API
        digest: Article digest (optional)
        content_md: Markdown content (optional)
    """
    if not is_db_available():
        return

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO articles
               (title, author, digest, content_md, thumb_media_id, draft_media_id, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)""",
            (title, author, digest, content_md, thumb_media_id, draft_media_id, datetime.now(), datetime.now())
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # Silent fail


def log_publish(draft_media_id: str, publish_id: str, status: str = 'publishing'):
    """
    Log publish operation to database (if available)

    Args:
        draft_media_id: Draft media_id
        publish_id: Publish task ID from WeChat API
        status: publishing or published
    """
    if not is_db_available():
        return

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE articles
               SET publish_id=?, status=?, published_at=?, updated_at=?
               WHERE draft_media_id=?""",
            (publish_id, status, datetime.now(), datetime.now(), draft_media_id)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass  # Silent fail
