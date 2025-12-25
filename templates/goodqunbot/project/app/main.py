import sys
import io
import os
import logging

# 强制设置环境编码为UTF-8
os.environ['PYTHONIOENCODING'] = 'utf-8'

# 设置标准输出为UTF-8，使用replace策略处理无法编码的字符
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
elif hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ],
    force=True
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import hashlib
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

from app import database
from app.wx_manager import wx_manager
from app.models import (
    GroupListResponse, MessageListResponse, GroupModel, MessageModel,
    SummaryModel, CreateSummaryRequest, SummaryListResponse, SummaryDetailResponse,
    SummaryStatsResponse, GroupMemberModel, GroupMemberListResponse, RefreshMembersResponse
)
from app.utils import truncate_message


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    print("[应用] 启动中...")
    # 初始化数据库
    await database.init_database()
    print("[应用] 启动完成")
    yield
    print("[应用] 关闭中...")


app = FastAPI(
    title="微信群消息助手",
    description="微信群消息查看和总结工具",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/health")
async def health_check():
    """健康检查端点（必需）"""
    print("[健康检查] 执行健康检查")
    wx_status = wx_manager.check_connection()
    return {
        "status": "ok",
        "wechat_connected": wx_status
    }


@app.get("/", response_class=HTMLResponse)
async def root():
    """主页"""
    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    index_path = os.path.join(static_dir, "index.html")

    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    else:
        return HTMLResponse(content="<h1>静态文件未找到</h1>")


@app.post("/api/groups/refresh")
async def refresh_groups():
    """刷新群列表（从微信拉取并存入数据库）"""
    print("[API] 开始刷新群列表")

    try:
        # 从微信获取群列表
        groups = wx_manager.get_group_list()

        if not groups:
            print("[API] 未获取到任何群组")
            return {"message": "未获取到群组，请检查微信是否登录", "count": 0}

        # 存入数据库
        inserted_count = 0
        for group in groups:
            group_id = await database.insert_group(
                name=group['name'],
                member_count=group.get('member_count', 0)
            )
            if group_id:
                inserted_count += 1

        print(f"[API] 刷新完成，新增/更新 {inserted_count} 个群组")
        return {
            "message": "刷新成功",
            "count": len(groups),
            "inserted": inserted_count
        }

    except Exception as e:
        print(f"[API] 刷新群列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"刷新失败: {str(e)}")


@app.get("/api/groups", response_model=GroupListResponse)
async def get_groups():
    """获取群组列表（从数据库）"""
    print("[API] 查询群组列表")

    try:
        groups_data = await database.get_all_groups()
        groups = [GroupModel(**g) for g in groups_data]

        return GroupListResponse(
            groups=groups,
            total=len(groups)
        )

    except Exception as e:
        print(f"[API] 查询群组列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/groups/{group_name}/messages", response_model=MessageListResponse)
async def get_group_messages(group_name: str, count: int = 100):
    """获取指定群的消息（直接从微信获取，不存储）"""
    print(f"[API] 查询群 '{group_name}' 的消息，数量: {count}")

    try:
        # 检查群是否存在
        group = await database.get_group_by_name(group_name)
        if not group:
            print(f"[API] 群 '{group_name}' 不存在")
            raise HTTPException(status_code=404, detail="群组不存在，请先刷新群列表")

        # 直接从微信获取消息
        messages = wx_manager.get_group_messages(group_name, count)

        # 构造返回模型
        messages_models = [
            MessageModel(
                group_id=group['id'],
                sender=msg['sender'],
                content=msg['content'],
                msg_time=msg['msg_time'],
                msg_type=msg.get('msg_type', 'unknown')
            ) for msg in messages
        ]

        return MessageListResponse(
            messages=messages_models,
            total=len(messages_models),
            group_name=group_name
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] 获取消息失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取消息失败: {str(e)}")


@app.get("/api/wechat/status")
async def wechat_status():
    """检查微信连接状态"""
    print("[API] 检查微信连接状态")
    connected = wx_manager.check_connection()
    return {
        "connected": connected,
        "message": "微信已连接" if connected else "微信未连接，请确保微信PC端已登录"
    }


@app.post("/api/groups/{group_name}/messages/load-more")
async def load_more_messages(group_name: str):
    """加载更多历史消息（直接从微信获取，不存储）"""
    print(f"[API] 加载更多消息，群: '{group_name}'")

    try:
        # 检查群是否存在
        group = await database.get_group_by_name(group_name)
        if not group:
            print(f"[API] 群 '{group_name}' 不存在")
            raise HTTPException(status_code=404, detail="群组不存在，请先刷新群列表")

        # 直接从微信加载更多消息
        all_messages = wx_manager.load_more_messages(group_name)

        if not all_messages:
            print("[API] 没有更多消息")
            return {
                "new_messages": [],
                "total": 0,
                "has_more": False
            }

        # 构造返回数据
        new_messages_models = [
            MessageModel(
                group_id=group['id'],
                sender=msg['sender'],
                content=msg['content'],
                msg_time=msg['msg_time'],
                msg_type=msg.get('msg_type', 'unknown')
            ) for msg in all_messages
        ]

        return {
            "new_messages": [msg.dict() for msg in new_messages_models],
            "total": len(new_messages_models),
            "has_more": len(all_messages) > 0
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] 加载更多消息失败: {e}")
        raise HTTPException(status_code=500, detail=f"加载失败: {str(e)}")


@app.get("/api/groups/{group_id}/members", response_model=GroupMemberListResponse)
async def get_group_members(group_id: int):
    """获取群成员列表（从数据库）"""
    print(f"[API] 查询群成员列表，group_id: {group_id}")

    try:
        # 获取群组信息
        groups = await database.get_all_groups()
        group = next((g for g in groups if g['id'] == group_id), None)
        if not group:
            print(f"[API] 群 {group_id} 不存在")
            raise HTTPException(status_code=404, detail="群组不存在")

        # 获取群成员列表
        members_data = await database.get_members_by_group_id(group_id)
        members = [GroupMemberModel(**m) for m in members_data]

        return GroupMemberListResponse(
            members=members,
            total=len(members),
            group_id=group_id,
            group_name=group['name'],
            member_count=group.get('member_count', 0),
            refreshed_at=group.get('members_refreshed_at')
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] 查询群成员失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.post("/api/groups/{group_id}/members/refresh", response_model=RefreshMembersResponse)
async def refresh_group_members(group_id: int):
    """刷新群成员（从微信获取并存表）"""
    print(f"[API] 刷新群成员，group_id: {group_id}")

    try:
        # 获取群组信息
        groups = await database.get_all_groups()
        group = next((g for g in groups if g['id'] == group_id), None)
        if not group:
            print(f"[API] 群 {group_id} 不存在")
            raise HTTPException(status_code=404, detail="群组不存在")

        group_name = group['name']

        # 从微信获取群成员
        print(f"[API] 从微信获取群成员: {group_name}")
        members = wx_manager.get_group_members(group_name)

        if not members:
            print("[API] 未获取到群成员")
            raise HTTPException(status_code=500, detail="获取群成员失败，请检查微信连接")

        # 存储到数据库
        member_count = await database.insert_group_members(group_id, members)

        # 获取刷新时间
        from datetime import datetime
        refreshed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        print(f"[API] 群成员刷新成功: {member_count} 人")
        return RefreshMembersResponse(
            success=True,
            message=f"成功刷新 {member_count} 个成员",
            member_count=member_count,
            refreshed_at=refreshed_at
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] 刷新群成员失败: {e}")
        raise HTTPException(status_code=500, detail=f"刷新失败: {str(e)}")


@app.post("/api/summaries")
async def create_summary(request: CreateSummaryRequest):
    """创建总结任务"""
    logger.info("=" * 60)
    logger.info(f"开始创建总结任务 - 群: {request.group_name}, 日期: {request.date_range}")
    print(f"[API] ==================== 开始创建总结任务 ====================")
    print(f"[API] 群名称: {request.group_name}")
    print(f"[API] 日期范围: {request.date_range}")

    try:
        # 检查群是否存在
        group = await database.get_group_by_name(request.group_name)
        if not group:
            logger.warning(f"群 '{request.group_name}' 不存在")
            print(f"[API] 群 '{request.group_name}' 不存在")
            raise HTTPException(status_code=404, detail="群组不存在，请先刷新群列表")

        # 创建总结任务
        summary_id = await database.create_summary(
            group_id=group['id'],
            group_name=request.group_name,
            date_range=request.date_range
        )

        if not summary_id:
            raise HTTPException(status_code=500, detail="创建总结任务失败")

        logger.info(f"创建总结任务成功: ID={summary_id}")

        # 更新状态为处理中
        await database.update_summary_status(summary_id, 'processing')

        try:
            # 从微信加载消息
            logger.info(f"开始加载消息 - 群: {request.group_name}, 日期: {request.date_range}, 批量加载频率: {request.batch_load_freq}")
            print(f"[API] 开始从微信加载消息，群: {request.group_name}, 日期范围: {request.date_range}, 批量加载频率: {request.batch_load_freq}")
            messages = wx_manager.load_messages_by_date_range(
                group_name=request.group_name,
                date_range=request.date_range,
                batch_load_freq=request.batch_load_freq
            )

            logger.info(f"消息加载完成: {len(messages)} 条")
            print(f"[API] 消息加载结果: {len(messages)} 条")

            # 读取环境变量
            message_max_length = int(os.getenv('MESSAGE_MAX_LENGTH', '500'))
            debug_mode = os.getenv('DEBUG', 'False').lower() == 'true'

            # 处理0条消息的情况
            if not messages:
                logger.info("该时间段暂无消息，生成空总结")
                print(f"[API] [!] 该时间段暂无消息")
                summary_content = f"# 群聊总结\n\n**{request.date_range}**暂无消息"

                # 更新总结状态为完成
                await database.update_summary_status(
                    summary_id=summary_id,
                    status='completed',
                    summary_content=summary_content,
                    message_count=0
                )

                logger.info(f"总结任务完成 - Summary ID: {summary_id}, 消息数: 0")
                print(f"[API] 总结任务完成: {summary_id}")
                return {
                    "summary_id": summary_id,
                    "message": "总结任务完成（该时间段暂无消息）",
                    "message_count": 0
                }

            # 消息预处理并存储
            logger.info(f"开始保存消息 - 总数: {len(messages)}, 最大长度: {message_max_length}")
            print(f"[API] 开始预处理并存储消息，消息最大长度: {message_max_length}")
            saved_count = 0
            failed_count = 0

            for idx, msg in enumerate(messages, 1):
                try:
                    # 生成消息hash（用于去重）
                    msg_hash = hashlib.md5(
                        f"{msg['sender']}_{msg['content']}_{msg['msg_time']}".encode()
                    ).hexdigest()

                    # 截断消息
                    truncated_content = truncate_message(msg['content'], message_max_length)

                    # 存储消息
                    result = await database.insert_message(
                        group_id=group['id'],
                        sender=msg['sender'],
                        content=truncated_content,
                        msg_time=msg['msg_time'],
                        msg_type=msg.get('msg_type', 'unknown'),
                        msg_hash=msg_hash,
                        summary_id=summary_id,
                        msg_timestamp=msg.get('msg_timestamp')
                    )

                    if result:
                        saved_count += 1
                    else:
                        if debug_mode:
                            print(f"[API] 消息 {idx} 已存在（重复）: {msg_hash[:8]}...")

                    if debug_mode and idx <= 3:
                        print(f"[API] 消息 {idx}: {msg['sender']} - {truncated_content[:50]}...")

                except Exception as e:
                    failed_count += 1
                    print(f"[API] [X] 保存消息 {idx} 失败: {type(e).__name__}")
                    print(f"[API] 错误详情: {str(e)[:200]}")
                    if debug_mode:
                        try:
                            import traceback
                            print(f"[API] 堆栈:\n{traceback.format_exc()}")
                        except:
                            pass

            logger.info(f"消息保存完成 - 成功: {saved_count}, 失败: {failed_count}")
            print(f"[API] 消息存储完成，共 {len(messages)} 条，成功 {saved_count}，失败 {failed_count}")

            # 调用OpenAI生成总结
            logger.info("准备调用OpenAI生成总结")
            openai_api_key = os.getenv('OPENAI_API_KEY')
            openai_api_base = os.getenv('OPENAI_API_BASE', 'https://api.openai.com/v1')
            openai_model = os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')

            if not openai_api_key:
                logger.warning("未配置OPENAI_API_KEY，跳过AI总结")
                print("[API] [!] 未配置OPENAI_API_KEY，跳过AI总结")
                summary_content = f"# 群聊总结\n\n共 {len(messages)} 条消息\n\n（未配置OpenAI API Key，无法生成AI总结）"
            else:
                # 拼接消息文本
                messages_text = "\n\n".join([
                    f"[{msg['msg_time']}] {msg['sender']}: {truncate_message(msg['content'], message_max_length)}"
                    for msg in messages
                ])

                # 调用OpenAI API
                try:
                    import openai
                    openai.api_key = openai_api_key
                    openai.api_base = openai_api_base

                    logger.info(f"OpenAI配置 - Base: {openai_api_base}, Model: {openai_model}")
                    print(f"[API] OpenAI配置 - Base: {openai_api_base}, Model: {openai_model}")

                    system_message = "你是一个专业的会议记录助手，擅长总结群聊内容。"
                    prompt = f"""请对以下微信群聊记录进行总结，输出Markdown格式：

{messages_text}

要求：
1. 提炼重点讨论内容
2. 列出关键决策和待办事项
3. 使用Markdown格式，包含标题、列表等
4. 简洁明了，突出重点"""

                    # DEBUG模式下打印请求内容
                    if debug_mode:
                        print(f"[API] ==================== LLM调用请求 ====================")
                        print(f"[API] System Message: {system_message}")
                        print(f"[API] User Prompt 总长度: {len(prompt)} 字符")

                        # 截断显示prompt（头500字+尾500字）
                        if len(prompt) > 1200:
                            prompt_preview = prompt[:500] + f"\n\n... [中间省略 {len(prompt) - 1000} 字符] ...\n\n" + prompt[-500:]
                            print(f"[API] User Prompt 内容预览:\n{prompt_preview}")
                        else:
                            print(f"[API] User Prompt 内容:\n{prompt}")

                        print(f"[API] ==================== 开始调用LLM ====================")

                    response = openai.ChatCompletion.create(
                        model=openai_model,
                        messages=[
                            {"role": "system", "content": system_message},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.7,
                        max_tokens=2000
                    )

                    summary_content = response.choices[0].message.content
                    logger.info(f"OpenAI调用成功 - 总结长度: {len(summary_content)} 字符")

                    # DEBUG模式下打印响应内容
                    if debug_mode:
                        print(f"[API] ==================== LLM调用响应 ====================")
                        print(f"[API] Response 总长度: {len(summary_content)} 字符")

                        # 截断显示response（头300字+尾300字）
                        if len(summary_content) > 800:
                            response_preview = summary_content[:300] + f"\n\n... [中间省略 {len(summary_content) - 600} 字符] ...\n\n" + summary_content[-300:]
                            print(f"[API] Response 内容预览:\n{response_preview}")
                        else:
                            print(f"[API] Response 内容:\n{summary_content}")

                        print(f"[API] ==================== LLM调用完成 ====================")

                except Exception as e:
                    logger.error(f"OpenAI调用失败: {str(e)[:200]}")
                    print(f"[API] [X] OpenAI调用失败: {str(e)[:200]}")
                    if debug_mode:
                        import traceback
                        try:
                            print(f"[API] 详细错误:\n{traceback.format_exc()}")
                        except:
                            print(f"[API] 详细错误: (无法打印完整错误)")
                    summary_content = f"# 群聊总结\n\n共 {len(messages)} 条消息\n\n（AI总结生成失败）"

            # 更新总结结果
            logger.info(f"更新总结状态为completed - Summary ID: {summary_id}")
            await database.update_summary_status(
                summary_id=summary_id,
                status='completed',
                summary_content=summary_content,
                message_count=len(messages)
            )

            logger.info(f"总结任务完成 - Summary ID: {summary_id}, 消息数: {len(messages)}")
            print(f"[API] 总结任务完成: {summary_id}")
            return {
                "summary_id": summary_id,
                "message": "总结任务完成",
                "message_count": len(messages)
            }

        except Exception as e:
            # 更新状态为失败
            print(f"[API] [X] 执行过程中发生异常")
            print(f"[API] 异常类型: {type(e).__name__}")
            print(f"[API] 异常信息: {str(e)[:500]}")
            try:
                import traceback
                print(f"[API] 完整堆栈:")
                print(traceback.format_exc())
            except:
                pass
            await database.update_summary_status(summary_id, 'failed')
            raise

    except HTTPException:
        raise
    except Exception as e:
        # 安全处理异常信息，避免GBK编码错误
        print(f"[API] [X] 顶层异常捕获")
        print(f"[API] 异常类型: {type(e).__name__}")
        try:
            error_msg = str(e)
            print(f"[API] 原始错误信息: {error_msg[:500]}")
            # 移除可能导致编码错误的特殊字符
            error_msg_safe = error_msg.encode('ascii', errors='replace').decode('ascii')
            print(f"[API] 创建总结任务失败: {error_msg_safe[:200]}")
            raise HTTPException(status_code=500, detail=f"创建失败: {error_msg_safe[:200]}")
        except HTTPException:
            raise
        except:
            print(f"[API] 创建总结任务失败: (错误信息包含特殊字符)")
            raise HTTPException(status_code=500, detail="创建失败: 内部错误")


@app.get("/api/summaries", response_model=SummaryListResponse)
async def get_summaries():
    """获取总结任务列表"""
    print("[API] 查询总结任务列表")

    try:
        summaries_data = await database.get_all_summaries()
        summaries = [SummaryModel(**s) for s in summaries_data]

        return SummaryListResponse(
            summaries=summaries,
            total=len(summaries)
        )

    except Exception as e:
        print(f"[API] 查询总结列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/summaries/{summary_id}", response_model=SummaryDetailResponse)
async def get_summary_detail(summary_id: int):
    """获取总结详情"""
    print(f"[API] 查询总结详情: {summary_id}")

    try:
        # 获取总结信息
        summary_data = await database.get_summary_by_id(summary_id)
        if not summary_data:
            raise HTTPException(status_code=404, detail="总结任务不存在")

        # 获取关联的消息
        messages_data = await database.get_messages_by_summary_id(summary_id)
        messages = [MessageModel(**m) for m in messages_data]

        return SummaryDetailResponse(
            summary=SummaryModel(**summary_data),
            messages=messages
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] 查询总结详情失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/summaries/{summary_id}/messages", response_model=MessageListResponse)
async def get_summary_messages(summary_id: int):
    """获取总结的原始消息列表"""
    print(f"[API] 查询总结消息: {summary_id}")

    try:
        # 获取总结信息
        summary_data = await database.get_summary_by_id(summary_id)
        if not summary_data:
            raise HTTPException(status_code=404, detail="总结任务不存在")

        # 获取关联的消息
        messages_data = await database.get_messages_by_summary_id(summary_id)
        messages = [MessageModel(**m) for m in messages_data]

        return MessageListResponse(
            messages=messages,
            total=len(messages),
            group_name=summary_data['group_name']
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] 查询总结消息失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/summaries/{summary_id}/stats", response_model=SummaryStatsResponse)
async def get_summary_stats(summary_id: int):
    """获取总结的统计数据"""
    print(f"[API] 查询总结统计数据: {summary_id}")

    try:
        # 获取统计数据
        stats_data = await database.get_summary_stats(summary_id)
        if not stats_data:
            raise HTTPException(status_code=404, detail="总结任务不存在")

        return SummaryStatsResponse(**stats_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] 查询统计数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


