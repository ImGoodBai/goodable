const COZE_API_BASE = process.env.COZE_API_BASE || 'https://api.coze.cn'

export interface CozeApiConfig {
  token: string
}

// 验证 Token 是否有效
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${COZE_API_BASE}/v3/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    // 返回码不是401/403表示token有效
    return ![401, 403].includes(response.status)
  } catch {
    return false
  }
}

// 获取工作空间列表
export async function getWorkspaces(token: string) {
  console.log('[DEBUG] getWorkspaces - calling API')

  const response = await fetch(`${COZE_API_BASE}/v1/workspaces`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  console.log('[DEBUG] getWorkspaces - status:', response.status)
  const data = await response.json()
  console.log('[DEBUG] getWorkspaces - response:', JSON.stringify(data, null, 2))

  if (!response.ok) {
    throw new Error(`获取工作空间列表失败: ${JSON.stringify(data)}`)
  }

  return data
}

// 获取 Bot 列表
export async function getBots(token: string, spaceId: string, pageIndex = 1, pageSize = 50) {
  const url = new URL(`${COZE_API_BASE}/v1/bots`)
  url.searchParams.set('workspace_id', spaceId)
  url.searchParams.set('page_index', String(pageIndex))
  url.searchParams.set('page_size', String(pageSize))

  console.log('[DEBUG] getBots - URL:', url.toString())
  console.log('[DEBUG] getBots - workspace_id:', spaceId)

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  console.log('[DEBUG] getBots - status:', response.status)
  const data = await response.json()
  console.log('[DEBUG] getBots - response:', JSON.stringify(data, null, 2))

  if (!response.ok) {
    throw new Error(`获取Bot列表失败: ${JSON.stringify(data)}`)
  }

  return data
}

// 获取工作流列表
export async function getWorkflows(token: string, spaceId: string, pageNum = 1, pageSize = 50) {
  const url = new URL(`${COZE_API_BASE}/v1/workflows`)
  url.searchParams.set('workspace_id', spaceId)
  url.searchParams.set('page_num', String(pageNum))
  url.searchParams.set('page_size', String(pageSize))

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`获取工作流列表失败: ${await response.text()}`)
  }

  return response.json()
}

// 上传文件
export async function uploadFile(token: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${COZE_API_BASE}/v1/files/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`上传失败: ${await response.text()}`)
  }

  return response.json()
}

// 执行工作流
export async function runWorkflow(
  token: string,
  workflowId: string,
  parameters: Record<string, any> = {}
) {
  const response = await fetch(`${COZE_API_BASE}/v1/workflow/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      parameters,
    }),
  })

  if (!response.ok) {
    throw new Error(`执行工作流失败: ${await response.text()}`)
  }

  return response.json()
}

// 流式聊天
export async function chatStream(
  token: string,
  botId: string,
  message: string,
  conversationId?: string,
  fileIds: string[] = []
) {
  let additionalMessages: any[]

  if (fileIds.length > 0) {
    const contentList = [{ type: 'text', text: message }]
    fileIds.forEach(fileId => {
      contentList.push({ type: 'image', file_id: fileId })
    })
    additionalMessages = [{
      role: 'user',
      content: JSON.stringify(contentList),
      content_type: 'object_string',
    }]
  } else {
    additionalMessages = [{
      role: 'user',
      content: message,
      content_type: 'text',
    }]
  }

  const chatData: any = {
    bot_id: botId,
    user_id: 'demo_user',
    stream: true,
    auto_save_history: false,
    additional_messages: additionalMessages,
  }

  if (conversationId) {
    chatData.conversation_id = conversationId
  }

  const response = await fetch(`${COZE_API_BASE}/v3/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(chatData),
  })

  if (!response.ok) {
    throw new Error(`对话失败: ${await response.text()}`)
  }

  return response.body
}
