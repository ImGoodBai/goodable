import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, getSession } from '@/lib/session'
import { getBots } from '@/lib/coze-api'

export async function GET(request: NextRequest) {
  try {
    const token = await getAccessToken()
    if (!token) {
      return NextResponse.json({ error: 'Token未配置' }, { status: 401 })
    }

    const session = await getSession()
    const spaceId = session.space_id
    if (!spaceId) {
      return NextResponse.json({ error: 'space_id未配置，请先配置工作空间ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const pageIndex = parseInt(searchParams.get('page_index') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '50')

    const data = await getBots(token, spaceId, pageIndex, pageSize)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[ERROR] Get bots failed:', error)
    return NextResponse.json(
      { error: `获取Bot列表失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
