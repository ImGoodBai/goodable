"""
Chat Messages API Endpoints
Handles message CRUD operations
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime
import uuid
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api.deps import get_db
from app.models.projects import Project
from app.models.messages import Message
from app.models.user_requests import UserRequest
from app.core.websocket.manager import manager


router = APIRouter()


class MessageResponse(BaseModel):
    id: str
    role: str
    message_type: str | None
    content: str
    metadata_json: dict | None = None
    parent_message_id: str | None = None
    session_id: str | None = None
    conversation_id: str | None = None
    cli_source: str | None = None
    created_at: datetime


class SendMessageRequest(BaseModel):
    content: str
    role: str = "user"
    conversation_id: str | None = None


@router.get("/{project_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    project_id: str, 
    conversation_id: Optional[str] = None, 
    cli_filter: Optional[str] = None,
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db)
):
    """Get messages for a project with optional filters"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    query = db.query(Message).filter(Message.project_id == project_id)
    
    if conversation_id:
        query = query.filter(Message.conversation_id == conversation_id)
    
    if cli_filter:
        query = query.filter(Message.cli_source == cli_filter)
    
    messages = query.order_by(Message.created_at.desc()).limit(limit).all()
    
    # Filter out messages marked as hidden from UI
    filtered_messages = []
    for msg in messages:
        if msg.metadata_json and msg.metadata_json.get("hidden_from_ui", False):
            continue  # Skip hidden messages
        filtered_messages.append(msg)
    
    return [
        MessageResponse(
            id=msg.id,
            role=msg.role,
            message_type=msg.message_type,
            content=msg.content,
            metadata_json=msg.metadata_json,
            parent_message_id=msg.parent_message_id,
            session_id=msg.session_id,
            conversation_id=msg.conversation_id,
            cli_source=msg.metadata_json.get("cli_type") if msg.metadata_json else None,
            created_at=msg.created_at
        ) for msg in reversed(filtered_messages)
    ]


@router.get("/{project_id}/active-session")
async def get_active_session(project_id: str, db: Session = Depends(get_db)):
    """Get the currently active session for a project"""
    from app.models.sessions import Session as ChatSession
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Find the most recent active session (not completed or failed)
    active_session = (
        db.query(ChatSession)
        .filter(ChatSession.project_id == project_id)
        .filter(ChatSession.status.in_(["active", "running"]))  # Include both active and running
        .order_by(ChatSession.started_at.desc())
        .first()
    )
    
    if not active_session:
        raise HTTPException(status_code=404, detail="No active session found")
    
    return {
        "session_id": active_session.id,
        "status": active_session.status,
        "cli_type": active_session.cli_type,
        "instruction": active_session.instruction,
        "started_at": active_session.started_at.isoformat() if active_session.started_at else None
    }


@router.post("/{project_id}/messages", response_model=MessageResponse)
async def send_message(
    project_id: str, 
    body: SendMessageRequest, 
    db: Session = Depends(get_db)
):
    """Send a simple message (no CLI execution)"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    conversation_id = body.conversation_id or str(uuid.uuid4())
    
    message = Message(
        id=str(uuid.uuid4()),
        project_id=project_id,
        role=body.role,
        message_type="chat",
        content=body.content,
        metadata_json={"source": "user_input"},
        conversation_id=conversation_id,
        created_at=datetime.utcnow()
    )
    
    db.add(message)
    db.commit()
    
    # Send to WebSocket clients
    await manager.send_message(project_id, {
        "type": "message",
        "data": {
            "id": message.id,
            "role": message.role,
            "message_type": message.message_type,
            "content": message.content,
            "metadata": message.metadata_json,
            "parent_message_id": message.parent_message_id,
            "session_id": message.session_id,
            "conversation_id": message.conversation_id
        },
        "timestamp": message.created_at.isoformat()
    })
    
    return MessageResponse(
        id=message.id,
        role=message.role,
        message_type=message.message_type,
        content=message.content,
        metadata_json=message.metadata_json,
        parent_message_id=message.parent_message_id,
        session_id=message.session_id,
        conversation_id=message.conversation_id,
        cli_source=None,
        created_at=message.created_at
    )


@router.get("/{project_id}/sessions/{session_id}/status")
async def get_session_status(project_id: str, session_id: str, db: Session = Depends(get_db)):
    """Get the status of a specific session"""
    from app.models.sessions import Session as ChatSession
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id)
        .filter(ChatSession.project_id == project_id)
        .first()
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session.id,
        "status": session.status,
        "cli_type": session.cli_type,
        "instruction": session.instruction,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "duration_ms": session.duration_ms
    }


@router.delete("/{project_id}/messages")
async def clear_messages(
    project_id: str,
    conversation_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Clear messages for a project or conversation"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    query = db.query(Message).filter(Message.project_id == project_id)
    
    if conversation_id:
        query = query.filter(Message.conversation_id == conversation_id)
    
    deleted_count = query.delete()
    db.commit()
    
    await manager.send_message(project_id, {
        "type": "messages_cleared",
        "conversation_id": conversation_id
    })
    
    return {"deleted": deleted_count}


@router.get("/{project_id}/requests/active")
async def get_active_requests(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get active user requests for a project (no logging for polling)"""
    # No logging to keep server logs clean
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Count active requests (is_completed = false)
    active_count = (
        db.query(UserRequest)
        .filter(UserRequest.project_id == project_id)
        .filter(UserRequest.is_completed == False)
        .count()
    )
    
    return {"hasActiveRequests": active_count > 0, "activeCount": active_count}