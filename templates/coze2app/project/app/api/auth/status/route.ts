import { NextResponse } from 'next/server'
import { getAccessToken, getSession } from '@/lib/session'

export async function GET() {
  try {
    const token = await getAccessToken()
    const hasToken = !!token

    const result: any = { configured: hasToken }

    if (hasToken) {
      const session = await getSession()
      if (session.token_configured_at) {
        const configuredAt = new Date(session.token_configured_at)
        result.configured_at = configuredAt.toLocaleString('zh-CN')
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[ERROR] Check auth status failed:', error)
    return NextResponse.json(
      { error: `检查状态失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
