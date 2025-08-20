"""
WebSocket Endpoints
Handles real-time WebSocket connections
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging

from app.core.websocket.manager import manager
from app.core.terminal_ui import ui

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    """WebSocket endpoint for real-time updates"""
    ui.info(f"Connection attempt for project: {project_id}", "WebSocket")
    try:
        await manager.connect(websocket, project_id)
        
        while True:
            try:
                data = await websocket.receive_text()
                ui.debug(f"Received data: {data}", "WebSocket")
                # Handle incoming WebSocket messages if needed
                # For now, we just maintain the connection
            except WebSocketDisconnect:
                ui.info(f"Disconnected for project: {project_id}", "WebSocket")
                break
            except Exception as e:
                ui.error(f"Error for project {project_id}: {e}", "WebSocket")
                break
    except Exception as e:
        ui.error(f"Setup error for project {project_id}: {e}", "WebSocket")
    finally:
        manager.disconnect(websocket, project_id)