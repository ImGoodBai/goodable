import { NextResponse } from 'next/server';
import { listProjectServices } from '@/lib/services/project-services';
import { timelineLogger } from '@/lib/services/timeline';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    try {
      await timelineLogger.append({
        type: 'api',
        level: 'info',
        message: 'List project services request',
        projectId: project_id,
        component: 'api',
        event: 'services.request'
      });
    } catch {}
    const services = await listProjectServices(project_id);
    const payload = services.map((service) => ({
      ...service,
      service_data: service.serviceData,
    }));
    try {
      await timelineLogger.append({
        type: 'api',
        level: 'info',
        message: 'List project services response',
        projectId: project_id,
        component: 'api',
        event: 'services.response',
        metadata: { count: payload.length }
      });
    } catch {}
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[API] Failed to load project services:', error);
    try {
      const { project_id } = await params;
      await timelineLogger.append({
        type: 'api',
        level: 'error',
        message: 'List project services failed',
        projectId: project_id,
        component: 'api',
        event: 'services.error',
        metadata: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
      await timelineLogger.append({
        type: 'api',
        level: 'info',
        message: 'Graceful degrade: return empty services',
        projectId: project_id,
        component: 'api',
        event: 'services.degrade'
      });
    } catch {}
    return NextResponse.json([]);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
