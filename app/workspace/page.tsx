"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppSidebar from '@/components/layout/AppSidebar';
import ChatInput from '@/components/chat/ChatInput';
import { FaFolder } from 'react-icons/fa';
import { FiHelpCircle } from 'react-icons/fi';
import { useGlobalSettings } from '@/contexts/GlobalSettingsContext';
import { getDefaultModelForCli } from '@/lib/constants/cliModels';
import {
  ACTIVE_CLI_MODEL_OPTIONS,
  DEFAULT_ACTIVE_CLI,
  normalizeModelForCli,
  sanitizeActiveCli,
  buildActiveModelOptions,
  type ActiveCliId,
  type ActiveModelOption,
} from '@/lib/utils/cliOptions';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  previewUrl?: string;
}

function WorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get('view') as 'home' | 'templates' | 'apps' | 'help' | null;
  const [currentView, setCurrentView] = useState<'home' | 'templates' | 'apps' | 'help'>(viewParam || 'home');
  const [projects, setProjects] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [preferredCli, setPreferredCli] = useState<ActiveCliId>(DEFAULT_ACTIVE_CLI);
  const [selectedModel, setSelectedModel] = useState<string>(getDefaultModelForCli(DEFAULT_ACTIVE_CLI));
  const [thinkingMode, setThinkingMode] = useState(false);
  const [projectType, setProjectType] = useState<'nextjs' | 'python-fastapi'>('nextjs');
  const [isCreating, setIsCreating] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const { settings: globalSettings } = useGlobalSettings();

  // Build model options
  const modelOptions: ActiveModelOption[] = buildActiveModelOptions({});
  const cliOptions = Object.keys(ACTIVE_CLI_MODEL_OPTIONS).map(id => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    available: true
  }));

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/projects`);
      if (!r.ok) return;
      const payload = await r.json();
      const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setProjects(items);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }, []);

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/templates`);
      if (!r.ok) return;
      const payload = await r.json();
      const items = Array.isArray(payload?.data) ? payload.data : [];
      setTemplates(items);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }, []);

  // Sync currentView with URL parameter
  useEffect(() => {
    if (viewParam && viewParam !== currentView) {
      setCurrentView(viewParam);
    }
  }, [viewParam]);

  useEffect(() => {
    if (currentView === 'apps') {
      loadProjects();
    } else if (currentView === 'templates') {
      loadTemplates();
    }
  }, [currentView, loadProjects, loadTemplates]);

  // Sync with global settings
  useEffect(() => {
    if (globalSettings?.default_cli) {
      const sanitized = sanitizeActiveCli(globalSettings.default_cli, DEFAULT_ACTIVE_CLI);
      setPreferredCli(sanitized);

      const cliConfig = globalSettings.cli_settings?.[sanitized];
      if (cliConfig?.model) {
        const normalized = normalizeModelForCli(sanitized, cliConfig.model, DEFAULT_ACTIVE_CLI);
        setSelectedModel(normalized);
      } else {
        setSelectedModel(getDefaultModelForCli(sanitized));
      }
    }
  }, [globalSettings]);

  // Create project and navigate
  const handleCreateProject = async (message: string, images?: any[]): Promise<boolean> => {
    if (isCreating) return false;
    setIsCreating(true);

    try {
      // Generate project ID
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const projectId = `project-${timestamp}-${randomStr}`;

      const response = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: message.slice(0, 50) || 'New Project',
          description: message.slice(0, 200),
          initialPrompt: message,
          preferredCli,
          selectedModel,
          projectType,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create project failed:', response.status, errorText);
        throw new Error(`Failed to create project: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      // Navigate to project chat page with initial prompt
      const encodedPrompt = encodeURIComponent(message);
      router.push(`/${projectId}/chat?initial_prompt=${encodedPrompt}`);
      return true; // Success
    } catch (error) {
      console.error('Failed to create project:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to create project';
      alert(errorMsg);
      return false; // Failure
    } finally {
      setIsCreating(false);
    }
  };

  const handleModelChange = (option: any) => {
    if (option && typeof option.id === 'string') {
      setSelectedModel(option.id);
    }
  };

  const handleCliChange = (cliId: string) => {
    const sanitized = sanitizeActiveCli(cliId, DEFAULT_ACTIVE_CLI);
    setPreferredCli(sanitized);
    setSelectedModel(getDefaultModelForCli(sanitized));
  };

  // Create project from template
  const handleUseTemplate = async (templateId: string, templateName: string) => {
    if (creatingTemplateId) return;
    setCreatingTemplateId(templateId);

    try {
      const response = await fetch(`${API_BASE}/api/templates/${templateId}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName }),
      });

      if (!response.ok) {
        throw new Error('Failed to create project from template');
      }

      const data = await response.json();
      const projectId = data.data?.projectId;

      if (projectId) {
        router.push(`/${projectId}/chat`);
      }
    } catch (error) {
      console.error('Failed to create project from template:', error);
      alert('创建项目失败，请重试');
    } finally {
      setCreatingTemplateId(null);
    }
  };

  // Delete project
  const handleDeleteProject = async (projectId: string, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`确定要删除项目 "${projectName}" 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete project');
      }

      // Refresh projects list
      await loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('删除项目失败，请重试');
    }
  };

  // Handle image error
  const handleImageError = (id: string) => {
    setImageErrors(prev => new Set(prev).add(id));
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      <AppSidebar
        currentPage={currentView}
        projectsCount={projects.length}
        onNavigate={(page) => {
          if (page === 'settings') {
            window.open('/settings', '_blank');
          } else {
            router.push(`/workspace?view=${page}`);
          }
        }}
      />

      <div className="flex-1 flex flex-col">
        {/* Home View */}
        {currentView === 'home' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-2xl">
              <h1 className="text-4xl font-bold text-gray-900 mb-2 text-center">
                Goodable
              </h1>
              <p className="text-gray-600 mb-8 text-center">
                一句话生成可商业发布的软件
              </p>
              <ChatInput
                onSendMessage={handleCreateProject}
                disabled={isCreating}
                placeholder="帮我写一个带微信支付，可手机号登录的健身咨询Bot。"
                mode="act"
                preferredCli={preferredCli}
                selectedModel={selectedModel}
                thinkingMode={thinkingMode}
                onThinkingModeChange={setThinkingMode}
                modelOptions={modelOptions}
                onModelChange={handleModelChange}
                cliOptions={cliOptions}
                onCliChange={handleCliChange}
                projectType={projectType}
                onProjectTypeChange={setProjectType}
              />
            </div>
          </div>
        )}

        {/* Templates View */}
        {currentView === 'templates' && (
          <div className="flex-1 overflow-y-auto p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">模板库</h2>
            {templates.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FaFolder className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500">暂无可用模板</p>
                <p className="text-sm text-gray-400 mt-2">请在 templates 目录添加模板</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    {/* Preview Image */}
                    <div className="w-full h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                      <img
                        src={template.previewUrl || '/placeholder.png'}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 text-lg">
                        {template.name}
                      </h3>
                      {template.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {template.description}
                        </p>
                      )}

                      {/* Tags */}
                      {template.tags && template.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {template.tags.slice(0, 3).map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Button */}
                      <button
                        onClick={() => handleUseTemplate(template.id, template.name)}
                        disabled={creatingTemplateId !== null}
                        className="w-full bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded transition-colors"
                      >
                        {creatingTemplateId === template.id ? '创建中...' : '使用模板'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Apps View */}
        {currentView === 'apps' && (
          <div className="flex-1 overflow-y-auto p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">我的应用</h2>
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">还没有项目</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project: any) => (
                  <div
                    key={project.id}
                    className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer relative group"
                    onClick={() => router.push(`/${project.id}/chat`)}
                  >
                    {/* Preview Image */}
                    <div className="w-full h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                      {imageErrors.has(project.id) ? (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                          <span className="text-4xl font-bold text-gray-400">
                            {project.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={`/api/projects/${project.id}/thumbnail`}
                          alt={project.name}
                          className="w-full h-full object-cover"
                          onError={() => handleImageError(project.id)}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 text-lg truncate">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {project.projectType === 'python-fastapi' ? 'Python FastAPI' : 'Next.js'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        更新于 {new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Delete Button (visible on hover) */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDeleteProject(project.id, project.name, e)}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm font-medium shadow-lg"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Help View */}
        {currentView === 'help' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiHelpCircle className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">帮助文档</h2>
              <p className="text-gray-500">即将推出...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="h-screen bg-white flex items-center justify-center">加载中...</div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
