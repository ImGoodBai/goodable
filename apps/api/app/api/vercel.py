"""
Vercel integration API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import logging
from uuid import uuid4

from app.api.deps import get_db
from app.models.projects import Project
from app.models.project_services import ProjectServiceConnection
from app.services.vercel_service import VercelService, VercelAPIError, check_project_availability
from app.services.token_service import get_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["vercel"])


class VercelConnectRequest(BaseModel):
    project_name: str
    framework: str = "nextjs"
    team_id: Optional[str] = None


class VercelConnectResponse(BaseModel):
    success: bool
    project_url: str
    deployment_url: Optional[str] = None
    message: str


class VercelDeploymentRequest(BaseModel):
    branch: str = "main"


class VercelDeploymentResponse(BaseModel):
    success: bool
    deployment_url: str
    deployment_id: str
    status: str
    message: str


@router.get("/vercel/check-project/{project_name}")
async def check_vercel_project_availability(project_name: str, db: Session = Depends(get_db)):
    """Check if a Vercel project name is available"""
    
    # Get Vercel token
    vercel_token = get_token(db, "vercel")
    if not vercel_token:
        raise HTTPException(status_code=401, detail="Vercel token not configured")
    
    try:
        # First validate the token
        vercel_service = VercelService(vercel_token)
        user_info = await vercel_service.check_token_validity()
        if not user_info.get("valid"):
            raise HTTPException(status_code=401, detail="Invalid Vercel token")
        
        result = await check_project_availability(vercel_token, project_name)
        
        if "error" in result:
            if "Invalid" in result["error"] or "token" in result["error"].lower():
                raise HTTPException(status_code=401, detail="Invalid Vercel token")
            else:
                raise HTTPException(status_code=500, detail=result["error"])
        
        if result["exists"]:
            raise HTTPException(status_code=409, detail=f"Project '{project_name}' already exists")
        
        return {"available": True}
        
    except VercelAPIError as e:
        if e.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid Vercel token")
        else:
            raise HTTPException(status_code=e.status_code or 500, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking Vercel project availability: {e}")
        raise HTTPException(status_code=500, detail="Failed to check project availability")


@router.post("/projects/{project_id}/vercel/connect", response_model=VercelConnectResponse)
async def connect_vercel_project(
    project_id: str, 
    request: VercelConnectRequest,
    db: Session = Depends(get_db)
):
    """Create Vercel project and connect it to the existing GitHub repository"""
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if GitHub is connected (required for Vercel)
    github_connection = db.query(ProjectServiceConnection).filter(
        ProjectServiceConnection.project_id == project_id,
        ProjectServiceConnection.provider == "github"
    ).first()
    
    if not github_connection:
        raise HTTPException(
            status_code=400, 
            detail="GitHub repository must be connected first before connecting Vercel"
        )
    
    # Get GitHub repository info
    github_repo = github_connection.service_data.get("full_name")
    if not github_repo:
        raise HTTPException(
            status_code=400, 
            detail="GitHub repository information is incomplete"
        )
    
    # Get Vercel token
    vercel_token = get_token(db, "vercel")
    if not vercel_token:
        raise HTTPException(
            status_code=401, 
            detail="Vercel token not configured. Please add your Vercel token in Global Settings."
        )
    
    try:
        # Initialize Vercel service
        vercel_service = VercelService(vercel_token)
        
        # Validate token and get user info
        user_info = await vercel_service.check_token_validity()
        if not user_info.get("valid"):
            raise HTTPException(status_code=401, detail="Invalid Vercel token")
        
        # Create Vercel project
        project_result = await vercel_service.create_project_with_github(
            project_name=request.project_name,
            github_repo=github_repo,
            framework=request.framework,
            team_id=request.team_id
        )
        
        if not project_result.get("success"):
            raise HTTPException(status_code=500, detail="Failed to create Vercel project")
        
        # Get project info (use canonical values returned by Vercel)
        vercel_project_id = project_result["project_id"]
        project_url = project_result["project_url"]
        canonical_project_name = project_result.get("project_name", request.project_name)
        
        # Save service connection to database
        try:
            # Check if Vercel connection already exists
            existing_connection = db.query(ProjectServiceConnection).filter(
                ProjectServiceConnection.project_id == project_id,
                ProjectServiceConnection.provider == "vercel"
            ).first()
            
            service_data = {
                "project_id": vercel_project_id,
                "project_name": canonical_project_name,
                "project_url": project_url,
                "framework": request.framework,
                "github_repo": github_repo,
                "team_id": request.team_id,
                "user_id": user_info.get("user_id"),
                "username": user_info.get("username")
            }
            
            if existing_connection:
                # Update existing connection
                existing_connection.service_data = service_data
                existing_connection.status = "connected"
                db.commit()
            else:
                # Create new connection
                connection = ProjectServiceConnection(
                    id=str(uuid4()),
                    project_id=project_id,
                    provider="vercel",
                    status="connected",
                    service_data=service_data
                )
                db.add(connection)
                db.commit()
                
        except Exception as db_error:
            logger.error(f"Database update failed: {db_error}")
            # Don't fail the operation for database issues
            
        return VercelConnectResponse(
            success=True,
            project_url=project_url,
            message=f"Vercel project '{request.project_name}' created and connected successfully!"
        )
        
    except VercelAPIError as e:
        logger.error(f"Vercel API error: {e.message}")
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in Vercel connection: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect Vercel project: {str(e)}")


@router.post("/projects/{project_id}/vercel/deploy", response_model=VercelDeploymentResponse)
async def deploy_to_vercel(
    project_id: str,
    request: VercelDeploymentRequest,
    db: Session = Depends(get_db)
):
    """Create a new deployment on Vercel"""
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if Vercel is connected
    vercel_connection = db.query(ProjectServiceConnection).filter(
        ProjectServiceConnection.project_id == project_id,
        ProjectServiceConnection.provider == "vercel"
    ).first()
    
    if not vercel_connection:
        raise HTTPException(status_code=400, detail="Vercel project not connected")
    
    # Check if GitHub is connected
    github_connection = db.query(ProjectServiceConnection).filter(
        ProjectServiceConnection.project_id == project_id,
        ProjectServiceConnection.provider == "github"
    ).first()
    
    if not github_connection:
        raise HTTPException(status_code=400, detail="GitHub repository not connected")
    
    # Get service data
    vercel_data = vercel_connection.service_data
    github_repo = github_connection.service_data.get("full_name")
    
    # Get Vercel token
    vercel_token = get_token(db, "vercel")
    if not vercel_token:
        raise HTTPException(status_code=401, detail="Vercel token not configured")
    
    try:
        # Initialize Vercel service
        vercel_service = VercelService(vercel_token)
        
        # Create deployment
        deployment_result = await vercel_service.create_deployment(
            project_name=vercel_data.get("project_name"),
            github_repo=github_repo,
            branch=request.branch,
            framework=vercel_data.get("framework", "nextjs")
        )
        
        if not deployment_result.get("success"):
            raise HTTPException(status_code=500, detail="Failed to create deployment")
        
        # Persist the exact URL/id returned by Vercel for future display
        try:
            vercel_data["last_deployment_id"] = deployment_result["deployment_id"]
            vercel_data["last_deployment_url"] = f"https://{deployment_result['deployment_url']}" if not str(deployment_result["deployment_url"]).startswith("http") else deployment_result["deployment_url"]
            # Also set canonical deployment_url if not set
            if not vercel_data.get("deployment_url"):
                vercel_data["deployment_url"] = vercel_data["last_deployment_url"]
            vercel_connection.service_data = vercel_data
            db.commit()
        except Exception:
            pass

        return VercelDeploymentResponse(
            success=True,
            deployment_url=f"https://{deployment_result['deployment_url']}",
            deployment_id=deployment_result["deployment_id"],
            status=deployment_result["status"],
            message="Deployment created successfully!"
        )
        
    except VercelAPIError as e:
        logger.error(f"Vercel API error: {e.message}")
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)
    except Exception as e:
        logger.error(f"Unexpected error in Vercel deployment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to deploy to Vercel: {str(e)}")


@router.get("/projects/{project_id}/vercel/status")
async def get_vercel_connection_status(project_id: str, db: Session = Depends(get_db)):
    """Get Vercel connection status for a project"""
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if Vercel token exists
    vercel_token = get_token(db, "vercel")
    token_exists = bool(vercel_token)
    
    # Get Vercel connection
    connection = db.query(ProjectServiceConnection).filter(
        ProjectServiceConnection.project_id == project_id,
        ProjectServiceConnection.provider == "vercel"
    ).first()
    
    # Check if project is actually connected (has service_data with project info)
    project_connected = bool(
        connection and 
        connection.status == "connected" and 
        connection.service_data and 
        (connection.service_data.get("project_id") or connection.service_data.get("project_name"))
    )
    
    if not connection:
        return {
            "connected": False,
            "status": "disconnected",
            "token_exists": token_exists,
            "project_connected": False
        }
    
    return {
        "connected": project_connected and token_exists,  # Both token and project must exist
        "status": connection.status,
        "service_data": connection.service_data or {},
        "created_at": connection.created_at.isoformat(),
        "updated_at": connection.updated_at.isoformat() if connection.updated_at else None,
        "token_exists": token_exists,
        "project_connected": project_connected
    }


@router.delete("/projects/{project_id}/vercel/disconnect")
async def disconnect_vercel_project(project_id: str, db: Session = Depends(get_db)):
    """Disconnect Vercel project from our project (does not delete the Vercel project)"""
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Find Vercel connection
    connection = db.query(ProjectServiceConnection).filter(
        ProjectServiceConnection.project_id == project_id,
        ProjectServiceConnection.provider == "vercel"
    ).first()
    
    if not connection:
        raise HTTPException(status_code=404, detail="Vercel connection not found")
    
    # Remove the connection
    db.delete(connection)
    db.commit()
    
    return {"message": "Vercel project disconnected successfully"}


@router.get("/projects/{project_id}/vercel/deployments/{deployment_id}/status")
async def get_deployment_status(
    project_id: str,
    deployment_id: str,
    db: Session = Depends(get_db)
):
    """Get deployment status"""
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get Vercel token
    vercel_token = get_token(db, "vercel")
    if not vercel_token:
        raise HTTPException(status_code=401, detail="Vercel token not configured")
    
    try:
        vercel_service = VercelService(vercel_token)
        status = await vercel_service.get_deployment_status(deployment_id)
        return status
    except VercelAPIError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)
    except Exception as e:
        logger.error(f"Error getting deployment status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get deployment status: {str(e)}")