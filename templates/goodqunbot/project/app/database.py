import aiosqlite
from datetime import datetime
from typing import List, Optional, Dict
import os
from pathlib import Path

DATABASE_URL = "python_dev.db"

# 停用词缓存
_stopwords_cache = None

def load_stopwords() -> set:
    """从配置文件加载停用词表（带缓存）"""
    global _stopwords_cache

    if _stopwords_cache is not None:
        return _stopwords_cache

    # 获取配置文件路径
    config_dir = Path(__file__).parent.parent / 'config'
    stopwords_file = config_dir / 'stopwords.txt'

    stopwords = set()
    try:
        if stopwords_file.exists():
            with open(stopwords_file, 'r', encoding='utf-8') as f:
                for line in f:
                    word = line.strip()
                    if word:  # 忽略空行
                        stopwords.add(word)
            print(f"成功加载停用词表：{len(stopwords)}个词")
        else:
            print(f"警告：停用词文件不存在 {stopwords_file}，使用默认停用词")
            # 使用默认停用词作为后备
            stopwords = {
                '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
                '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '吗', '啊', '哦',
                '呢', '吧', '嗯', '哈', '哒', '喔', '额', '诶', '嘿', '嘛', '呀', '呃', '咦', '唔', '哟', '嗷',
                '么', '可以', '知道', '觉得', '这个', '那个', '什么', '怎么', '为什么', '但是', '如果', '已经'
            }
    except Exception as e:
        print(f"加载停用词文件失败：{e}，使用默认停用词")
        stopwords = {
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
            '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '吗', '啊', '哦',
            '呢', '吧', '嗯', '哈', '哒', '喔', '额', '诶', '嘿', '嘛', '呀', '呃', '咦', '唔', '哟', '嗷',
            '么', '可以', '知道', '觉得', '这个', '那个', '什么', '怎么', '为什么', '但是', '如果', '已经'
        }

    _stopwords_cache = stopwords
    return stopwords


async def init_database():
    """初始化数据库表结构"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        # 创建群组表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                member_count INTEGER DEFAULT 0,
                last_msg_time TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 创建消息表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                sender TEXT NOT NULL,
                content TEXT NOT NULL,
                msg_time TEXT NOT NULL,
                msg_type TEXT DEFAULT 'unknown',
                msg_hash TEXT NOT NULL,
                summary_id INTEGER,
                msg_timestamp INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups (id),
                FOREIGN KEY (summary_id) REFERENCES summaries (id)
            )
        """)

        # 创建总结表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                group_name TEXT NOT NULL,
                date_range TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                summary_content TEXT,
                message_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups (id)
            )
        """)

        # 创建群成员表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS group_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                member_name TEXT NOT NULL,
                member_order INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups (id),
                UNIQUE (group_id, member_name)
            )
        """)

        # 给groups表添加members_refreshed_at字段（如果不存在）
        try:
            await db.execute("ALTER TABLE groups ADD COLUMN members_refreshed_at TEXT")
        except aiosqlite.OperationalError:
            pass  # 字段已存在，忽略

        # 创建索引提升查询性能
        await db.execute("CREATE INDEX IF NOT EXISTS idx_group_name ON groups(name)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_msg_hash_summary ON messages(msg_hash, summary_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_group_id ON messages(group_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_summary_id ON messages(summary_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_summary_group_id ON summaries(group_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id)")

        await db.commit()
        print("[数据库] 数据库表初始化完成")


async def insert_group(name: str, member_count: int = 0) -> Optional[int]:
    """插入群组，如果已存在则更新member_count"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        try:
            cursor = await db.execute(
                "INSERT INTO groups (name, member_count) VALUES (?, ?)",
                (name, member_count)
            )
            await db.commit()
            print(f"[数据库] 新增群组: {name}, 成员数: {member_count}")
            return cursor.lastrowid
        except aiosqlite.IntegrityError:
            # 群组已存在，更新member_count
            await db.execute(
                "UPDATE groups SET member_count = ? WHERE name = ?",
                (member_count, name)
            )
            await db.commit()
            cursor = await db.execute("SELECT id FROM groups WHERE name = ?", (name,))
            row = await cursor.fetchone()
            print(f"[数据库] 更新群组: {name}, 成员数: {member_count}")
            return row[0] if row else None


async def get_all_groups() -> List[Dict]:
    """获取所有群组列表"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, name, member_count, last_msg_time, members_refreshed_at FROM groups ORDER BY id DESC"
        )
        rows = await cursor.fetchall()
        print(f"[数据库] 查询到 {len(rows)} 个群组")
        return [dict(row) for row in rows]


