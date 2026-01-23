"use client";
import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv } from '@/lib/motion';
import ServiceConnectionModal from '@/components/modals/ServiceConnectionModal';
import { Settings } from 'lucide-react';
import { useGlobalSettings } from '@/contexts/GlobalSettingsContext';
import { getModelDefinitionsForCli, normalizeModelId } from '@/lib/constants/cliModels';
import { fetchCliStatusSnapshot, createCliStatusFallback } from '@/hooks/useCLI';
import type { CLIStatus } from '@/types/cli';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface GlobalSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'general' | 'ai-agents' | 'services';
  embedded?: boolean; // New prop for non-modal mode
}

interface CLIOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  models: { id: string; name: string; }[];
  color: string;
  brandColor: string;
  downloadUrl: string;
  installCommand: string;
  enabled?: boolean;
}

const CLI_OPTIONS: CLIOption[] = [
  {
    id: 'claude',
    name: 'Claude兼容API',
    icon: '',
    description: '暂时不支持openai API',
    color: 'from-gray-700 to-gray-900',
    brandColor: '#374151',
    downloadUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    enabled: true,
    models: getModelDefinitionsForCli('claude').map(({ id, name }) => ({ id, name })),
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    icon: '',
    description: 'OpenAI Codex agent with GPT-5 support',
    color: 'from-slate-900 to-gray-700',
    brandColor: '#000000',
    downloadUrl: 'https://github.com/openai/codex',
    installCommand: 'npm install -g @openai/codex',
    enabled: false,
    models: getModelDefinitionsForCli('codex').map(({ id, name }) => ({ id, name })),
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    icon: '',
    description: 'Cursor CLI with multi-model router and autonomous tooling',
    color: 'from-slate-500 to-gray-600',
    brandColor: '#6B7280',
    downloadUrl: 'https://docs.cursor.com/en/cli/overview',
    installCommand: 'curl https://cursor.com/install -fsS | bash',
    enabled: false,
    models: getModelDefinitionsForCli('cursor').map(({ id, name }) => ({ id, name })),
  },
  {
    id: 'qwen',
    name: 'Qwen Coder',
    icon: '',
    description: 'Alibaba Qwen Code CLI with sandbox capabilities',
    color: 'from-emerald-500 to-teal-600',
    brandColor: '#11A97D',
    downloadUrl: 'https://github.com/QwenLM/qwen-code',
    installCommand: 'npm install -g @qwen-code/qwen-code',
    enabled: false,
    models: getModelDefinitionsForCli('qwen').map(({ id, name }) => ({ id, name })),
  },
  {
    id: 'glm',
    name: 'GLM CLI',
    icon: '',
    description: 'Zhipu GLM agent running on Claude Code runtime',
    color: 'from-blue-500 to-indigo-600',
    brandColor: '#1677FF',
    downloadUrl: 'https://docs.z.ai/devpack/tool/claude',
    installCommand: 'zai devpack install claude',
    enabled: false,
    models: getModelDefinitionsForCli('glm').map(({ id, name }) => ({ id, name })),
  },
];

// Global settings are provided by context

interface ServiceToken {
  id: string;
  provider: string;
  token: string;
  name?: string;
  created_at: string;
  last_used?: string;
}

