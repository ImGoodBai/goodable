"""
Database models and connection for WeChat article management
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from pathlib import Path

# Database URL from environment or default to relative path
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/articles.db")

# Ensure data directory exists
data_dir = Path(__file__).parents[1] / "data"
data_dir.mkdir(exist_ok=True)

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


class Article(Base):
    """Article model for WeChat posts"""
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    author = Column(String(32), nullable=False)
    digest = Column(String(120))
    content_md = Column(Text)  # Markdown source
    content_html = Column(Text)  # HTML converted
    thumb_media_id = Column(String(100))  # Cover image media_id
    thumb_url = Column(String(500))  # Cover image local path
    draft_media_id = Column(String(100))  # Draft media_id
    publish_id = Column(String(100))  # Publish task ID
    status = Column(String(20), default="draft")  # draft/publishing/published/failed
    error_msg = Column(Text)  # Error message
    theme = Column(String(50), default="default")  # Theme name (default/business/fresh)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    published_at = Column(DateTime)

    # Relationships
    images = relationship("Image", back_populates="article", cascade="all, delete-orphan")


class Image(Base):
    """Image model for uploaded files"""
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=True)
    file_path = Column(String(500), nullable=False)
    media_id = Column(String(100))  # WeChat media_id
    media_type = Column(String(20))  # thumb/image
    file_size = Column(Integer)
    created_at = Column(DateTime, default=datetime.now)

    # Relationships
    article = relationship("Article", back_populates="images")


class OperationLog(Base):
    """Operation log for tracking actions"""
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id"), nullable=True)
    operation = Column(String(50))  # upload/create_draft/publish
    status = Column(String(20))  # success/failed
    details = Column(Text)  # JSON details
    created_at = Column(DateTime, default=datetime.now)


def init_db():
    """Initialize database and create all tables"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Get database session (for dependency injection)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Initialize database on import
init_db()
