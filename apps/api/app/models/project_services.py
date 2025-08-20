"""
Project service connections model for tracking Git, Supabase, Vercel integrations
"""
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class ProjectServiceConnection(Base):
    __tablename__ = "project_service_connections"
    
    id = Column(String(64), primary_key=True, index=True)  # UUID
    project_id = Column(String(64), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    # Service Info
    provider = Column(String(32), nullable=False)  # 'github', 'supabase', 'vercel'
    status = Column(String(32), default="connected")  # 'connected', 'disconnected', 'error', 'pending'
    
    # Service-specific connection data
    service_data = Column(JSON, nullable=True)  # Store provider-specific info
    # Examples:
    # GitHub: {"repo_url": "https://github.com/user/repo", "repo_name": "my-app", "default_branch": "main"}
    # Supabase: {"project_url": "https://xxx.supabase.co", "project_id": "xxx", "database_name": "postgres"}
    # Vercel: {"deployment_url": "https://my-app.vercel.app", "project_id": "xxx", "auto_deploy": true}
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    project = relationship("Project", back_populates="service_connections")
    
    # Indexes
    __table_args__ = (
        Index('idx_project_services', 'project_id', 'provider'),
        Index('idx_provider_status', 'provider', 'status'),
    )