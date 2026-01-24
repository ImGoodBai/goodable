import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Tuple, Any


def parse_wechat_time(time_text: str, base_time: Optional[datetime] = None) -> Optional[datetime]:
    """
    解析微信相对时间文本为绝对时间

    Args:
        time_text: 微信时间文本（如"昨天 14:23"、"3分钟前"、"周一 10:00"等）
        base_time: 基准时间（默认为当前时间）

    Returns:
        解析后的datetime对象，解析失败返回None
    """
    if not time_text:
        return None

    if base_time is None:
        base_time = datetime.now()

    time_text = time_text.strip()

    # 1. 刚刚
    if time_text == '刚刚':
        return base_time

    # 2. HH:mm 格式（今天的时间）
    match = re.match(r'^(\d{1,2}):(\d{2})$', time_text)
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2))
        return base_time.replace(hour=hour, minute=minute, second=0, microsecond=0)

    # 3. N分钟前
    match = re.match(r'^(\d+)分钟前$', time_text)
    if match:
        minutes = int(match.group(1))
        return base_time - timedelta(minutes=minutes)

    # 3. N小时前
    match = re.match(r'^(\d+)小时前$', time_text)
    if match:
        hours = int(match.group(1))
        return base_time - timedelta(hours=hours)

    # 4. 昨天 [HH:mm]
    match = re.match(r'^昨天(?:\s+(\d{1,2}):(\d{2}))?$', time_text)
    if match:
        yesterday = base_time - timedelta(days=1)
        if match.group(1):
            hour = int(match.group(1))
            minute = int(match.group(2))
            return yesterday.replace(hour=hour, minute=minute, second=0, microsecond=0)
        else:
            return yesterday.replace(hour=0, minute=0, second=0, microsecond=0)

    # 5. 前天 [HH:mm]
    match = re.match(r'^前天(?:\s+(\d{1,2}):(\d{2}))?$', time_text)
    if match:
        day_before_yesterday = base_time - timedelta(days=2)
        if match.group(1):
            hour = int(match.group(1))
            minute = int(match.group(2))
            return day_before_yesterday.replace(hour=hour, minute=minute, second=0, microsecond=0)
        else:
            return day_before_yesterday.replace(hour=0, minute=0, second=0, microsecond=0)

    # 6. 周X/星期X [HH:mm]
    match = re.match(r'^(?:周|星期)([一二三四五六日天])(?:\s+(\d{1,2}):(\d{2}))?$', time_text)
    if match:
        weekday_map = {
            '一': 0, '二': 1, '三': 2, '四': 3,
            '五': 4, '六': 5, '日': 6, '天': 6
        }
        target_weekday = weekday_map[match.group(1)]
        current_weekday = base_time.weekday()

        # 计算天数差（向过去回推）
        days_diff = (current_weekday - target_weekday) % 7
        if days_diff == 0:
            days_diff = 7  # 如果是今天，回推到上周同一天

        target_date = base_time - timedelta(days=days_diff)

        if match.group(2):
            hour = int(match.group(2))
            minute = int(match.group(3))
            return target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
        else:
            return target_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # 7. M月D日 [HH:mm]（默认当前年份）
    match = re.match(r'^(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?$', time_text)
    if match:
        month = int(match.group(1))
        day = int(match.group(2))
        year = base_time.year

        # 如果日期在未来，则是去年的日期
        temp_date = datetime(year, month, day)
        if temp_date > base_time:
            year -= 1

        if match.group(3):
            hour = int(match.group(3))
            minute = int(match.group(4))
            return datetime(year, month, day, hour, minute, 0, 0)
        else:
            return datetime(year, month, day, 0, 0, 0, 0)

    # 8. YYYY年M月D日 [HH:mm]
    match = re.match(r'^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?$', time_text)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))

        if match.group(4):
            hour = int(match.group(4))
            minute = int(match.group(5))
            return datetime(year, month, day, hour, minute, 0, 0)
        else:
            return datetime(year, month, day, 0, 0, 0, 0)

    # 解析失败
    return None


