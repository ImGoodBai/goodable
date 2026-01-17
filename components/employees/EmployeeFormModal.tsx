"use client";

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type {
  Employee,
  EmployeeCategoryKey,
  EmployeeMode,
} from '@/types/backend/employee';
import { DEFAULT_EMPLOYEE_CATEGORIES } from '@/types/backend/employee';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface EmployeeFormModalProps {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSave: () => void;
}

export default function EmployeeFormModal({
  open,
  employee,
  onClose,
  onSave,
}: EmployeeFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EmployeeCategoryKey>('other');
  const [mode, setMode] = useState<EmployeeMode>('work');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptPlan, setSystemPromptPlan] = useState('');
  const [systemPromptExecution, setSystemPromptExecution] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!employee;
  const isBuiltin = employee?.is_builtin ?? false;

  // Reset form when modal opens/closes or employee changes
  useEffect(() => {
    if (open) {
      if (employee) {
        setName(employee.name);
        setDescription(employee.description || '');
        setCategory(employee.category);
        setMode(employee.mode);
        setSystemPrompt(employee.system_prompt || '');
        setSystemPromptPlan(employee.system_prompt_plan || '');
        setSystemPromptExecution(employee.system_prompt_execution || '');
      } else {
        setName('');
        setDescription('');
        setCategory('other');
        setMode('work');
        setSystemPrompt('');
        setSystemPromptPlan('');
        setSystemPromptExecution('');
      }
      setError('');
    }
  }, [open, employee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation - skip name/mode validation for builtin employees
    if (!isBuiltin) {
      if (!name.trim()) {
        setError('请输入员工名称');
        return;
      }
    }

    if (mode === 'work' && !systemPrompt.trim()) {
      setError('请输入 System Prompt');
      return;
    }

    if (mode === 'code' && (!systemPromptPlan.trim() || !systemPromptExecution.trim())) {
      setError('请输入 Plan 和 Execution 提示词');
      return;
    }

    setLoading(true);

    try {
      // Builtin employees can only update prompts
      const payload = isBuiltin
        ? {
            system_prompt: mode === 'work' ? systemPrompt.trim() : '',
            system_prompt_plan: mode === 'code' ? systemPromptPlan.trim() : undefined,
            system_prompt_execution: mode === 'code' ? systemPromptExecution.trim() : undefined,
          }
        : {
            name: name.trim(),
            description: description.trim() || undefined,
            category,
            mode,
            system_prompt: mode === 'work' ? systemPrompt.trim() : '',
            system_prompt_plan: mode === 'code' ? systemPromptPlan.trim() : undefined,
            system_prompt_execution: mode === 'code' ? systemPromptExecution.trim() : undefined,
          };

      const url = isEditing
        ? `${API_BASE}/api/employees/${employee.id}`
        : `${API_BASE}/api/employees`;

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '保存失败');
        return;
      }

      onSave();
    } catch (err) {
      setError('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end pt-10">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel - right aligned, full height minus top padding, 60% width */}
      <div
        className="relative bg-white shadow-2xl w-[60%] h-full flex flex-col rounded-tl-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? '编辑数字员工' : '新建数字员工'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form - scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 text-sm text-red-600 rounded">
                {error}
              </div>
            )}

            {/* Name - inline */}
            <div className="flex items-center gap-4">
              <label className="w-24 text-sm text-gray-600 flex-shrink-0">
                名称 {!isBuiltin && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Python 程序员"
                disabled={isBuiltin}
                className={`flex-1 px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm rounded focus:outline-none focus:bg-gray-100 ${isBuiltin ? 'opacity-60 cursor-not-allowed' : ''}`}
                maxLength={50}
              />
            </div>

            {/* Category - inline */}
            <div className="flex items-center gap-4">
              <label className="w-24 text-sm text-gray-600 flex-shrink-0">类型</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EmployeeCategoryKey)}
                disabled={isBuiltin}
                className={`flex-1 px-3 py-2 bg-gray-50 text-gray-900 text-sm rounded focus:outline-none focus:bg-gray-100 ${isBuiltin ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {DEFAULT_EMPLOYEE_CATEGORIES.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode - inline */}
            <div className="flex items-center gap-4">
              <label className="w-24 text-sm text-gray-600 flex-shrink-0">
                模式 {!isBuiltin && <span className="text-red-500">*</span>}
              </label>
              <div className={`flex items-center gap-6 ${isBuiltin ? 'opacity-60' : ''}`}>
                <label className={`flex items-center gap-2 ${isBuiltin ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="code"
                    checked={mode === 'code'}
                    onChange={() => setMode('code')}
                    disabled={isBuiltin}
                    className="w-4 h-4 text-gray-700 focus:ring-gray-400"
                  />
                  <span className="text-sm text-gray-700">code（编程）</span>
                </label>
                <label className={`flex items-center gap-2 ${isBuiltin ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="work"
                    checked={mode === 'work'}
                    onChange={() => setMode('work')}
                    disabled={isBuiltin}
                    className="w-4 h-4 text-gray-700 focus:ring-gray-400"
                  />
                  <span className="text-sm text-gray-700">work（工作）</span>
                </label>
              </div>
            </div>

            {/* Description - inline */}
            <div className="flex items-start gap-4">
              <label className="w-24 text-sm text-gray-600 flex-shrink-0 pt-2">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述员工职责..."
                rows={2}
                disabled={isBuiltin}
                className={`flex-1 px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm rounded focus:outline-none focus:bg-gray-100 resize-none ${isBuiltin ? 'opacity-60 cursor-not-allowed' : ''}`}
                maxLength={200}
              />
            </div>

            {/* Divider */}
            <div className="pt-2 pb-1">
              <p className="text-xs text-gray-400">
                {mode === 'work' ? '工作模式使用单一提示词' : '编程模式使用 Plan + Execution 双提示词'}
              </p>
            </div>

            {/* Work Mode Prompt */}
            {mode === 'work' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm text-gray-600">
                  System Prompt <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="输入系统提示词..."
                  className="w-full min-h-[300px] px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm rounded focus:outline-none focus:bg-gray-100 font-mono resize"
                  style={{ resize: 'vertical' }}
                />
              </div>
            )}

            {/* Code Mode Prompts */}
            {mode === 'code' && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-gray-600">
                    System Prompt - Plan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={systemPromptPlan}
                    onChange={(e) => setSystemPromptPlan(e.target.value)}
                    placeholder="输入规划阶段的系统提示词..."
                    className="w-full min-h-[200px] px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm rounded focus:outline-none focus:bg-gray-100 font-mono resize"
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-gray-600">
                    System Prompt - Execution <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={systemPromptExecution}
                    onChange={(e) => setSystemPromptExecution(e.target.value)}
                    placeholder="输入执行阶段的系统提示词..."
                    className="w-full min-h-[200px] px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm rounded focus:outline-none focus:bg-gray-100 font-mono resize"
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </>
            )}
          </div>
        </form>

        {/* Footer - fixed at bottom */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
