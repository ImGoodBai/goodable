"""
Project Initializer Service
Handles project initialization, scaffolding, and setup
"""
import os
import json
import shutil
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.services.filesystem import (
    ensure_dir,
    scaffold_nextjs_minimal,
    init_git_repo,
    write_env_file
)


async def initialize_project(project_id: str, name: str) -> str:
    """
    Initialize a new project with directory structure and scaffolding
    
    Args:
        project_id: Unique project identifier
        name: Human-readable project name
    
    Returns:
        str: Path to the created project directory
    """
    
    # Create project directory
    project_path = os.path.join(settings.projects_root, project_id, "repo")
    ensure_dir(project_path)
    
    # Create assets directory
    assets_path = os.path.join(settings.projects_root, project_id, "assets")
    ensure_dir(assets_path)
    
    try:
        # Scaffold NextJS project using create-next-app (includes automatic git init)
        scaffold_nextjs_minimal(project_path)
        
        # CRITICAL: Force create independent git repository for each project
        # create-next-app inherits parent .git when run inside existing repo
        # This ensures each project has its own isolated git history
        init_git_repo(project_path)
        
        # Create initial .env file
        env_content = f"NEXT_PUBLIC_PROJECT_ID={project_id}\nNEXT_PUBLIC_PROJECT_NAME={name}\n"
        write_env_file(project_path, env_content)
        
        # Create metadata directory and initial metadata file
        create_project_metadata(project_id, name)
        
        # Setup Claude Code configuration
        setup_claude_config(project_path)
        
        return project_path
        
    except Exception as e:
        # Clean up failed project directory
        import shutil
        project_root = os.path.join(settings.projects_root, project_id)
        if os.path.exists(project_root):
            shutil.rmtree(project_root)
        
        # Re-raise with user-friendly message
        raise Exception(f"Failed to initialize Next.js project: {str(e)}")


async def cleanup_project(project_id: str) -> bool:
    """
    Clean up project files and directories
    
    Args:
        project_id: Project identifier to clean up
    
    Returns:
        bool: True if cleanup was successful
    """
    
    try:
        project_root = os.path.join(settings.projects_root, project_id)
        
        if os.path.exists(project_root):
            import shutil
            shutil.rmtree(project_root)
            return True
        
        return False
    
    except Exception as e:
        print(f"Error cleaning up project {project_id}: {e}")
        return False


async def get_project_path(project_id: str) -> Optional[str]:
    """
    Get the filesystem path for a project
    
    Args:
        project_id: Project identifier
    
    Returns:
        Optional[str]: Path to project directory if it exists
    """
    
    project_path = os.path.join(settings.projects_root, project_id, "repo")
    
    if os.path.exists(project_path):
        return project_path
    
    return None


async def project_exists(project_id: str) -> bool:
    """
    Check if a project exists on the filesystem
    
    Args:
        project_id: Project identifier
    
    Returns:
        bool: True if project exists
    """
    
    project_path = os.path.join(settings.projects_root, project_id)
    return os.path.exists(project_path)


def create_project_metadata(project_id: str, name: str):
    """
    Create initial metadata file with placeholder content
    This will be filled by CLI Agent based on the user's initial prompt
    
    Args:
        project_id: Project identifier
        name: Project name
    """
    
    # Create data directory structure
    data_dir = os.path.join(settings.projects_root, project_id, "data")
    metadata_dir = os.path.join(data_dir, "metadata")
    ensure_dir(metadata_dir)
    
    metadata_data = {
        "name": name,
        "description": "Project created with AI assistance"
    }
    
    metadata_path = os.path.join(metadata_dir, f"{project_id}.json")
    
    try:
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata_data, f, indent=2, ensure_ascii=False)
        from app.core.terminal_ui import ui
        ui.success(f"Created initial metadata at {metadata_path}", "Project")
    except Exception as e:
        ui.error(f"Failed to create metadata: {e}", "Project")
        raise


async def parse_and_update_project_metadata(project_id: str, db_session) -> dict:
    """
    Parse metadata file and update project information in database
    
    Args:
        project_id: Project identifier
        db_session: Database session
    
    Returns:
        dict: Parsed project information
    """
    
    metadata_path = os.path.join(settings.projects_root, project_id, "data", "metadata", f"{project_id}.json")
    
    if not os.path.exists(metadata_path):
        raise Exception(f"Metadata file not found at {metadata_path}")
    
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        
        # Update project in database
        from app.models.projects import Project as ProjectModel
        project = db_session.query(ProjectModel).filter(ProjectModel.id == project_id).first()
        
        if project:
            # Update project fields from metadata
            if metadata.get('name') and metadata['name'] != project.name:
                project.name = metadata['name']
            
            # Store additional info in settings (only description since other fields are pre-configured)
            project.settings = {
                "description": metadata.get('description', ''),
                "features": [],  # Pre-configured
                "tech_stack": ["Next.js", "React", "TypeScript"],  # Pre-configured
                "version": "1.0.0",  # Pre-configured
                "ai_generated": True
            }
            
            db_session.commit()
            ui.success(f"Updated project {project_id} with metadata", "Project")
        
        return metadata
        
    except Exception as e:
        ui.error(f"Failed to parse metadata for project {project_id}: {e}", "Project")
        raise


def get_metadata_path(project_id: str) -> str:
    """Get the metadata file path for a project"""
    return os.path.join(settings.projects_root, project_id, "data", "metadata", f"{project_id}.json")


def setup_claude_config(project_path: str):
    """
    Setup Claude Code configuration for the project
    
    Args:
        project_path: Path to the project repository directory
    """
    try:
        from app.core.terminal_ui import ui
        
        # Create .claude directory structure
        claude_dir = os.path.join(project_path, ".claude")
        claude_hooks_dir = os.path.join(claude_dir, "hooks")
        ensure_dir(claude_dir)
        ensure_dir(claude_hooks_dir)
        
        # Get paths to source files in project root
        # Current file: apps/api/app/services/project/initializer.py
        # Go up to project root: ../../../../..
        current_file_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.join(current_file_dir, "..", "..", "..", "..", "..")
        project_root = os.path.abspath(project_root)
        scripts_dir = os.path.join(project_root, "scripts")
        settings_src = os.path.join(scripts_dir, "settings.json")
        type_check_src = os.path.join(scripts_dir, "type_check.sh")
        
        # Copy settings.json
        settings_dst = os.path.join(claude_dir, "settings.json")
        if os.path.exists(settings_src):
            shutil.copy2(settings_src, settings_dst)
            ui.success(f"Copied settings.json to {settings_dst}", "Claude Config")
        else:
            ui.warning(f"Source file not found: {settings_src}", "Claude Config")
        
        # Copy type_check.sh
        type_check_dst = os.path.join(claude_hooks_dir, "type_check.sh")
        if os.path.exists(type_check_src):
            shutil.copy2(type_check_src, type_check_dst)
            # Make the script executable
            os.chmod(type_check_dst, 0o755)
            ui.success(f"Copied type_check.sh to {type_check_dst}", "Claude Config")
        else:
            ui.warning(f"Source file not found: {type_check_src}", "Claude Config")
        
        ui.success("Claude Code configuration setup complete", "Claude Config")
        
    except Exception as e:
        ui.error(f"Failed to setup Claude configuration: {e}", "Claude Config")
        # Don't fail the whole project creation for this
        pass