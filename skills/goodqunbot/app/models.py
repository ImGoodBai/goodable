from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class GroupModel(BaseModel):
    """群组数据模型"""
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=200, description="群名称")
    member_count: int = Field(default=0, ge=0, description="群成员数量")
    last_msg_time: Optional[str] = Field(default=None, description="最后消息时间")
    members_refreshed_at: Optional[str] = Field(default=None, description="成员刷新时间")


class MessageModel(BaseModel):
    """消息数据模型"""
    id: Optional[int] = None
    group_id: int = Field(..., gt=0, description="所属群组ID")
    sender: str = Field(..., min_length=1, max_length=100, description="发送者")
    content: str = Field(..., description="消息内容")
    msg_time: str = Field(..., description="消息时间")
    msg_type: str = Field(default="unknown", description="消息类型")


class GroupListResponse(BaseModel):
    """群组列表响应模型"""
    groups: list[GroupModel]
    total: int


class MessageListResponse(BaseModel):
    """消息列表响应模型"""
    messages: list[MessageModel]
    total: int
    group_name: str


class SummaryModel(BaseModel):
    """总结数据模型"""
    id: Optional[int] = None
    group_id: int = Field(..., gt=0, description="所属群组ID")
    group_name: str = Field(..., min_length=1, max_length=200, description="群名称")
    date_range: str = Field(..., description="日期范围")
    status: str = Field(default="pending", description="任务状态")
    summary_content: Optional[str] = Field(default=None, description="总结内容")
    message_count: int = Field(default=0, ge=0, description="消息数量")
    created_at: Optional[str] = Field(default=None, description="创建时间")


class CreateSummaryRequest(BaseModel):
    """创建总结请求模型"""
    group_name: str = Field(..., min_length=1, max_length=200, description="群名称")
    date_range: str = Field(..., description="日期范围：今天或近2天")
    batch_load_freq: int = Field(default=5, ge=2, le=60, description="批量加载频率：每N次LoadMoreMessage后执行一次GetAllMessage")


class SummaryListResponse(BaseModel):
    """总结列表响应模型"""
    summaries: list[SummaryModel]
    total: int


class SummaryDetailResponse(BaseModel):
    """总结详情响应模型"""
    summary: SummaryModel
    messages: list[MessageModel]


class MessageStats(BaseModel):
    """消息统计模型"""
    total: int = Field(default=0, description="总消息数")
    text: int = Field(default=0, description="文本消息数")
    image: int = Field(default=0, description="图片消息数")
    emoji: int = Field(default=0, description="表情消息数")
    video: int = Field(default=0, description="视频消息数")
    link: int = Field(default=0, description="链接消息数")
    video_channel: int = Field(default=0, description="视频号消息数")


class TopSender(BaseModel):
    """活跃榜条目模型"""
    sender: str = Field(..., description="发言人")
    count: int = Field(..., description="消息数")


class WordCloudItem(BaseModel):
    """词云条目模型"""
    word: str = Field(..., description="词汇")
    count: int = Field(..., description="出现次数")


class SummaryStatsResponse(BaseModel):
    """总结统计响应模型"""
    total_members: int = Field(default=0, description="群总人数")
    active_members: int = Field(default=0, description="本次发言人数")
    message_stats: MessageStats = Field(..., description="消息统计")
    hourly_distribution: list[int] = Field(default_factory=lambda: [0] * 24, description="24小时消息分布")
    top_senders: list[TopSender] = Field(default_factory=list, description="活跃榜Top5")
    word_cloud: list[WordCloudItem] = Field(default_factory=list, description="词云数据Top50")


class GroupMemberModel(BaseModel):
    """群成员数据模型"""
    id: Optional[int] = None
    member_name: str = Field(..., min_length=1, max_length=100, description="成员昵称")
    member_order: int = Field(..., ge=1, description="成员序号")


class GroupMemberListResponse(BaseModel):
    """群成员列表响应模型"""
    members: list[GroupMemberModel]
    total: int
    group_id: int
    group_name: str
    member_count: int
    refreshed_at: Optional[str] = Field(default=None, description="刷新时间")


class RefreshMembersResponse(BaseModel):
    """刷新成员响应模型"""
    success: bool
    message: str
    member_count: int
    refreshed_at: str


