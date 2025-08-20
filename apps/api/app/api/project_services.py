"""
Project services API for managing Git, Supabase, Vercel integrations
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Dict, Any, Optional
from uuid import uuid4
import logging

from app.db.session import get_db
from app.models.projects import Project
from app.models.project_services import ProjectServiceConnection
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["project-services"])


class ServiceConnectionCreate(BaseModel):
    provider: str  # 'github', 'supabase', 'vercel'
    service_data: Dict[str, Any] = {}


class ServiceConnectionResponse(BaseModel):
    id: str
    provider: str
    status: str
    service_data: Dict[str, Any]
    created_at: str
    updated_at: Optional[str] = None
    last_sync_at: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectServicesResponse(BaseModel):
    github: Optional[ServiceConnectionResponse] = None
    supabase: Optional[ServiceConnectionResponse] = None
    vercel: Optional[ServiceConnectionResponse] = None


@router.get("/{project_id}/services", response_model=List[ServiceConnectionResponse])
async def get_project_services(project_id: str, db: Session = Depends(get_db)):
    """Get all service connections for a project"""
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get all service connections for this project
    connections = db.query(ProjectServiceConnection).filter(
        ProjectServiceConnection.project_id == project_id
    ).all()
    
    # Convert to list format for frontend compatibility
    service_list = []
    for conn in connections:
        service_list.append(ServiceConnectionResponse(
            id=conn.id,
            provider=conn.provider,
            status=conn.status,
            service_data=conn.service_data or {},
            created_at=conn.created_at.isoformat(),
            updated_at=conn.updated_at.isoformat() if conn.updated_at else None,
            last_sync_at=conn.last_sync_at.isoformat() if conn.last_sync_at else None
        ))
    
    return service_list


@router.post("/{project_id}/services/{provider}")
async def connect_service(
    project_id: str, 
    provider: str, 
    connection_data: ServiceConnectionCreate,
    db: Session = Depends(get_db)
):
    """Connect a service to a project"""
    
    # Validate provider
    if provider not in ["github", "supabase", "vercel"]:
        raise HTTPException(status_code=400, detail="Invalid provider")
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if connection already exists
    existing = db.query(ProjectServiceConnection).filter(
        and_(
            ProjectServiceConnection.project_id == project_id,
            ProjectServiceConnection.provider == provider
        )
    ).first()
    
    if existing:
        # Update existing connection
        existing.service_data = connection_data.service_data
        existing.status = "connected"
        db.commit()
        db.refresh(existing)
        
        return {
            "message": f"{provider.capitalize()} service updated successfully",
            "connection_id": existing.id
        }
    else:
        # Create new connection
        connection = ProjectServiceConnection(
            id=str(uuid4()),
            project_id=project_id,
            provider=provider,
            status="connected",
            service_data=connection_data.service_data
        )
        
        db.add(connection)
        db.commit()
        db.refresh(connection)
        
        return {
            "message": f"{provider.capitalize()} service connected successfully",
            "connection_id": connection.id
        }


@router.delete("/{project_id}/services/{provider}")
async def disconnect_service(project_id: str, provider: str, db: Session = Depends(get_db)):
    """Disconnect a service from a project"""
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Find the connection
    connection = db.query(ProjectServiceConnection).filter(
        and_(
            ProjectServiceConnection.project_id == project_id,
            ProjectServiceConnection.provider == provider
        )
    ).first()
    
    if not connection:
        raise HTTPException(status_code=404, detail=f"{provider.capitalize()} service not connected")
    
    # Delete the connection
    db.delete(connection)
    db.commit()
    
    return {"message": f"{provider.capitalize()} service disconnected successfully"}


@router.get("/{project_id}/services/{provider}/status")
async def get_service_status(project_id: str, provider: str, db: Session = Depends(get_db)):
    """Get the status of a specific service connection"""
    
    connection = db.query(ProjectServiceConnection).filter(
        and_(
            ProjectServiceConnection.project_id == project_id,
            ProjectServiceConnection.provider == provider
        )
    ).first()
    
    if not connection:
        return {"connected": False, "status": "disconnected"}
    
    return {
        "connected": True,
        "status": connection.status,
        "service_data": connection.service_data or {},
        "last_sync_at": connection.last_sync_at.isoformat() if connection.last_sync_at else None
    }