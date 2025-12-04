/**
 * POST /api/projects/[project_id]/install-dependencies
 * Run npm install (or equivalent) for a project workspace.
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
      message: 'Install dependencies request',
      projectId: project_id,
      component: 'api',
      event: 'api.request',
      metadata: { path: '/api/projects/[project_id]/install-dependencies', method: 'POST' }
    });
    const result = await previewManager.installDependencies(project_id);

    await timelineLogger.append({
      type: 'api',
      level: 'info',
      message: 'Install dependencies response',
      projectId: project_id,
      component: 'api',
      event: 'api.response',
      metadata: { code: 0, msg: 'ok', data: { logCount: result.logs.length } }
    });
    return NextResponse.json({
      success: true,
      logs: result.logs,
    });
  } catch (error) {
    console.error('[API] Failed to install dependencies:', error);
    const msg = error instanceof Error ? error.message : 'Failed to install dependencies';
    const { params } = arguments[1] as RouteContext;
    try {
      const { project_id } = await params;
      await timelineLogger.append({
        type: 'api',
        level: 'error',
        message: 'Install dependencies response',
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
