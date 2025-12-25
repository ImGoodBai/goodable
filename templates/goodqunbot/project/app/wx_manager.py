import sys
import os
from typing import List, Dict, Optional
import threading
import time
import random
from datetime import datetime

# 将 wxauto_lib 所在目录加入 Python 搜索路径
# 智能检测：先尝试 .. 再尝试 ../..（兼容开发环境和部署环境）
current_dir = os.path.dirname(__file__)
project_root = os.path.abspath(os.path.join(current_dir, '..'))
if not os.path.exists(os.path.join(project_root, 'wxauto_lib')):
    project_root = os.path.abspath(os.path.join(current_dir, '../..'))

wxauto_lib_path = os.path.join(project_root, 'wxauto_lib')

# 使用 importlib 加载 wxauto_lib（参考 demo_pyc.py）
import importlib.util
try:
    # 清除可能的旧缓存
    for key in list(sys.modules.keys()):
        if 'wxauto' in key.lower():
            del sys.modules[key]

    spec = importlib.util.spec_from_file_location(
        "wxauto_lib",
        os.path.join(wxauto_lib_path, "__init__.pyc")
    )
    spec.submodule_search_locations = [wxauto_lib_path]
    wxauto_lib = importlib.util.module_from_spec(spec)
    sys.modules['wxauto_lib'] = wxauto_lib
    spec.loader.exec_module(wxauto_lib)
    WeChat = wxauto_lib.WeChat
    FindWindow = wxauto_lib.FindWindow
except Exception as e:
    # 如果加载失败，抛出错误
    print(f"[ERROR] Failed to load wxauto_lib: {e}")
    raise ImportError(f"Failed to load wxauto_lib from {wxauto_lib_path}") from e

from app.utils import (
    parse_wechat_time,
    calculate_cutoff_time,
    extract_earliest_time_from_messages,
    filter_messages_by_date_range
)


