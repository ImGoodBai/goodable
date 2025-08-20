from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from app.api.deps import get_db
from app.models.env_vars import EnvVar
from app.models.projects import Project as ProjectModel
from app.services.env_manager import (
    load_env_vars_from_db,
    create_env_var,
    update_env_var,
    delete_env_var,
    sync_env_file_to_db,
    sync_db_to_env_file,
    get_env_var_conflicts
)
from app.core.crypto import secret_box

router = APIRouter(prefix="/api/env", tags=["env"]) 


class EnvVarCreate(BaseModel):
    key: str
    value: str
    scope: str = "runtime"
    var_type: str = "string"
    is_secret: bool = True
    description: Optional[str] = None


class EnvVarUpdate(BaseModel):
    value: str


class EnvVarResponse(BaseModel):
    id: str
    key: str
    value: str
    scope: str
    var_type: str
    is_secret: bool
    description: Optional[str]


class SyncResponse(BaseModel):
    success: bool
    synced_count: int
    message: str


class ConflictResponse(BaseModel):
    conflicts: List[dict]
    has_conflicts: bool


@router.get("/{project_id}", response_model=List[EnvVarResponse])
async def get_env_vars(project_id: str, db: Session = Depends(get_db)):
    """Get all environment variables for a project"""
    # Verify project exists
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        # Get encrypted vars from DB
        db_env_vars = db.query(EnvVar).filter(
            EnvVar.project_id == project_id
        ).all()
        
        result = []
        for env_var in db_env_vars:
            try:
                # Decrypt value for API response
                decrypted_value = secret_box.decrypt(env_var.value_encrypted)
                result.append(EnvVarResponse(
                    id=env_var.id,
                    key=env_var.key,
                    value=decrypted_value,
                    scope=env_var.scope,
                    var_type=env_var.var_type,
                    is_secret=env_var.is_secret,
                    description=env_var.description
                ))
            except Exception as e:
                print(f"⚠️  Failed to decrypt env var {env_var.key}: {e}")
                continue
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get env vars: {str(e)}")


@router.post("/{project_id}")
async def create_env_variable(project_id: str, body: EnvVarCreate, db: Session = Depends(get_db)):
    """Create a new environment variable and sync to .env file"""
    # Verify project exists
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        # Create env var using service (includes sync to file)
        env_var = create_env_var(
            db, project_id, body.key, body.value,
            scope=body.scope, var_type=body.var_type,
            is_secret=body.is_secret, description=body.description
        )
        
        return {
            "success": True,
            "message": f"Environment variable '{body.key}' created and synced to .env file",
            "id": env_var.id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create env var: {str(e)}")


@router.put("/{project_id}/{key}")
async def update_env_variable(project_id: str, key: str, body: EnvVarUpdate, db: Session = Depends(get_db)):
    """Update an environment variable and sync to .env file"""
    # Verify project exists
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        # Update env var using service (includes sync to file)
        success = update_env_var(db, project_id, key, body.value)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Environment variable '{key}' not found")
        
        return {
            "success": True,
            "message": f"Environment variable '{key}' updated and synced to .env file"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update env var: {str(e)}")


@router.delete("/{project_id}/{key}")
async def delete_env_variable(project_id: str, key: str, db: Session = Depends(get_db)):
    """Delete an environment variable and sync to .env file"""
    # Verify project exists
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        # Delete env var using service (includes sync to file)
        success = delete_env_var(db, project_id, key)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Environment variable '{key}' not found")
        
        return {
            "success": True,
            "message": f"Environment variable '{key}' deleted and synced to .env file"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete env var: {str(e)}")


@router.get("/{project_id}/conflicts", response_model=ConflictResponse)
async def get_sync_conflicts(project_id: str, db: Session = Depends(get_db)):
    """Check for conflicts between database and .env file"""
    # Verify project exists
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        conflicts = get_env_var_conflicts(db, project_id)
        return ConflictResponse(
            conflicts=conflicts,
            has_conflicts=len(conflicts) > 0
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check conflicts: {str(e)}")


@router.post("/{project_id}/sync/file-to-db", response_model=SyncResponse)
async def sync_file_to_database(project_id: str, db: Session = Depends(get_db)):
    """Sync .env file contents to database (file -> DB)"""
    # Verify project exists
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        synced_count = sync_env_file_to_db(db, project_id)
        return SyncResponse(
            success=True,
            synced_count=synced_count,
            message=f"Synced {synced_count} environment variables from .env file to database"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync file to DB: {str(e)}")


@router.post("/{project_id}/sync/db-to-file", response_model=SyncResponse)
async def sync_database_to_file(project_id: str, db: Session = Depends(get_db)):
    """Sync database contents to .env file (DB -> file)"""
    # Verify project exists
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        synced_count = sync_db_to_env_file(db, project_id)
        return SyncResponse(
            success=True,
            synced_count=synced_count,
            message=f"Synced {synced_count} environment variables from database to .env file"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync DB to file: {str(e)}")


# Legacy endpoint for backward compatibility
@router.post("/{project_id}/upsert")
async def upsert_env(project_id: str, body: EnvVarCreate, db: Session = Depends(get_db)):
    """Legacy upsert endpoint - creates or updates an env var"""
    # Check if env var exists
    existing = db.query(EnvVar).filter(
        EnvVar.project_id == project_id,
        EnvVar.key == body.key
    ).first()
    
    if existing:
        # Update existing
        return await update_env_variable(project_id, body.key, EnvVarUpdate(value=body.value), db)
    else:
        # Create new
        return await create_env_variable(project_id, body, db)
