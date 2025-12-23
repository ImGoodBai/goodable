import { NextRequest, NextResponse } from 'next/server'
import { getSpaceId, setSpaceId } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const spaceId = body.space_id?.trim()

    if (!spaceId) {
      return NextResponse.json({ error: 'space_id不能为空' }, { status: 400 })
    }

    await setSpaceId(spaceId)

    return NextResponse.json({ success: true, message: 'space_id配置成功' })
  } catch (error) {
    console.error('[ERROR] Config space_id failed:', error)
    return NextResponse.json(
      { error: `配置失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const spaceId = await getSpaceId()

    if (!spaceId) {
      return NextResponse.json({ error: 'space_id未配置' }, { status: 404 })
    }

    return NextResponse.json({ space_id: spaceId })
  } catch (error) {
    console.error('[ERROR] Get space_id failed:', error)
    return NextResponse.json(
      { error: `获取失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
