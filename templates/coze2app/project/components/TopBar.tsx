'use client'

import { useState, useEffect } from 'react'

interface TopBarProps {
  onTokenConfigured: () => void
}

export default function TopBar({ onTokenConfigured }: TopBarProps) {
  const [token, setToken] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [loading, setLoading] = useState(false)
  const [configuredAt, setConfiguredAt] = useState('')

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status')
      const data = await res.json()
      console.log('[DEBUG] Auth status:', data)
      setIsConfigured(data.configured)
      if (data.configured_at) {
        setConfiguredAt(data.configured_at)
      }
      // 修复：如果已配置，触发回调通知父组件
      if (data.configured) {
        onTokenConfigured()
      }
    } catch (error) {
      console.error('检查认证状态失败:', error)
    }
  }

  const handleConfigToken = async () => {
    if (!token.trim()) {
      alert('请输入 Token')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/config/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()

      if (res.ok) {
        alert('Token 配置成功！')
        setIsConfigured(true)
        setToken('')
        onTokenConfigured()
        checkAuthStatus()
      } else {
        alert(data.error || '配置失败')
      }
    } catch (error) {
      alert(`配置失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClearToken = async () => {
    if (!confirm('确定要清除 Token 配置吗？')) return

    try {
      const res = await fetch('/api/auth/clear', { method: 'POST' })
      if (res.ok) {
        alert('Token 已清除')
        setIsConfigured(false)
        setConfiguredAt('')
        window.location.reload()
      }
    } catch (error) {
      alert(`清除失败: ${error}`)
    }
  }

  return (
    <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-4">
      <h1 className="text-lg font-semibold text-gray-800">Coze2App，让工作流一键变软件。</h1>

      {isConfigured ? (
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm text-green-600">✓ Token 已配置</span>
          {configuredAt && (
            <span className="text-xs text-gray-500">({configuredAt})</span>
          )}
          <button
            onClick={handleClearToken}
            className="ml-auto px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            清除 Token
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfigToken()}
            placeholder="请输入 Coze PAT Token"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={handleConfigToken}
            disabled={loading || !token.trim()}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '配置中...' : '配置 Token'}
          </button>
        </div>
      )}
    </div>
  )
}