export default function GlobalSettings({ isOpen, onClose, initialTab = 'ai-agents', embedded = false }: GlobalSettingsProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'ai-agents' | 'asr' | 'services'>(initialTab === 'general' ? 'ai-agents' : (initialTab as 'ai-agents' | 'asr' | 'services'));
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'github' | 'supabase' | 'vercel' | null>(null);
  const [tokens, setTokens] = useState<{ [key: string]: ServiceToken | null }>({
    aliyun: null,
    github: null,
    supabase: null,
    vercel: null
  });
  const [aliyunKeyId, setAliyunKeyId] = useState('');
  const [aliyunKeySecret, setAliyunKeySecret] = useState('');
  const [aliyunKeyVisible, setAliyunKeyVisible] = useState(false);
  const [aliyunSaving, setAliyunSaving] = useState(false);
  const [aliyunTesting, setAliyunTesting] = useState(false);
  const [aliyunMessage, setAliyunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cliStatus, setCLIStatus] = useState<CLIStatus>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { settings: globalSettings, setSettings: setGlobalSettings, refresh: refreshGlobalSettings } = useGlobalSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [selectedCLI, setSelectedCLI] = useState<CLIOption | null>(null);
  const [apiKeyVisibility, setApiKeyVisibility] = useState<Record<string, boolean>>({});
  const [apiTestState, setApiTestState] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});
  const [apiTestMessage, setApiTestMessage] = useState<Record<string, string>>({});
  // ASR settings state
  const [asrEnabled, setAsrEnabled] = useState(false);
  const [asrBaseUrl, setAsrBaseUrl] = useState('');
  const [asrSubmitUrl, setAsrSubmitUrl] = useState('');
  const [asrQueryUrlTemplate, setAsrQueryUrlTemplate] = useState('');
  const [asrSaving, setAsrSaving] = useState(false);
  const [asrMessage, setAsrMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Show toast function
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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

  const loadAllTokens = useCallback(async () => {
    const providers = ['aliyun', 'github', 'supabase', 'vercel'];
    const newTokens: { [key: string]: ServiceToken | null } = {};

    for (const provider of providers) {
      try {
        const response = await fetch(`${API_BASE}/api/tokens/${provider}`);
        if (response.ok) {
          const tokenData = await response.json();
          newTokens[provider] = tokenData;
          // 如果是阿里云且有 token，解析并填充输入框
          if (provider === 'aliyun' && tokenData?.token) {
            try {
              const parsed = JSON.parse(tokenData.token);
              setAliyunKeyId(parsed.id || '');
              setAliyunKeySecret(parsed.secret || '');
            } catch {
              // token 格式不是 JSON，忽略
            }
          }
        } else {
          newTokens[provider] = null;
        }
      } catch {
        newTokens[provider] = null;
      }
    }

    setTokens(newTokens);
  }, []);

  const handleServiceClick = (provider: 'github' | 'supabase' | 'vercel') => {
    setSelectedProvider(provider);
    setServiceModalOpen(true);
  };

  const handleServiceModalClose = () => {
    setServiceModalOpen(false);
    setSelectedProvider(null);
    loadAllTokens(); // Reload tokens after modal closes
  };

  const loadGlobalSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/settings/global`);
      if (response.ok) {
        const settings = await response.json();
        if (settings?.cli_settings) {
          for (const [cli, config] of Object.entries(settings.cli_settings)) {
            if (config && typeof config === 'object' && 'model' in config) {
              (config as any).model = normalizeModelId(cli, (config as any).model as string);
            }
          }
        }
        setGlobalSettings(settings);
        // Load ASR settings
        if (settings?.ai_services?.asr) {
          const asr = settings.ai_services.asr;
          setAsrEnabled(asr.enabled || false);
          if (asr.wanjie) {
            setAsrBaseUrl(asr.wanjie.base_url || '');
            setAsrSubmitUrl(asr.wanjie.submit_url || '');
            setAsrQueryUrlTemplate(asr.wanjie.query_url_template || '');
          }
        }
      }
    } catch (error) {
      console.error('Failed to load global settings:', error);
    }
  }, [setGlobalSettings]);

  const checkCLIStatus = useCallback(async () => {
    const checkingStatus: CLIStatus = CLI_OPTIONS.reduce((acc, cli) => {
      acc[cli.id] = { installed: true, checking: true };
      return acc;
    }, {} as CLIStatus);
    setCLIStatus(checkingStatus);

    try {
      const status = await fetchCliStatusSnapshot();
      setCLIStatus(status);
    } catch (error) {
      console.error('Error checking CLI status:', error);
      setCLIStatus(createCliStatusFallback());
    }
  }, []);

  // Load all service tokens and CLI data
  useEffect(() => {
    if (isOpen) {
      loadAllTokens();
      loadGlobalSettings();
      checkCLIStatus();
    }
  }, [isOpen, loadAllTokens, loadGlobalSettings, checkCLIStatus]);

  const saveGlobalSettings = async () => {
    setIsLoading(true);
    setSaveMessage(null);
    
    try {
      const payload = JSON.parse(JSON.stringify(globalSettings));
      if (payload?.cli_settings) {
        for (const [cli, config] of Object.entries(payload.cli_settings)) {
          if (config && typeof config === 'object' && 'model' in config) {
            (config as any).model = normalizeModelId(cli, (config as any).model as string);
          }
        }
      }

      const response = await fetch(`${API_BASE}/api/settings/global`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save settings');
      }
      
      setSaveMessage({ 
        type: 'success', 
        text: 'Settings saved successfully!' 
      });
      // make sure context stays in sync
      try {
        await refreshGlobalSettings();
      } catch {}
      
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
      
    } catch (error) {
      console.error('Failed to save global settings:', error);
      setSaveMessage({ 
        type: 'error', 
        text: 'Failed to save settings. Please try again.' 
      });
      
      // Clear error message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };


  const setDefaultCLI = (cliId: string) => {
    const cliInstalled = cliStatus[cliId]?.installed;
    if (!cliInstalled) return;
    
    setGlobalSettings(prev => ({
      ...prev,
      default_cli: cliId
    }));
  };

  const setDefaultModel = (cliId: string, modelId: string) => {
    setGlobalSettings(prev => ({
      ...prev,
      cli_settings: {
        ...(prev?.cli_settings ?? {}),
        [cliId]: {
          ...(prev?.cli_settings?.[cliId] ?? {}),
          model: normalizeModelId(cliId, modelId)
        }
      }
    }));
  };

  const setCliApiKey = (cliId: string, apiKey: string) => {
    setGlobalSettings(prev => {
      const nextCliSettings = { ...(prev?.cli_settings ?? {}) };
      const existing = { ...(nextCliSettings[cliId] ?? {}) };
      const trimmed = apiKey.trim();

      if (trimmed.length > 0) {
        existing.apiKey = trimmed;
        nextCliSettings[cliId] = existing;
      } else {
        delete existing.apiKey;
        if (Object.keys(existing).length > 0) {
          nextCliSettings[cliId] = existing;
        } else {
          delete nextCliSettings[cliId];
        }
      }

      return {
        ...prev,
        cli_settings: nextCliSettings,
      };
    });
  };

  const setCliApiUrl = (cliId: string, apiUrl: string) => {
    setGlobalSettings(prev => {
      const nextCliSettings = { ...(prev?.cli_settings ?? {}) };
      const existing = { ...(nextCliSettings[cliId] ?? {}) };
      const trimmed = apiUrl.trim();

      if (trimmed.length > 0) {
        existing.apiUrl = trimmed;
        nextCliSettings[cliId] = existing;
      } else {
        delete existing.apiUrl;
        if (Object.keys(existing).length > 0) {
          nextCliSettings[cliId] = existing;
        } else {
          delete nextCliSettings[cliId];
        }
      }

      return {
        ...prev,
        cli_settings: nextCliSettings,
      };
    });
  };

  const setCliCustomModel = (cliId: string, customModel: string) => {
    setGlobalSettings(prev => {
      const nextCliSettings = { ...(prev?.cli_settings ?? {}) };
      const existing = { ...(nextCliSettings[cliId] ?? {}) };
      const trimmed = customModel.trim();

      if (trimmed.length > 0) {
        existing.customModel = trimmed;
        nextCliSettings[cliId] = existing;
      } else {
        delete existing.customModel;
        if (Object.keys(existing).length > 0) {
          nextCliSettings[cliId] = existing;
        } else {
          delete nextCliSettings[cliId];
        }
      }

      return {
        ...prev,
        cli_settings: nextCliSettings,
      };
    });
  };

  const toggleApiKeyVisibility = (cliId: string) => {
    setApiKeyVisibility(prev => ({
      ...prev,
      [cliId]: !prev[cliId],
    }));
  };

  const testClaudeApi = async (cliId: string) => {
    const settings = globalSettings.cli_settings[cliId] || {};
    const apiKey = settings.apiKey;
    const apiUrl = settings.apiUrl;

    if (!apiKey) {
      setApiTestState(prev => ({ ...prev, [cliId]: 'error' }));
      setApiTestMessage(prev => ({ ...prev, [cliId]: 'API Key is required' }));
      setTimeout(() => {
        setApiTestState(prev => ({ ...prev, [cliId]: 'idle' }));
        setApiTestMessage(prev => ({ ...prev, [cliId]: '' }));
      }, 3000);
      return;
    }

    setApiTestState(prev => ({ ...prev, [cliId]: 'testing' }));
    setApiTestMessage(prev => ({ ...prev, [cliId]: '' }));

    try {
      const response = await fetch(`${API_BASE}/api/settings/test-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliId,
          apiKey,
          apiUrl: apiUrl || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setApiTestState(prev => ({ ...prev, [cliId]: 'success' }));
        setApiTestMessage(prev => ({ ...prev, [cliId]: result.message || 'Connection successful' }));
      } else {
        setApiTestState(prev => ({ ...prev, [cliId]: 'error' }));
        setApiTestMessage(prev => ({ ...prev, [cliId]: result.message || 'Connection failed' }));
      }
    } catch (error) {
      setApiTestState(prev => ({ ...prev, [cliId]: 'error' }));
      setApiTestMessage(prev => ({ ...prev, [cliId]: 'Network error: ' + (error instanceof Error ? error.message : 'Unknown error') }));
    }

    setTimeout(() => {
      setApiTestState(prev => ({ ...prev, [cliId]: 'idle' }));
      setApiTestMessage(prev => ({ ...prev, [cliId]: '' }));
    }, 3000);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'github':
        return (
          <svg width="20" height="20" viewBox="0 0 98 96" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="currentColor"/>
          </svg>
        );
      case 'supabase':
        return (
          <svg width="20" height="20" viewBox="0 0 109 113" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z" fill="url(#paint0_linear)"/>
            <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z" fill="#3ECF8E"/>
            <defs>
              <linearGradient id="paint0_linear" x1="53.9738" y1="54.974" x2="94.1635" y2="71.8295" gradientUnits="userSpaceOnUse">
                <stop stopColor="#249361"/>
                <stop offset="1" stopColor="#3ECF8E"/>
              </linearGradient>
            </defs>
          </svg>
        );
      case 'vercel':
        return (
          <svg width="20" height="20" viewBox="0 0 76 65" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor"/>
          </svg>
        );
      case 'aliyun':
        return (
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 4L4 9.5V16C4 23 10 27.5 16 28C22 27.5 28 23 28 16V9.5L16 4Z" fill="#FF6A00"/>
            <path d="M16 8L10 10.5V14.5C10 18.5 13 21 16 21.5C19 21 22 18.5 22 14.5V10.5L16 8Z" fill="white"/>
          </svg>
        );
      default:
        return null;
    }
  };

  // 阿里云 AccessKey 保存
  const handleSaveAliyunKey = async () => {
    if (!aliyunKeyId.trim() || !aliyunKeySecret.trim()) {
      setAliyunMessage({ type: 'error', text: 'AccessKeyId 和 AccessKeySecret 都是必填项' });
      setTimeout(() => setAliyunMessage(null), 3000);
      return;
    }

    setAliyunSaving(true);
    try {
      const tokenValue = JSON.stringify({ id: aliyunKeyId.trim(), secret: aliyunKeySecret.trim() });
      const response = await fetch(`${API_BASE}/api/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'aliyun',
          token: tokenValue,
          name: 'Aliyun AccessKey'
        })
      });

      if (response.ok) {
        setAliyunMessage({ type: 'success', text: '阿里云 AccessKey 保存成功' });
        loadAllTokens();
      } else {
        const error = await response.text();
        setAliyunMessage({ type: 'error', text: `保存失败: ${error}` });
      }
    } catch (error) {
      setAliyunMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setAliyunSaving(false);
      setTimeout(() => setAliyunMessage(null), 3000);
    }
  };

  // 阿里云 AccessKey 删除
  const handleDeleteAliyunKey = async () => {
    const aliyunToken = tokens.aliyun;
    if (!aliyunToken) return;

    if (!confirm('确定要删除阿里云 AccessKey 吗？')) return;

    setAliyunSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/tokens/${aliyunToken.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setAliyunKeyId('');
        setAliyunKeySecret('');
        setAliyunMessage({ type: 'success', text: 'AccessKey 已删除' });
        loadAllTokens();
      } else {
        setAliyunMessage({ type: 'error', text: '删除失败' });
      }
    } catch {
      setAliyunMessage({ type: 'error', text: '删除失败，请重试' });
    } finally {
      setAliyunSaving(false);
      setTimeout(() => setAliyunMessage(null), 3000);
    }
  };

  // 阿里云 AccessKey 验证
  const handleTestAliyunKey = async () => {
    if (!aliyunKeyId.trim() || !aliyunKeySecret.trim()) {
      setAliyunMessage({ type: 'error', text: 'AccessKeyId 和 AccessKeySecret 都是必填项' });
      setTimeout(() => setAliyunMessage(null), 3000);
      return;
    }

    setAliyunTesting(true);
    setAliyunMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/settings/test-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliId: 'aliyun',
          accessKeyId: aliyunKeyId.trim(),
          accessKeySecret: aliyunKeySecret.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setAliyunMessage({ type: 'success', text: result.message });
      } else {
        setAliyunMessage({ type: 'error', text: result.message });
      }
    } catch (error) {
      setAliyunMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setAliyunTesting(false);
      setTimeout(() => setAliyunMessage(null), 5000);
    }
  };

  if (!isOpen) return null;

  const containerClass = embedded
    ? "relative bg-white w-full h-full flex flex-col"
    : "relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[700px] border border-gray-200 flex flex-col";

  const ContentWrapper = embedded ? 'div' : MotionDiv;
  const contentProps = embedded ? {} : {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 },
    transition: { duration: 0.2 }
  };

  const content = (
    <ContentWrapper
      className={containerClass}
      {...contentProps}
    >
          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-gray-500" />
                <h2 className="text-base font-medium text-gray-900">Settings</h2>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 ">
            <nav className="flex px-5">
              {[
                { id: 'ai-agents' as const, label: 'LLM API' },
                { id: 'asr' as const, label: 'ASR' },
                { id: 'services' as const, label: 'Services' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-gray-900 text-gray-900 '
                      : 'border-transparent text-gray-600 hover:text-gray-700 hover:border-gray-300 '
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Preferences</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div>
                        <p className="font-medium text-gray-900">Auto-save projects</p>
                        <p className="text-sm text-gray-600">Automatically save changes to projects</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-white rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div>
                        <p className="font-medium text-gray-900 ">Show file extensions</p>
                        <p className="text-sm text-gray-600 ">Display file extensions in code explorer</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-white rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai-agents' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">Claude兼容API（暂不支持OpenAI）</span>
                    <select
                      value={globalSettings.default_cli}
                      onChange={(e) => setDefaultCLI(e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-200 rounded bg-white text-gray-600 focus:outline-none"
                    >
                      {CLI_OPTIONS.filter(cli => cliStatus[cli.id]?.installed && cli.enabled !== false).map(cli => (
                        <option key={cli.id} value={cli.id}>
                          {cli.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    {saveMessage && (
                      <span className={`text-xs ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {saveMessage.text}
                      </span>
                    )}
                    <button
                      onClick={saveGlobalSettings}
                      disabled={isLoading}
                      className="px-3 py-1 text-xs font-medium bg-gray-900 hover:bg-gray-800 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {isLoading ? '保存...' : '保存'}
                    </button>
                  </div>
                </div>

                {/* CLI Agents Grid */}
                <div className="divide-y divide-gray-100">
                  {CLI_OPTIONS.filter(cli => cli.enabled !== false).map((cli) => {
                    const status = cliStatus[cli.id];
                    const settings = globalSettings.cli_settings[cli.id] || {};
                    const isChecking = status?.checking || false;
                    const isInstalled = status?.installed || false;
                    const isDefault = globalSettings.default_cli === cli.id;

                    return (
                      <div
                        key={cli.id}
                        className="py-4 first:pt-0"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-shrink-0">
                            {cli.id === 'claude' && (
                              <Image src="/claude.png" alt="Claude" width={24} height={24} className="w-6 h-6" />
                            )}
                            {cli.id === 'cursor' && (
                              <Image src="/cursor.png" alt="Cursor" width={24} height={24} className="w-6 h-6" />
                            )}
                            {cli.id === 'codex' && (
                              <Image src="/oai.png" alt="Codex" width={24} height={24} className="w-6 h-6" />
                            )}
                            {cli.id === 'qwen' && (
                              <Image src="/qwen.png" alt="Qwen" width={24} height={24} className="w-6 h-6" />
                            )}
                            {cli.id === 'glm' && (
                              <Image src="/glm.svg" alt="GLM" width={24} height={24} className="w-6 h-6" />
                            )}
                            {cli.id === 'gemini' && (
                              <Image src="/gemini.png" alt="Gemini" width={24} height={24} className="w-6 h-6" />
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-800">{cli.name}</span>
                        </div>

                        {/* Model Selection and API Configuration */}
                        <div className="space-y-3 pl-9">
                            {cli.id !== 'claude' && (
                              <select
                                value={settings.model || ''}
                                onChange={(e) => setDefaultModel(cli.id, e.target.value)}
                                className="w-full px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-700 text-xs focus:outline-none"
                              >
                                <option value="">Select model</option>
                                {cli.models.map(model => (
                                  <option key={model.id} value={model.id}>
                                    {model.name}
                                  </option>
                                ))}
                              </select>
                            )}

                            {cli.id === 'glm' && (
                              <div className="space-y-1">
                                <label className="text-xs text-gray-500">API Key</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type={apiKeyVisibility[cli.id] ? 'text' : 'password'}
                                    value={settings.apiKey ?? ''}
                                    onChange={(e) => setCliApiKey(cli.id, e.target.value)}
                                    placeholder="Enter GLM API key"
                                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded bg-white text-sm text-gray-700 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleApiKeyVisibility(cli.id); }}
                                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded bg-white"
                                  >
                                    {apiKeyVisibility[cli.id] ? 'Hide' : 'Show'}
                                  </button>
                                </div>
                              </div>
                            )}
                            {cli.id === 'cursor' && (
                              <div className="space-y-1">
                                <label className="text-xs text-gray-500">API Key (optional)</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type={apiKeyVisibility[cli.id] ? 'text' : 'password'}
                                    value={settings.apiKey ?? ''}
                                    onChange={(e) => setCliApiKey(cli.id, e.target.value)}
                                    placeholder="Enter Cursor API key"
                                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded bg-white text-sm text-gray-700 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleApiKeyVisibility(cli.id); }}
                                    className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded bg-white"
                                  >
                                    {apiKeyVisibility[cli.id] ? 'Hide' : 'Show'}
                                  </button>
                                </div>
                              </div>
                            )}
                            {cli.id === 'claude' && (
                              <div className="space-y-3">
                                {/* 古德白推荐 */}
                                <div className="flex items-center gap-3 px-3 py-2 border border-orange-200 bg-orange-50 rounded">
                                  <span className="text-orange-500 text-sm">⭐</span>
                                  <div className="flex-1 flex items-center gap-2 text-[12px]">
                                    <span className="font-medium text-orange-700">古德白推荐</span>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const registerUrl = 'https://api.100agent.co/register?aff=H7ZZ';
                                        if (typeof window !== 'undefined' && (window as any).desktopAPI?.openExternal) {
                                          await (window as any).desktopAPI.openExternal(registerUrl);
                                        } else {
                                          window.open(registerUrl, '_blank');
                                        }
                                      }}
                                      className="text-blue-600 hover:underline font-medium"
                                    >
                                      算力平台 →
                                    </button>
                                    <span className="text-gray-500">注册 → 充值 → 添加令牌 → 复制密钥</span>
                                  </div>
                                </div>

                                {/* API Key */}
                                <div className="space-y-1">
                                  <label className="text-xs text-gray-500">API Key</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type={apiKeyVisibility[cli.id] ? 'text' : 'password'}
                                      value={settings.apiKey ?? ''}
                                      onChange={(e) => setCliApiKey(cli.id, e.target.value)}
                                      placeholder="sk-ant-xxx or custom auth token"
                                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded bg-white text-sm text-gray-700 focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleApiKeyVisibility(cli.id); }}
                                      className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded bg-white"
                                    >
                                      {apiKeyVisibility[cli.id] ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); testClaudeApi(cli.id); }}
                                      disabled={apiTestState[cli.id] === 'testing'}
                                      className={`px-2 py-1.5 text-xs border rounded ${
                                        apiTestState[cli.id] === 'testing' ? 'text-gray-400 border-gray-200' :
                                        apiTestState[cli.id] === 'success' ? 'text-green-600 border-green-300' :
                                        apiTestState[cli.id] === 'error' ? 'text-red-600 border-red-300' :
                                        'text-gray-500 border-gray-200 hover:text-gray-700'
                                      }`}
                                    >
                                      {apiTestState[cli.id] === 'testing' ? '...' :
                                       apiTestState[cli.id] === 'success' ? '✓' :
                                       apiTestState[cli.id] === 'error' ? '✗' : '测试'}
                                    </button>
                                  </div>
                                  {apiTestMessage[cli.id] && (
                                    <p className={`text-[11px] ${apiTestState[cli.id] === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                      {apiTestMessage[cli.id]}
                                    </p>
                                  )}
                                </div>

                                {/* API Base URL */}
                                <div className="space-y-1">
                                  <label className="text-xs text-gray-500">API Base URL (Optional)</label>
                                  <input
                                    type="text"
                                    value={typeof settings.apiUrl === 'string' ? settings.apiUrl : ''}
                                    onChange={(e) => setCliApiUrl(cli.id, e.target.value)}
                                    placeholder="https://api.100agent.co (默认)"
                                    className="w-full px-3 py-1.5 border border-gray-200 rounded bg-white text-sm text-gray-700 focus:outline-none"
                                  />
                                </div>

                                {/* Model Selection */}
                                <div className="space-y-1">
                                  <label className="text-xs text-gray-500">模型 (Optional)</label>
                                  <select
                                    value={settings.model || ''}
                                    onChange={(e) => setDefaultModel(cli.id, e.target.value)}
                                    className="w-full px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-700 text-sm focus:outline-none"
                                  >
                                    <option value="">Select model</option>
                                    {cli.models.map(model => (
                                      <option key={model.id} value={model.id}>
                                        {model.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Custom Model ID */}
                                <div className="space-y-1">
                                  <label className="text-xs text-gray-500">自定义模型 ID (Optional)</label>
                                  <input
                                    type="text"
                                    value={typeof settings.customModel === 'string' ? settings.customModel : ''}
                                    onChange={(e) => setCliCustomModel(cli.id, e.target.value)}
                                    placeholder="如: doubao-seed-code-preview-251028"
                                    className="w-full px-3 py-1.5 border border-gray-200 rounded bg-white text-sm text-gray-700 focus:outline-none"
                                  />
                                  <p className="text-[11px] text-gray-400">用于第三方兼容API，填写后覆盖上方模型选择器</p>
                                </div>
                              </div>
                            )}
                          </div>
                      </div>
                    );
                  })}

                </div>
              </div>
            )}

            {activeTab === 'asr' && (
              <div className="space-y-6">
                {/* ASR Service Configuration */}
                <div className="border border-gray-200 rounded-xl p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl ring-1 ring-inset ring-gray-200 bg-white flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 text-sm">ASR Speech Recognition (Wanjie)</h4>
                        {asrEnabled && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-emerald-700 bg-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Enabled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600">
                        Configure ASR service for speech-to-text in sub-projects and Skills
                      </p>
                    </div>
                  </div>

                  {/* Enable Toggle */}
                  <div className="flex items-center justify-between p-3 mb-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Enable ASR Service</p>
                      <p className="text-xs text-gray-500">Inject ASR config into sub-projects and Skills</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={asrEnabled}
                        onChange={(e) => setAsrEnabled(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                  </div>

                  {/* ASR URLs Configuration */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Base URL</label>
                      <input
                        type="text"
                        value={asrBaseUrl}
                        onChange={(e) => setAsrBaseUrl(e.target.value)}
                        placeholder="http://your-asr-server:port"
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Submit URL</label>
                      <input
                        type="text"
                        value={asrSubmitUrl}
                        onChange={(e) => setAsrSubmitUrl(e.target.value)}
                        placeholder="http://your-asr-server:port/v1/audio/transcriptions"
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                      <p className="text-[11px] text-gray-500">Endpoint for submitting audio files</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Query URL Template</label>
                      <input
                        type="text"
                        value={asrQueryUrlTemplate}
                        onChange={(e) => setAsrQueryUrlTemplate(e.target.value)}
                        placeholder="http://your-asr-server:port/v1/audio/transcriptions/{task_id}"
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                      <p className="text-[11px] text-gray-500">Use {'{task_id}'} as placeholder for task ID</p>
                    </div>

                    {/* Message */}
                    {asrMessage && (
                      <p className={`text-[11px] leading-snug ${asrMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {asrMessage.text}
                      </p>
                    )}

                    {/* Save Button */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={async () => {
                          setAsrSaving(true);
                          setAsrMessage(null);
                          try {
                            const response = await fetch(`${API_BASE}/api/settings/global`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                ai_services: {
                                  asr: {
                                    enabled: asrEnabled,
                                    provider: 'wanjie',
                                    wanjie: {
                                      base_url: asrBaseUrl.trim(),
                                      submit_url: asrSubmitUrl.trim(),
                                      query_url_template: asrQueryUrlTemplate.trim(),
                                    }
                                  }
                                }
                              })
                            });
                            if (response.ok) {
                              setAsrMessage({ type: 'success', text: 'ASR settings saved successfully' });
                              await refreshGlobalSettings();
                            } else {
                              setAsrMessage({ type: 'error', text: 'Failed to save ASR settings' });
                            }
                          } catch (error) {
                            setAsrMessage({ type: 'error', text: 'Network error, please try again' });
                          } finally {
                            setAsrSaving(false);
                            setTimeout(() => setAsrMessage(null), 3000);
                          }
                        }}
                        disabled={asrSaving}
                        className="px-4 py-1.5 text-sm font-medium bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {asrSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-gray-900">
                        How it works
                      </h3>
                      <div className="mt-2 text-sm text-gray-700">
                        <p>
                          When enabled, ASR configuration will be automatically injected into:
                        </p>
                        <ul className="list-disc list-inside mt-1 text-xs text-gray-600">
                          <li>Sub-project preview processes (as environment variables)</li>
                          <li>Claude Agent system prompts (with usage examples)</li>
                          <li>Skill execution environments</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'services' && (
              <div className="space-y-6">
                {/* 阿里云 AccessKey 配置卡片 - 放在第一个 */}
                <div className="border border-gray-400 rounded-xl p-6 bg-gray-50/30">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl ring-1 ring-inset ring-gray-200 bg-white flex items-center justify-center">
                      {getProviderIcon('aliyun')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 text-sm">阿里云 AccessKey</h4>
                        {tokens.aliyun && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-emerald-700 bg-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            已配置
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600">
                        用于部署项目到阿里云函数计算（Function Compute），Serverless 架构，国内访问更快
                      </p>
                    </div>
                  </div>

                  {/* 获取引导 */}
                  <div className="flex items-center gap-3 p-3 mb-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      {getProviderIcon('aliyun')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-relaxed text-gray-700">
                        前往阿里云控制台创建 AccessKey，建议使用 RAM 子用户并授予<strong className="font-medium text-gray-900">函数计算权限</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const url = 'https://ram.console.aliyun.com/manage/ak';
                        if (typeof window !== 'undefined' && (window as any).desktopAPI?.openExternal) {
                          await (window as any).desktopAPI.openExternal(url);
                        } else {
                          window.open(url, '_blank');
                        }
                      }}
                      className="flex-shrink-0 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-normal rounded border border-gray-200 transition-colors whitespace-nowrap"
                    >
                      获取 AccessKey
                    </button>
                  </div>

                  {/* AccessKey 输入 */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">AccessKey ID</label>
                      <input
                        type="text"
                        value={aliyunKeyId}
                        onChange={(e) => setAliyunKeyId(e.target.value)}
                        placeholder="LTAI5t..."
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">AccessKey Secret</label>
                      <div className="flex items-center gap-2">
                        <input
                          type={aliyunKeyVisible ? 'text' : 'password'}
                          value={aliyunKeySecret}
                          onChange={(e) => setAliyunKeySecret(e.target.value)}
                          placeholder="输入 AccessKey Secret"
                          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => setAliyunKeyVisible(!aliyunKeyVisible)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg bg-white transition-colors"
                        >
                          {aliyunKeyVisible ? '隐藏' : '显示'}
                        </button>
                      </div>
                    </div>

                    {/* 消息提示 */}
                    {aliyunMessage && (
                      <p className={`text-[11px] leading-snug ${aliyunMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {aliyunMessage.text}
                      </p>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={handleTestAliyunKey}
                        disabled={aliyunTesting || !aliyunKeyId.trim() || !aliyunKeySecret.trim()}
                        className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {aliyunTesting ? '验证中...' : '验证'}
                      </button>
                      <button
                        onClick={handleSaveAliyunKey}
                        disabled={aliyunSaving || (!aliyunKeyId.trim() && !aliyunKeySecret.trim())}
                        className="px-4 py-1.5 text-sm font-medium bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {aliyunSaving ? '保存中...' : '保存'}
                      </button>
                      {tokens.aliyun && (
                        <button
                          onClick={handleDeleteAliyunKey}
                          disabled={aliyunSaving}
                          className="px-4 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors disabled:opacity-50"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 其他 Service Tokens */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">其他服务</h3>

                  <div className="space-y-4">
                    {Object.entries(tokens)
                      .filter(([provider]) => provider !== 'aliyun')
                      .map(([provider, token]) => (
                      <div key={provider} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 ">
                        <div className="flex items-center gap-3">
                          <div className="text-gray-700 ">
                            {getProviderIcon(provider)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 capitalize">{provider}</p>
                            <p className="text-sm text-gray-600 ">
                              {token ? (
                                <>
                                  Token configured • Added {new Date(token.created_at).toLocaleDateString()}
                                </>
                              ) : (
                                'Token not configured'
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {token && (
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                          )}
                          <button
                            onClick={() => handleServiceClick(provider as 'github' | 'supabase' | 'vercel')}
                            className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-all"
                          >
                            {token ? 'Update Token' : 'Add Token'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200 ">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-gray-900 ">
                          Token Configuration
                        </h3>
                        <div className="mt-2 text-sm text-gray-700 ">
                          <p>
                            Tokens configured here will be available for all projects. To connect a project to specific repositories
                            and services, use the Project Settings in each individual project.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ContentWrapper>
  );

  if (embedded) {
    return content;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
          onClick={onClose}
        />
        {content}
      </div>

      {/* Service Connection Modal */}
      {selectedProvider && (
        <ServiceConnectionModal
          isOpen={serviceModalOpen}
          onClose={handleServiceModalClose}
          provider={selectedProvider}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[80] px-4 py-3 rounded-lg shadow-2xl transition-all transform animate-slide-in-up ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Install Guide Modal */}
      {installModalOpen && selectedCLI && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" key={`modal-${selectedCLI.id}`}>
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => {
              setInstallModalOpen(false);
              setSelectedCLI(null);
            }}
          />
          
          <div 
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 transform"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-gray-200 ">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedCLI.id === 'claude' && (
                    <Image src="/claude.png" alt="Claude" width={32} height={32} className="w-8 h-8" />
                  )}
                  {selectedCLI.id === 'cursor' && (
                    <Image src="/cursor.png" alt="Cursor" width={32} height={32} className="w-8 h-8" />
                  )}
                  {selectedCLI.id === 'codex' && (
                    <Image src="/oai.png" alt="Codex" width={32} height={32} className="w-8 h-8" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 ">
                      Install {selectedCLI.name}
                    </h3>
                    <p className="text-sm text-gray-600 ">
                      Follow these steps to get started
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setInstallModalOpen(false);
                    setSelectedCLI(null);
                  }}
                  className="text-gray-600 hover:text-gray-900 transition-colors p-1 hover:bg-gray-100 rounded-lg"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Step 1: Install */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900 ">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs" style={{ backgroundColor: selectedCLI.brandColor }}>
                    1
                  </span>
                  Install CLI
                </div>
                <div className="ml-8 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                  <code className="text-sm text-gray-800 flex-1">
                    {selectedCLI.installCommand}
                  </code>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      (async () => {
                        const ok = await copyTextSafe(selectedCLI.installCommand);
                        showToast(ok ? 'Command copied to clipboard' : 'Failed to copy command', ok ? 'success' : 'error');
                      })();
                    }}
                    className="text-gray-500 hover:text-gray-700 "
                    title="Copy command"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 3h10a2 2 0 012 2v10M9 3H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M9 3v2a2 2 0 002 2h6a2 2 0 002-2V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Step 2: Authenticate */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900 ">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs" style={{ backgroundColor: selectedCLI.brandColor }}>
                    2
                  </span>
                  {selectedCLI.id === 'gemini' && 'Authenticate (OAuth or API Key)'}
                  {selectedCLI.id === 'glm' && 'Authenticate (Z.ai DevPack login)'}
                  {selectedCLI.id === 'qwen' && 'Authenticate (Qwen OAuth or API Key)'}
                  {selectedCLI.id === 'codex' && 'Start Codex and sign in'}
                  {selectedCLI.id === 'claude' && 'Start Claude and sign in'}
                  {selectedCLI.id === 'cursor' && 'Start Cursor CLI and sign in'}
                </div>
                <div className="ml-8 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                  <code className="text-sm text-gray-800 flex-1">
                    {selectedCLI.id === 'claude' ? 'claude' :
                     selectedCLI.id === 'cursor' ? 'cursor-agent' :
                     selectedCLI.id === 'codex' ? 'codex' :
                     selectedCLI.id === 'qwen' ? 'qwen' :
                     selectedCLI.id === 'glm' ? 'zai' :
                     selectedCLI.id === 'gemini' ? 'gemini' : ''}
                  </code>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const authCmd = selectedCLI.id === 'claude' ? 'claude' :
                                      selectedCLI.id === 'cursor' ? 'cursor-agent' :
                                      selectedCLI.id === 'codex' ? 'codex' :
                                      selectedCLI.id === 'qwen' ? 'qwen' :
                                      selectedCLI.id === 'glm' ? 'zai' :
                                      selectedCLI.id === 'gemini' ? 'gemini' : '';
                      (async () => {
                        const ok = authCmd ? await copyTextSafe(authCmd) : false;
                        showToast(ok ? 'Command copied to clipboard' : 'Failed to copy command', ok ? 'success' : 'error');
                      })();
                    }}
                    className="text-gray-500 hover:text-gray-700 "
                    title="Copy command"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 3h10a2 2 0 012 2v10M9 3H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M9 3v2a2 2 0 002 2h6a2 2 0 002-2V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Step 3: Test */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900 ">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs" style={{ backgroundColor: selectedCLI.brandColor }}>
                    3
                  </span>
                  Test your installation
                </div>
                <div className="ml-8 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                  <code className="text-sm text-gray-800 flex-1">
                    {selectedCLI.id === 'claude' ? 'claude --version' :
                     selectedCLI.id === 'cursor' ? 'cursor-agent --version' :
                     selectedCLI.id === 'codex' ? 'codex --version' :
                     selectedCLI.id === 'qwen' ? 'qwen --version' :
                     selectedCLI.id === 'glm' ? 'zai --version' :
                     selectedCLI.id === 'gemini' ? 'gemini --version' : ''}
                  </code>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const versionCmd = selectedCLI.id === 'claude' ? 'claude --version' :
                                        selectedCLI.id === 'cursor' ? 'cursor-agent --version' :
                                        selectedCLI.id === 'codex' ? 'codex --version' :
                                        selectedCLI.id === 'qwen' ? 'qwen --version' :
                                        selectedCLI.id === 'glm' ? 'zai --version' :
                                        selectedCLI.id === 'gemini' ? 'gemini --version' : '';
                      (async () => {
                        const ok = versionCmd ? await copyTextSafe(versionCmd) : false;
                        showToast(ok ? 'Command copied to clipboard' : 'Failed to copy command', ok ? 'success' : 'error');
                      })();
                    }}
                    className="text-gray-500 hover:text-gray-700 "
                    title="Copy command"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 3h10a2 2 0 012 2v10M9 3H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M9 3v2a2 2 0 002 2h6a2 2 0 002-2V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Minimal guide only; removed extra info */}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-200 flex justify-between">
              <button
                onClick={() => checkCLIStatus()}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Refresh Status
              </button>
              <button
                onClick={() => {
                  setInstallModalOpen(false);
                  setSelectedCLI(null);
                }}
                className="px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
