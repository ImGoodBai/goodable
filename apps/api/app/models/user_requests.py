"""
User Request Model
사용자 요청별 작업 상태 추적 모델
"""
from sqlalchemy import String, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db.base import Base


class UserRequest(Base):
    """사용자 요청별 작업 상태 추적 테이블"""
    __tablename__ = "user_requests"

    # 기본 식별자
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # request_id
    
    # 관련 엔티티 연결
    project_id: Mapped[str] = mapped_column(
        String(64), 
        ForeignKey("projects.id", ondelete="CASCADE"), 
        index=True, 
        nullable=False
    )
    
    # 사용자 메시지 연결 (1:1 관계)
    user_message_id: Mapped[str] = mapped_column(
        String(64), 
        ForeignKey("messages.id", ondelete="CASCADE"), 
        unique=True,  # 한 메시지당 하나의 요청
        index=True, 
        nullable=False
    )
    
    # 실행 세션 연결 (1:1 또는 1:N 관계 가능)
    session_id: Mapped[str | None] = mapped_column(
        String(64), 
        ForeignKey("sessions.id", ondelete="SET NULL"), 
        index=True
    )
    
    # 요청 정보
    instruction: Mapped[str] = mapped_column(Text, nullable=False)  # 사용자 요청 내용
    request_type: Mapped[str] = mapped_column(String(16), default="act")  # act, chat
    
    # 완료 상태 추적
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_successful: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # None: 진행중, True: 성공, False: 실패
    
    # 실행 결과 메타데이터  
    result_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # CLI 정보
    cli_type_used: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    
    # 타임스탬프
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    project = relationship("Project", back_populates="user_requests")
    user_message = relationship("Message", foreign_keys=[user_message_id])
    session = relationship("Session", back_populates="user_requests")

    @property
    def duration_ms(self) -> int | None:
        """요청 처리 시간 계산 (밀리초)"""
        if self.started_at and self.completed_at:
            return int((self.completed_at - self.started_at).total_seconds() * 1000)
        return None

    @property 
    def status(self) -> str:
        """요청 상태 반환"""
        if not self.is_completed:
            return "pending" if not self.started_at else "running"
        elif self.is_successful is True:
            return "completed"
        else:
            return "failed"
            
    def __repr__(self) -> str:
        return f"<UserRequest(id={self.id}, status={self.status}, instruction='{self.instruction[:50]}...')>"