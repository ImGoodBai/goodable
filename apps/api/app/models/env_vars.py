from sqlalchemy import String, DateTime, ForeignKey, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db.base import Base


class EnvVar(Base):
    __tablename__ = "env_vars"
    __table_args__ = (
        UniqueConstraint('project_id', 'key', 'scope', name='unique_project_var'),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    
    # Variable Info
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value_encrypted: Mapped[str] = mapped_column(Text, nullable=False)  # Always encrypted
    
    # Scope & Type
    scope: Mapped[str] = mapped_column(String(32), default="runtime")  # runtime, build, preview
    var_type: Mapped[str] = mapped_column(String(32), default="string")  # string, number, boolean, json
    is_secret: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Metadata
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    project = relationship("Project", back_populates="env_vars")
