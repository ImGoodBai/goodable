import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const session = await getSession()
    const hasToken = !!session.access_token

    const result: any = { configured: hasToken }

    if (hasToken && session.token_configured_at) {
      const configuredAt = new Date(session.token_configured_at)
      result.configured_at = configuredAt.toLocaleString('zh-CN')
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
