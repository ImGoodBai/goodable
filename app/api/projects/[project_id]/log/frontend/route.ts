import { NextResponse } from 'next/server'
import { timelineLogger } from '@/lib/services/timeline'

interface RouteContext {
  params: Promise<{ project_id: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { project_id } = await params
    const body = await request.json().catch(() => ({}))
    const event = typeof body?.event === 'string' ? body.event : undefined
    const message = typeof body?.message === 'string' ? body.message : ''
    const level = body?.level === 'warn' ? 'warn' : body?.level === 'error' ? 'error' : 'info'
    const metadata = typeof body?.metadata === 'object' && body?.metadata ? body.metadata : undefined
    const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined

    await timelineLogger.append({
      type: 'frontend',
      level,
      message: message || (event ?? ''),
      projectId: project_id,
      taskId,
      component: 'frontend',
      event,
      metadata
    })

    return NextResponse.json({ code: 0, msg: 'ok', data: null })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to log frontend event'
    return NextResponse.json({ code: -1, msg, data: null }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
