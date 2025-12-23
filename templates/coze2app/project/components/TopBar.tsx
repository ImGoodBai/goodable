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
  const [showHelp, setShowHelp] = useState(false)

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
    <>
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
            <button
              onClick={() => setShowHelp(true)}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              title="查看配置帮助"
            >
              ❓ 帮助
            </button>
          </div>
        )}
      </div>

      {/* 帮助弹窗 */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">📖 Token 配置指南</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <h3 className="font-semibold text-blue-900 mb-2">第一步：打开 Coze 平台</h3>
                <p className="text-sm text-blue-800">
                  访问：
                  <a
                    href="https://code.coze.cn/playground"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-600 underline hover:text-blue-700"
                  >
                    https://code.coze.cn/playground
                  </a>
                </p>
              </div>

              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <h3 className="font-semibold text-green-900 mb-2">第二步：登录</h3>
                <p className="text-sm text-green-800">
                  使用您的账号登录 Coze 平台
                </p>
              </div>

              <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded">
                <h3 className="font-semibold text-purple-900 mb-2">第三步：获取令牌</h3>
                <p className="text-sm text-purple-800">
                  进入后台后，点击 <strong>授权 → 服务身份及凭证 → 添加</strong>，勾选 <strong>所有空间</strong> 和 <strong>所有权限</strong>，确认后复制令牌，填入输入框即可。
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-3 rounded">
                <p className="text-xs text-gray-600">
                  💡 <strong>提示：</strong>令牌具有您账号的完整权限，请妥善保管，不要泄露给他人。
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
