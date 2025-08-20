"""
Tool usage tracking for Claude Code SDK
"""
from sqlalchemy import String, DateTime, ForeignKey, JSON, Integer, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db.base import Base


class ToolUsage(Base):
    """Track individual tool usage within sessions"""
    __tablename__ = "tools_usage"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    message_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    
    # Tool Info
    tool_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # Edit, Write, Read, Bash, etc.
    tool_action: Mapped[str | None] = mapped_column(String(32), nullable=True)  # start, complete, error
    
    # Input/Output
    input_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    
    # File Changes Tracking
    files_affected: Mapped[list | None] = mapped_column(JSON, nullable=True)  # Array of file paths
    lines_added: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lines_removed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Performance
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    session = relationship("Session", back_populates="tools_usage")
    project = relationship("Project", back_populates="tools_usage")