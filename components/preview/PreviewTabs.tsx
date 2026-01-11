'use client';

import { X, FileCode, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useEffect, useRef, useState, useMemo } from 'react';

interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

interface FileChange {
  type: 'write' | 'edit';
  filePath: string;
  content?: string;
  oldString?: string;
  newString?: string;
  timestamp: string;
}

interface PreviewTabsProps {
  planContent: string | null;
  todos: Todo[];
  fileChanges: FileChange[];
  activeTab: 'none' | 'activity' | 'todo';
  onTabChange: (tab: 'none' | 'activity' | 'todo') => void;
  onApprovePlan?: () => void;
  pendingApproval?: boolean;
}

// 根据文件扩展名获取语言类型
const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'json': 'json',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sh': 'bash',
    'bash': 'bash',
    'sql': 'sql',
    'xml': 'xml',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
  };
  return langMap[ext] || 'plaintext';
};

// HTML 转义
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export default function PreviewTabs({
  planContent,
  todos,
  fileChanges,
  activeTab,
  onTabChange,
  onApprovePlan,
  pendingApproval,
}: PreviewTabsProps) {
  const hasPlan = !!planContent;
  const hasTodos = todos.length > 0;
  const hasFileChanges = fileChanges.length > 0;
  const hasActivity = hasPlan || hasFileChanges;
  const activityEndRef = useRef<HTMLDivElement>(null);

  // 动态加载 highlight.js
  const [hljs, setHljs] = useState<any>(null);

  useEffect(() => {
    if (hasFileChanges && !hljs) {
      import('highlight.js/lib/common').then(mod => {
        setHljs(mod.default);
      });
    }
  }, [hasFileChanges, hljs]);

  // 自动滚动到最新变更
  useEffect(() => {
    if (activeTab === 'activity' && activityEndRef.current) {
      activityEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [fileChanges, activeTab]);

  // 高亮代码
  const highlightCode = useMemo(() => {
    return (code: string, filePath: string): string => {
      if (!hljs || !code) {
        return escapeHtml(code || '');
      }
      const language = getLanguageFromPath(filePath);
      try {
        if (language === 'plaintext') {
          return escapeHtml(code);
        }
        return hljs.highlight(code, { language }).value;
      } catch {
        try {
          return hljs.highlightAuto(code).value;
        } catch {
          return escapeHtml(code);
        }
      }
    };
  }, [hljs]);

  if (!hasActivity && !hasTodos) {
    return null;
  }

  const completedCount = todos.filter(t => t.status === 'completed').length;

  // 提取文件名
  const getFileName = (filePath: string) => {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  };

  // 计算活动数量（设计文档算1个 + 文件变更数量）
  const activityCount = (hasPlan ? 1 : 0) + fileChanges.length;

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-50 z-10">
      {/* 顶部标签栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          {/* 执行动态标签 - 放在第一位 */}
          {hasActivity && (
            <button
              onClick={() => onTabChange('activity')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'activity'
                  ? 'bg-gray-200 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Zap size={12} />
              执行动态 ({activityCount})
              {pendingApproval && activeTab !== 'activity' && (
                <span className="ml-1 w-1.5 h-1.5 bg-orange-400 rounded-full inline-block animate-pulse" />
              )}
            </button>
          )}
          {/* 任务进度标签 */}
          {hasTodos && (
            <button
              onClick={() => onTabChange('todo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'todo'
                  ? 'bg-gray-200 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              任务进度 {completedCount}/{todos.length}
            </button>
          )}
        </div>
        <button
          onClick={() => onTabChange('none')}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          title="关闭"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {/* 执行动态内容 */}
        {activeTab === 'activity' && (
          <div className="space-y-3">
            {/* 设计文档卡片 - 放在最前面，深灰色边框 */}
            {planContent && (
              <div className="bg-white rounded-lg border border-gray-400 overflow-hidden">
                {/* 文件头 */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-300">
                  <div className="flex items-center gap-2">
                    <FileCode size={14} className="text-gray-600" />
                    <span className="text-xs font-medium text-gray-700">设计方案</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                      规划
                    </span>
                  </div>
                  {pendingApproval && (
                    <span className="text-[10px] text-orange-600 font-medium animate-pulse">
                      待确认
                    </span>
                  )}
                </div>

                {/* 设计文档内容 - 使用和代码一致的小字体 */}
                <div className="p-3 max-h-[400px] overflow-y-auto">
                  <div className="text-xs text-gray-700 leading-relaxed [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-3 [&_h1]:mb-2 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-gray-800 [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px] [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2 [&_strong]:font-semibold [&_strong]:text-gray-800">
                    <ReactMarkdown>{planContent}</ReactMarkdown>
                  </div>
                </div>

                {/* 确认按钮 */}
                {pendingApproval && onApprovePlan && (
                  <div className="px-4 py-3 bg-gray-100 border-t border-gray-300 flex justify-end">
                    <button
                      onClick={onApprovePlan}
                      className="px-4 py-2 text-sm font-medium rounded-md transition-colors bg-gray-800 hover:bg-gray-900 text-white"
                    >
                      确认执行
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 文件变更卡片 */}
            {fileChanges.map((change, index) => (
              <div key={index} className="bg-white rounded-lg border border-gray-400 overflow-hidden">
                {/* 文件头 */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <FileCode size={14} className="text-gray-500" />
                    <span className="text-xs font-medium text-gray-700">{getFileName(change.filePath)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      change.type === 'write'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {change.type === 'write' ? '创建' : '编辑'}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(change.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* 文件路径 */}
                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-[10px] text-gray-500 font-mono">{change.filePath}</span>
                </div>

                {/* 代码内容 - 带语法高亮 */}
                <div className="p-3">
                  {change.type === 'write' && change.content && (
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto bg-gray-100 text-gray-800 p-2 rounded border border-gray-200 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-50 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded">
                      <code
                        className="hljs"
                        dangerouslySetInnerHTML={{
                          __html: change.content.length > 5000
                            ? highlightCode(change.content.slice(0, 5000), change.filePath) + '\n\n... (内容已截断，共 ' + change.content.length + ' 字符)'
                            : highlightCode(change.content, change.filePath)
                        }}
                      />
                    </pre>
                  )}
                  {change.type === 'edit' && (
                    <div className="space-y-2">
                      {change.oldString && (
                        <div className="bg-red-50 border border-red-200 rounded">
                          <div className="text-[10px] text-red-600 font-medium px-2 py-1 border-b border-red-200">- 删除</div>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-[150px] overflow-y-auto p-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-red-100 [&::-webkit-scrollbar-thumb]:bg-red-300 [&::-webkit-scrollbar-thumb]:rounded">
                            <code
                              className="text-red-700"
                              dangerouslySetInnerHTML={{ __html: highlightCode(change.oldString, change.filePath) }}
                            />
                          </pre>
                        </div>
                      )}
                      {change.newString && (
                        <div className="bg-green-50 border border-green-200 rounded">
                          <div className="text-[10px] text-green-600 font-medium px-2 py-1 border-b border-green-200">+ 新增</div>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-[150px] overflow-y-auto p-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-green-100 [&::-webkit-scrollbar-thumb]:bg-green-300 [&::-webkit-scrollbar-thumb]:rounded">
                            <code
                              className="text-green-700"
                              dangerouslySetInnerHTML={{ __html: highlightCode(change.newString, change.filePath) }}
                            />
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={activityEndRef} />
          </div>
        )}

        {/* Todo 列表 */}
        {activeTab === 'todo' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {todos.map((todo, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* 状态指示 */}
                  <div className="flex-shrink-0">
                    {todo.status === 'completed' ? (
                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    ) : todo.status === 'in_progress' ? (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  {/* 内容 */}
                  <p className={`text-sm ${
                    todo.status === 'completed'
                      ? 'text-gray-500'
                      : todo.status === 'in_progress'
                      ? 'text-gray-900 font-medium'
                      : 'text-gray-500'
                  }`}>
                    {todo.status === 'in_progress' ? (todo.activeForm || todo.content) : todo.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
