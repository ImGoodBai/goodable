import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const token = await getAccessToken()
    if (!token) {
      return NextResponse.json({ error: 'Token未配置' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file || !file.name) {
      return NextResponse.json({ error: '没有文件或文件名为空' }, { status: 400 })
    }

    // 转发到 Coze API
    const cozeFormData = new FormData()
    cozeFormData.append('file', file)

    const response = await fetch(`${process.env.COZE_API_BASE || 'https://api.coze.cn'}/v1/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: cozeFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: `上传失败: ${errorText}` }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[ERROR] File upload failed:', error)
    return NextResponse.json(
      { error: `文件上传失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
