/**
 * POST /api/chat/[project_id]/interrupt - 中断正在执行的任务
 */

import { NextRequest, NextResponse } from 'next/server';
import { interruptTask } from '@/lib/services/cli/claude';
import { requestCancelForUserRequest } from '@/lib/services/user-requests';
import { streamManager } from '@/lib/services/stream';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { project_id } = await params;

  try {
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: 'Missing requestId' },
        { status: 400 }
      );
    }

    console.log(`[Interrupt API] 🛑 Interrupting task: ${requestId} for project: ${project_id}`);

    const result = await interruptTask(requestId, project_id);

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      // Fallback: mark cancel requested so SDK loop can pick up and stop
      await requestCancelForUserRequest(requestId);
      console.log(`[Interrupt API] 已写入中断标记: ${requestId}`);
      // Announce interrupt immediately for better UX
      try {
        streamManager.publish(project_id, {
          type: 'task_interrupted',
          data: {
            projectId: project_id,
            requestId,
            timestamp: new Date().toISOString(),
            message: '任务已被用户中断（接口兜底）'
          }
        });
        console.log(`[Interrupt API] 已推送任务中断事件: ${requestId}`);
      } catch {}
      return NextResponse.json({ success: true, scheduled: true });
    }
  } catch (error: any) {
    console.error('[Interrupt API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
