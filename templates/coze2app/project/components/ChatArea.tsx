'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Bot {
  id: string  // 修复：实际字段是 id
  name: string
}

interface Workflow {
  workflow_id: string
  name: string
  icon_url?: string  // 添加图标字段
}

interface ChatAreaProps {
  selectedBot: Bot | null
  selectedWorkflow: Workflow | null
}

export default function ChatArea({ selectedBot, selectedWorkflow }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string>()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 切换 Bot/工作流时清空消息和文件
    setMessages([])
    setConversationId(undefined)
    setSelectedFiles([])
    setUploadedFileIds([])
  }, [selectedBot, selectedWorkflow])

  useEffect(() => {
    // 自动滚动到底部
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 文件选择处理
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setSelectedFiles((prev) => [...prev, ...files])
    setUploading(true)

    // 上传文件
    const fileIds: string[] = []
    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        })

        const data = await res.json()
        if (res.ok && data.data?.id) {
          fileIds.push(data.data.id)
          console.log('文件上传成功:', file.name, '-> ID:', data.data.id)
        } else {
          console.error('文件上传失败:', file.name, data.error)
          alert(`文件上传失败: ${file.name}`)
        }
      } catch (error) {
        console.error('文件上传失败:', file.name, error)
        alert(`文件上传失败: ${file.name}`)
      }
    }

    setUploadedFileIds((prev) => [...prev, ...fileIds])
    setUploading(false)

    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 移除文件
  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setUploadedFileIds((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    if (!input.trim()) return

    if (selectedBot) {
      await handleBotChat()
    } else if (selectedWorkflow) {
      await handleWorkflowRun()
    }
  }

  const handleBotChat = async () => {
    if (!selectedBot) return

    const userMessage = input.trim()
    const fileIds = [...uploadedFileIds] // 复制当前文件ID
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    // 清空文件列表
    setSelectedFiles([])
    setUploadedFileIds([])
    setLoading(true)

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: selectedBot.id,  // 修复：使用 id 字段
          message: userMessage,
          conversation_id: conversationId,
          file_ids: fileIds,  // 添加文件ID
        }),
      })

      if (!res.ok) {
        throw new Error('对话失败')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('无法读取响应')

      const decoder = new TextDecoder()
      let assistantMessage = ''
      let newConversationId = conversationId

      // 添加空的助手消息
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          if (line.startsWith('event:')) {
            continue
          } else if (line.startsWith('data:')) {
            try {
              const dataStr = line.slice(5).trim()
              if (dataStr === '[DONE]') continue

              const eventData = JSON.parse(dataStr)

              // 提取 conversation_id
              if (eventData.conversation_id) {
                newConversationId = eventData.conversation_id
              }

              // 累积消息内容
              if (eventData.role === 'assistant' && eventData.type === 'answer') {
                assistantMessage += eventData.content || ''
                // 实时更新最后一条消息
                setMessages((prev) => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = {
                    role: 'assistant',
                    content: assistantMessage,
                  }
                  return newMessages
                })
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      setConversationId(newConversationId)
    } catch (error) {
      console.error('发送消息失败:', error)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `错误: ${error}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleWorkflowRun = async () => {
    if (!selectedWorkflow) return

    const userInput = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userInput }])
    setLoading(true)

    try {
      const res = await fetch('/api/workflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: selectedWorkflow.workflow_id,
          parameters: { input: userInput },
        }),
      })

      const data = await res.json()

      if (res.ok) {
        const output = data.data?.output || JSON.stringify(data.data || data, null, 2)
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `工作流执行结果:\n${output}` },
        ])
      } else {
        throw new Error(data.error || '执行失败')
      }
    } catch (error) {
      console.error('执行工作流失败:', error)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `错误: ${error}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const currentName = selectedBot?.name || selectedWorkflow?.name

  if (!selectedBot && !selectedWorkflow) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">请先选择一个 Bot 或工作流</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* 头部 */}
      <div className="bg-white border-b border-gray-200 px-5 py-3">
        <h2 className="text-base font-semibold text-gray-800">{currentName}</h2>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            {selectedBot ? '开始对话吧...' : '输入参数运行工作流...'}
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] px-4 py-2 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="bg-white border-t border-gray-200 p-4">
        {/* 文件预览 */}
        {selectedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm"
              >
                <span className="text-gray-700">
                  📄 {file.name} ({(file.size / 1024).toFixed(1)}KB)
                </span>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="text-red-500 hover:text-red-700 font-bold"
                  title="移除文件"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {/* 文件上传按钮 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || loading}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
            title="上传文件"
          >
            {uploading ? '上传中...' : '📎'}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleSend()}
            placeholder={selectedBot ? '输入消息...' : '输入参数...'}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500 disabled:bg-gray-100"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-6 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '发送中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
