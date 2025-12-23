/**
 * General Settings Component
 * Project general settings tab
 */
import React, { useEffect, useMemo, useState } from 'react';
import { validateProjectName } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface GeneralSettingsProps {
  projectId: string;
  projectName: string;
  projectDescription?: string | null;
  onProjectUpdated?: (update: { name: string; description?: string | null }) => void;
}

type StatusMessage = { type: 'success' | 'error'; text: string } | null;

export function GeneralSettings({
  projectId,
  projectName,
  projectDescription = '',
  onProjectUpdated,
}: GeneralSettingsProps) {
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState(projectDescription ?? '');
  const [originalName, setOriginalName] = useState(projectName);
  const [originalDescription, setOriginalDescription] = useState(projectDescription ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [absolutePath, setAbsolutePath] = useState<string>('');

  // 获取项目完整数据（包括绝对路径）
  useEffect(() => {
    if (!projectId || projectId === 'global-settings') return;

    const fetchProjectPath = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/projects/${projectId}`);
        if (response.ok) {
          const data = await response.json();
          setAbsolutePath(data?.data?.absolutePath || '');
        }
      } catch (error) {
        console.error('Failed to fetch project path:', error);
      }
    };

    fetchProjectPath();
  }, [projectId]);

  useEffect(() => {
    setName(projectName);
    setOriginalName(projectName);
  }, [projectName]);

  useEffect(() => {
    const nextDescription = projectDescription ?? '';
    setDescription(nextDescription);
    setOriginalDescription(nextDescription);
  }, [projectDescription]);

  useEffect(() => {
    if (status?.type === 'success') {
      const timeout = window.setTimeout(() => setStatus(null), 3000);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [status]);

  const normalizedName = useMemo(() => name.trim(), [name]);
  const normalizedDescription = useMemo(() => description.trim(), [description]);
  const normalizedOriginalName = useMemo(() => originalName.trim(), [originalName]);
  const normalizedOriginalDescription = useMemo(
    () => (originalDescription ?? '').trim(),
    [originalDescription]
  );

  const isProjectScoped = Boolean(projectId && projectId !== 'global-settings');
  const isDirty =
    normalizedName !== normalizedOriginalName ||
    normalizedDescription !== normalizedOriginalDescription;
  const isSaveDisabled =
    !isProjectScoped ||
    isSaving ||
    !normalizedName ||
    !validateProjectName(normalizedName) ||
    !isDirty;

  const copyTextSafe = async (text: string): Promise<boolean> => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function' &&
        (typeof document === 'undefined' || document.hasFocus())
      ) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      throw new Error('clipboard_unavailable');
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        if (!ok) throw new Error('exec_command_failed');
        return true;
      } catch {
        return false;
      }
    }
  };

  const handleSave = async () => {
    if (isSaveDisabled) return;
    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: normalizedName,
          description: normalizedDescription || null,
        }),
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          payload?.error ||
          payload?.message ||
          payload?.detail ||
          'Failed to update project settings.';
        throw new Error(message);
      }

      const updated = payload?.data ?? payload ?? {};
      const updatedName =
        typeof updated.name === 'string' && updated.name.trim()
          ? updated.name.trim()
          : normalizedName;
      const updatedDescriptionRaw =
        typeof updated.description === 'string' ? updated.description : normalizedDescription;
      const updatedDescription = (updatedDescriptionRaw ?? '').trim();

      setName(updatedName);
      setDescription(updatedDescription);
      setOriginalName(updatedName);
      setOriginalDescription(updatedDescription);
      onProjectUpdated?.({
        name: updatedName,
        description: updatedDescription || null,
      });

      setStatus({ type: 'success', text: 'Changes saved successfully.' });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Something went wrong while saving changes.';
      setStatus({ type: 'error', text: message });
    } finally {
      setIsSaving(false);
    }
  };

  const nameError =
    normalizedName && !validateProjectName(normalizedName)
      ? 'Use 1-50 characters: letters, numbers, spaces, hyphens, or underscores.'
      : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">General Settings</h3>

        {!isProjectScoped ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Select a project to edit its general settings.
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={event => {
                  setName(event.target.value);
                  if (status?.type) setStatus(null);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter project name"
              />
              {nameError && (
                <p className="mt-2 text-sm text-red-600">
                  {nameError}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Project ID</label>
              <input
                type="text"
                value={projectId}
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Project Path</label>
              <div className="relative">
                <input
                  type="text"
                  value={absolutePath}
                  disabled
                  className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500 font-mono text-xs"
                  title={absolutePath}
                />
                {absolutePath && (
                  <button
                    onClick={async () => {
                      const ok = await copyTextSafe(absolutePath);
                      setStatus(
                        ok
                          ? { type: 'success', text: 'Path copied to clipboard!' }
                          : { type: 'error', text: 'Failed to copy path to clipboard.' }
                      );
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    title="Copy path to clipboard"
                  >
                    Copy
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                All file operations will be restricted to this directory
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={event => {
                  setDescription(event.target.value);
                  if (status?.type) setStatus(null);
                }}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe your project..."
              />
            </div>

            {status && (
              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  status.type === 'success'
                    ? 'border border-green-200 bg-green-50 text-green-700'
                    : 'border border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {status.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={isSaveDisabled}
                className="rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
