"""
Service tokens model for storing access tokens (local development only)
"""
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from app.db.base import Base

class ServiceToken(Base):
    __tablename__ = "service_tokens"

    id = Column(String(36), primary_key=True, index=True)
    provider = Column(String(50), nullable=False, index=True)  # github, supabase, vercel
    name = Column(String(255), nullable=False)  # User-defined name
    token = Column(Text, nullable=False)  # Plain text token (local only)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_used = Column(DateTime(timezone=True), nullable=True)
    
    # Add unique constraint to prevent multiple tokens per provider (optional)
    # If you want to allow multiple tokens per provider, remove this
    __table_args__ = (
        # UniqueConstraint('provider', name='uq_provider_token'),
    )