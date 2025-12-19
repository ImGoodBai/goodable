import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/session'

export async function POST() {
  try {
    await clearSession()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ERROR] Clear session failed:', error)
    return NextResponse.json(
      { error: `清除失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
