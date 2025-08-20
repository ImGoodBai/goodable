"""
Projects API Router
Combines all project-related endpoints
"""
from fastapi import APIRouter

from .crud import router as crud_router
from .preview import router as preview_router
from .system_prompt import router as system_prompt_router


# Create main projects router (prefix will be added in main.py)
router = APIRouter()

# Include sub-routers without additional prefix
router.include_router(crud_router, tags=["projects"])
router.include_router(preview_router, tags=["projects"])
router.include_router(system_prompt_router, tags=["projects"])