class WxManager:
    """微信实例管理器（单例模式）"""
    _instance = None
    _lock = threading.RLock()
    _wx = None
    _last_heartbeat = None
    _retry_count = 0
    _MAX_RETRY_COUNT = 3
    _HEARTBEAT_INTERVAL = 60  # 心跳间隔60秒
    _connection_state = False

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def _check_wx_window_exists(self) -> bool:
        """检查微信窗口是否存在"""
        print("[微信] 检查微信窗口是否存在...")
        try:
            wx_hwnd = FindWindow(classname='WeChatMainWndForPC')
            if wx_hwnd:
                print(f"[微信] 找到微信窗口，句柄: {wx_hwnd}")
                return True
            else:
                print("[微信] [X] 未找到微信窗口，请确保微信PC客户端已启动并登录")
                return False
        except Exception as e:
            print(f"[微信] 检查微信窗口异常: {e}")
            return False

    def get_wx_instance(self) -> WeChat:
        """获取微信实例"""
        with self._lock:
            # 如果实例已存在，检查连接状态
            if self._wx is not None:
                if self._check_connection():
                    return self._wx
                else:
                    print("[微信] 现有实例连接已断开，准备重新创建")
                    self._cleanup_instance()

            # 创建新实例
            return self._create_instance()

    def _create_instance(self) -> Optional[WeChat]:
        """创建微信实例"""
        print("[微信] ==================== 开始创建微信实例 ====================")

        # 检查重试次数
        if self._retry_count >= self._MAX_RETRY_COUNT:
            print(f"[微信] [X] 已达到最大重试次数 {self._MAX_RETRY_COUNT}，停止重试")
            print("[微信] [i] 请检查：1. 微信PC客户端是否已启动 2. 是否已登录账号")
            return None

        # 重试等待
        if self._retry_count > 0:
            wait_time = 2 * self._retry_count
            print(f"[微信] [...] 第 {self._retry_count + 1} 次重试，等待 {wait_time} 秒...")
            time.sleep(wait_time)

        # 步骤1: 预检查微信窗口
        print("[微信] 步骤 1/4: 预检查微信窗口")
        if not self._check_wx_window_exists():
            self._retry_count += 1
            self._connection_state = False
            return None

        # 步骤2: 创建 WeChat 实例
        print("[微信] 步骤 2/4: 创建 WeChat 对象")
        try:
            print("[微信]   - 调用 WeChat(myinfo=True)...")
            self._wx = WeChat(myinfo=True)
            print("[微信]   [OK] WeChat 对象创建成功")
        except LookupError as e:
            print(f"[微信]   [X] 创建失败 (LookupError): {e}")
            print("[微信]   [i] 可能原因：微信未登录或版本不兼容")
            self._retry_count += 1
            self._connection_state = False
            self._wx = None
            return None
        except Exception as e:
            print(f"[微信]   [X] 创建失败 (未知错误): {e}")
            self._retry_count += 1
            self._connection_state = False
            self._wx = None
            return None

        # 步骤3: 验证实例有效性
        print("[微信] 步骤 3/4: 验证实例有效性")
        if not hasattr(self._wx, 'nickname') or not self._wx.nickname:
            print("[微信]   [X] 实例无效：缺少 nickname 属性")
            print("[微信]   [i] 可能原因：微信未完全初始化")
            self._retry_count += 1
            self._connection_state = False
            self._wx = None
            return None

        print(f"[微信]   [OK] 实例有效，账号昵称: {self._wx.nickname}")

        # 步骤4: 初始化连接状态
        print("[微信] 步骤 4/4: 初始化连接状态")
        self._last_heartbeat = time.time()
        self._connection_state = True
        self._retry_count = 0
        print(f"[微信]   [OK] 心跳时间已记录: {time.strftime('%H:%M:%S', time.localtime(self._last_heartbeat))}")

        print(f"[微信] ==================== 微信实例创建成功 ====================")
        print(f"[微信] [OK] 已登录账号: {self._wx.nickname}")

        return self._wx

    def _check_connection(self) -> bool:
        """检查连接状态（心跳检测）"""
        if self._wx is None:
            return False

        current_time = time.time()
        # 如果在心跳间隔内，直接返回缓存状态
        if self._last_heartbeat and (current_time - self._last_heartbeat < self._HEARTBEAT_INTERVAL):
            return self._connection_state

        # 执行心跳检测
        print("[微信] 执行心跳检测...")
        try:
            sessions = self._wx.GetSession()
            if sessions is None:
                print("[微信] [X] 心跳检测失败: GetSession 返回 None")
                self._connection_state = False
                self._wx = None
                return False

            self._last_heartbeat = current_time
            self._connection_state = True
            print(f"[微信] [OK] 心跳检测成功，更新时间: {time.strftime('%H:%M:%S', time.localtime())}")
            return True
        except Exception as e:
            print(f"[微信] [X] 心跳检测失败: {e}")
            self._connection_state = False
            self._wx = None
            return False

    def _cleanup_instance(self):
        """清理微信实例"""
        if self._wx is None:
            return

        print("[微信] 清理微信实例...")
        try:
            if hasattr(self._wx, 'Close') and callable(getattr(self._wx, 'Close')):
                self._wx.Close()
            del self._wx
        except Exception as e:
            print(f"[微信] 清理实例时异常: {e}")
        finally:
            self._wx = None
            self._connection_state = False
            self._last_heartbeat = None
            print("[微信] [OK] 实例清理完成")

    def get_group_list(self) -> List[Dict]:
        """获取群组列表"""
        print("[微信群列表] ==================== 开始获取群列表 ====================")

        wx = self.get_wx_instance()
        if wx is None:
            print("[微信群列表] [X] 微信实例不可用")
            return []

        try:
            print("[微信群列表] 调用 GetAllRecentGroups()...")
            group_list_raw = wx.GetAllRecentGroups()
            print(f"[微信群列表] 原始返回 {len(group_list_raw) if group_list_raw else 0} 条数据")

            if not group_list_raw:
                print("[微信群列表] [!] 未获取到任何群组数据")
                return []

            group_list = []
            filtered_count = 0

            for idx, (name, count) in enumerate(group_list_raw, 1):
                # 过滤临时群（名称中包含顿号）
                if '、' in name:
                    print(f"[微信群列表] [{idx}] 过滤临时群: {name}")
                    filtered_count += 1
                    continue

                # 将count转换为整数（WeChat API返回的是字符串）
                try:
                    member_count = int(count) if count else 0
                except (ValueError, TypeError):
                    member_count = 0

                group_list.append({
                    'name': name,
                    'member_count': member_count
                })
                print(f"[微信群列表] [{idx}] 添加群: {name} (成员: {member_count})")

            print(f"[微信群列表] ==================== 获取完成 ====================")
            print(f"[微信群列表] [OK] 有效群组: {len(group_list)} 个")
            print(f"[微信群列表] [OK] 过滤临时群: {filtered_count} 个")
            return group_list

        except Exception as e:
            print(f"[微信群列表] [X] 获取失败: {e}")
            import traceback
            print(f"[微信群列表] 详细错误:\n{traceback.format_exc()}")
            return []

    def get_group_messages(self, group_name: str, count: int = 100) -> List[Dict]:
        """获取指定群的消息"""
        print(f"[微信消息] ==================== 开始获取消息 ====================")
        print(f"[微信消息] 目标群: {group_name}")
        print(f"[微信消息] 数量: {count} 条")

        wx = self.get_wx_instance()
        if wx is None:
            print("[微信消息] [X] 微信实例不可用")
            return []

        try:
            # 切换到指定群聊
            print(f"[微信消息] 步骤 1/2: 切换到群聊...")
            wx.ChatWith(who=group_name)
            print(f"[微信消息]   [OK] 已切换到群: {group_name}")

            # 获取消息
            print(f"[微信消息] 步骤 2/2: 读取消息...")
            print(f"[微信消息]   - 调用 GetAllMessage()...")
            msgs = wx.GetAllMessage(
                savepic=False,
                savefile=False,
                savevoice=False
            )
            print(f"[微信消息]   - 原始返回 {len(msgs) if msgs else 0} 条消息")

            if not msgs:
                print("[微信消息] [!] 未获取到任何消息")
                return []

            # 只取最后 count 条
            target_msgs = msgs[-count:] if len(msgs) > count else msgs
            print(f"[微信消息]   - 截取最后 {len(target_msgs)} 条消息")

            message_list = []
            for idx, msg in enumerate(target_msgs, 1):
                sender = msg.sender if hasattr(msg, 'sender') else '未知'
                content = msg.content if hasattr(msg, 'content') else ''
                msg_time = msg.time if hasattr(msg, 'time') else ''
                msg_type = msg.type if hasattr(msg, 'type') else 'unknown'

                message_list.append({
                    'sender': sender,
                    'content': content,
                    'msg_time': msg_time,
                    'msg_type': msg_type
                })

                # 打印前3条和后3条消息的摘要
                if idx <= 3 or idx > len(target_msgs) - 3:
                    content_preview = content[:30] + '...' if len(content) > 30 else content
                    print(f"[微信消息]   [{idx}] [{msg_type}] {sender}: {content_preview}")

            if len(target_msgs) > 6:
                print(f"[微信消息]   ... (中间省略 {len(target_msgs) - 6} 条消息)")

            print(f"[微信消息] ==================== 获取完成 ====================")
            print(f"[微信消息] [OK] 有效消息: {len(message_list)} 条")
            return message_list

        except Exception as e:
            print(f"[微信消息] [X] 获取失败: {e}")
            import traceback
            print(f"[微信消息] 详细错误:\n{traceback.format_exc()}")
            return []

    def load_more_messages(self, group_name: str) -> List[Dict]:
        """加载更多历史消息"""
        print(f"[微信加载更多] ==================== 开始加载更多消息 ====================")
        print(f"[微信加载更多] 目标群: {group_name}")

        wx = self.get_wx_instance()
        if wx is None:
            print("[微信加载更多] [X] 微信实例不可用")
            return []

        try:
            # 确保已切换到目标群
            print(f"[微信加载更多] 步骤 1/3: 切换到群聊...")
            wx.ChatWith(who=group_name)
            print(f"[微信加载更多]   [OK] 已切换到群: {group_name}")

            # 调用 LoadMoreMessage 加载更多
            print(f"[微信加载更多] 步骤 2/3: 调用 LoadMoreMessage...")
            result = wx.LoadMoreMessage(interval=0.3)
            print(f"[微信加载更多]   [OK] LoadMoreMessage 返回: {result}")

            if not result:
                print("[微信加载更多] [!] 可能已经到顶，没有更多消息")
                return []

            # 等待加载完成
            import time
            time.sleep(1)

            # 获取所有消息
            print(f"[微信加载更多] 步骤 3/3: 获取所有消息...")
            msgs = wx.GetAllMessage(savepic=False, savefile=False, savevoice=False)
            print(f"[微信加载更多]   [OK] 获取到 {len(msgs) if msgs else 0} 条消息")

            if not msgs:
                print("[微信加载更多] [!] 未获取到任何消息")
                return []

            # 解析所有消息
            message_list = []
            for idx, msg in enumerate(msgs, 1):
                sender = msg.sender if hasattr(msg, 'sender') else '未知'
                content = msg.content if hasattr(msg, 'content') else ''
                msg_time = msg.time if hasattr(msg, 'time') else ''
                msg_type = msg.type if hasattr(msg, 'type') else 'unknown'

                message_list.append({
                    'sender': sender,
                    'content': content,
                    'msg_time': msg_time,
                    'msg_type': msg_type
                })

            print(f"[微信加载更多] ==================== 加载完成 ====================")
            print(f"[微信加载更多] [OK] 返回消息总数: {len(message_list)} 条")
            return message_list

        except Exception as e:
            print(f"[微信加载更多] [X] 加载失败: {e}")
            import traceback
            print(f"[微信加载更多] 详细错误:\n{traceback.format_exc()}")
            return []

    def get_group_members(self, group_name: str) -> List[str]:
        """获取指定群的成员列表"""
        print(f"[微信群成员] ==================== 开始获取群成员 ====================")
        try:
            print(f"[微信群成员] 目标群: {group_name}")
        except UnicodeEncodeError:
            print(f"[微信群成员] 目标群: (含特殊字符)")

        wx = self.get_wx_instance()
        if wx is None:
            print("[微信群成员] [X] 微信实例不可用")
            return []

        try:
            # 随机延迟（防风控）
            delay = random.uniform(4, 10)
            print(f"[微信群成员] 随机延迟 {delay:.1f} 秒（防风控）...")
            time.sleep(delay)

            # 切换到指定群聊
            print(f"[微信群成员] 步骤 1/2: 切换到群聊...")
            wx.ChatWith(who=group_name)
            try:
                print(f"[微信群成员]   [OK] 已切换到群: {group_name}")
            except UnicodeEncodeError:
                print(f"[微信群成员]   [OK] 已切换到群: (含特殊字符)")

            # 获取群成员
            print(f"[微信群成员] 步骤 2/2: 获取群成员...")
            members = wx.GetGroupMembers()

            if not members:
                print("[微信群成员] [!] 未获取到任何成员")
                return []

            print(f"[微信群成员] ==================== 获取完成 ====================")
            print(f"[微信群成员] [OK] 群成员数量: {len(members)}")

            # 打印前5个和后5个成员
            if len(members) > 0:
                preview_count = min(5, len(members))
                for i in range(preview_count):
                    try:
                        print(f"[微信群成员]   [{i+1}] {members[i]}")
                    except UnicodeEncodeError:
                        print(f"[微信群成员]   [{i+1}] (含特殊字符)")

                if len(members) > 10:
                    print(f"[微信群成员]   ... (中间省略 {len(members) - 10} 个成员)")
                    for i in range(len(members) - 5, len(members)):
                        try:
                            print(f"[微信群成员]   [{i+1}] {members[i]}")
                        except UnicodeEncodeError:
                            print(f"[微信群成员]   [{i+1}] (含特殊字符)")

            return members

        except Exception as e:
            print(f"[微信群成员] [X] 获取失败: {e}")
            import traceback
            print(f"[微信群成员] 详细错误:\n{traceback.format_exc()}")
            return []

    def check_connection(self) -> bool:
        """检查微信连接状态"""
        print("[微信] 检查连接状态...")
        try:
            wx = self.get_wx_instance()
            if wx is None:
                print("[微信] [X] 微信实例为空")
                return False

            has_nickname = hasattr(wx, 'nickname') and wx.nickname
            if has_nickname:
                print(f"[微信] [OK] 连接正常，账号: {wx.nickname}")
            else:
                print("[微信] [X] 实例无效，缺少 nickname")

            return has_nickname
        except Exception as e:
            print(f"[微信] [X] 连接检查失败: {e}")
            return False

    def load_messages_by_date_range(self, group_name: str, date_range: str, batch_load_freq: int = 5, max_iterations: int = 50) -> List[Dict]:
        """
        根据日期范围加载群消息

        Args:
            group_name: 群名称
            date_range: "今天" 或 "近2天"
            batch_load_freq: 批量加载频率，每N次LoadMoreMessage后执行一次GetAllMessage
            max_iterations: 最大循环次数，防止死循环

        Returns:
            消息列表，按时间正序（旧消息在前）
        """
        print(f"[微信日期加载] ==================== 开始按日期加载消息 ====================")
        try:
            print(f"[微信日期加载] 目标群: {group_name}")
        except UnicodeEncodeError:
            print(f"[微信日期加载] 目标群: (含特殊字符)")
        print(f"[微信日期加载] 日期范围: {date_range}")
        print(f"[微信日期加载] 批量加载频率: 每 {batch_load_freq} 次LoadMoreMessage后检查一次时间")

        wx = self.get_wx_instance()
        if wx is None:
            print("[微信日期加载] [X] 微信实例不可用")
            return []

        try:
            # 计算截止时间
            base_time = datetime.now()
            cutoff_time = calculate_cutoff_time(date_range, base_time)
            print(f"[微信日期加载] 截止时间: {cutoff_time.strftime('%Y-%m-%d %H:%M:%S')}")

            # 切换到目标群
            print(f"[微信日期加载] 步骤 1/3: 切换到群聊...")
            wx.ChatWith(who=group_name)
            try:
                print(f"[微信日期加载]   [OK] 已切换到群: {group_name}")
            except UnicodeEncodeError:
                print(f"[微信日期加载]   [OK] 已切换到群: (含特殊字符)")

            iteration = 0
            all_messages = []
            load_count = 0  # 累计LoadMoreMessage次数

            while iteration < max_iterations:
                iteration += 1

                # 批量加载：连续执行batch_load_freq次LoadMoreMessage
                print(f"[微信日期加载] 第 {iteration} 轮批量加载（每轮 {batch_load_freq} 次）...")

                for i in range(batch_load_freq):
                    load_count += 1
                    print(f"[微信日期加载]   - 第 {load_count} 次 LoadMoreMessage...")
                    result = wx.LoadMoreMessage(interval=0.3)

                    if not result:
                        print(f"[微信日期加载]   [!] 已到顶，没有更多消息（第 {load_count} 次时）")
                        break

                    # 等待加载完成
                    time.sleep(0.5)

                # 批量加载后，执行一次GetAllMessage检查时间
                print(f"[微信日期加载] 步骤 2/3: 检查消息时间（已加载 {load_count} 次）...")
                msgs = wx.GetAllMessage(savepic=False, savefile=False, savevoice=False)

                if not msgs:
                    print("[微信日期加载] [!] 未获取到任何消息")
                    break

                print(f"[微信日期加载]   - 当前消息总数: {len(msgs)}")

                # 使用utils函数提取最早时间
                earliest_time = extract_earliest_time_from_messages(msgs, base_time)

                if earliest_time:
                    print(f"[微信日期加载]   - 最早时间: {earliest_time.strftime('%Y-%m-%d %H:%M:%S')}")

                    # 检查是否早于截止时间
                    if earliest_time < cutoff_time:
                        print(f"[微信日期加载]   [OK] 已达到截止时间，停止加载")
                        # 保存当前所有消息
                        all_messages = msgs
                        break
                else:
                    print(f"[微信日期加载]   [!] 无法解析时间，继续加载")

                # 如果上一轮的批量加载提前结束（到顶），则退出
                if not result:
                    all_messages = msgs
                    break

            # 达到最大迭代次数
            if iteration >= max_iterations:
                print(f"[微信日期加载] [!] 达到最大迭代次数 {max_iterations}，停止加载")
                # 获取最终消息
                msgs = wx.GetAllMessage(savepic=False, savefile=False, savevoice=False)
                if msgs:
                    all_messages = msgs

            # 步骤3: 使用utils函数过滤消息
            print(f"[微信日期加载] 步骤 3/3: 过滤消息...")
            filtered_messages = filter_messages_by_date_range(all_messages, cutoff_time, base_time)

            # 打印时间标记（用于调试）
            current_time_context = None
            for msg in all_messages:
                msg_type = msg.type if hasattr(msg, 'type') else ''
                sender = msg.sender if hasattr(msg, 'sender') else ''
                content = msg.content if hasattr(msg, 'content') else ''

                if msg_type == 'sys' and sender == 'SYS':
                    parsed_time = parse_wechat_time(content, base_time)
                    if parsed_time and parsed_time >= cutoff_time:
                        print(f"[微信日期加载]   - 时间标记: {content} -> {parsed_time.strftime('%Y-%m-%d %H:%M:%S')}")

            print(f"[微信日期加载] ==================== 加载完成 ====================")
            print(f"[微信日期加载] [OK] 原始消息: {len(all_messages)} 条")
            print(f"[微信日期加载] [OK] 过滤后消息: {len(filtered_messages)} 条")
            print(f"[微信日期加载] [OK] 循环次数: {iteration}")

            return filtered_messages

        except Exception as e:
            print(f"[微信日期加载] [X] 加载失败: {e}")
            import traceback
            print(f"[微信日期加载] 详细错误:\n{traceback.format_exc()}")
            return []


# 全局单例
wx_manager = WxManager()
