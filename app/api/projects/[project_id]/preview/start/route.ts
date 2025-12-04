/**
 * POST /api/projects/[id]/preview/start
 * Launches the development server for a project and returns the preview URL.
 */

import { NextResponse } from 'next/server';
import { previewManager } from '@/lib/services/preview';
import { timelineLogger } from '@/lib/services/timeline';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const { project_id } = await params;
    await timelineLogger.append({
      type: 'api',
      level: 'info',
      message: 'Preview start request',
      projectId: project_id,
      component: 'api',
      event: 'api.request',
      metadata: { path: '/api/projects/[id]/preview/start', method: 'POST' }
    });
    const preview = await previewManager.start(project_id);

    await timelineLogger.append({
      type: 'api',
      level: 'info',
      message: 'Preview start response',
      projectId: project_id,
      component: 'api',
      event: 'api.response',
      metadata: { code: 0, msg: 'ok', data: preview }
    });
    return NextResponse.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    console.error('[API] Failed to start preview:', error);
    const msg = error instanceof Error ? error.message : 'Failed to start preview';
    const { params } = arguments[1] as RouteContext;
    try {
      const { project_id } = await params;
      await timelineLogger.append({
        type: 'api',
        level: 'error',
        message: 'Preview start response',
        projectId: project_id,
        component: 'api',
        event: 'api.response',
        metadata: { code: -1, msg }
      });
    } catch {}
    return NextResponse.json(
      {
        success: false,
        error: msg,
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
