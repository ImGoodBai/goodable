import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/coze-api'
import { setAccessToken } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = body.token?.trim()

    if (!token) {
      return NextResponse.json({ error: 'Token不能为空' }, { status: 400 })
    }

    // 验证token
    const isValid = await verifyToken(token)
    if (!isValid) {
      return NextResponse.json({ error: 'Token无效或已过期' }, { status: 401 })
    }

    // 存储token到session
    await setAccessToken(token)

    return NextResponse.json({
      success: true,
      message: 'Token配置成功',
    })
  } catch (error) {
    console.error('[ERROR] Config token failed:', error)
    return NextResponse.json(
      { error: `配置Token失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
