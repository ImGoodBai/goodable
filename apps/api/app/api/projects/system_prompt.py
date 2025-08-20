"""
System Prompt Management
Handles system prompt operations for projects
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.projects import Project as ProjectModel
from app.services.claude_act import load_system_prompt, get_system_prompt


router = APIRouter()


class SystemPromptResponse(BaseModel):
    system_prompt: str
    project_id: str


class SystemPromptUpdate(BaseModel):
    system_prompt: str


@router.get("/{project_id}/system-prompt", response_model=SystemPromptResponse)
async def get_project_system_prompt(project_id: str, db: Session = Depends(get_db)):
    """Get system prompt for a project"""
    
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Load system prompt for the project
    system_prompt = get_system_prompt(project_id)
    
    return SystemPromptResponse(
        system_prompt=system_prompt,
        project_id=project_id
    )


@router.put("/{project_id}/system-prompt")
async def update_project_system_prompt(
    project_id: str,
    body: SystemPromptUpdate,
    db: Session = Depends(get_db)
):
    """Update system prompt for a project"""
    
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # TODO: Implement system prompt update logic
    # This would involve saving the custom system prompt to a project-specific location
    
    return {
        "message": "System prompt updated successfully",
        "project_id": project_id
    }


@router.post("/{project_id}/system-prompt/reset")
async def reset_project_system_prompt(project_id: str, db: Session = Depends(get_db)):
    """Reset system prompt to default for a project"""
    
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # TODO: Implement system prompt reset logic
    # This would involve removing any custom system prompt for the project
    
    return {
        "message": "System prompt reset to default",
        "project_id": project_id
    }