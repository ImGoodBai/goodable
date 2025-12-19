import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/session'
import { runWorkflow } from '@/lib/coze-api'

export async function POST(request: NextRequest) {
  try {
    const token = await getAccessToken()
    if (!token) {
      return NextResponse.json({ error: 'Token未配置' }, { status: 401 })
    }

    const body = await request.json()
    const workflowId = body.workflow_id
    const parameters = body.parameters || {}

    if (!workflowId) {
      return NextResponse.json({ error: '缺少workflow_id参数' }, { status: 400 })
    }

    const data = await runWorkflow(token, workflowId, parameters)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[ERROR] Workflow run failed:', error)
    return NextResponse.json(
      { error: `执行工作流失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
