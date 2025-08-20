"""
WebSocket Connection Manager
Handles WebSocket connections for real-time chat updates
"""
from typing import Dict, List
import json
from fastapi import WebSocket
from app.core.terminal_ui import ui


class ConnectionManager:
    """WebSocket connection manager for real-time updates"""
    
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: str):
        """Connect a new WebSocket client"""
        await websocket.accept()
        
        # Initialize connection list if needed
        if project_id not in self.active_connections:
            self.active_connections[project_id] = []
        
        # Add new connection to the list (allow multiple connections per project)
        self.active_connections[project_id].append(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str):
        """Disconnect a WebSocket client"""
        if project_id in self.active_connections:
            try:
                self.active_connections[project_id].remove(websocket)
            except ValueError:
                pass
            
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]

    async def send_message(self, project_id: str, message_data: dict):
        """Send message to all WebSocket connections for a project"""
        if project_id in self.active_connections:
            for connection in self.active_connections[project_id][:]:
                try:
                    await connection.send_text(json.dumps(message_data))
                except Exception:
                    # Connection failed - remove it silently
                    try:
                        self.active_connections[project_id].remove(connection)
                    except (ValueError, KeyError):
                        pass

    async def broadcast_status(self, project_id: str, status: str, data: dict = None):
        """Broadcast status update to all connections"""
        message = {
            "type": "status",
            "status": status,
            "data": data or {}
        }
        await self.send_message(project_id, message)

    async def broadcast_cli_output(self, project_id: str, output: str, cli_type: str):
        """Broadcast CLI output to all connections"""
        message = {
            "type": "cli_output",
            "output": output,
            "cli_type": cli_type
        }
        await self.send_message(project_id, message)

    async def broadcast_to_project(self, project_id: str, message_data: dict):
        """Broadcast message to all connections for a project (alias for send_message)"""
        await self.send_message(project_id, message_data)


# Global connection manager instance
manager = ConnectionManager()