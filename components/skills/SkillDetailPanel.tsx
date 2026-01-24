"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, FolderOpen, FileText, Settings, Eye, EyeOff, Play, GitFork } from 'lucide-react';
import type { SkillMeta, EnvVarConfig, FileTreeNode } from '@/lib/services/skill-service';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface SkillDetailPanelProps {
  open: boolean;
  skillName: string | null;
  onClose: () => void;
  onEnvSaved?: () => void;
  onRunSkill?: (skillName: string) => void;
  onForkSkill?: (skillName: string) => void;
  onDeleteSkill?: (skillName: string) => void;
}

export default function SkillDetailPanel({
  open,
  skillName,
  onClose,
  onEnvSaved,
  onRunSkill,
  onForkSkill,
  onDeleteSkill,
}: SkillDetailPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  // Skill data
  const [skill, setSkill] = useState<SkillMeta | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [skillMdContent, setSkillMdContent] = useState<string | null>(null);

  // Env vars
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  // Load skill detail
  const loadDetail = useCallback(async () => {
    if (!skillName) return;

    setLoading(true);
    setError('');

    try {
      // Load detail and env in parallel
      const [detailRes, envRes] = await Promise.all([
        fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/detail`),
        fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/env`),
      ]);

      const detailData = await detailRes.json();
      const envData = await envRes.json();

      if (detailData.success) {
        setSkill(detailData.data.skill);
        setFileTree(detailData.data.fileTree);
        setSkillMdContent(detailData.data.skillMdContent);
      } else {
        setError(detailData.error || 'Failed to load skill detail');
      }

      if (envData.success) {
        setEnvValues(envData.data || {});
      }
    } catch (err) {
      setError('Failed to load skill detail');
    } finally {
      setLoading(false);
    }
  }, [skillName]);

  useEffect(() => {
    if (open && skillName) {
      loadDetail();
    }
  }, [open, skillName, loadDetail]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setSkill(null);
      setFileTree(null);
      setSkillMdContent(null);
      setEnvValues({});
      setError('');
      setMessage(null);
      setVisibleSecrets({});
    }
  }, [open]);

  // Save env vars
  const handleSaveEnv = async () => {
    if (!skillName) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars: envValues }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: '保存成功' });
        onEnvSaved?.();
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2000);
    }
  };

  // Copy path to clipboard
  const handleCopyPath = async () => {
    if (!skill?.path) return;
    try {
      await navigator.clipboard.writeText(skill.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Toggle secret visibility
  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Render file tree
  const renderFileTree = (node: FileTreeNode, depth = 0): React.ReactNode => {
    const indent = depth * 16;
    const isDir = node.type === 'directory';

    return (
      <div key={node.name}>
        <div
          className="flex items-center gap-1 py-0.5 text-sm text-gray-700 font-mono"
          style={{ paddingLeft: `${indent}px` }}
        >
          {depth > 0 && (
            <span className="text-gray-400 mr-1">
              {isDir ? '├── ' : '├── '}
            </span>
          )}
          {isDir ? (
            <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
          <span className={isDir ? 'text-gray-900' : 'text-gray-600'}>{node.name}{isDir ? '/' : ''}</span>
        </div>
        {node.children?.map(child => renderFileTree(child, depth + 1))}
      </div>
    );
  };

  if (!open) return null;

  const hasEnvVars = skill?.envVars && skill.envVars.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end pt-10">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative bg-white shadow-2xl w-[60%] h-full flex flex-col rounded-tl-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {skill?.displayName || skill?.name || skillName}
          </h2>
          <div className="flex items-center gap-2">
            {/* Run button (hasApp only) */}
            {skill?.hasApp && onRunSkill && (
              <button
                onClick={() => onRunSkill(skill.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-black hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                运行
              </button>
            )}
            {/* Fork button (hasApp only) */}
            {skill?.hasApp && onForkSkill && (
              <button
                onClick={() => onForkSkill(skill.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <GitFork className="w-4 h-4" />
                二开
              </button>
            )}
            {/* Delete button (user skills only) */}
            {skill?.source === 'user' && onDeleteSkill && (
              <button
                onClick={() => onDeleteSkill(skill.name)}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                删除
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">加载中...</div>
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="p-3 bg-red-50 text-sm text-red-600 rounded">{error}</div>
            </div>
          ) : (
            <div className="px-6 py-4 space-y-6">
              {/* Env Vars Section */}
              {hasEnvVars && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-medium text-gray-900">环境变量配置</h3>
                  </div>

                  {/* Message */}
                  {message && (
                    <div
                      className={`px-3 py-2 rounded text-sm ${
                        message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {message.text}
                    </div>
                  )}

                  {/* Env var inputs */}
                  <div className="space-y-3">
                    {skill?.envVars?.map((envVar: EnvVarConfig) => (
                      <div key={envVar.key} className="flex items-center gap-4">
                        <label className="w-32 text-sm text-gray-600 flex-shrink-0">
                          {envVar.label || envVar.key}
                          {envVar.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <div className="flex-1 relative">
                          <input
                            type={envVar.secret && !visibleSecrets[envVar.key] ? 'password' : 'text'}
                            value={envValues[envVar.key] || ''}
                            onChange={(e) => setEnvValues(prev => ({ ...prev, [envVar.key]: e.target.value }))}
                            placeholder={envVar.placeholder || ''}
                            className="w-full px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm rounded focus:outline-none focus:bg-gray-100"
                          />
                          {envVar.secret && (
                            <button
                              type="button"
                              onClick={() => toggleSecretVisibility(envVar.key)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            >
                              {visibleSecrets[envVar.key] ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Save button */}
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveEnv}
                      disabled={saving}
                      className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-gray-200" />
                </div>
              )}

              {/* Path Section */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-900">📁 目录路径</h3>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-50 text-sm text-gray-700 rounded font-mono truncate">
                    {skill?.path}
                  </code>
                  <button
                    onClick={handleCopyPath}
                    className="px-3 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                    title="复制路径"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* File Tree Section */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-900">📂 目录结构</h3>
                <div className="p-3 bg-gray-50 rounded">
                  {fileTree ? renderFileTree(fileTree) : <span className="text-gray-500 text-sm">无</span>}
                </div>
              </div>

              {/* SKILL.md Section */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-900">📄 SKILL.md</h3>
                <div className="p-3 bg-gray-50 rounded">
                  {skillMdContent ? (
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{skillMdContent}</pre>
                  ) : (
                    <span className="text-gray-500 text-sm">（无 SKILL.md）</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