async def get_group_by_name(name: str) -> Optional[Dict]:
    """根据群名称获取群组信息"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM groups WHERE name = ?", (name,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def create_summary(group_id: int, group_name: str, date_range: str) -> Optional[int]:
    """创建总结任务"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        cursor = await db.execute(
            "INSERT INTO summaries (group_id, group_name, date_range, status) VALUES (?, ?, ?, ?)",
            (group_id, group_name, date_range, 'pending')
        )
        await db.commit()
        print(f"[数据库] 创建总结任务: {group_name} - {date_range}")
        return cursor.lastrowid


async def get_all_summaries() -> List[Dict]:
    """获取所有总结任务列表"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM summaries ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        print(f"[数据库] 查询到 {len(rows)} 个总结任务")
        return [dict(row) for row in rows]


async def get_summary_by_id(summary_id: int) -> Optional[Dict]:
    """根据ID获取总结任务"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM summaries WHERE id = ?", (summary_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def update_summary_status(summary_id: int, status: str, summary_content: str = None, message_count: int = None):
    """更新总结任务状态"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        if summary_content is not None and message_count is not None:
            await db.execute(
                "UPDATE summaries SET status = ?, summary_content = ?, message_count = ? WHERE id = ?",
                (status, summary_content, message_count, summary_id)
            )
        else:
            await db.execute(
                "UPDATE summaries SET status = ? WHERE id = ?",
                (status, summary_id)
            )
        await db.commit()
        print(f"[数据库] 更新总结任务状态: {summary_id} -> {status}")


async def insert_message(group_id: int, sender: str, content: str, msg_time: str, msg_type: str, msg_hash: str, summary_id: int = None, msg_timestamp: int = None) -> Optional[int]:
    """插入消息记录"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        # 检查同一个summary下是否已存在相同的msg_hash（去重）
        if summary_id is not None:
            cursor = await db.execute(
                "SELECT id FROM messages WHERE msg_hash = ? AND summary_id = ?",
                (msg_hash, summary_id)
            )
            existing = await cursor.fetchone()
            if existing:
                # 消息已存在（同一个summary下的重复消息）
                return None

        # 插入新消息
        try:
            cursor = await db.execute(
                "INSERT INTO messages (group_id, sender, content, msg_time, msg_type, msg_hash, summary_id, msg_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (group_id, sender, content, msg_time, msg_type, msg_hash, summary_id, msg_timestamp)
            )
            await db.commit()
            return cursor.lastrowid
        except Exception as e:
            print(f"[数据库] 插入消息失败: {e}")
            return None


async def get_messages_by_summary_id(summary_id: int) -> List[Dict]:
    """根据总结ID获取关联的消息列表"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM messages WHERE summary_id = ? ORDER BY id ASC",
            (summary_id,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def insert_group_members(group_id: int, member_names: List[str]) -> int:
    """批量插入群成员（覆盖式更新）"""
    # 去重：保留第一次出现的成员，去除重复
    unique_members = []
    seen = set()
    for name in member_names:
        if name not in seen:
            unique_members.append(name)
            seen.add(name)

    # 记录去重信息
    original_count = len(member_names)
    unique_count = len(unique_members)
    if original_count > unique_count:
        print(f"[数据库] 成员去重: {original_count} -> {unique_count} (去除 {original_count - unique_count} 个重复)")

    async with aiosqlite.connect(DATABASE_URL) as db:
        # 删除该群的旧成员数据
        await db.execute("DELETE FROM group_members WHERE group_id = ?", (group_id,))

        # 批量插入新成员（使用去重后的列表）
        insert_count = 0
        for order, name in enumerate(unique_members, start=1):
            await db.execute(
                "INSERT INTO group_members (group_id, member_name, member_order) VALUES (?, ?, ?)",
                (group_id, name, order)
            )
            insert_count += 1

        # 更新群的刷新时间和成员数量
        refresh_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        await db.execute(
            "UPDATE groups SET members_refreshed_at = ?, member_count = ? WHERE id = ?",
            (refresh_time, insert_count, group_id)
        )

        await db.commit()
        print(f"[数据库] 更新群成员: group_id={group_id}, 成员数={insert_count}")
        return insert_count


async def get_members_by_group_id(group_id: int) -> List[Dict]:
    """根据群ID获取成员列表"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, member_name, member_order FROM group_members WHERE group_id = ? ORDER BY member_order ASC",
            (group_id,)
        )
        rows = await cursor.fetchall()
        print(f"[数据库] 查询群成员: group_id={group_id}, 成员数={len(rows)}")
        return [dict(row) for row in rows]


