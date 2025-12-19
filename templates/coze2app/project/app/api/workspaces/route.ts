import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/session'
import { getWorkspaces } from '@/lib/coze-api'

export async function GET() {
  try {
    const token = await getAccessToken()
    if (!token) {
      return NextResponse.json({ error: 'Token未配置' }, { status: 401 })
    }

    const data = await getWorkspaces(token)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[ERROR] Get workspaces failed:', error)
    return NextResponse.json(
      { error: `获取工作空间列表失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
