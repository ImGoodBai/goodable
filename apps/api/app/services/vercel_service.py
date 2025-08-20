"""
Vercel integration service for creating projects and deployments
"""
import aiohttp
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

VERCEL_API_BASE = "https://api.vercel.com"


class VercelAPIError(Exception):
    """Custom exception for Vercel API errors"""
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class VercelService:
    """Service class for Vercel API integration"""
    
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
    
    async def check_token_validity(self) -> Dict[str, Any]:
        """Check if the Vercel token is valid and get user info"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{VERCEL_API_BASE}/v2/user",
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        user_data = await response.json()
                        return {
                            "valid": True,
                            "user_id": user_data.get("id"),
                            "username": user_data.get("username"),
                            "name": user_data.get("name"),
                            "email": user_data.get("email")
                        }
                    elif response.status == 401:
                        return {"valid": False, "error": "Invalid Vercel token"}
                    else:
                        error_text = await response.text()
                        return {"valid": False, "error": f"API error: {error_text}"}
        except Exception as e:
            logger.error(f"Error checking Vercel token validity: {e}")
            return {"valid": False, "error": str(e)}
    
    async def create_project_with_github(
        self,
        project_name: str,
        github_repo: str,  # format: "username/repo-name"
        framework: str = "nextjs",
        team_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new Vercel project and link it to a GitHub repository"""
        
        try:
            # Prepare the request payload
            payload = {
                "name": project_name,
                "framework": framework,
                "gitRepository": {
                    "type": "github",
                    "repo": github_repo
                }
            }
            
            # Build the URL with optional team_id
            url = f"{VERCEL_API_BASE}/v11/projects"
            if team_id:
                url += f"?teamId={team_id}"
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    headers=self.headers,
                    json=payload
                ) as response:
                    response_data = await response.json()
                    
                    if response.status == 200 or response.status == 201:
                        project = response_data
                        return {
                            "success": True,
                            "project_id": project.get("id"),
                            "project_name": project.get("name"),
                            "framework": project.get("framework"),
                            "git_repository": project.get("link", {}).get("repo"),
                            "created_at": project.get("createdAt"),
                            "project_url": f"https://vercel.com/{project.get('accountId')}/{project.get('name')}",
                            "raw_response": project
                        }
                    else:
                        error_msg = response_data.get("error", {}).get("message", "Unknown error")
                        logger.error(f"Failed to create Vercel project: {error_msg}")
                        raise VercelAPIError(f"Failed to create project: {error_msg}", response.status)
                        
        except aiohttp.ClientError as e:
            logger.error(f"Network error while creating Vercel project: {e}")
            raise VercelAPIError(f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error while creating Vercel project: {e}")
            raise VercelAPIError(f"Unexpected error: {str(e)}")
    
    async def get_project(self, project_id: str) -> Dict[str, Any]:
        """Get project information by ID"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{VERCEL_API_BASE}/v9/projects/{project_id}",
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        try:
                            error_data = await response.json()
                            error_msg = error_data.get("error", {}).get("message", "Unknown error")
                        except:
                            error_msg = await response.text()
                        raise VercelAPIError(f"Failed to get project: {error_msg}", response.status)
        except VercelAPIError:
            raise
        except Exception as e:
            logger.error(f"Error getting Vercel project: {e}")
            raise VercelAPIError(f"Error getting project: {str(e)}")
    
    async def create_deployment(
        self,
        project_name: str,
        github_repo: str,
        branch: str = "main",
        framework: str = "nextjs"
    ) -> Dict[str, Any]:
        """Create a new deployment from GitHub repository"""
        
        try:
            payload = {
                "name": project_name,
                "gitSource": {
                    "type": "github",
                    "repo": github_repo,
                    "ref": branch
                },
                "projectSettings": {
                    "framework": framework
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{VERCEL_API_BASE}/v13/deployments",
                    headers=self.headers,
                    json=payload
                ) as response:
                    response_data = await response.json()
                    
                    if response.status == 200 or response.status == 201:
                        deployment = response_data
                        return {
                            "success": True,
                            "deployment_id": deployment.get("id"),
                            "deployment_url": deployment.get("url"),
                            "status": deployment.get("readyState"),
                            "created_at": deployment.get("createdAt"),
                            "raw_response": deployment
                        }
                    else:
                        error_msg = response_data.get("error", {}).get("message", "Unknown error")
                        logger.error(f"Failed to create Vercel deployment: {error_msg}")
                        raise VercelAPIError(f"Failed to create deployment: {error_msg}", response.status)
                        
        except Exception as e:
            logger.error(f"Error creating Vercel deployment: {e}")
            raise VercelAPIError(f"Error creating deployment: {str(e)}")
    
    async def get_deployment_status(self, deployment_id: str) -> Dict[str, Any]:
        """Get deployment status by ID"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{VERCEL_API_BASE}/v13/deployments/{deployment_id}",
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        deployment = await response.json()
                        return {
                            "id": deployment.get("id"),
                            "url": deployment.get("url"),
                            "status": deployment.get("readyState"),
                            "created_at": deployment.get("createdAt"),
                            "ready": deployment.get("ready"),
                            "raw_response": deployment
                        }
                    else:
                        try:
                            error_data = await response.json()
                            error_msg = error_data.get("error", {}).get("message", "Unknown error")
                        except:
                            error_msg = await response.text()
                        raise VercelAPIError(f"Failed to get deployment: {error_msg}", response.status)
        except Exception as e:
            logger.error(f"Error getting Vercel deployment: {e}")
            raise VercelAPIError(f"Error getting deployment: {str(e)}")


async def check_project_availability(access_token: str, project_name: str) -> Dict[str, Any]:
    """Check if a Vercel project name is available by listing projects"""
    service = VercelService(access_token)
    
    try:
        # Get list of projects and check if name exists
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{VERCEL_API_BASE}/v10/projects",
                headers=service.headers
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    projects = data.get("projects", [])
                    
                    # Check if project name already exists
                    for project in projects:
                        if project.get("name") == project_name:
                            return {"available": False, "exists": True}
                    
                    # Name is available
                    return {"available": True, "exists": False}
                else:
                    try:
                        error_data = await response.json()
                        error_msg = error_data.get("error", {}).get("message", "Unknown error")
                    except:
                        error_msg = await response.text()
                    
                    if response.status == 401:
                        return {"available": False, "error": "Invalid Vercel token"}
                    else:
                        return {"available": False, "error": f"API error: {error_msg}"}
                        
    except Exception as e:
        logger.error(f"Error checking Vercel project availability: {e}")
        return {"available": False, "error": str(e)}