"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppSidebar from '@/components/layout/AppSidebar';
import ChatInput from '@/components/chat/ChatInput';
import EmployeeDropdown from '@/components/employees/EmployeeDropdown';
import EmployeeList from '@/components/employees/EmployeeList';
import SkillDetailPanel from '@/components/skills/SkillDetailPanel';
import { Folder, FolderOpen, HelpCircle, ShoppingBag, CheckCircle, FileText, Receipt, Users, Sparkles } from 'lucide-react';
import { useGlobalSettings } from '@/contexts/GlobalSettingsContext';
import { useSlimMode } from '@/hooks/useSlimMode';
import { getDefaultModelForCli } from '@/lib/constants/cliModels';
import type { Employee } from '@/types/backend/employee';
import {
  ACTIVE_CLI_MODEL_OPTIONS,
  DEFAULT_ACTIVE_CLI,
  normalizeModelForCli,
  sanitizeActiveCli,
  buildActiveModelOptions,
  type ActiveCliId,
  type ActiveModelOption,
} from '@/lib/utils/cliOptions';
import { ONLINE_TEMPLATES } from '@/lib/mock/onlineTemplates';
import { getTemplateDisplayChar } from '@/lib/utils/colorGenerator';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  previewUrl?: string;
  author?: string;
  version?: string;
  isDownloaded?: boolean;
}

interface EnvVarConfig {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  default?: string;
}

interface SkillMeta {
  name: string;
  displayName?: string;
  description: string;
  path: string;
  source: 'builtin' | 'user';
  size: number;
  enabled: boolean;
  // Extended fields
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  preview?: string;
  projectType?: 'nextjs' | 'python-fastapi';
  envVars?: EnvVarConfig[];
  // Capability flags
  hasSkill: boolean;
  hasApp: boolean;
}

function WorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get('view') as 'home' | 'templates' | 'apps' | 'employees' | 'skills' | 'help' | null;
  const employeeIdParam = searchParams?.get('employee_id');
  const autoSendParam = searchParams?.get('auto_send') === 'true';
  const [currentView, setCurrentView] = useState<'home' | 'templates' | 'apps' | 'employees' | 'skills' | 'help'>(viewParam || 'home');
  const [projects, setProjects] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [preferredCli, setPreferredCli] = useState<ActiveCliId>(DEFAULT_ACTIVE_CLI);
  const [selectedModel, setSelectedModel] = useState<string>(getDefaultModelForCli(DEFAULT_ACTIVE_CLI));
  const [thinkingMode, setThinkingMode] = useState(false);
  const [projectType, setProjectType] = useState<'nextjs' | 'python-fastapi'>('python-fastapi');
  const [workMode, setWorkMode] = useState<'code' | 'work'>('code');
  const [isCreating, setIsCreating] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<'templates' | 'deployed' | 'developed'>('templates');
  const [workHomeTab, setWorkHomeTab] = useState<'tips' | 'recent'>('tips');
  const [inputControl, setInputControl] = useState<{ focus: () => void; setMessage: (msg: string) => void } | null>(null);
  const { settings: globalSettings } = useGlobalSettings();

  // Global slim mode - enables window size toggle from title bar
  useSlimMode();

  // Employee state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Cache input content per employee
  const employeeInputCacheRef = useRef<Record<string, string>>({});
  // Current input message (synced with ChatInput via inputControl)
  const currentInputRef = useRef<string>('');

  // Load employees for display
  const loadEmployees = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/employees`);
      if (response.ok) {
        const data = await response.json();
        setEmployees(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load employees:', error);
    }
  }, []);

  // Load default employee from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('selected_employee_id');
    if (saved) {
      setSelectedEmployeeId(saved);
    } else {
      // Default to first builtin employee
      setSelectedEmployeeId('builtin-python-dev');
    }
    loadEmployees();
  }, [loadEmployees]);

  // Handle employee selection - with input cache
  const handleEmployeeSelect = (employee: Employee) => {
    // Save current input for previous employee
    if (selectedEmployeeId && currentInputRef.current) {
      employeeInputCacheRef.current[selectedEmployeeId] = currentInputRef.current;
    }

    setSelectedEmployeeId(employee.id);
    localStorage.setItem('selected_employee_id', employee.id);
    // Auto switch workMode based on employee mode
    setWorkMode(employee.mode);

    // Restore cached input or use first_prompt
    const cachedInput = employeeInputCacheRef.current[employee.id];
    const inputToSet = cachedInput ?? employee.first_prompt ?? '';

    if (inputControl) {
      inputControl.setMessage(inputToSet);
      currentInputRef.current = inputToSet;
    }
  };

  // Sync workMode and first_prompt with selected employee after employees loaded
  useEffect(() => {
    if (employees.length > 0 && selectedEmployeeId) {
      const emp = employees.find(e => e.id === selectedEmployeeId);
      if (emp) {
        if (emp.mode !== workMode) {
          setWorkMode(emp.mode);
        }
        // Set first_prompt to input if no cached input exists
        if (inputControl && !employeeInputCacheRef.current[selectedEmployeeId]) {
          const prompt = emp.first_prompt ?? '';
          inputControl.setMessage(prompt);
          currentInputRef.current = prompt;
        }
      }
    }
  }, [employees, selectedEmployeeId, inputControl]);

  // Get employee name by ID for display
  const getEmployeeName = (employeeId: string | null | undefined): string | null => {
    if (!employeeId) return null;
    const emp = employees.find(e => e.id === employeeId);
    return emp?.name || null;
  };

  // Skills state
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsMessage, setSkillsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importPath, setImportPath] = useState('');
  const [importing, setImporting] = useState(false);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState<'all' | 'app' | 'skill'>('all');

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
      if (!r.ok) {
        // If API fails, show only online templates
        setTemplates(ONLINE_TEMPLATES);
        return;
      }
      const payload = await r.json();
      const localItems = Array.isArray(payload?.data) ? payload.data : [];

      // Mark local templates as downloaded
      const localTemplatesWithFlag = localItems.map((t: Template) => ({
        ...t,
        author: t.author || '古德白',
        isDownloaded: true,
      }));

      // Merge local and online templates
      const allTemplates = [...localTemplatesWithFlag, ...ONLINE_TEMPLATES];
      setTemplates(allTemplates);
    } catch (error) {
      console.error('Failed to load templates:', error);
      // On error, show only online templates
      setTemplates(ONLINE_TEMPLATES);
    }
  }, []);

  // Load skills
  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/skills`);
      if (response.ok) {
        const data = await response.json();
        setSkills(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  // Delete skill
  const deleteSkill = async (skillName: string) => {
    if (!confirm(`确定要删除技能 "${skillName}" 吗？`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setSkills(prev => prev.filter(s => s.name !== skillName));
        setSkillsMessage({ type: 'success', text: '已删除' });
      } else {
        const data = await response.json();
        setSkillsMessage({ type: 'error', text: data.error || '删除失败' });
      }
    } catch (error) {
      setSkillsMessage({ type: 'error', text: '删除失败' });
    }
    setTimeout(() => setSkillsMessage(null), 2000);
  };

  // Toggle skill enabled/disabled
  const toggleSkillEnabled = async (skillName: string, enabled: boolean) => {
    // If enabling, check if required env vars are set
    if (enabled) {
      const skill = skills.find(s => s.name === skillName);
      const requiredEnvVars = skill?.envVars?.filter(v => v.required) || [];

      if (requiredEnvVars.length > 0) {
        try {
          const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/env`);
          const data = await response.json();
          const envValues = data.success ? data.data : {};

          const missingVars = requiredEnvVars.filter(v => !envValues[v.key]);
          if (missingVars.length > 0) {
            setSkillsMessage({
              type: 'error',
              text: `请先设置必填环境变量: ${missingVars.map(v => v.label || v.key).join(', ')}`
            });
            setSelectedSkillName(skillName); // Open detail panel
            setTimeout(() => setSkillsMessage(null), 3000);
            return;
          }
        } catch (error) {
          console.error('Failed to check env vars:', error);
        }
      }
    }

    try {
      const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (response.ok) {
        setSkills(prev => prev.map(s => s.name === skillName ? { ...s, enabled } : s));
        setSkillsMessage({ type: 'success', text: enabled ? '已启用' : '已禁用' });
      } else {
        const data = await response.json();
        setSkillsMessage({ type: 'error', text: data.error || '操作失败' });
      }
    } catch (error) {
      setSkillsMessage({ type: 'error', text: '操作失败' });
    }
    setTimeout(() => setSkillsMessage(null), 2000);
  };

  // Run skill as app
  const handleRunSkill = async (skillName: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/run`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success && data.data?.projectId) {
        router.push(`/${data.data.projectId}/chat`);
      } else {
        setSkillsMessage({ type: 'error', text: data.error || '运行失败' });
        setTimeout(() => setSkillsMessage(null), 2000);
      }
    } catch (error) {
      setSkillsMessage({ type: 'error', text: '运行失败' });
      setTimeout(() => setSkillsMessage(null), 2000);
    }
  };

  // Fork skill for customization
  const handleForkSkill = async (skillName: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/fork`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success && data.data?.projectId) {
        router.push(`/${data.data.projectId}/chat`);
      } else {
        setSkillsMessage({ type: 'error', text: data.error || '二开失败' });
        setTimeout(() => setSkillsMessage(null), 2000);
      }
    } catch (error) {
      setSkillsMessage({ type: 'error', text: '二开失败' });
      setTimeout(() => setSkillsMessage(null), 2000);
    }
  };

  // Import skill from path
  const importSkillFromPath = async () => {
    if (!importPath.trim()) return;
    setImporting(true);
    try {
      const response = await fetch(`${API_BASE}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        setSkillsMessage({ type: 'success', text: '导入成功' });
        setImportPath('');
        await loadSkills();
      } else {
        setSkillsMessage({ type: 'error', text: data.error || '导入失败' });
      }
    } catch (error) {
      setSkillsMessage({ type: 'error', text: '导入失败' });
    } finally {
      setImporting(false);
    }
    setTimeout(() => setSkillsMessage(null), 3000);
  };

  // Import skill from ZIP file upload
  const importSkillFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    if (!file.name.endsWith('.zip')) {
      setSkillsMessage({ type: 'error', text: '只支持 .zip 格式文件' });
      setTimeout(() => setSkillsMessage(null), 3000);
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/skills/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setSkillsMessage({ type: 'success', text: '导入成功' });
        await loadSkills();
      } else {
        setSkillsMessage({ type: 'error', text: data.error || '导入失败' });
      }
    } catch (error) {
      setSkillsMessage({ type: 'error', text: '导入失败' });
    } finally {
      setImporting(false);
    }
    setTimeout(() => setSkillsMessage(null), 3000);
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Load workMode from localStorage on client side
  useEffect(() => {
    const saved = localStorage.getItem('workspace_work_mode');
    if (saved === 'work' || saved === 'code') {
      setWorkMode(saved);
    }
  }, []);

  // Sync currentView with URL parameter
  useEffect(() => {
    if (viewParam && viewParam !== currentView) {
      setCurrentView(viewParam);
    }
  }, [viewParam]);

  // 保存 workMode 到 localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('workspace_work_mode', workMode);
    }
  }, [workMode]);

  useEffect(() => {
    if (currentView === 'home') {
      loadTemplates();
      loadProjects();
    } else if (currentView === 'apps') {
      loadProjects();
    } else if (currentView === 'templates') {
      loadTemplates();
    } else if (currentView === 'skills') {
      loadSkills();
    }
  }, [currentView, loadProjects, loadTemplates, loadSkills]);

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

  // Handle tip card click - fill input with tip title
  const handleTipCardClick = useCallback((title: string) => {
    if (inputControl) {
      inputControl.setMessage(title);
      inputControl.focus();
    }
  }, [inputControl]);

  // Create project and navigate
  // employeeId param allows overriding selectedEmployeeId (fixes async state update issue)
  const handleCreateProject = useCallback(async (message: string, images?: any[], employeeId?: string): Promise<boolean> => {
    if (isCreating) return false;

    setIsCreating(true);

    try {
      // Generate short project ID (8 chars)
      const projectId = `p-${Math.random().toString(36).substring(2, 10)}`;

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
          mode: workMode,
          employee_id: employeeId ?? selectedEmployeeId ?? undefined,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create project failed:', response.status, errorText);
        throw new Error(`Failed to create project: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      // 演示模式：sourceProjectId 模式直接跳转到源项目
      if (data.data?.demoRedirect?.projectId) {
        const { projectId: targetProjectId, deployedUrl } = data.data.demoRedirect;
        console.log('[DemoMode] Redirecting to sourceProjectId:', targetProjectId);
        const targetUrl = `/${targetProjectId}/chat?demoReplay=true&deployedUrl=${encodeURIComponent(deployedUrl || '')}`;
        router.push(targetUrl);
        return true;
      }

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
  }, [isCreating, preferredCli, selectedModel, projectType, workMode, selectedEmployeeId, router]);

  // Handle auto_send from URL params (for shift+派活 new window)
  const autoSendTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoSendTriggeredRef.current) return;
    if (!autoSendParam || !employeeIdParam || employees.length === 0) return;

    const employee = employees.find(e => e.id === employeeIdParam);
    if (!employee) return;

    // Mark as triggered to prevent re-execution
    autoSendTriggeredRef.current = true;

    // Set employee and mode
    setSelectedEmployeeId(employee.id);
    localStorage.setItem('selected_employee_id', employee.id);
    setWorkMode(employee.mode);

    // Auto send first_prompt if exists
    if (employee.first_prompt) {
      handleCreateProject(employee.first_prompt, undefined, employee.id);
    }
  }, [autoSendParam, employeeIdParam, employees, handleCreateProject]);

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

  // Import template
  const handleImportTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    event.target.value = '';

    if (!file.name.endsWith('.zip')) {
      alert('只支持 .zip 格式文件');
      return;
    }

    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/templates/import`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        alert(result.error || '导入失败');
        return;
      }

      alert(result.data.message || '导入成功');

      // Refresh templates list
      await loadTemplates();
    } catch (error) {
      console.error('Failed to import template:', error);
      alert('导入失败，请重试');
    } finally {
      setIsImporting(false);
    }
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
          <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto relative">
            {/* Top Left - Employee Dropdown */}
            <div className="absolute top-4 left-8 z-10">
              <EmployeeDropdown
                selectedEmployeeId={selectedEmployeeId}
                onSelect={handleEmployeeSelect}
              />
            </div>
            {/* Top Right - Promotion Banner - hidden when window width < 600px */}
            <div className="absolute top-4 right-8 z-10 promo-banner-responsive">
              <button
                onClick={() => window.open('/settings', '_blank')}
                className="text-xs px-2 py-1 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-md transition-colors cursor-pointer"
              >
                💰 限时福利：注册送7元算力 →
              </button>
              <style jsx>{`
                @media (max-width: 599px) {
                  .promo-banner-responsive {
                    display: none;
                  }
                }
              `}</style>
            </div>

            <div className="w-full max-w-4xl px-4 sm:px-8 mt-24">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1.5 text-center">
                Goodable
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mb-6 text-center">
                专门为超级个体打造的桌面智能体应用，内置 18 个数字员工，一个人就是一支队伍。
              </p>
              <ChatInput
                onSendMessage={handleCreateProject}
                disabled={isCreating}
                placeholder="描述你想要的应用..."
                mode="act"
                workMode={workMode}
                onWorkModeChange={setWorkMode}
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
                onExposeInputControl={setInputControl}
                onInputChange={(value) => { currentInputRef.current = value; }}
              />

              {/* Quick Action Chips - only show in code mode */}
              {workMode === 'code' && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 home-suggestions-area">
                  <button
                    onClick={() => handleCreateProject("做一个万能短视频下载工具")}
                    className="px-2 sm:px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded-md hover:border-gray-300 hover:text-gray-700 transition-colors text-xs"
                  >
                    短视频下载
                  </button>
                  <button
                    onClick={() => handleCreateProject("做一个飞书文档一键变网站的工具")}
                    className="px-2 sm:px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded-md hover:border-gray-300 hover:text-gray-700 transition-colors text-xs"
                  >
                    飞书变网站
                  </button>
                  <button
                    onClick={() => handleCreateProject("做一个微信群智能助手")}
                    className="px-2 sm:px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded-md hover:border-gray-300 hover:text-gray-700 transition-colors text-xs"
                  >
                    微信群助手
                  </button>
                </div>
              )}
            </div>

            {/* Tab Switcher - Different for code vs work mode */}
            {workMode === 'code' ? (
              <div className="w-full max-w-5xl px-4 sm:px-8 mt-12 flex items-center justify-start gap-3 sm:gap-6 border-b border-gray-200 overflow-x-auto home-suggestions-area">
                {[
                  { key: 'templates' as const, label: '模板市场', showCount: false },
                  { key: 'deployed' as const, label: '已部署到阿里云', showCount: true, count: projects.filter((p: any) => p.deployedUrl !== undefined && p.deployedUrl !== null && p.mode !== 'work').length },
                  { key: 'developed' as const, label: '开发完成', showCount: true, count: projects.filter((p: any) => p.dependenciesInstalled === true && !p.deployedUrl && p.mode !== 'work').length },
                ].map(({ key, label, showCount, count }) => {
                  const isActive = homeTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setHomeTab(key)}
                      className={`px-1 pb-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                        isActive
                          ? 'border-gray-900 text-gray-900 font-medium'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}{showCount && ` (${count})`}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="w-full max-w-5xl px-4 sm:px-8 mt-12 flex items-center justify-start gap-3 sm:gap-6 border-b border-gray-200 overflow-x-auto home-suggestions-area">
                {[
                  { key: 'tips' as const, label: '使用提醒' },
                  { key: 'recent' as const, label: '最近操作', count: projects.filter((p: any) => p.mode === 'work').length },
                ].map(({ key, label, count }) => {
                  const isActive = workHomeTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setWorkHomeTab(key)}
                      className={`px-1 pb-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                        isActive
                          ? 'border-gray-900 text-gray-900 font-medium'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}{count !== undefined && ` (${count})`}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Card Display Area */}
            <div className="w-full max-w-5xl px-4 sm:px-8 mt-4 pb-8 home-suggestions-area">
              {/* Code Mode Content */}
              {workMode === 'code' && (
                <>
                  {/* Templates Tab */}
                  {homeTab === 'templates' && (
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                      {templates.filter(t => t.isDownloaded !== false).slice(0, 4).length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm col-span-full">暂无模板</div>
                      ) : (
                        templates.filter(t => t.isDownloaded !== false).slice(0, 4).map((template) => {
                          const isDownloaded = template.isDownloaded !== false;
                          return (
                            <div
                              key={template.id}
                              className="bg-white rounded-xl p-4 hover:shadow-lg transition-shadow flex items-start gap-4 group"
                            >
                              <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gray-100 flex-shrink-0">
                                {isDownloaded ? (
                                  <CheckCircle className="w-8 h-8 text-green-500" />
                                ) : (
                                  <ShoppingBag className="w-8 h-8 text-gray-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 text-base mb-1 truncate">
                                  {template.name}
                                </h3>
                                <p className="text-xs text-gray-500 mb-2">
                                  作者：{template.author || '古德白'}
                                  {template.version && ` v${template.version}`} · {isDownloaded ? '本地' : '在线'}
                                </p>
                                {template.description && (
                                  <p className="text-sm text-gray-600 line-clamp-2">
                                    {template.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleUseTemplate(template.id, template.name)}
                                  disabled={creatingTemplateId !== null}
                                  className="px-4 py-2 bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                                >
                                  {creatingTemplateId === template.id ? '创建中...' : '使用'}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Deployed Apps Tab */}
                  {homeTab === 'deployed' && (
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                      {projects.filter((p: any) => p.deployedUrl !== undefined && p.deployedUrl !== null && p.mode !== 'work').slice(0, 4).length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm col-span-full">暂无已部署应用</div>
                      ) : (
                        projects.filter((p: any) => p.deployedUrl !== undefined && p.deployedUrl !== null && p.mode !== 'work').slice(0, 4).map((project: any) => {
                          const projectType = project.projectType === 'python-fastapi' ? 'Python FastAPI' : 'Next.js';
                          const updateTime = new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt);
                          const updateDate = updateTime.toLocaleDateString();
                          const updateTimeStr = updateTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                          const previewStatus = project.status;
                          let previewStatusText = '';
                          if (previewStatus === 'running') {
                            previewStatusText = '运行中';
                          }

                          return (
                            <div
                              key={project.id}
                              className="bg-white rounded-xl p-4 hover:shadow-lg transition-shadow flex items-start gap-4 cursor-pointer group relative"
                              onClick={() => router.push(`/${project.id}/chat`)}
                            >
                              <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gray-100 flex-shrink-0">
                                <Folder className="w-8 h-8 text-gray-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 text-base mb-1 truncate">
                                  {project.name}
                                </h3>
                                {project.description && (
                                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                                    {project.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                                    {projectType}
                                  </span>
                                  <span>·</span>
                                  <span>更新于 {updateDate} {updateTimeStr}</span>
                                  <span>·</span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">
                                    已部署
                                  </span>
                                  {previewStatusText && (
                                    <>
                                      <span>·</span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">
                                        {previewStatusText}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => handleDeleteProject(project.id, project.name, e)}
                                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Developed Apps Tab */}
                  {homeTab === 'developed' && (
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                      {projects.filter((p: any) => p.dependenciesInstalled === true && !p.deployedUrl && p.mode !== 'work').slice(0, 4).length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm col-span-full">暂无开发完成的应用</div>
                      ) : (
                        projects.filter((p: any) => p.dependenciesInstalled === true && !p.deployedUrl && p.mode !== 'work').slice(0, 4).map((project: any) => {
                          const projectType = project.projectType === 'python-fastapi' ? 'Python FastAPI' : 'Next.js';
                          const updateTime = new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt);
                          const updateDate = updateTime.toLocaleDateString();
                          const updateTimeStr = updateTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                          const previewStatus = project.status;
                          let previewStatusText = '';
                          if (previewStatus === 'running') {
                            previewStatusText = '运行中';
                          }

                          return (
                            <div
                              key={project.id}
                              className="bg-white rounded-xl p-4 hover:shadow-lg transition-shadow flex items-start gap-4 cursor-pointer group relative"
                              onClick={() => router.push(`/${project.id}/chat`)}
                            >
                              <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gray-100 flex-shrink-0">
                                <Folder className="w-8 h-8 text-gray-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 text-base mb-1 truncate">
                                  {project.name}
                                </h3>
                                {project.description && (
                                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                                    {project.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                                    {projectType}
                                  </span>
                                  <span>·</span>
                                  <span>更新于 {updateDate} {updateTimeStr}</span>
                                  <span>·</span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                                    已安装
                                  </span>
                                  {previewStatusText && (
                                    <>
                                      <span>·</span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">
                                        {previewStatusText}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => handleDeleteProject(project.id, project.name, e)}
                                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Work Mode Content */}
              {workMode === 'work' && (
                <>
                  {/* Tips Tab - 使用提醒 */}
                  {workHomeTab === 'tips' && (
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                      {[
                        {
                          icon: <FolderOpen className="w-8 h-8 text-green-500" />,
                          title: '整理下载/桌面文件夹',
                          description: '选中文件夹，AI 帮你按类型、日期自动分类，批量移动重命名'
                        },
                        {
                          icon: <Receipt className="w-8 h-8 text-green-500" />,
                          title: '智能整理发票生成报销单',
                          description: '选中发票截图文件夹，AI 自动识别金额和类型，按项目分类汇总成表'
                        },
                        {
                          icon: <FileText className="w-8 h-8 text-green-500" />,
                          title: '智能整理合同文件夹',
                          description: '选中合同文件夹，AI 智能提取客户、金额、类型等信息，生成统计表并归档'
                        },
                        {
                          icon: <Users className="w-8 h-8 text-green-500" />,
                          title: '智能简历批量整理',
                          description: '选中简历文件夹，AI 提取关键信息生成汇总表，按人才级别、岗位类型等自动分类存档'
                        }
                      ].map((tip, index) => (
                        <div
                          key={index}
                          onClick={() => handleTipCardClick(tip.title)}
                          className="bg-white rounded-xl p-4 hover:shadow-lg transition-shadow flex items-start gap-4 cursor-pointer"
                        >
                          <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-green-50 flex-shrink-0">
                            {tip.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 text-base mb-1">
                              {tip.title}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {tip.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent Tab - 最近操作 */}
                  {workHomeTab === 'recent' && (
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                      {projects.filter((p: any) => p.mode === 'work').slice(0, 4).length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm col-span-full">暂无操作记录</div>
                      ) : (
                        projects.filter((p: any) => p.mode === 'work').slice(0, 4).map((project: any) => {
                          const updateTime = new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt);
                          const updateDate = updateTime.toLocaleDateString();
                          const updateTimeStr = updateTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                          const dirName = project.work_directory ? project.work_directory.split(/[/\\]/).pop() : '';

                          return (
                            <div
                              key={project.id}
                              className="bg-white rounded-xl p-4 hover:shadow-lg transition-shadow flex items-start gap-4 cursor-pointer"
                              onClick={() => router.push(`/${project.id}/chat`)}
                            >
                              <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gray-100 flex-shrink-0">
                                <FolderOpen className="w-8 h-8 text-gray-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 text-base mb-1 truncate">
                                  {project.name}
                                </h3>
                                {dirName && (
                                  <p className="text-sm text-gray-600 mb-2 truncate" title={project.work_directory}>
                                    {dirName}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400">
                                  {updateDate} {updateTimeStr}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Templates View */}
        {currentView === 'templates' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">模板市场</h2>
              <div>
                <input
                  type="file"
                  id="template-import-input"
                  accept=".zip"
                  onChange={handleImportTemplate}
                  className="hidden"
                  disabled={isImporting}
                />
                <label
                  htmlFor="template-import-input"
                  className={`px-4 py-2 ${
                    isImporting
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-black hover:bg-gray-900 cursor-pointer'
                  } text-white text-sm font-medium rounded-lg transition-colors inline-block`}
                >
                  {isImporting ? '导入中...' : '导入模板'}
                </label>
              </div>
            </div>
            {templates.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Folder className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500">暂无可用模板</p>
                <p className="text-sm text-gray-400 mt-2">加载中...</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                {templates.map((template) => {
                  const isDownloaded = template.isDownloaded !== false;

                  return (
                    <div
                      key={template.id}
                      className="bg-white rounded-xl p-4 hover:shadow-lg transition-shadow flex items-start gap-4 group"
                    >
                      {/* Icon */}
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gray-100 flex-shrink-0">
                        {isDownloaded ? (
                          <CheckCircle className="w-8 h-8 text-green-500" />
                        ) : (
                          <ShoppingBag className="w-8 h-8 text-gray-500" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <h3 className="font-semibold text-gray-900 text-base mb-1 truncate">
                          {template.name}
                        </h3>

                        {/* Author and Status */}
                        <p className="text-xs text-gray-500 mb-2">
                          作者：{template.author || '古德白'}
                          {template.version && ` v${template.version}`} · {isDownloaded ? '本地' : '在线'}
                        </p>

                        {/* Description */}
                        {template.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                      </div>

                      {/* Action Button */}
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isDownloaded ? (
                          <button
                            onClick={() => handleUseTemplate(template.id, template.name)}
                            disabled={creatingTemplateId !== null}
                            className="px-4 py-2 bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                          >
                            {creatingTemplateId === template.id ? '创建中...' : '使用'}
                          </button>
                        ) : (
                          <button
                            disabled
                            title="即将推出"
                            className="px-4 py-2 bg-gray-300 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed whitespace-nowrap"
                          >
                            下载
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* My Apps View */}
        {currentView === 'apps' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">我的应用</h2>
              {projects.length > 0 && (
                <div className="flex items-center gap-2">
                  {[
                    { key: null, label: '全部' },
                    { key: '已部署', label: '已部署' },
                    { key: '已安装', label: '已安装' },
                    { key: '已生成', label: '已生成' },
                    { key: '已确认', label: '已确认' },
                    { key: '新建', label: '新建' },
                  ].map(({ key, label }) => {
                    const count = key === null
                      ? projects.length
                      : projects.filter((p: any) => {
                          const status = p.deployedUrl ? '已部署'
                            : p.dependenciesInstalled ? '已安装'
                            : p.latestRequestStatus === 'completed' ? '已生成'
                            : p.planConfirmed ? '已确认'
                            : '新建';
                          return status === key;
                        }).length;
                    const isActive = filterStatus === key;
                    return (
                      <button
                        key={label}
                        onClick={() => setFilterStatus(key)}
                        className={`px-3 py-1 text-sm rounded-full transition-colors ${
                          isActive
                            ? 'bg-gray-300 text-gray-900 font-medium'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {label}({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">还没有项目</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                {projects
                  .filter((project: any) => {
                    if (filterStatus === null) return true;
                    const status = project.deployedUrl ? '已部署'
                      : project.dependenciesInstalled ? '已安装'
                      : project.latestRequestStatus === 'completed' ? '已生成'
                      : project.planConfirmed ? '已确认'
                      : '新建';
                    return status === filterStatus;
                  })
                  .map((project: any) => {
                  // Display employee name or fallback to projectType
                  const employeeName = getEmployeeName(project.employee_id);
                  const displayType = employeeName || (project.projectType === 'python-fastapi' ? 'Python FastAPI' : project.mode === 'work' ? '工作模式' : 'Next.js');
                  const updateTime = new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt);
                  const updateDate = updateTime.toLocaleDateString();
                  const updateTimeStr = updateTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

                  // 项目主进度状态（5个）
                  const latestRequestStatus = project.latestRequestStatus;
                  let progressStatus = '';
                  let progressStatusColor = '';

                  if (project.deployedUrl) {
                    progressStatus = '已部署';
                    progressStatusColor = 'bg-green-100 text-green-700';
                  } else if (project.dependenciesInstalled) {
                    progressStatus = '已安装';
                    progressStatusColor = 'bg-purple-100 text-purple-700';
                  } else if (latestRequestStatus === 'completed') {
                    progressStatus = '已生成';
                    progressStatusColor = 'bg-blue-100 text-blue-700';
                  } else if (project.planConfirmed) {
                    progressStatus = '已确认';
                    progressStatusColor = 'bg-yellow-100 text-yellow-700';
                  } else {
                    progressStatus = '新建';
                    progressStatusColor = 'bg-gray-100 text-gray-600';
                  }

                  // 预览状态：仅显示运行中
                  const previewStatus = project.status;
                  let previewStatusText = '';
                  if (previewStatus === 'running') {
                    previewStatusText = '运行中';
                  }

                  return (
                    <div
                      key={project.id}
                      className="bg-white rounded-xl p-4 hover:shadow-lg transition-shadow flex items-start gap-4 cursor-pointer group relative"
                      onClick={() => router.push(`/${project.id}/chat`)}
                    >
                      {/* Icon */}
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gray-100 flex-shrink-0">
                        <Folder className="w-8 h-8 text-gray-500" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <h3 className="font-semibold text-gray-900 text-base mb-1 truncate">
                          {project.name}
                        </h3>

                        {/* Description */}
                        {project.description && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                            {project.description}
                          </p>
                        )}

                        {/* Type and Time and Status */}
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                            {displayType}
                          </span>
                          <span>·</span>
                          <span>更新于 {updateDate} {updateTimeStr}</span>
                          {progressStatus && (
                            <>
                              <span>·</span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${progressStatusColor}`}>
                                {progressStatus}
                              </span>
                            </>
                          )}
                          {previewStatusText && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">
                                {previewStatusText}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete Button */}
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDeleteProject(project.id, project.name, e)}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Employees View */}
        {currentView === 'employees' && (
          <EmployeeList
            onAssignWork={async (employee, shiftKey) => {
              // Shift+click: open in new slim window
              if (shiftKey && typeof window !== 'undefined' && (window as any).desktopAPI) {
                try {
                  const result = await (window as any).desktopAPI.openNewWindow({
                    slimMode: true,
                    url: `/workspace?view=home&employee_id=${employee.id}&auto_send=true`
                  });
                  if (!result?.success) {
                    console.error('Failed to open new window:', result?.error);
                  }
                } catch (error) {
                  console.error('Failed to open new window:', error);
                }
                return;
              }

              // Normal click: handle in current window
              setSelectedEmployeeId(employee.id);
              localStorage.setItem('selected_employee_id', employee.id);
              setWorkMode(employee.mode);

              // If employee has first_prompt, create project and send directly
              if (employee.first_prompt) {
                await handleCreateProject(employee.first_prompt, undefined, employee.id);
              } else {
                // No first_prompt, go to home page
                setCurrentView('home');
              }
            }}
          />
        )}

        {/* Skills View */}
        {currentView === 'skills' && (
          <div className="flex-1 overflow-y-auto p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">我的技能</h2>
              <div className="flex items-center gap-2">
                {/* Filter buttons */}
                {skills.length > 0 && (
                  <>
                    {[
                      { key: 'all' as const, label: '全部' },
                      { key: 'app' as const, label: 'App' },
                      { key: 'skill' as const, label: 'Skills' },
                    ].map(({ key, label }) => {
                      const count = key === 'all'
                        ? skills.length
                        : key === 'app'
                        ? skills.filter(s => s.hasApp).length
                        : skills.filter(s => s.hasSkill).length;
                      const isActive = skillFilter === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setSkillFilter(key)}
                          className={`px-3 py-1 text-sm rounded-full transition-colors ${
                            isActive
                              ? 'bg-gray-300 text-gray-900 font-medium'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {label}({count})
                        </button>
                      );
                    })}
                  </>
                )}
                {skillsMessage && (
                  <span className={`text-sm ${skillsMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {skillsMessage.text}
                  </span>
                )}
                <input
                  type="file"
                  id="skill-import-input"
                  accept=".zip"
                  onChange={importSkillFromFile}
                  className="hidden"
                  disabled={importing}
                />
                <label
                  htmlFor="skill-import-input"
                  className={`px-4 py-2 ${
                    importing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-black hover:bg-gray-900 cursor-pointer'
                  } text-white text-sm font-medium rounded-lg transition-colors inline-block`}
                >
                  {importing ? '导入中...' : '导入技能'}
                </label>
              </div>
            </div>

            {/* Skills List */}
            {skillsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500">加载中...</div>
              </div>
            ) : skills.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500">暂无技能</p>
                <p className="text-sm text-gray-400 mt-2">导入技能包或将内置技能放入 skills 目录</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {skills
                  .filter((skill) => {
                    if (skillFilter === 'all') return true;
                    if (skillFilter === 'app') return skill.hasApp;
                    if (skillFilter === 'skill') return skill.hasSkill;
                    return true;
                  })
                  .map((skill) => (
                  <div
                    key={skill.name}
                    className={`bg-white rounded-xl p-4 hover:shadow-lg transition-shadow group cursor-pointer ${!skill.enabled ? 'opacity-60' : ''}`}
                    onClick={() => setSelectedSkillName(skill.name)}
                  >
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 text-base truncate">
                          {skill.displayName || skill.name}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          skill.source === 'builtin'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {skill.source === 'builtin' ? '内置' : '导入'}
                        </span>
                        {skill.hasSkill && (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600">
                            Skills
                          </span>
                        )}
                        {skill.hasApp && (
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600">
                            App
                          </span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                          {skill.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {skill.author && (
                          <>
                            <span>作者: {skill.author}</span>
                            <span>·</span>
                          </>
                        )}
                        {skill.version && (
                          <>
                            <span>v{skill.version}</span>
                            <span>·</span>
                          </>
                        )}
                        <span>大小: {formatSize(skill.size)}</span>
                      </div>
                    </div>
                    {/* Action buttons row */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Toggle switch (hasSkill only, always visible) */}
                      {skill.hasSkill && (
                        <button
                          onClick={() => toggleSkillEnabled(skill.name, !skill.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            skill.enabled ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          title={skill.enabled ? '点击禁用' : '点击启用'}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              skill.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      )}
                      {/* Settings button (always visible) */}
                      <button
                        onClick={() => setSelectedSkillName(skill.name)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded transition-colors"
                      >
                        设置
                      </button>
                      {/* Run button (hasApp only, hover to show) */}
                      {skill.hasApp && (
                        <button
                          onClick={() => handleRunSkill(skill.name)}
                          className="px-3 py-1.5 bg-black hover:bg-gray-900 text-white text-sm font-medium rounded transition-all opacity-0 group-hover:opacity-100"
                        >
                          运行
                        </button>
                      )}
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
                <HelpCircle className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">帮助文档</h2>
              <p className="text-gray-500">即将推出...</p>
            </div>
          </div>
        )}
      </div>

      {/* Skill Detail Panel */}
      <SkillDetailPanel
        open={!!selectedSkillName}
        skillName={selectedSkillName}
        onClose={() => setSelectedSkillName(null)}
        onEnvSaved={() => loadSkills()}
        onRunSkill={handleRunSkill}
        onForkSkill={handleForkSkill}
        onDeleteSkill={deleteSkill}
      />
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
