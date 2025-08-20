from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
import os
from pathlib import Path
from app.core.config import settings
from app.api.deps import get_db
from sqlalchemy.orm import Session
from app.models.projects import Project as ProjectModel

router = APIRouter(prefix="/api/repo", tags=["repo"])


class RepoEntry(BaseModel):
    path: str
    type: str  # file | dir
    size: Optional[int] = None


def _safe_join(repo_root: str, rel_path: str) -> str:
    full = os.path.normpath(os.path.join(repo_root, rel_path))
    if not full.startswith(os.path.normpath(repo_root) + os.sep) and os.path.normpath(full) != os.path.normpath(repo_root):
        raise HTTPException(status_code=400, detail="Invalid path")
    return full


@router.get("/{project_id}/tree", response_model=List[RepoEntry])
async def repo_tree(project_id: str, dir: str = Query("."), db: Session = Depends(get_db)) -> List[RepoEntry]:
    row = db.get(ProjectModel, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if project is still initializing
    if row.status == "initializing":
        raise HTTPException(status_code=400, detail="Project is still initializing")
    
    repo_root = os.path.join(settings.projects_root, project_id, "repo")
    
    # Check if repo directory exists
    if not os.path.exists(repo_root):
        if row.status == "failed":
            raise HTTPException(status_code=400, detail="Project initialization failed")
        else:
            raise HTTPException(status_code=400, detail="Project repository not found")
    
    target = _safe_join(repo_root, dir)
    if not os.path.isdir(target):
        raise HTTPException(status_code=400, detail="Not a directory")
    
    entries: List[RepoEntry] = []
    for child in sorted(Path(target).iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        rel = os.path.relpath(str(child), repo_root)
        if child.is_dir():
            entries.append(RepoEntry(path=rel, type="dir"))
        else:
            entries.append(RepoEntry(path=rel, type="file", size=child.stat().st_size))
    return entries


@router.get("/{project_id}/file")
async def repo_file(project_id: str, path: str, db: Session = Depends(get_db)):
    row = db.get(ProjectModel, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    repo_root = os.path.join(settings.projects_root, project_id, "repo")
    target = _safe_join(repo_root, path)
    if not os.path.isfile(target):
        raise HTTPException(status_code=404, detail="File not found")
    with open(target, "r", encoding="utf-8", errors="ignore") as f:
        return {"path": path, "content": f.read()}
