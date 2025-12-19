'use client'

import { useState, useEffect } from 'react'

interface Bot {
  id: string  // 修复：实际字段是 id 不是 bot_id
  name: string
  description?: string
  icon_url?: string
}

interface Workflow {
  workflow_id: string
  name: string
  description?: string
  icon_url?: string  // 添加图标字段
}

interface Workspace {
  id: string  // 修复：字段名是 id 不是 workspace_id
  name: string
}

interface LeftPanelProps {
  isTokenConfigured: boolean
  onSelectBot: (bot: Bot) => void
  onSelectWorkflow: (workflow: Workflow) => void
}

type TabType = 'bots' | 'workflows'

export default function LeftPanel({ isTokenConfigured, onSelectBot, onSelectWorkflow }: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('bots')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [bots, setBots] = useState<Bot[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBotId, setSelectedBotId] = useState('')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')

  useEffect(() => {
    console.log('[DEBUG] isTokenConfigured changed:', isTokenConfigured)
    if (isTokenConfigured) {
      console.log('[DEBUG] Token is configured, loading workspaces...')
      loadWorkspaces()
    }
  }, [isTokenConfigured])

  useEffect(() => {
    console.log('[DEBUG] selectedWorkspace or activeTab changed:', { selectedWorkspace, activeTab })
    if (selectedWorkspace) {
      if (activeTab === 'bots') {
        console.log('[DEBUG] Loading bots for workspace:', selectedWorkspace)
        loadBots()
      } else {
        console.log('[DEBUG] Loading workflows for workspace:', selectedWorkspace)
        loadWorkflows()
      }
    }
  }, [selectedWorkspace, activeTab])

  const loadWorkspaces = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/workspaces')
      const data = await res.json()
      console.log('[DEBUG] loadWorkspaces response:', data)
      console.log('[DEBUG] data.data type:', typeof data.data)
      console.log('[DEBUG] data.data is array:', Array.isArray(data.data))
      console.log('[DEBUG] data.data content:', data.data)

      // 修复：检查多种可能的数据结构
      let workspaceList = []

      if (Array.isArray(data.data)) {
        // 情况1: data.data 是数组
        workspaceList = data.data
      } else if (data.data && typeof data.data === 'object') {
        // 情况2: data.data 是对象，可能包含 items 或其他字段
        if (Array.isArray(data.data.items)) {
          workspaceList = data.data.items
        } else if (Array.isArray(data.data.workspaces)) {
          workspaceList = data.data.workspaces
        } else {
          console.warn('[WARN] data.data is object but no known array field:', Object.keys(data.data))
        }
      } else if (Array.isArray(data)) {
        // 情况3: data 本身就是数组
        workspaceList = data
      }

      console.log('[DEBUG] Final workspace list:', workspaceList)

      if (workspaceList.length > 0) {
        setWorkspaces(workspaceList)
        const firstWorkspace = workspaceList[0].id  // 注意字段名是 id
        setSelectedWorkspace(firstWorkspace)
        console.log('[DEBUG] Selected workspace:', firstWorkspace)
        // 保存到后端
        await fetch('/api/config/space-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ space_id: firstWorkspace }),
        })
      } else {
        console.warn('[WARN] No workspaces found after parsing')
      }
    } catch (error) {
      console.error('加载工作空间失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadBots = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bots')
      const data = await res.json()
      console.log('[DEBUG] loadBots response:', data)

      // 修复：Bot 列表在 data.data.items 中
      if (data.data?.items && Array.isArray(data.data.items)) {
        console.log('[DEBUG] Found bots:', data.data.items.length)
        setBots(data.data.items)
      } else if (data.data?.space_bots && Array.isArray(data.data.space_bots)) {
        // 备用路径1
        console.log('[DEBUG] Found bots in space_bots:', data.data.space_bots.length)
        setBots(data.data.space_bots)
      } else if (data.items && Array.isArray(data.items)) {
        // 备用路径2
        console.log('[DEBUG] Found bots in root items:', data.items.length)
        setBots(data.items)
      } else {
        console.warn('[WARN] No bots found. Response keys:', Object.keys(data))
        if (data.data) {
          console.warn('[WARN] data.data keys:', Object.keys(data.data))
        }
        setBots([])
      }
    } catch (error) {
      console.error('加载 Bot 列表失败:', error)
      alert(`加载 Bot 列表失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const loadWorkflows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/workflows')
      const data = await res.json()
      console.log('[DEBUG] loadWorkflows response:', data)

      // 修复：检查正确的数据路径
      if (data.data?.items && Array.isArray(data.data.items)) {
        setWorkflows(data.data.items)
      } else if (data.items && Array.isArray(data.items)) {
        setWorkflows(data.items)
      } else {
        console.warn('[WARN] No workflows found. Response keys:', Object.keys(data))
        setWorkflows([])
      }
    } catch (error) {
      console.error('加载工作流列表失败:', error)
      alert(`加载工作流列表失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleWorkspaceChange = async (workspaceId: string) => {
    console.log('[DEBUG] Workspace changed to:', workspaceId)
    // 清空当前列表
    setBots([])
    setWorkflows([])
    setSelectedBotId('')
    setSelectedWorkflowId('')

    // 设置新的工作空间
    setSelectedWorkspace(workspaceId)

    // 保存到后端
    await fetch('/api/config/space-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: workspaceId }),
    })
  }

  const handleBotClick = (bot: Bot) => {
    setSelectedBotId(bot.id)  // 修复：使用 id 字段
    setSelectedWorkflowId('')
    onSelectBot(bot)
  }

  const handleWorkflowClick = (workflow: Workflow) => {
    setSelectedWorkflowId(workflow.workflow_id)
    setSelectedBotId('')
    onSelectWorkflow(workflow)
  }

  if (!isTokenConfigured) {
    return (
      <div className="w-[350px] bg-white border-r border-gray-200 flex items-center justify-center flex-shrink-0">
        <p className="text-gray-500 text-sm">请先配置 Token</p>
      </div>
    )
  }

  return (
    <div className="w-[350px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        {/* 工作空间选择 - 移到最上方 */}
        {workspaces.length > 0 && (
          <select
            value={selectedWorkspace}
            onChange={(e) => handleWorkspaceChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500 mb-3"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        )}

        {/* Bot/工作流切换按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('bots')}
            className={`flex-1 py-2 text-sm rounded transition-colors ${
              activeTab === 'bots'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Bot 列表
          </button>
          <button
            onClick={() => setActiveTab('workflows')}
            className={`flex-1 py-2 text-sm rounded transition-colors ${
              activeTab === 'workflows'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            工作流
          </button>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-8">加载中...</div>
        ) : activeTab === 'bots' ? (
          bots.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">暂无 Bot</div>
          ) : (
            <div className="space-y-2">
              {bots.map((bot) => (
                <div
                  key={bot.id}
                  onClick={() => handleBotClick(bot)}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    selectedBotId === bot.id
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Bot 图标 */}
                    {bot.icon_url && (
                      <img
                        src={bot.icon_url}
                        alt={bot.name}
                        className="w-10 h-10 rounded-lg flex-shrink-0 object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">{bot.name}</div>
                      {bot.description && (
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {bot.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          workflows.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">暂无工作流</div>
          ) : (
            <div className="space-y-2">
              {workflows.map((workflow) => (
                <div
                  key={workflow.workflow_id}
                  onClick={() => handleWorkflowClick(workflow)}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    selectedWorkflowId === workflow.workflow_id
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* 工作流图标 - 如果没有图标则显示默认的闪电符号 */}
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg text-2xl">
                      {workflow.icon_url ? (
                        <img
                          src={workflow.icon_url}
                          alt={workflow.name}
                          className="w-full h-full rounded-lg object-cover"
                          onError={(e) => {
                            // 图片加载失败时显示默认图标
                            e.currentTarget.style.display = 'none'
                            e.currentTarget.nextElementSibling!.classList.remove('hidden')
                          }}
                        />
                      ) : null}
                      <span className={workflow.icon_url ? 'hidden' : ''}>⚡</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">
                        {workflow.name}
                      </div>
                      {workflow.description && (
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {workflow.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
