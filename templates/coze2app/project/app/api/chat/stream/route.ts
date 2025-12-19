import { NextRequest } from 'next/server'
import { getAccessToken } from '@/lib/session'
import { chatStream } from '@/lib/coze-api'

export async function POST(request: NextRequest) {
  try {
    const token = await getAccessToken()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token未配置' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const botId = body.bot_id
    const message = body.message
    const conversationId = body.conversation_id
    const fileIds = body.file_ids || []

    if (!botId || !message) {
      return new Response(JSON.stringify({ error: '缺少bot_id或message参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 获取流式响应
    const stream = await chatStream(token, botId, message, conversationId, fileIds)

    if (!stream) {
      throw new Error('无法获取响应流')
    }

    // 返回流式响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[ERROR] Chat stream failed:', error)
    return new Response(
      JSON.stringify({ error: `对话失败: ${error instanceof Error ? error.message : String(error)}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