async def get_summary_stats(summary_id: int) -> Optional[Dict]:
    """获取总结的统计数据"""
    import jieba
    from collections import Counter

    async with aiosqlite.connect(DATABASE_URL) as db:
        db.row_factory = aiosqlite.Row

        # 1. 获取总结信息
        cursor = await db.execute("SELECT group_id FROM summaries WHERE id = ?", (summary_id,))
        summary_row = await cursor.fetchone()
        if not summary_row:
            return None

        group_id = summary_row['group_id']

        # 2. 获取群总人数
        cursor = await db.execute("SELECT member_count FROM groups WHERE id = ?", (group_id,))
        group_row = await cursor.fetchone()
        # 如果member_count为0或None，则使用active_members作为total_members
        total_members_from_db = group_row['member_count'] if group_row else 0

        # 3. 获取所有消息
        cursor = await db.execute(
            "SELECT sender, content, msg_time, msg_timestamp FROM messages WHERE summary_id = ?",
            (summary_id,)
        )
        messages = await cursor.fetchall()

        if not messages:
            # 返回空统计
            return {
                'total_members': 0,
                'active_members': 0,
                'message_stats': {
                    'total': 0,
                    'text': 0,
                    'image': 0,
                    'emoji': 0,
                    'video': 0,
                    'link': 0,
                    'video_channel': 0
                },
                'hourly_distribution': [0] * 24,
                'top_senders': [],
                'word_cloud': []
            }

        # 4. 统计发言人数（去重）
        senders = set()
        sender_counts = Counter()
        hourly_dist = [0] * 24

        # 消息类型统计
        msg_type_stats = {
            'total': 0,
            'text': 0,
            'image': 0,
            'emoji': 0,
            'video': 0,
            'link': 0,
            'video_channel': 0
        }

        # 收集所有文本内容用于词云
        all_text = []

        for msg in messages:
            sender = msg['sender']
            content = msg['content']
            msg_time = msg['msg_time']

            # 统计发言人
            senders.add(sender)
            sender_counts[sender] += 1

            # 统计消息总数
            msg_type_stats['total'] += 1

            # 统计消息类型（按照用户要求：使用==判断，不是包含）
            if content == '[图片]':
                msg_type_stats['image'] += 1
            elif content == '[视频]':
                msg_type_stats['video'] += 1
            elif content == '[表情]' or content == '[动画表情]':
                msg_type_stats['emoji'] += 1
            elif content == '[链接]':
                msg_type_stats['link'] += 1
            elif content == '[视频号]':
                msg_type_stats['video_channel'] += 1
            else:
                # 其他视为文本消息
                msg_type_stats['text'] += 1
                # 收集文本内容用于词云
                all_text.append(content)

            # 统计24小时分布（使用msg_timestamp）
            try:
                msg_timestamp = msg['msg_timestamp']
                if msg_timestamp:
                    real_time = datetime.fromtimestamp(msg_timestamp)
                    hour = real_time.hour
                    hourly_dist[hour] += 1
            except:
                pass

        # 5. 活跃榜Top5
        top_senders = [
            {'sender': sender, 'count': count}
            for sender, count in sender_counts.most_common(5)
        ]

        # 6. 词云统计Top50
        word_cloud = []
        if all_text:
            # 从配置文件加载停用词表
            stopwords = load_stopwords()

            # 合并所有文本
            combined_text = ' '.join(all_text)

            # jieba分词
            words = jieba.lcut(combined_text)

            # 过滤并统计
            word_counts = Counter()
            for word in words:
                word = word.strip()
                # 过滤：长度>=2，非纯数字，非停用词，非群成员昵称
                if len(word) >= 2 and not word.isdigit() and word not in stopwords and word not in senders:
                    word_counts[word] += 1

            # Top50
            word_cloud = [
                {'word': word, 'count': count}
                for word, count in word_counts.most_common(50)
            ]

        return {
            'total_members': total_members_from_db if total_members_from_db > 0 else len(senders),
            'active_members': len(senders),
            'message_stats': msg_type_stats,
            'hourly_distribution': hourly_dist,
            'top_senders': top_senders,
            'word_cloud': word_cloud
        }


