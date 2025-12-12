"use client";

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Terminal } from 'lucide-react';

interface SlashCommand {
  name: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/compact', description: '压缩历史消息，摘要旧消息以节省上下文' },
  { name: '/context', description: '显示上下文使用情况和token统计' },
  { name: '/cost', description: '查看当前会话的成本统计' },
  { name: '/init', description: '初始化或重置会话状态' },
  { name: '/pr-comments', description: '生成Pull Request评论' },
  { name: '/release-notes', description: '生成发布说明文档' },
  { name: '/todos', description: '显示当前任务列表' },
  { name: '/review', description: '代码审查当前更改' },
  { name: '/security-review', description: '执行安全审查' },
  { name: '/plan', description: '规划模式 - 先制定方案再执行' },
];

interface SlashCommandMenuProps {
  onSelectCommand: (command: string) => void;
  disabled?: boolean;
}

export default function SlashCommandMenu({ onSelectCommand, disabled = false }: SlashCommandMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCommandClick = (command: string) => {
    onSelectCommand(command);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="p-2 text-gray-400 hover:text-gray-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Slash Commands"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50"
        >
          {/* Header */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-700">Slash Commands</span>
          </div>

          {/* Command List */}
          <div className="max-h-80 overflow-y-auto">
            {SLASH_COMMANDS.map((cmd) => (
              <button
                key={cmd.name}
                type="button"
                onClick={() => handleCommandClick(cmd.name)}
                className="w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 group"
              >
                <div className="flex items-start gap-2">
                  <code className="text-sm font-mono text-blue-600 group-hover:text-blue-700 shrink-0">
                    {cmd.name}
                  </code>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 ml-0">
                  {cmd.description}
                </div>
              </button>
            ))}
          </div>

          {/* Footer Hint */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              点击命令直接发送，或在输入框输入 <code className="text-xs bg-gray-100 px-1 rounded">/</code> 开头的命令
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
