'use client'

import { useState, useEffect } from 'react'
import TopBar from '@/components/TopBar'
import LeftPanel from '@/components/LeftPanel'
import ChatArea from '@/components/ChatArea'

interface Bot {
  id: string  // 修复：实际字段是 id
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

export default function Home() {
  const [isTokenConfigured, setIsTokenConfigured] = useState(false)
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)

  // 页面加载时检查 Token 状态
  useEffect(() => {
    checkInitialAuthStatus()
  }, [])

  const checkInitialAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status')
      const data = await res.json()
      console.log('[DEBUG] Initial auth status:', data)
      if (data.configured) {
        setIsTokenConfigured(true)
      }
    } catch (error) {
      console.error('检查初始认证状态失败:', error)
    }
  }

  const handleTokenConfigured = () => {
    console.log('[DEBUG] Token configured callback triggered')
    setIsTokenConfigured(true)
  }

  const handleSelectBot = (bot: Bot) => {
    setSelectedBot(bot)
    setSelectedWorkflow(null)
  }

  const handleSelectWorkflow = (workflow: Workflow) => {
    setSelectedWorkflow(workflow)
    setSelectedBot(null)
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar onTokenConfigured={handleTokenConfigured} />
      <div className="flex-1 flex overflow-hidden">
        <LeftPanel
          isTokenConfigured={isTokenConfigured}
          onSelectBot={handleSelectBot}
          onSelectWorkflow={handleSelectWorkflow}
        />
        <ChatArea selectedBot={selectedBot} selectedWorkflow={selectedWorkflow} />
      </div>
    </div>
  )
}
