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

function WorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get('view') as 'home' | 'templates' | 'apps' | 'help' | null;
  const [currentView, setCurrentView] = useState<'home' | 'templates' | 'apps' | 'help'>(viewParam || 'home');
  const [projects, setProjects] = useState<any[]>([]);
  const [preferredCli, setPreferredCli] = useState<ActiveCliId>(DEFAULT_ACTIVE_CLI);
  const [selectedModel, setSelectedModel] = useState<string>(getDefaultModelForCli(DEFAULT_ACTIVE_CLI));
  const [thinkingMode, setThinkingMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
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

  // Sync currentView with URL parameter
  useEffect(() => {
    if (viewParam && viewParam !== currentView) {
      setCurrentView(viewParam);
    }
  }, [viewParam]);

  useEffect(() => {
    if (currentView === 'apps') {
      loadProjects();
    }
  }, [currentView, loadProjects]);

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
              />
            </div>
          </div>
        )}

        {/* Templates View */}
        {currentView === 'templates' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaFolder className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">模板库</h2>
              <p className="text-gray-500">即将推出...</p>
            </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project: any) => (
                  <div
                    key={project.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer relative group"
                    onClick={() => router.push(`/${project.id}/chat`)}
                  >
                    <h3 className="font-semibold text-gray-900 mb-2 truncate">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-8">
                      {new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt).toLocaleDateString()}
                    </p>
                    <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        编辑
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="text-xs text-gray-500 hover:text-red-600"
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