def calculate_cutoff_time(date_range: str, base_time: Optional[datetime] = None) -> datetime:
    """
    根据日期范围计算截止时间

    Args:
        date_range: "今天" 或 "近N天"（如"近2天"、"近5天"、"近130天"等）
        base_time: 基准时间（默认为当前时间）

    Returns:
        截止时间（早于此时间的消息将被过滤）
    """
    if base_time is None:
        base_time = datetime.now()

    if date_range == "今天":
        # 今天0点
        return base_time.replace(hour=0, minute=0, second=0, microsecond=0)
    elif date_range.startswith("近") and date_range.endswith("天"):
        # 提取天数
        import re
        match = re.match(r'^近(\d+)天$', date_range)
        if match:
            days = int(match.group(1))
            # N天前0点
            target_date = base_time - timedelta(days=days-1)
            return target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            raise ValueError(f"日期范围格式错误: {date_range}")
    else:
        raise ValueError(f"不支持的日期范围: {date_range}")


def truncate_message(content: str, max_length: int) -> str:
    """
    截断消息内容到指定长度

    Args:
        content: 消息内容
        max_length: 最大长度

    Returns:
        截断后的消息
    """
    if len(content) <= max_length:
        return content
    return content[:max_length] + "..."


def extract_earliest_time_from_messages(messages: List[Any], base_time: Optional[datetime] = None) -> Optional[datetime]:
    """
    从消息列表中提取最早的时间标记

    Args:
        messages: 消息列表（每个消息需要有 type, sender, content 属性）
        base_time: 基准时间（默认为当前时间）

    Returns:
        最早的时间，如果没有找到时间标记则返回None
    """
    if base_time is None:
        base_time = datetime.now()

    for msg in messages:
        msg_type = msg.type if hasattr(msg, 'type') else ''
        sender = msg.sender if hasattr(msg, 'sender') else ''
        content = msg.content if hasattr(msg, 'content') else ''

        # 时间消息判断：type==sys 且 sender==SYS
        if msg_type == 'sys' and sender == 'SYS':
            # 解析时间
            parsed_time = parse_wechat_time(content, base_time)
            if parsed_time:
                return parsed_time

    return None


def filter_messages_by_date_range(
    messages: List[Any],
    cutoff_time: datetime,
    base_time: Optional[datetime] = None
) -> List[Dict[str, Any]]:
    """
    根据日期范围过滤消息

    Args:
        messages: 消息列表（每个消息需要有 type, sender, content 属性）
        cutoff_time: 截止时间（早于此时间的消息将被过滤）
        base_time: 基准时间（默认为当前时间）

    Returns:
        过滤后的消息列表，每条消息包含：sender, content, msg_time, msg_type, msg_timestamp
    """
    if base_time is None:
        base_time = datetime.now()

    filtered_messages = []
    current_time_context = None  # 当前时间上下文：(时间文本, datetime对象)

    for msg in messages:
        sender = msg.sender if hasattr(msg, 'sender') else ''
        content = msg.content if hasattr(msg, 'content') else ''
        msg_type = msg.type if hasattr(msg, 'type') else 'unknown'

        # 判断是否是时间消息（type='sys' 且 sender='SYS'）
        if msg_type == 'sys' and sender == 'SYS':
            # 这是时间标记消息，解析时间
            parsed_time = parse_wechat_time(content, base_time)
            if parsed_time:
                current_time_context = (content, parsed_time)
            continue  # 时间消息本身不加入结果

        # 普通消息，使用当前时间上下文
        if current_time_context:
            msg_time_text, msg_time = current_time_context

            # 只保留在日期范围内的消息
            if msg_time >= cutoff_time:
                filtered_messages.append({
                    'sender': sender,
                    'content': content,
                    'msg_time': msg_time_text,
                    'msg_type': msg_type,
                    'msg_timestamp': int(msg_time.timestamp())
                })
        else:
            # 没有时间上下文，默认为当前时间（最新消息）
            filtered_messages.append({
                'sender': sender,
                'content': content,
                'msg_time': '刚刚',
                'msg_type': msg_type,
                'msg_timestamp': int(base_time.timestamp())
            })

    return filtered_messages
