import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, getSpaceId } from '@/lib/session'
import { getWorkflows } from '@/lib/coze-api'

export async function GET(request: NextRequest) {
  try {
    const token = await getAccessToken()
    if (!token) {
      return NextResponse.json({ error: 'Token未配置' }, { status: 401 })
    }

    const spaceId = await getSpaceId()
    if (!spaceId) {
      return NextResponse.json({ error: 'space_id未配置，请先配置工作空间ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const pageNum = parseInt(searchParams.get('page_num') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '50')

    const data = await getWorkflows(token, spaceId, pageNum, pageSize)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[ERROR] Get workflows failed:', error)
    return NextResponse.json(
      { error: `获取工作流列表失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
