"use client";
import { useEffect, useState, useRef, useCallback, useMemo, type ChangeEvent, type KeyboardEvent, type UIEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv, MotionH3, MotionP, MotionButton } from '@/lib/motion';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Code, Monitor, Smartphone, Play, Square, RefreshCw, Settings, Folder, FolderOpen,
  File as FileIcon, FileCode, Palette, Braces, Atom, Workflow, Ship, GitBranch, FileText,
  Database, Coffee, Triangle, Lock, Home, ChevronUp, ChevronRight, ChevronDown,
  ArrowLeft, ArrowRight, RotateCcw, Share2, Type, Bird, Gem, Flame, List, Plus,
  HelpCircle, ExternalLink
} from 'lucide-react';
import ChatLog from '@/components/chat/ChatLog';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { AIAssistantSettings } from '@/components/settings/AIAssistantSettings';
import { EnvironmentSettings } from '@/components/settings/EnvironmentSettings';
import ChatInput from '@/components/chat/ChatInput';
import { ChatErrorBoundary } from '@/components/ErrorBoundary';
import AppSidebar from '@/components/layout/AppSidebar';
import { useGlobalSettings } from '@/contexts/GlobalSettingsContext';
import AliyunDeployPage from '@/components/deploy/AliyunDeployPage';
import PreviewTabs from '@/components/preview/PreviewTabs';
import { getDefaultModelForCli, getModelDisplayName } from '@/lib/constants/cliModels';
import {
  ACTIVE_CLI_BRAND_COLORS,
  ACTIVE_CLI_IDS,
  ACTIVE_CLI_MODEL_OPTIONS,
  ACTIVE_CLI_NAME_MAP,
  DEFAULT_ACTIVE_CLI,
  buildActiveModelOptions,
  normalizeModelForCli,
  sanitizeActiveCli,
  type ActiveCliId,
  type ActiveModelOption,
} from '@/lib/utils/cliOptions';

// No longer loading ProjectSettings (managed by global settings on main page)

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

let focusInputRefGlobal: { fn: null | (() => void) } | undefined;
let inputControlRefGlobal: { control: null | { focus: () => void; setMessage: (msg: string) => void } } | undefined;

const assistantBrandColors = ACTIVE_CLI_BRAND_COLORS;

const CLI_LABELS = ACTIVE_CLI_NAME_MAP;

const CLI_ORDER = ACTIVE_CLI_IDS;

const sanitizeCli = (cli?: string | null) => sanitizeActiveCli(cli, DEFAULT_ACTIVE_CLI);

const sanitizeModel = (cli: string, model?: string | null) => normalizeModelForCli(cli, model, DEFAULT_ACTIVE_CLI);

// Function to convert hex to CSS filter for tinting white images
// Since the original image is white (#FFFFFF), we can apply filters more accurately
const hexToFilter = (hex: string): string => {
  // For white source images, we need to invert and adjust
  const filters: { [key: string]: string } = {
    '#DE7356': 'brightness(0) saturate(100%) invert(52%) sepia(73%) saturate(562%) hue-rotate(336deg) brightness(95%) contrast(91%)',
    '#000000': 'brightness(0) saturate(100%)',
    '#11A97D': 'brightness(0) saturate(100%) invert(57%) sepia(30%) saturate(747%) hue-rotate(109deg) brightness(90%) contrast(92%)',
    '#1677FF': 'brightness(0) saturate(100%) invert(40%) sepia(86%) saturate(1806%) hue-rotate(201deg) brightness(98%) contrast(98%)',
  };
  return filters[hex] || filters['#DE7356'];
};

type Entry = { path: string; type: 'file'|'dir'; size?: number };
type ProjectStatus = 'initializing' | 'active' | 'failed';

type CliStatusSnapshot = {
  available?: boolean;
  configured?: boolean;
  models?: string[];
};

type ModelOption = Omit<ActiveModelOption, 'cli'> & { cli: string };

const buildModelOptions = (statuses: Record<string, CliStatusSnapshot>): ModelOption[] =>
  buildActiveModelOptions(statuses).map(option => ({
    ...option,
    cli: option.cli,
  }));

// TreeView component for VSCode-style file explorer
interface TreeViewProps {
  entries: Entry[];
  selectedFile: string;
  expandedFolders: Set<string>;
  folderContents: Map<string, Entry[]>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onLoadFolder: (path: string) => Promise<void>;
  level: number;
  parentPath?: string;
  getFileIcon: (entry: Entry) => React.ReactElement;
}

function TreeView({ entries, selectedFile, expandedFolders, folderContents, onToggleFolder, onSelectFile, onLoadFolder, level, parentPath = '', getFileIcon }: TreeViewProps) {
  // Ensure entries is an array
  if (!entries || !Array.isArray(entries)) {
    return null;
  }
  
  // Group entries by directory
  const sortedEntries = [...entries].sort((a, b) => {
    // Directories first
    if (a.type === 'dir' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'dir') return 1;
    // Then alphabetical
    return a.path.localeCompare(b.path);
  });

  return (
    <>
      {sortedEntries.map((entry, index) => {
        // entry.path should already be the full path from API
        const fullPath = entry.path;
        let entryKey =
          fullPath && typeof fullPath === 'string' && fullPath.trim().length > 0
            ? fullPath.trim()
            : (entry as any)?.name && typeof (entry as any).name === 'string' && (entry as any).name.trim().length > 0
            ? `${parentPath || 'root'}::__named_${(entry as any).name.trim()}`
            : '';
        if (!entryKey || entryKey.trim().length === 0) {
          entryKey = `${parentPath || 'root'}::__entry_${level}_${index}_${entry.type}`;
        }
        const isExpanded = expandedFolders.has(fullPath);
        const indent = level * 8;
        
        return (
          <div key={entryKey}>
            <div
              className={`group flex items-center h-[22px] px-2 cursor-pointer ${
                selectedFile === fullPath 
                  ? 'bg-blue-100 ' 
                  : 'hover:bg-gray-100 '
              }`}
              style={{ paddingLeft: `${8 + indent}px` }}
              onClick={async () => {
                if (entry.type === 'dir') {
                  // Load folder contents if not already loaded
                  if (!folderContents.has(fullPath)) {
                    await onLoadFolder(fullPath);
                  }
                  onToggleFolder(fullPath);
                } else {
                  onSelectFile(fullPath);
                }
              }}
            >
              {/* Chevron for folders */}
              <div className="w-4 flex items-center justify-center mr-0.5">
                {entry.type === 'dir' && (
                  isExpanded ? 
                    <span className="w-2.5 h-2.5 text-gray-600 flex items-center justify-center"><ChevronDown size={10} /></span> : 
                    <span className="w-2.5 h-2.5 text-gray-600 flex items-center justify-center"><ChevronRight size={10} /></span>
                )}
              </div>
              
              {/* Icon */}
              <span className="w-4 h-4 flex items-center justify-center mr-1.5">
                {entry.type === 'dir' ? (
                  isExpanded ? 
                    <span className="text-amber-600 w-4 h-4 flex items-center justify-center"><FolderOpen size={16} /></span> : 
                    <span className="text-amber-600 w-4 h-4 flex items-center justify-center"><Folder size={16} /></span>
                ) : (
                  getFileIcon(entry)
                )}
              </span>
              
              {/* File/Folder name */}
              <span className={`text-[13px] leading-[22px] ${
                selectedFile === fullPath ? 'text-blue-700 ' : 'text-gray-700 '
              }`} style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
                {level === 0 ? (entry.path.split('/').pop() || entry.path) : (entry.path.split('/').pop() || entry.path)}
              </span>
            </div>
            
            {/* Render children if expanded */}
            {entry.type === 'dir' && isExpanded && folderContents.has(fullPath) && (
              <TreeView
                entries={folderContents.get(fullPath) || []}
                selectedFile={selectedFile}
                expandedFolders={expandedFolders}
                folderContents={folderContents}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                onLoadFolder={onLoadFolder}
                level={level + 1}
                parentPath={fullPath}
                getFileIcon={getFileIcon}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export default function ChatPage() {
  const params = useParams<{ project_id: string }>();
  const projectId = params?.project_id ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectName, setProjectName] = useState<string>('');
  const [projectDescription, setProjectDescription] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [backendPreviewPhase, setBackendPreviewPhase] = useState<string>('stopped');
  const previewOrigin = useMemo(() => {
    if (!previewUrl) return '';
    try {
      const base = previewUrl.split('?')[0];
      return new URL(base).origin;
    } catch {
      return '';
    }
  }, [previewUrl]);
  const [tree, setTree] = useState<Entry[]>([]);
  const [content, setContent] = useState<string>('');
  const [editedContent, setEditedContent] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('.');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [folderContents, setFolderContents] = useState<Map<string, Entry[]>>(new Map());
  const [prompt, setPrompt] = useState('');

  // Ref to store add/remove message handlers from ChatLog
  const messageHandlersRef = useRef<{
    add: (message: any) => void;
    remove: (messageId: string) => void;
  } | null>(null);

  // Ref to store current requestId
  const currentRequestIdRef = useRef<string | null>(null);

  // Ref to track pending requests for deduplication
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  // Stable message handlers to prevent reassignment issues
  const stableMessageHandlers = useRef<{
    add: (message: any) => void;
    remove: (messageId: string) => void;
  } | null>(null);

  // Track active optimistic messages by requestId
  const optimisticMessagesRef = useRef<Map<string, any>>(new Map());
  const [mode, setMode] = useState<'act' | 'chat'>('act');
  const [isRunning, setIsRunning] = useState(false);
  const [isSseFallbackActive, setIsSseFallbackActive] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showConsole, setShowConsole] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timelineContent, setTimelineContent] = useState<string>('');
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [isTimelineSseConnected, setIsTimelineSseConnected] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const timelineEventSourceRef = useRef<EventSource | null>(null);
  const [deviceMode, setDeviceMode] = useState<'desktop'|'mobile'>('desktop');
  const [uploadedImages, setUploadedImages] = useState<{name: string; url: string; base64?: string; path?: string}[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  // Initialize states with default values, will be loaded from localStorage in useEffect
  const [hasInitialPrompt, setHasInitialPrompt] = useState<boolean>(false);
  const [agentWorkComplete, setAgentWorkComplete] = useState<boolean>(false);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('initializing');
  const [initializationMessage, setInitializationMessage] = useState('Starting project initialization...');
  const [initialPromptSent, setInitialPromptSent] = useState(false);
  const initialPromptSentRef = useRef(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [deployChannel, setDeployChannel] = useState<'aliyun' | 'vercel'>('aliyun');
  const [publishLoading, setPublishLoading] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'general' | 'ai-assistant' | 'environment'>('general');
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [vercelConnected, setVercelConnected] = useState<boolean | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'deploying' | 'ready' | 'error'>('idle');
  const deployPollRef = useRef<NodeJS.Timeout | null>(null);
  const [showAliyunDeploy, setShowAliyunDeploy] = useState(false);
  // 从 URL 参数初始化 isDemo，避免时序问题
  const [isDemo, setIsDemo] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('demoReplay') === 'true';
  });
  const [demoDeployedUrl, setDemoDeployedUrl] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    return params.get('deployedUrl') || undefined;
  });
  const [isStartingPreview, setIsStartingPreview] = useState(false);
  const [previewInitializationMessage, setPreviewInitializationMessage] = useState('Starting development server...');
  const [isStopping, setIsStopping] = useState(false);
  const [cliStatuses, setCliStatuses] = useState<Record<string, CliStatusSnapshot>>({});
  const [conversationId, setConversationId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return '';
  });

  const [preferredCli, setPreferredCli] = useState<ActiveCliId>(DEFAULT_ACTIVE_CLI);
  const [selectedModel, setSelectedModel] = useState<string>(getDefaultModelForCli(DEFAULT_ACTIVE_CLI));
  const [usingGlobalDefaults, setUsingGlobalDefaults] = useState<boolean>(true);
  const [thinkingMode, setThinkingMode] = useState<boolean>(false);
  const [isUpdatingModel, setIsUpdatingModel] = useState<boolean>(false);
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Plan/Todo 标签状态
  const [activePreviewTab, setActivePreviewTab] = useState<'none' | 'activity' | 'todo'>('none');
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [currentTodos, setCurrentTodos] = useState<Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }>>([]);
  const [fileChanges, setFileChanges] = useState<Array<{ type: 'write' | 'edit'; filePath: string; content?: string; oldString?: string; newString?: string; timestamp: string }>>([]);
  const [pendingPlanApproval, setPendingPlanApproval] = useState<{ requestId: string } | null>(null);
  const approvedRequestIdsRef = useRef<Set<string>>(new Set());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const editedContentRef = useRef<string>('');
  const [isFileUpdating, setIsFileUpdating] = useState(false);
  const modelOptions = useMemo(() => buildModelOptions(cliStatuses), [cliStatuses]);
  const cliOptions = useMemo(
    () => CLI_ORDER.map(cli => ({
      id: cli,
      name: CLI_LABELS[cli] || cli,
      available: Boolean(cliStatuses[cli]?.available && cliStatuses[cli]?.configured)
    })),
    [cliStatuses]
  );

  const updatePreferredCli = useCallback((cli: string) => {
    const sanitized = sanitizeCli(cli);
    setPreferredCli(sanitized);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('selectedAssistant', sanitized);
    }
  }, []);

  const updateSelectedModel = useCallback((model: string, cliOverride?: string) => {
    const effectiveCli = cliOverride ? sanitizeCli(cliOverride) : preferredCli;
    const sanitized = sanitizeModel(effectiveCli, model);
    setSelectedModel(sanitized);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('selectedModel', sanitized);
    }
  }, [preferredCli]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  const sendInitialPrompt = useCallback(async (initialPrompt: string) => {
    if (initialPromptSent) {
      return;
    }

    setAgentWorkComplete(false);
    localStorage.setItem(`project_${projectId}_taskComplete`, 'false');

    const requestId = crypto.randomUUID();

    try {
      try { console.log(`已发送初始提示，请求ID=${requestId}`); } catch {}
      setInitialPromptSent(true);

      const requestBody = {
        instruction: initialPrompt,
        images: [],
        isInitialPrompt: true,
        cliPreference: preferredCli,
        conversationId: conversationId || undefined,
        requestId,
        selectedModel,
      };

      const r = await fetch(`${API_BASE}/api/chat/${projectId}/act`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!r.ok) {
        const errorText = await r.text();
        console.error('❌ API Error:', errorText);
        setInitialPromptSent(false);
        return;
      }

      const result = await r.json();

      const returnedConversationId =
        typeof result?.conversationId === 'string'
          ? result.conversationId
          : typeof result?.conversation_id === 'string'
          ? result.conversation_id
          : undefined;
      if (returnedConversationId) {
        setConversationId(returnedConversationId);
      }

      const resolvedRequestId =
        typeof result?.requestId === 'string'
          ? result.requestId
          : typeof result?.request_id === 'string'
          ? result.request_id
          : requestId;
      const userMessageId =
        typeof result?.userMessageId === 'string'
          ? result.userMessageId
          : typeof result?.user_message_id === 'string'
          ? result.user_message_id
          : '';

      setPrompt('');

      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('initial_prompt');
      window.history.replaceState({}, '', newUrl.toString());
    } catch (error) {
      console.error('Error sending initial prompt:', error);
      setInitialPromptSent(false);
    } finally {
    }
  }, [initialPromptSent, preferredCli, conversationId, projectId, selectedModel]);

  // Guarded trigger that can be called from multiple places safely
  const triggerInitialPromptIfNeeded = useCallback(() => {
    const initialPromptFromUrl = searchParams?.get('initial_prompt');
    if (!initialPromptFromUrl) return;
    if (initialPromptSentRef.current) return;
    // Synchronously guard to prevent double ACT calls
    initialPromptSentRef.current = true;
    setInitialPromptSent(true);
    
    // Store the selected model and assistant in sessionStorage when returning
    const cliFromUrl = searchParams?.get('cli');
    const modelFromUrl = searchParams?.get('model');
    if (cliFromUrl) {
      const sanitizedCli = sanitizeCli(cliFromUrl);
      sessionStorage.setItem('selectedAssistant', sanitizedCli);
      if (modelFromUrl) {
        sessionStorage.setItem('selectedModel', sanitizeModel(sanitizedCli, modelFromUrl));
      }
    } else if (modelFromUrl) {
      sessionStorage.setItem('selectedModel', sanitizeModel(preferredCli, modelFromUrl));
    }
    
    // Don't show the initial prompt in the input field
    // setPrompt(initialPromptFromUrl);
    sendInitialPrompt(initialPromptFromUrl);
  }, [searchParams, sendInitialPrompt, preferredCli]);

const loadCliStatuses = useCallback(() => {
  const snapshot: Record<string, CliStatusSnapshot> = {};
  ACTIVE_CLI_IDS.forEach(id => {
    const models = ACTIVE_CLI_MODEL_OPTIONS[id]?.map(model => model.id) ?? [];
    snapshot[id] = {
      available: true,
      configured: true,
      models,
    };
  });
  setCliStatuses(snapshot);
}, []);

const persistProjectPreferences = useCallback(
  async (changes: { preferredCli?: string; selectedModel?: string }) => {
    if (!projectId) return;
    const payload: Record<string, unknown> = {};
    if (changes.preferredCli) {
      const sanitizedPreferredCli = sanitizeCli(changes.preferredCli);
      payload.preferredCli = sanitizedPreferredCli;
      payload.preferred_cli = sanitizedPreferredCli;
    }
    if (changes.selectedModel) {
      const targetCli = sanitizeCli(changes.preferredCli ?? preferredCli);
      const normalized = sanitizeModel(targetCli, changes.selectedModel);
      payload.selectedModel = normalized;
      payload.selected_model = normalized;
    }
    if (Object.keys(payload).length === 0) return;

    const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to update project preferences');
    }

    const result = await response.json().catch(() => null);
    return result?.data ?? result;
  },
  [projectId, preferredCli]
);

  const handleModelChange = useCallback(
    async (option: ModelOption, opts?: { skipCliUpdate?: boolean; overrideCli?: string }) => {
      if (!projectId || !option) return;

      const { skipCliUpdate = false, overrideCli } = opts || {};
      const targetCli = sanitizeCli(overrideCli ?? option.cli);
      const sanitizedModelId = sanitizeModel(targetCli, option.id);

      const previousCli = preferredCli;
      const previousModel = selectedModel;

      if (targetCli === previousCli && sanitizedModelId === previousModel) {
        return;
      }

      setUsingGlobalDefaults(false);
      updatePreferredCli(targetCli);
      updateSelectedModel(option.id, targetCli);

      setIsUpdatingModel(true);

      try {
        const preferenceChanges: { preferredCli?: string; selectedModel?: string } = {
          selectedModel: sanitizedModelId,
        };
        if (!skipCliUpdate && targetCli !== previousCli) {
          preferenceChanges.preferredCli = targetCli;
        }

        await persistProjectPreferences(preferenceChanges);

        const cliLabel = CLI_LABELS[targetCli] || targetCli;
        const modelLabel = getModelDisplayName(targetCli, sanitizedModelId);
        try {
          await fetch(`${API_BASE}/api/chat/${projectId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `Switched to ${cliLabel} (${modelLabel})`,
              role: 'system',
              message_type: 'info',
              cli_source: targetCli,
              conversation_id: conversationId || undefined,
            }),
          });
        } catch (messageError) {
          console.warn('Failed to record model switch message:', messageError);
        }

        loadCliStatuses();
      } catch (error) {
        console.error('Failed to update model preference:', error);
        updatePreferredCli(previousCli);
        updateSelectedModel(previousModel, previousCli);
        alert('Failed to update model. Please try again.');
      } finally {
        setIsUpdatingModel(false);
      }
    },
    [projectId, preferredCli, selectedModel, conversationId, loadCliStatuses, persistProjectPreferences, updatePreferredCli, updateSelectedModel]
  );

  useEffect(() => {
    loadCliStatuses();
  }, [loadCliStatuses]);

  const handleCliChange = useCallback(
    async (cliId: string) => {
      if (!projectId) return;
      if (cliId === preferredCli) return;

      setUsingGlobalDefaults(false);

      const candidateModels = modelOptions.filter(option => option.cli === cliId);
      const fallbackOption =
        candidateModels.find(option => option.id === selectedModel && option.available) ||
        candidateModels.find(option => option.available) ||
        candidateModels[0];

      if (fallbackOption) {
        await handleModelChange(fallbackOption, { overrideCli: cliId });
        return;
      }

      const previousCli = preferredCli;
      const previousModel = selectedModel;
      setIsUpdatingModel(true);

      try {
        updatePreferredCli(cliId);
        const defaultModel = getDefaultModelForCli(cliId);
        updateSelectedModel(defaultModel, cliId);
        await persistProjectPreferences({ preferredCli: cliId, selectedModel: defaultModel });
        loadCliStatuses();
      } catch (error) {
        console.error('Failed to update CLI preference:', error);
        updatePreferredCli(previousCli);
        updateSelectedModel(previousModel, previousCli);
        alert('Failed to update CLI. Please try again.');
      } finally {
        setIsUpdatingModel(false);
      }
    },
    [projectId, preferredCli, selectedModel, modelOptions, handleModelChange, loadCliStatuses, persistProjectPreferences, updatePreferredCli, updateSelectedModel]
  );

  useEffect(() => {
    if (!modelOptions.length) return;
    const hasSelected = modelOptions.some(option => option.cli === preferredCli && option.id === selectedModel);
    if (!hasSelected) {
      const fallbackOption = modelOptions.find(option => option.cli === preferredCli && option.available)
        || modelOptions.find(option => option.cli === preferredCli)
        || modelOptions.find(option => option.available)
        || modelOptions[0];
      if (fallbackOption) {
        void handleModelChange(fallbackOption);
      }
    }
  }, [modelOptions, preferredCli, selectedModel, handleModelChange]);

  const loadDeployStatus = useCallback(async () => {
    try {
      // Use the same API as ServiceSettings to check actual project service connections
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/services`);
      if (response.status === 404) {
        setGithubConnected(false);
        setVercelConnected(false);
        setPublishedUrl(null);
        setDeploymentStatus('idle');
        return;
      }

      if (response.ok) {
        const connections = await response.json();
        const githubConnection = connections.find((conn: any) => conn.provider === 'github');
        const vercelConnection = connections.find((conn: any) => conn.provider === 'vercel');
        
        // Check actual project connections (not just token existence)
        setGithubConnected(!!githubConnection);
        setVercelConnected(!!vercelConnection);
        
        // Set published URL only if actually deployed
        if (vercelConnection && vercelConnection.service_data) {
          const sd = vercelConnection.service_data;
          // Only use actual deployment URLs, not predicted ones
          const rawUrl = sd.last_deployment_url || null;
          const url = rawUrl ? (String(rawUrl).startsWith('http') ? String(rawUrl) : `https://${rawUrl}`) : null;
          setPublishedUrl(url || null);
          if (url) {
            setDeploymentStatus('ready');
          } else {
            setDeploymentStatus('idle');
          }
        } else {
          setPublishedUrl(null);
          setDeploymentStatus('idle');
        }
      } else {
        setGithubConnected(false);
        setVercelConnected(false);
        setPublishedUrl(null);
        setDeploymentStatus('idle');
      }

    } catch (e) {
      console.warn('Failed to load deploy status', e);
      setGithubConnected(false);
      setVercelConnected(false);
      setPublishedUrl(null);
      setDeploymentStatus('idle');
    }
  }, [projectId]);

  const startDeploymentPolling = useCallback((depId: string) => {
    if (deployPollRef.current) clearInterval(deployPollRef.current);
    setDeploymentStatus('deploying');
    setDeploymentId(depId);
    
    console.log('🔍 Monitoring deployment:', depId);
    
    deployPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/projects/${projectId}/vercel/deployment/current`);
        if (r.status === 404) {
          setDeploymentStatus('idle');
          setDeploymentId(null);
          setPublishLoading(false);
          if (deployPollRef.current) {
            clearInterval(deployPollRef.current);
            deployPollRef.current = null;
          }
          return;
        }
        if (!r.ok) return;
        const data = await r.json();
        
        // Stop polling if no active deployment (completed)
        if (!data.has_deployment) {
          console.log('🔍 Deployment completed - no active deployment');

          // Set final deployment URL
          if (data.last_deployment_url) {
            const url = String(data.last_deployment_url).startsWith('http') ? data.last_deployment_url : `https://${data.last_deployment_url}`;
            console.log('🔍 Deployment complete! URL:', url);
            setPublishedUrl(url);
            setDeploymentStatus('ready');
          } else {
            setDeploymentStatus('idle');
          }
          
          // End publish loading state (important: release loading even if no deployment)
          setPublishLoading(false);
          
          if (deployPollRef.current) {
            clearInterval(deployPollRef.current);
            deployPollRef.current = null;
          }
          return;
        }
        
        // If there is an active deployment
        const status = data.status;
        
        // Log only status changes
        if (status && status !== 'QUEUED') {
          console.log('🔍 Deployment status:', status);
        }
        
        // Check if deployment is ready or failed
        const isReady = status === 'READY';
        const isBuilding = status === 'BUILDING' || status === 'QUEUED';
        const isError = status === 'ERROR';
        
        if (isError) {
          console.error('🔍 Deployment failed:', status);
          setDeploymentStatus('error');
          
          // End publish loading state
          setPublishLoading(false);
          
          // Close publish panel after error (with delay to show error message)
          setTimeout(() => {
            setShowPublishPanel(false);
          }, 3000); // Show error for 3 seconds before closing
          
          if (deployPollRef.current) {
            clearInterval(deployPollRef.current);
            deployPollRef.current = null;
          }
          return;
        }
        
        if (isReady && data.deployment_url) {
          const url = String(data.deployment_url).startsWith('http') ? data.deployment_url : `https://${data.deployment_url}`;
          console.log('🔍 Deployment complete! URL:', url);
          setPublishedUrl(url);
          setDeploymentStatus('ready');
          
          // End publish loading state
          setPublishLoading(false);
          
          // Keep panel open to show the published URL
          
          if (deployPollRef.current) {
            clearInterval(deployPollRef.current);
            deployPollRef.current = null;
          }
        } else if (isBuilding) {
          setDeploymentStatus('deploying');
        }
      } catch (error) {
        console.error('🔍 Polling error:', error);
      }
    }, 3000); // Poll every 3 seconds
  }, [projectId]);

  const checkCurrentDeployment = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/vercel/deployment/current`);
      if (response.status === 404) {
        return;
      }

      if (response.ok) {
        const data = await response.json();
        if (data.has_deployment) {
          setDeploymentId(data.deployment_id);
          setDeploymentStatus('deploying');
          setPublishLoading(false);
          setShowPublishPanel(true);
          startDeploymentPolling(data.deployment_id);
          console.log('🔍 Resuming deployment monitoring:', data.deployment_id);
        }
      }
    } catch (e) {
      console.warn('Failed to check current deployment', e);
    }
  }, [projectId, startDeploymentPolling]);

  const start = useCallback(async () => {
    try {
      setIsStartingPreview(true);
      setActivePreviewTab('none'); // 关闭 plan/todo 标签
      setPreviewError(null);
      setPreviewInitializationMessage('Starting preview...');
      try { await fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'trigger.preview.frontend', message: 'Frontend triggered preview start', level: 'info' }) }); } catch {}
      try { await fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.start', message: 'Start preview', level: 'info' }) }); } catch {}

      const r = await fetch(`${API_BASE}/api/projects/${projectId}/preview/start`, { method: 'POST' });
      if (!r.ok) {
        console.error('Failed to start preview:', r.statusText);
        setPreviewInitializationMessage('Failed to start preview');
        setIsStartingPreview(false);
        try { await fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.start.error', message: 'Failed to start preview', level: 'error' }) }); } catch {}
        return;
      }
      const payload = await r.json();
      const data = payload?.data ?? payload ?? {};

      setPreviewInitializationMessage('Preview ready');
      setPreviewUrl(typeof data.url === 'string' ? data.url : null);
      // 不要在这里设置 setIsStartingPreview(false)，让 SSE 事件控制状态
      setCurrentRoute('/');
      try { await fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.ready', message: 'Preview ready', level: 'info', metadata: { url: typeof data.url === 'string' ? data.url : null } }) }); } catch {}
      // Health check moved to backend or skipped to avoid跨域
    } catch (error) {
      console.error('Error starting preview:', error);
      setPreviewInitializationMessage('An error occurred');
      setIsStartingPreview(false);
      try { await fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.start.exception', message: String(error instanceof Error ? error.message : error), level: 'error' }) }); } catch {}
    }
  }, [projectId]);

  // Navigate to specific route in iframe
  const navigateToRoute = (route: string) => {
    if (previewUrl && iframeRef.current) {
      const baseUrl = previewUrl.split('?')[0]; // Remove any query params
      // Ensure route starts with /
      const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
      const newUrl = `${baseUrl}${normalizedRoute}`;
      iframeRef.current.src = newUrl;
      setCurrentRoute(normalizedRoute);
      try { fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.navigate', message: 'Navigate preview', level: 'info', metadata: { route: normalizedRoute, url: newUrl } }) }); } catch {}
    }
  };

  const refreshPreview = useCallback(() => {
    if (!previewUrl || !iframeRef.current) {
      return;
    }

    try {
      const normalizedRoute =
        currentRoute && currentRoute.startsWith('/')
          ? currentRoute
          : `/${currentRoute || ''}`;
      const baseUrl = previewUrl.split('?')[0] || previewUrl;
      const url = new URL(baseUrl + normalizedRoute);
      url.searchParams.set('_ts', Date.now().toString());
      iframeRef.current.src = url.toString();
    } catch (error) {
      console.warn('Failed to refresh preview iframe:', error);
    }
  }, [previewUrl, currentRoute]);


  const stop = useCallback(async () => {
    try {
      setIsStopping(true);
      await fetch(`${API_BASE}/api/projects/${projectId}/preview/stop`, { method: 'POST' });
      setPreviewUrl(null);
    } catch (error) {
      console.error('Error stopping preview:', error);
    } finally {
      setIsStopping(false);
    }
  }, [projectId]);

  // Load timeline.txt content
  const loadTimelineContent = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingTimeline(true);
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/files/content?path=logs/timeline.txt`);
      const data = await response.json();

      if (data.success && data.data?.content) {
        setTimelineContent(data.data.content);
        // Auto-scroll to bottom
        setTimeout(() => {
          consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        setTimelineContent('');
      }
    } catch (error) {
      console.error('[Timeline] Failed to load timeline.txt:', error);
      setTimelineContent('Failed to load timeline logs');
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [projectId]);

  // Timeline SSE connection - real-time log streaming
  useEffect(() => {
    if (!projectId) return;
    if (!showConsole) return;
    if (typeof window === 'undefined') return;
    if (!('EventSource' in window)) return;

    let eventSource: EventSource | null = null;
    let disposed = false;

    const connectTimelineStream = () => {
      if (disposed) return;

      try {
        const streamUrl = `${API_BASE}/api/projects/${projectId}/timeline/stream`;
        eventSource = new EventSource(streamUrl);
        timelineEventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsTimelineSseConnected(true);
        };

        eventSource.onmessage = (event) => {
          if (!event.data) return;

          try {
            const message = JSON.parse(event.data);

            if (message.type === 'content') {
              // Initial full content
              setTimelineContent(message.data || '');
              setTimeout(() => {
                consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            } else if (message.type === 'update') {
              // Incremental update - append to existing content
              setTimelineContent((prev) => prev + message.data);
              setTimeout(() => {
                consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }
          } catch (error) {
            console.error('[Timeline SSE] Failed to parse message:', error);
          }
        };

        eventSource.onerror = () => {
          setIsTimelineSseConnected(false);
          if (disposed) return;

          eventSource?.close();
          // Auto-reconnect after 2 seconds
          setTimeout(() => {
            if (!disposed) {
              connectTimelineStream();
            }
          }, 2000);
        };
      } catch (error) {
        console.error('[Timeline SSE] Failed to establish connection:', error);
        setIsTimelineSseConnected(false);
      }
    };

    connectTimelineStream();

    return () => {
      disposed = true;
      setIsTimelineSseConnected(false);
      if (timelineEventSourceRef.current) {
        timelineEventSourceRef.current.close();
        timelineEventSourceRef.current = null;
      }
    };
  }, [projectId, showConsole]);

  const loadSubdirectory = useCallback(async (dir: string): Promise<Entry[]> => {
    try {
      const r = await fetch(`${API_BASE}/api/repo/${projectId}/tree?dir=${encodeURIComponent(dir)}`);
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Failed to load subdirectory:', error);
      return [];
    }
  }, [projectId]);

  const loadTree = useCallback(async (dir = '.') => {
    try {
      const r = await fetch(`${API_BASE}/api/repo/${projectId}/tree?dir=${encodeURIComponent(dir)}`);
      const data = await r.json();
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        setTree(data);
        const newFolderContents = new Map();
        setFolderContents(newFolderContents);
      } else {
        console.error('Tree data is not an array:', data);
        setTree([]);
      }
      
      setCurrentPath(dir);
    } catch (error) {
      console.error('Failed to load tree:', error);
      setTree([]);
    }
  }, [projectId, loadSubdirectory]);

  // Load subdirectory contents

  // Load folder contents
  const handleLoadFolder = useCallback(async (path: string) => {
    const contents = await loadSubdirectory(path);
    setFolderContents(prev => {
      const newMap = new Map(prev);
      newMap.set(path, contents);
      
      // Also load nested directories
      for (const entry of contents) {
        if (entry.type === 'dir') {
          const fullPath = `${path}/${entry.path}`;
          // Don't load if already loaded
          if (!newMap.has(fullPath)) {
            loadSubdirectory(fullPath).then(subContents => {
              setFolderContents(prev2 => new Map(prev2).set(fullPath, subContents));
            });
          }
        }
      }
      
      return newMap;
    });
  }, [loadSubdirectory]);

  // Toggle folder expansion
  function toggleFolder(path: string) {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }

  // Build tree structure from flat list
  function buildTreeStructure(entries: Entry[]): Map<string, Entry[]> {
    const structure = new Map<string, Entry[]>();
    
    // Initialize with root
    structure.set('', []);
    
    entries.forEach(entry => {
      const parts = entry.path.split('/');
      const parentPath = parts.slice(0, -1).join('/');
      
      if (!structure.has(parentPath)) {
        structure.set(parentPath, []);
      }
      structure.get(parentPath)?.push(entry);
      
      // If it's a directory, ensure it exists in the structure
      if (entry.type === 'dir') {
        if (!structure.has(entry.path)) {
          structure.set(entry.path, []);
        }
      }
    });
    
    return structure;
  }

  const openFile = useCallback(async (path: string) => {
    try {
      if (hasUnsavedChanges && path !== selectedFile) {
        const shouldDiscard =
          typeof window !== 'undefined'
            ? window.confirm('You have unsaved changes. Discard them and open the new file?')
            : true;
        if (!shouldDiscard) {
          return;
        }
      }

      setSaveFeedback('idle');
      setSaveError(null);

      const r = await fetch(`${API_BASE}/api/repo/${projectId}/file?path=${encodeURIComponent(path)}`);
      
      if (!r.ok) {
        console.error('Failed to load file:', r.status, r.statusText);
        const fallback = '// Failed to load file content';
        setContent(fallback);
        setEditedContent(fallback);
        editedContentRef.current = fallback;
        setHasUnsavedChanges(false);
        setSelectedFile(path);
        return;
      }
      
      const data = await r.json();
      const fileContent = typeof data?.content === 'string' ? data.content : '';
      setContent(fileContent);
      setEditedContent(fileContent);
      editedContentRef.current = fileContent;
      setHasUnsavedChanges(false);
      setSelectedFile(path);
      setIsFileUpdating(false);

      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.scrollTop = 0;
          editorRef.current.scrollLeft = 0;
        }
        if (highlightRef.current) {
          highlightRef.current.scrollTop = 0;
          highlightRef.current.scrollLeft = 0;
        }
        if (lineNumberRef.current) {
          lineNumberRef.current.scrollTop = 0;
        }
      });
    } catch (error) {
      console.error('Error opening file:', error);
      const fallback = '// Error loading file';
      setContent(fallback);
      setEditedContent(fallback);
      editedContentRef.current = fallback;
      setHasUnsavedChanges(false);
      setSelectedFile(path);
    }
  }, [projectId, hasUnsavedChanges, selectedFile]);

  // Reload currently selected file
  const reloadCurrentFile = useCallback(async () => {
    if (selectedFile && !showPreview && !hasUnsavedChanges) {
      try {
        const r = await fetch(`${API_BASE}/api/repo/${projectId}/file?path=${encodeURIComponent(selectedFile)}`);
        if (r.ok) {
          const data = await r.json();
          const newContent = data.content || '';
          if (newContent !== content) {
            setIsFileUpdating(true);
            setContent(newContent);
            setEditedContent(newContent);
            editedContentRef.current = newContent;
            setHasUnsavedChanges(false);
            setSaveFeedback('idle');
            setSaveError(null);
            setTimeout(() => setIsFileUpdating(false), 500);
          }
        }
      } catch (error) {
        // Silently fail - this is a background refresh
      }
    }
  }, [projectId, selectedFile, showPreview, hasUnsavedChanges, content]);

  // Lazy load highlight.js only when needed
  const [hljs, setHljs] = useState<any>(null);
  
  useEffect(() => {
    if (selectedFile && !hljs) {
      import('highlight.js/lib/common').then(mod => {
        setHljs(mod.default);
        // Load highlight.js CSS dynamically
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
        document.head.appendChild(link);
      });
    }
  }, [selectedFile, hljs]);

  const highlightedCode = useMemo(() => {
    const code = editedContent ?? '';
    if (!code) {
      return '&nbsp;';
    }

    if (!hljs) {
      return escapeHtml(code);
    }

    const language = getFileLanguage(selectedFile);
    try {
      if (!language || language === 'plaintext') {
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
  }, [hljs, editedContent, selectedFile]);

  const onEditorChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setEditedContent(value);
    editedContentRef.current = value;
    setHasUnsavedChanges(value !== content);
    setSaveFeedback('idle');
    setSaveError(null);
    if (isFileUpdating) {
      setIsFileUpdating(false);
    }
  }, [content, isFileUpdating]);

  const handleEditorScroll = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = event.currentTarget;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = scrollTop;
    }
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (!selectedFile || isSavingFile || !hasUnsavedChanges) {
      return;
    }

    const contentToSave = editedContentRef.current;
    setIsSavingFile(true);
    setSaveFeedback('idle');
    setSaveError(null);

    try {
      const response = await fetch(`${API_BASE}/api/repo/${projectId}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFile, content: contentToSave }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to save file';
        try {
          const data = await response.clone().json();
          errorMessage = data?.error || data?.message || errorMessage;
        } catch {
          const text = await response.text().catch(() => '');
          if (text) {
            errorMessage = text;
          }
        }
        throw new Error(errorMessage);
      }

      setContent(contentToSave);
      setSaveFeedback('success');

      if (editedContentRef.current === contentToSave) {
        setHasUnsavedChanges(false);
        setIsFileUpdating(true);
        setTimeout(() => setIsFileUpdating(false), 800);
      }

      refreshPreview();
    } catch (error) {
      console.error('Failed to save file:', error);
      setSaveFeedback('error');
      setSaveError(error instanceof Error ? error.message : 'Failed to save file');
    } finally {
      setIsSavingFile(false);
    }
  }, [selectedFile, isSavingFile, hasUnsavedChanges, projectId, refreshPreview]);

  const handleEditorKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      handleSaveFile();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const indent = '  ';
      const value = editedContent;
      const newValue = value.slice(0, start) + indent + value.slice(end);

      setEditedContent(newValue);
      editedContentRef.current = newValue;
      setHasUnsavedChanges(newValue !== content);
      setSaveFeedback('idle');
      setSaveError(null);
      if (isFileUpdating) {
        setIsFileUpdating(false);
      }

      requestAnimationFrame(() => {
        const position = start + indent.length;
        el.selectionStart = position;
        el.selectionEnd = position;
        if (highlightRef.current) {
          highlightRef.current.scrollTop = el.scrollTop;
          highlightRef.current.scrollLeft = el.scrollLeft;
        }
        if (lineNumberRef.current) {
          lineNumberRef.current.scrollTop = el.scrollTop;
        }
      });
    }
  }, [handleSaveFile, editedContent, content, isFileUpdating]);

  useEffect(() => {
    if (saveFeedback === 'success') {
      const timer = setTimeout(() => setSaveFeedback('idle'), 1800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [saveFeedback]);

  useEffect(() => {
    if (editorRef.current && highlightRef.current && lineNumberRef.current) {
      const { scrollTop, scrollLeft } = editorRef.current;
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
      lineNumberRef.current.scrollTop = scrollTop;
    }
  }, [editedContent]);

  // Get file extension for syntax highlighting
  function getFileLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'tsx':
      case 'ts':
        return 'typescript';
      case 'jsx':
      case 'js':
      case 'mjs':
        return 'javascript';
      case 'css':
        return 'css';
      case 'scss':
      case 'sass':
        return 'scss';
      case 'html':
      case 'htm':
        return 'html';
      case 'json':
        return 'json';
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'py':
        return 'python';
      case 'sh':
      case 'bash':
        return 'bash';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'xml':
        return 'xml';
      case 'sql':
        return 'sql';
      case 'php':
        return 'php';
      case 'java':
        return 'java';
      case 'c':
        return 'c';
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'rb':
        return 'ruby';
      case 'vue':
        return 'vue';
      case 'svelte':
        return 'svelte';
      case 'dockerfile':
        return 'dockerfile';
      case 'toml':
        return 'toml';
      case 'ini':
        return 'ini';
      case 'conf':
      case 'config':
        return 'nginx';
      default:
        return 'plaintext';
    }
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Get file icon based on type
  function getFileIcon(entry: Entry): React.ReactElement {
    if (entry.type === 'dir') {
      return <span className="text-blue-500"><Folder size={16} /></span>;
    }
    
    const ext = entry.path.split('.').pop()?.toLowerCase();
    const filename = entry.path.split('/').pop()?.toLowerCase();
    
    // Special files
    if (filename === 'package.json') return <span className="text-green-600"><Braces size={16} /></span>;
    if (filename === 'dockerfile') return <span className="text-blue-400"><Ship size={16} /></span>;
    if (filename?.startsWith('.env')) return <span className="text-yellow-500"><Lock size={16} /></span>;
    if (filename === 'readme.md') return <span className="text-gray-600"><FileText size={16} /></span>;
    if (filename?.includes('config')) return <span className="text-gray-500"><Settings size={16} /></span>;
    
    switch (ext) {
      case 'tsx':
        return <span className="text-cyan-400"><Atom size={16} /></span>;
      case 'ts':
        return <span className="text-blue-600"><Type size={16} /></span>;
      case 'jsx':
        return <span className="text-cyan-400"><Atom size={16} /></span>;
      case 'js':
      case 'mjs':
        return <span className="text-yellow-400"><Braces size={16} /></span>;
      case 'css':
        return <span className="text-blue-500"><Palette size={16} /></span>;
      case 'scss':
      case 'sass':
        return <span className="text-pink-500"><Palette size={16} /></span>;
      case 'html':
      case 'htm':
        return <span className="text-orange-500"><FileCode size={16} /></span>;
      case 'json':
        return <span className="text-yellow-600"><Braces size={16} /></span>;
      case 'md':
      case 'markdown':
        return <span className="text-gray-600"><FileText size={16} /></span>;
      case 'py':
        return <span className="text-blue-400"><Workflow size={16} /></span>;
      case 'sh':
      case 'bash':
        return <span className="text-green-500"><FileCode size={16} /></span>;
      case 'yaml':
      case 'yml':
        return <span className="text-red-500"><List size={16} /></span>;
      case 'xml':
        return <span className="text-orange-600"><FileCode size={16} /></span>;
      case 'sql':
        return <span className="text-blue-600"><Database size={16} /></span>;
      case 'php':
        return <span className="text-indigo-500"><Braces size={16} /></span>;
      case 'java':
        return <span className="text-red-600"><Coffee size={16} /></span>;
      case 'c':
        return <span className="text-blue-700"><FileCode size={16} /></span>;
      case 'cpp':
      case 'cc':
      case 'cxx':
        return <span className="text-blue-600"><Plus size={16} /></span>;
      case 'rs':
        return <span className="text-orange-700"><Settings size={16} /></span>;
      case 'go':
        return <span className="text-cyan-500"><Bird size={16} /></span>;
      case 'rb':
        return <span className="text-red-500"><Gem size={16} /></span>;
      case 'vue':
        return <span className="text-green-500"><Triangle size={16} /></span>;
      case 'svelte':
        return <span className="text-orange-600"><Flame size={16} /></span>;
      case 'dockerfile':
        return <span className="text-blue-400"><Ship size={16} /></span>;
      case 'toml':
      case 'ini':
      case 'conf':
      case 'config':
        return <span className="text-gray-500"><Settings size={16} /></span>;
      default:
        return <span className="text-gray-400"><FileIcon size={16} /></span>;
    }
  }

  

  const loadSettings = useCallback(async (projectSettings?: { cli?: string; model?: string }) => {
    try {
      console.log('🔧 loadSettings called with project settings:', projectSettings);

      const hasCliSet = projectSettings?.cli || preferredCli;
      const hasModelSet = projectSettings?.model || selectedModel;

      if (!hasCliSet || !hasModelSet) {
        console.log('⚠️ Missing CLI or model, loading global settings');
        const globalResponse = await fetch(`${API_BASE}/api/settings/global`);
        if (globalResponse.ok) {
          const globalSettings = await globalResponse.json();
          const defaultCli = sanitizeCli(globalSettings.default_cli || globalSettings.defaultCli);
          const cliToUse = sanitizeCli(hasCliSet || defaultCli);

          if (!hasCliSet) {
            console.log('🔄 Setting CLI from global:', cliToUse);
            updatePreferredCli(cliToUse);
          }

          if (!hasModelSet) {
            const cliSettings = globalSettings.cli_settings?.[cliToUse] || globalSettings.cliSettings?.[cliToUse];
            if (cliSettings?.model) {
              updateSelectedModel(cliSettings.model, cliToUse);
            } else {
              updateSelectedModel(getDefaultModelForCli(cliToUse), cliToUse);
            }
          }
        } else {
          const response = await fetch(`${API_BASE}/api/settings`);
          if (response.ok) {
            const settings = await response.json();
            if (!hasCliSet) updatePreferredCli(settings.preferred_cli || settings.default_cli || DEFAULT_ACTIVE_CLI);
            if (!hasModelSet) {
              const cli = sanitizeCli(settings.preferred_cli || settings.default_cli || preferredCli || DEFAULT_ACTIVE_CLI);
              updateSelectedModel(getDefaultModelForCli(cli), cli);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      const hasCliSet = projectSettings?.cli || preferredCli;
      const hasModelSet = projectSettings?.model || selectedModel;
      if (!hasCliSet) updatePreferredCli(DEFAULT_ACTIVE_CLI);
      if (!hasModelSet) updateSelectedModel(getDefaultModelForCli(DEFAULT_ACTIVE_CLI), DEFAULT_ACTIVE_CLI);
    }
  }, [preferredCli, selectedModel, updatePreferredCli, updateSelectedModel]);

  const loadProjectInfo = useCallback(async (): Promise<{ cli?: string; model?: string; status?: ProjectStatus }> => {
    try {
      const r = await fetch(`${API_BASE}/api/projects/${projectId}`);
      if (!r.ok) {
        setProjectName(`Project ${projectId.slice(0, 8)}`);
        setProjectDescription('');
        setHasInitialPrompt(false);
        localStorage.setItem(`project_${projectId}_hasInitialPrompt`, 'false');
        setProjectStatus('active');
        setIsInitializing(false);
        setUsingGlobalDefaults(true);
        return {};
      }

      const payload = await r.json();
      const project = payload?.data ?? payload;
      const rawPreferredCli =
        typeof project?.preferredCli === 'string'
          ? project.preferredCli
          : typeof project?.preferred_cli === 'string'
          ? project.preferred_cli
          : undefined;
      const rawSelectedModel =
        typeof project?.selectedModel === 'string'
          ? project.selectedModel
          : typeof project?.selected_model === 'string'
          ? project.selected_model
          : undefined;

      console.log('📋 Loading project info:', {
        preferredCli: rawPreferredCli,
        selectedModel: rawSelectedModel,
      });

      setProjectName(project.name || `Project ${projectId.slice(0, 8)}`);

      const projectCli = sanitizeCli(rawPreferredCli || preferredCli);
      if (rawPreferredCli) {
        updatePreferredCli(projectCli);
      }
      if (rawSelectedModel) {
        updateSelectedModel(rawSelectedModel, projectCli);
      } else {
        updateSelectedModel(getDefaultModelForCli(projectCli), projectCli);
      }

      const followGlobal = !rawPreferredCli && !rawSelectedModel;
      setUsingGlobalDefaults(followGlobal);
      setProjectDescription(project.description || '');

      if (project.initial_prompt) {
        setHasInitialPrompt(true);
        localStorage.setItem(`project_${projectId}_hasInitialPrompt`, 'true');
      } else {
        setHasInitialPrompt(false);
        localStorage.setItem(`project_${projectId}_hasInitialPrompt`, 'false');
      }

      if (project.status === 'initializing') {
        setProjectStatus('initializing');
        setIsInitializing(true);
      } else {
        setProjectStatus('active');
        setIsInitializing(false);
        triggerInitialPromptIfNeeded();
      }

      const normalizedModel = rawSelectedModel
        ? sanitizeModel(projectCli, rawSelectedModel)
        : getDefaultModelForCli(projectCli);

      return {
        cli: rawPreferredCli ? projectCli : undefined,
        model: normalizedModel,
        status: project.status as ProjectStatus | undefined,
      };
    } catch (error) {
      console.error('Failed to load project info:', error);
      setProjectName(`Project ${projectId.slice(0, 8)}`);
      setProjectDescription('');
      setHasInitialPrompt(false);
      localStorage.setItem(`project_${projectId}_hasInitialPrompt`, 'false');
      setProjectStatus('active');
      setIsInitializing(false);
      setUsingGlobalDefaults(true);
      return {};
    }
  }, [
    projectId,
    triggerInitialPromptIfNeeded,
    updatePreferredCli,
    updateSelectedModel,
    preferredCli,
  ]);

  const loadProjectInfoRef = useRef(loadProjectInfo);
  useEffect(() => {
    loadProjectInfoRef.current = loadProjectInfo;
  }, [loadProjectInfo]);

  useEffect(() => {
    if (!searchParams) return;
    const cliParam = searchParams.get('cli');
    const modelParam = searchParams.get('model');
    if (!cliParam && !modelParam) {
      return;
    }
    const sanitizedCli = cliParam ? sanitizeCli(cliParam) : preferredCli;
    if (cliParam) {
      setUsingGlobalDefaults(false);
      updatePreferredCli(sanitizedCli);
    }
    if (modelParam) {
      setUsingGlobalDefaults(false);
      updateSelectedModel(modelParam, sanitizedCli);
    }
  }, [searchParams, preferredCli, updatePreferredCli, updateSelectedModel, setUsingGlobalDefaults]);

  const loadSettingsRef = useRef(loadSettings);
  useEffect(() => {
    loadSettingsRef.current = loadSettings;
  }, [loadSettings]);

  const loadTreeRef = useRef(loadTree);
  useEffect(() => {
    loadTreeRef.current = loadTree;
  }, [loadTree]);

  const loadDeployStatusRef = useRef(loadDeployStatus);
  useEffect(() => {
    loadDeployStatusRef.current = loadDeployStatus;
  }, [loadDeployStatus]);

  const checkCurrentDeploymentRef = useRef(checkCurrentDeployment);
  useEffect(() => {
    checkCurrentDeploymentRef.current = checkCurrentDeployment;
  }, [checkCurrentDeployment]);

  // Stable message handlers with useCallback to prevent reassignment
  const createStableMessageHandlers = useCallback(() => {
    const addMessage = (message: any) => {
      console.log('🔄 [StableHandler] Adding message via stable handler:', {
        messageId: message.id,
        role: message.role,
        isOptimistic: message.isOptimistic,
        requestId: message.requestId
      });

      // Track optimistic messages by requestId
      if (message.isOptimistic && message.requestId) {
        optimisticMessagesRef.current.set(message.requestId, message);
        console.log('🔄 [StableHandler] Tracking optimistic message:', {
          requestId: message.requestId,
          tempId: message.id
        });
      }

      // Also call the current handlers if they exist
      if (messageHandlersRef.current) {
        messageHandlersRef.current.add(message);
      }
    };

    const removeMessage = (messageId: string) => {
      console.log('🔄 [StableHandler] Removing message via stable handler:', messageId);

      // Remove from optimistic messages tracking if it's an optimistic message
      const optimisticMessage = Array.from(optimisticMessagesRef.current.values())
        .find(msg => msg.id === messageId);
      if (optimisticMessage && optimisticMessage.requestId) {
        optimisticMessagesRef.current.delete(optimisticMessage.requestId);
        console.log('🔄 [StableHandler] Removed optimistic message tracking:', {
          requestId: optimisticMessage.requestId,
          tempId: messageId
        });
      }

      // Also call the current handlers if they exist
      if (messageHandlersRef.current) {
        messageHandlersRef.current.remove(messageId);
      }
    };

    return { add: addMessage, remove: removeMessage };
  }, []);

  // Initialize stable handlers once
  useEffect(() => {
    stableMessageHandlers.current = createStableMessageHandlers();
    const optimisticMessages = optimisticMessagesRef.current;

    return () => {
      stableMessageHandlers.current = null;
      optimisticMessages.clear();
    };
  }, [createStableMessageHandlers]);

  // Handle image upload with base64 conversion
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          
          // Convert to base64
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = e.target?.result as string;
            setUploadedImages(prev => [...prev, {
              name: file.name,
              url,
              base64
            }]);
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  // Remove uploaded image
  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].url);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  async function runAct(messageOverride?: string, externalImages?: any[]): Promise<boolean> {
    let finalMessage = messageOverride || prompt;
    const imagesToUse = externalImages || uploadedImages;

    if (!finalMessage.trim() && imagesToUse.length === 0) {
      alert('Please enter a task description or upload an image.');
      return false;
    }

    // Add additional instructions in Chat Mode
    if (mode === 'chat') {
      finalMessage = finalMessage + "\n\nDo not modify code, only answer to the user's request.";
    }

    // Create request fingerprint for deduplication
    const requestFingerprint = JSON.stringify({
      message: finalMessage.trim(),
      imageCount: imagesToUse.length,
      cliPreference: preferredCli,
      model: selectedModel,
      mode
    });

    // Check for duplicate pending requests
    if (pendingRequestsRef.current.has(requestFingerprint)) {
      // 注释掉，减少干扰
      // console.log('🔄 [DEBUG] Duplicate request detected, skipping:', requestFingerprint);
      return false;
    }

    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;  // 保存当前requestId
    setIsRunning(true);
    console.log(`[中断按钮] ===请求开始=== requestId=${requestId}, mode=${mode}, isRunning=true`);
    let tempUserMessageId: string | null = null;

    // Add to pending requests
    pendingRequestsRef.current.add(requestFingerprint);

    try {
      const uploadImageFromBase64 = async (img: { base64: string; name?: string }) => {
        const base64String = img.base64;
        const match = base64String.match(/^data:(.*?);base64,(.*)$/);
        const mimeType = match && match[1] ? match[1] : 'image/png';
        const base64Data = match && match[2] ? match[2] : base64String;

        const byteString = atob(base64Data);
        const buffer = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i += 1) {
          buffer[i] = byteString.charCodeAt(i);
        }

        const extension = (() => {
          if (mimeType.includes('png')) return 'png';
          if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
          if (mimeType.includes('gif')) return 'gif';
          if (mimeType.includes('webp')) return 'webp';
          if (mimeType.includes('svg')) return 'svg';
          return 'png';
        })();

        const inferredName = img.name && img.name.trim().length > 0 ? img.name.trim() : `image-${crypto.randomUUID()}.${extension}`;
        const hasExtension = /\.[a-zA-Z0-9]+$/.test(inferredName);
        const filename = hasExtension ? inferredName : `${inferredName}.${extension}`;

        const file = new File([buffer], filename, { type: mimeType });
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/api/assets/${projectId}/upload`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Upload failed');
        }

        const result = await response.json();
        return {
          name: result.filename || filename,
          path: result.absolute_path,
          url: `/api/assets/${projectId}/${result.filename}`,
          public_url: typeof result.public_url === 'string' ? result.public_url : undefined,
          publicUrl: typeof result.public_url === 'string' ? result.public_url : undefined,
        };
      };

      console.log('🖼️ Processing images in runAct:', {
          imageCount: imagesToUse.length,
          cli: preferredCli,
          requestId
        });
      const processedImages: { name: string; path: string; url?: string; public_url?: string; publicUrl?: string }[] = [];

      for (let i = 0; i < imagesToUse.length; i += 1) {
        const image = imagesToUse[i];
        console.log(`🖼️ Processing image ${i}:`, {
          id: image.id,
          filename: image.filename,
          hasPath: !!image.path,
          hasPublicUrl: !!image.publicUrl,
          hasAssetUrl: !!image.assetUrl
        });
        if (image?.path) {
          const name = image.filename || image.name || `Image ${i + 1}`;
          const candidateUrl = typeof image.assetUrl === 'string' ? image.assetUrl : undefined;
          const candidatePublicUrl = typeof image.publicUrl === 'string' ? image.publicUrl : undefined;
          const processedImage = {
            name,
            path: image.path,
            url: candidateUrl && candidateUrl.startsWith('/') ? candidateUrl : undefined,
            public_url: candidatePublicUrl,
            publicUrl: candidatePublicUrl,
          };
          console.log(`🖼️ Created processed image ${i}:`, processedImage);
          processedImages.push(processedImage);
          continue;
        }

        if (image?.base64) {
          try {
            const uploaded = await uploadImageFromBase64({ base64: image.base64, name: image.name });
            processedImages.push(uploaded);
          } catch (uploadError) {
            console.error('Image upload failed:', uploadError);
            alert('Failed to upload image. Please try again.');
            setIsRunning(false);
            // Remove from pending requests
            pendingRequestsRef.current.delete(requestFingerprint);
            return false;
          }
        }
      }

      const requestBody = {
        instruction: finalMessage,
        images: processedImages,
        isInitialPrompt: false,
        cliPreference: preferredCli,
        conversationId: conversationId || undefined,
        requestId,
        selectedModel,
      };

      console.log('📸 Sending request to act API:', {
        messageLength: finalMessage.length,
        imageCount: processedImages.length,
        cli: preferredCli,
        requestId,
        images: processedImages.map(img => ({
          name: img.name,
          hasPath: !!img.path,
          hasUrl: !!img.url,
          hasPublicUrl: !!img.publicUrl
        }))
      });

      // Optimistically add user message to UI BEFORE API call for instant feedback
      tempUserMessageId = requestId + '-user-temp';
      if (messageHandlersRef.current) {
        const optimisticUserMessage = {
          id: tempUserMessageId,
          projectId: projectId,
          role: 'user' as const,
          messageType: 'chat' as const,
          content: finalMessage,
          conversationId: conversationId || null,
          requestId: requestId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isStreaming: false,
          isFinal: false,
          isOptimistic: true,
          metadata:
            processedImages.length > 0
              ? {
                  attachments: processedImages.map((img) => ({
                    name: img.name,
                    path: img.path,
                    url: img.url,
                    publicUrl: img.publicUrl ?? img.public_url,
                  })),
                }
              : undefined,
        };
        console.log('🔄 [Optimistic] Adding optimistic user message via stable handler:', {
          tempId: tempUserMessageId,
          requestId,
          content: finalMessage.substring(0, 50) + '...'
        });

        // Use stable handlers instead of direct messageHandlersRef to prevent reassignment issues
        if (stableMessageHandlers.current) {
          stableMessageHandlers.current.add(optimisticUserMessage);
        } else if (messageHandlersRef.current) {
          // Fallback to direct handlers if stable handlers aren't ready yet
          messageHandlersRef.current.add(optimisticUserMessage);
        }
      }

      // Add timeout to prevent indefinite waiting
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let r: Response;
      try {
        r = await fetch(`${API_BASE}/api/chat/${projectId}/act`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!r.ok) {
          const errorText = await r.text();
          console.error('API Error:', errorText);

          if (tempUserMessageId) {
            console.log('🔄 [Optimistic] Removing optimistic user message due to API error via stable handler:', tempUserMessageId);
            if (stableMessageHandlers.current) {
              stableMessageHandlers.current.remove(tempUserMessageId);
            } else if (messageHandlersRef.current) {
              messageHandlersRef.current.remove(tempUserMessageId);
            }
          }

          alert(`Failed to send message: ${r.status} ${r.statusText}\n${errorText}`);
          return false;
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          if (tempUserMessageId) {
            console.log('🔄 [Optimistic] Removing optimistic user message due to timeout via stable handler:', tempUserMessageId);
            if (stableMessageHandlers.current) {
              stableMessageHandlers.current.remove(tempUserMessageId);
            } else if (messageHandlersRef.current) {
              messageHandlersRef.current.remove(tempUserMessageId);
            }
          }

          alert('Request timed out after 60 seconds. Please check your connection and try again.');
          return false;
        }
        throw fetchError;
      }

      const result = await r.json();

      console.log('📸 Act API response received:', {
        success: result.success,
        userMessageId: result.userMessageId,
        conversationId: result.conversationId,
        requestId: result.requestId,
        hasAttachments: processedImages.length > 0,
        demoMode: result.demoMode,
      });

      const returnedConversationId =
        typeof result?.conversationId === 'string'
          ? result.conversationId
          : typeof result?.conversation_id === 'string'
          ? result.conversation_id
          : undefined;
      if (returnedConversationId) {
        setConversationId(returnedConversationId);
      }

      const resolvedRequestId =
        typeof result?.requestId === 'string'
          ? result.requestId
          : typeof result?.request_id === 'string'
          ? result.request_id
          : requestId;
      const userMessageId =
        typeof result?.userMessageId === 'string'
          ? result.userMessageId
          : typeof result?.user_message_id === 'string'
          ? result.user_message_id
          : '';

      // Refresh data after completion
      await loadTree('.');

      // Don't clear prompt here - let ChatInput handle it based on return value
      // setPrompt('');
      // if (uploadedImages && uploadedImages.length > 0) {
      //   uploadedImages.forEach(img => {
      //     if (img.url) URL.revokeObjectURL(img.url);
      //   });
      //   setUploadedImages([]);
      // }

      return true; // Success

    } catch (error: any) {
      console.error('Act execution error:', error);

      if (tempUserMessageId) {
        console.log('🔄 [Optimistic] Removing optimistic user message due to execution error via stable handler:', tempUserMessageId);
        if (stableMessageHandlers.current) {
          stableMessageHandlers.current.remove(tempUserMessageId);
        } else if (messageHandlersRef.current) {
          messageHandlersRef.current.remove(tempUserMessageId);
        }
      }

      const errorMessage = error?.message || String(error);
      alert(`Failed to send message: ${errorMessage}\n\nPlease try again. If the problem persists, check the console for details.`);

      // 仅在API调用失败时设为false，成功时由SSE事件控制
      setIsRunning(false);
      console.log(`[中断按钮] setIsRunning(false) - 来源: API失败`);
      return false; // Failure
    } finally {
      // Remove from pending requests
      pendingRequestsRef.current.delete(requestFingerprint);
    }
  }


  // 停止任务
  const handleStopTask = async () => {
    console.log('[中断按钮] 🛑 用户点击中断按钮');
    console.log('[中断按钮] 当前 isRunning:', isRunning);

    if (!isRunning) {
      console.log('[中断按钮] ❌ isRunning=false，无活跃请求，忽略');
      return;
    }

    const requestId = currentRequestIdRef.current;
    console.log('[中断按钮] 当前 requestId:', requestId);

    if (!requestId) {
      console.log('[中断按钮] ❌ requestId 为空，无法中断');
      return;
    }

    console.log(`[中断按钮] 🔄 发送中断请求: ${requestId}`);

    try {
      const response = await fetch(`${API_BASE}/api/chat/${projectId}/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });

      const result = await response.json();
      console.log('[中断按钮] API 响应:', result);

      if (!response.ok) {
        throw new Error(result.error || `Failed to stop task: ${response.status}`);
      }

      console.log('[中断按钮] ✅ 中断请求成功发送');
      currentRequestIdRef.current = null;  // 清空

      // 显示成功提示
      console.log('[中断按钮] 💡 等待后端处理中断...');
    } catch (error: any) {
      console.error('[StopTask] ❌ Error:', error);
      alert(`停止任务失败: ${error.message}\n\n请重试或查看控制台获取详细信息`);
    }
  };


  // Handle project status updates via callback from ChatLog
  const handleProjectStatusUpdate = (status: string, message?: string) => {
    const previousStatus = projectStatus;
    
    // Ignore if status is the same (prevent duplicates)
    if (previousStatus === status) {
      return;
    }
    
    setProjectStatus(status as ProjectStatus);
    if (message) {
      setInitializationMessage(message);
    }
    
    // If project becomes active, stop showing loading UI
    if (status === 'active') {
      setIsInitializing(false);
      
      // Handle only when transitioning from initializing → active
      if (previousStatus === 'initializing') {
        loadTreeRef.current?.('.');
      }
      
      // Initial prompt: trigger once with shared guard (handles active-via-WS case)
      triggerInitialPromptIfNeeded();
    } else if (status === 'failed') {
      setIsInitializing(false);
    }
  };

  // Function to start dependency installation in background
  const handleRetryInitialization = async () => {
    setProjectStatus('initializing');
    setIsInitializing(true);
    setInitializationMessage('Retrying project initialization...');
    
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/retry-initialization`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to retry initialization');
      }
    } catch (error) {
      console.error('Failed to retry initialization:', error);
      setProjectStatus('failed');
      setInitializationMessage('Failed to retry initialization. Please try again.');
    }
  };

  // Load states from localStorage when projectId changes
  useEffect(() => {
    if (typeof window !== 'undefined' && projectId) {
      const storedHasInitialPrompt = localStorage.getItem(`project_${projectId}_hasInitialPrompt`);
      const storedTaskComplete = localStorage.getItem(`project_${projectId}_taskComplete`);
      
      if (storedHasInitialPrompt !== null) {
        setHasInitialPrompt(storedHasInitialPrompt === 'true');
      }
      if (storedTaskComplete !== null) {
        setAgentWorkComplete(storedTaskComplete === 'true');
      }
    }
  }, [projectId]);

  // 处理演示模式：检测 URL 参数并设置状态
  useEffect(() => {
    if (!projectId || !searchParams) return;

    const demoReplay = searchParams.get('demoReplay');
    const deployedUrl = searchParams.get('deployedUrl');

    if (demoReplay === 'true') {
      setIsDemo(true);
      if (deployedUrl) {
        setDemoDeployedUrl(deployedUrl);
      }

      // 清除 URL 参数
      const url = new URL(window.location.href);
      url.searchParams.delete('demoReplay');
      url.searchParams.delete('deployedUrl');
      window.history.replaceState({}, '', url.toString());
    }
  }, [projectId, searchParams]);



  // Poll for file changes in code view
  useEffect(() => {
    if (!showPreview && selectedFile && !hasUnsavedChanges) {
      const interval = setInterval(() => {
        reloadCurrentFile();
      }, 2000); // Check every 2 seconds

      return () => clearInterval(interval);
    }
  }, [showPreview, selectedFile, hasUnsavedChanges, reloadCurrentFile]);


  useEffect(() => {
    if (!projectId) {
      return;
    }

    let canceled = false;

    const initializeChat = async () => {
      try {
        const projectSettingsPromise = loadProjectInfoRef.current?.();
        const parallelTasks: Promise<any>[] = [];
        const t2 = loadDeployStatusRef.current?.();
        const t3 = checkCurrentDeploymentRef.current?.();
        if (t2) parallelTasks.push(t2);
        if (t3) parallelTasks.push(t3);
        await Promise.all(parallelTasks);
        if (canceled) return;

        const projectSettings = await projectSettingsPromise;
        if (canceled) return;
        await loadSettingsRef.current?.(projectSettings);
      } catch (error) {
        console.error('Failed to initialize chat view:', error);
      }
    };

    initializeChat();

    try {
      router.prefetch('/');
    } catch {}

    const handleServicesUpdate = () => {
      loadDeployStatusRef.current?.();
    };

    const handleBeforeUnload = () => {
      navigator.sendBeacon(`${API_BASE}/api/projects/${projectId}/preview/stop`);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('services-updated', handleServicesUpdate);

    return () => {
      canceled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('services-updated', handleServicesUpdate);

      const currentPreview = previewUrlRef.current;
      if (currentPreview) {
        fetch(`${API_BASE}/api/projects/${projectId}/preview/stop`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    fetch(`${API_BASE}/api/projects`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        const items = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];
        try {
          sessionStorage.setItem('projectsCache', JSON.stringify(items));
        } catch {}
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let canceled = false;
    const run = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/projects/${projectId}/preview/status`, { cache: 'no-store' });
        if (!r.ok) return;
        const payload = await r.json();
        const data = payload?.data ?? payload ?? {};
        const status = typeof data?.status === 'string' ? data.status : undefined;
        const url = typeof data?.url === 'string' ? data.url : null;
        try { console.log('[PreviewStatus.HTTP]', { status, url, data }); } catch {}
        if (status) {
          setBackendPreviewPhase(status);
        }
        if (canceled) return;
        if (url) {
          setPreviewUrl(url);
          setCurrentRoute('/');
          // 不要在轮询中设置 setIsStartingPreview(false)，让 SSE 事件控制
          setPreviewError(null);
        } else {
          // 不要在轮询中设置 setIsStartingPreview(false)，让 SSE 事件控制
          if (status === 'error') {
            setPreviewError('预览启动失败');
          }
        }
      } catch {}
    };
    run();
    return () => {
      canceled = true;
    };
  }, [projectId]);

  // Cleanup pending requests on unmount
  useEffect(() => {
    const pendingRequests = pendingRequestsRef.current;
    return () => {
      pendingRequests.clear();
    };
  }, []);

  // React to global settings changes when using global defaults
  const { settings: globalSettings } = useGlobalSettings();
  useEffect(() => {
    if (!usingGlobalDefaults) return;
    if (!globalSettings) return;

    const cli = sanitizeCli(globalSettings.default_cli);
    updatePreferredCli(cli);

    const modelFromGlobal = globalSettings.cli_settings?.[cli]?.model;
    if (modelFromGlobal) {
      updateSelectedModel(modelFromGlobal, cli);
    } else {
      updateSelectedModel(getDefaultModelForCli(cli), cli);
    }
  }, [globalSettings, usingGlobalDefaults, updatePreferredCli, updateSelectedModel]);


  // Show loading UI if project is initializing

  const [isNavigatingHome, setIsNavigatingHome] = useState(false);
  const [sidebarActiveItem, setSidebarActiveItem] = useState<'home' | 'templates' | 'apps' | 'help'>('apps'); // Sidebar shows 'apps' as active
  const [currentView, setCurrentView] = useState<'home' | 'templates' | 'apps' | 'help' | 'chat'>('chat'); // Content shows chat
  const [projects, setProjects] = useState<any[]>([]);

  // Load projects list for "My Apps" view
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

  useEffect(() => {
    if (currentView === 'apps') {
      loadProjects();
    }
  }, [currentView, loadProjects]);

  return (
    <>
      <style jsx global>{`
        /* Light theme syntax highlighting */
        .hljs {
          background: #f9fafb !important;
          color: #374151 !important;
        }
        
        .hljs-punctuation,
        .hljs-bracket,
        .hljs-operator {
          color: #1f2937 !important;
          font-weight: 600 !important;
        }
        
        .hljs-built_in,
        .hljs-keyword {
          color: #7c3aed !important;
          font-weight: 600 !important;
        }
        
        .hljs-string {
          color: #059669 !important;
        }
        
        .hljs-number {
          color: #dc2626 !important;
        }
        
        .hljs-comment {
          color: #6b7280 !important;
          font-style: italic;
        }
        
        .hljs-function,
        .hljs-title {
          color: #2563eb !important;
          font-weight: 600 !important;
        }
        
        .hljs-variable,
        .hljs-attr {
          color: #dc2626 !important;
        }
        
        .hljs-tag,
        .hljs-name {
          color: #059669 !important;
        }
        
        /* Make parentheses, brackets, and braces more visible */
        .hljs-punctuation:is([data-char="("], [data-char=")"], [data-char="["], [data-char="]"], [data-char="{"], [data-char="}"]) {
          color: #1f2937 !important;
          font-weight: bold !important;
          background: rgba(59, 130, 246, 0.1);
          border-radius: 2px;
          padding: 0 1px;
        }
        
      `}</style>

      <div className="h-screen bg-white flex relative overflow-hidden">
        {/* App Sidebar */}
        <AppSidebar
          currentPage={sidebarActiveItem}
          projectsCount={projects.length}
          onNavigate={(page) => {
            if (page === 'settings') {
              window.open('/settings', '_blank');
            } else if (page === 'home') {
              router.push('/workspace');
            } else if (page === 'apps') {
              router.push('/workspace?view=apps');
            } else if (page === 'templates') {
              router.push('/workspace?view=templates');
            } else {
              router.push(`/workspace?view=${page}`);
            }
          }}
        />

        <div className="h-full flex-1 flex">
          {/* Left: Chat window or Main Content */}
          <div
            style={{ width: currentView === 'chat' ? '35%' : '100%' }}
            className="h-full border-r border-gray-200 flex flex-col min-w-0 flex-shrink-0 overflow-hidden"
          >
            {currentView === 'chat' && (
              <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 p-4 h-[73px] flex items-center">
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => router.push('/workspace?view=apps')}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                  title="返回我的应用"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-semibold text-gray-900 truncate">
                    {typeof projectName === 'string'
                      ? (projectName.length > 30 ? `${projectName.slice(0, 30)}…` : projectName)
                      : 'Loading...'}
                  </h1>
                  {projectDescription && (
                    <p className="text-sm text-gray-500 truncate">
                      {projectDescription}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Chat log area */}
            <div className="flex-1 min-h-0">
              <ChatErrorBoundary>
              {(() => {
                const focusInputRef = focusInputRefGlobal || (focusInputRefGlobal = { fn: null as null | (() => void) });
                return null;
              })()}
              <ChatLog
                projectId={projectId}
                isDemoReplay={isDemo}
                onFocusInput={() => {
                  try {
                    const f = (focusInputRefGlobal && focusInputRefGlobal.fn) as undefined | (() => void);
                    if (typeof f === 'function') f();
                  } catch {}
                }}
                onAddUserMessage={(handlers) => {
                  messageHandlersRef.current = handlers;
                  // Update stable handlers reference if exists
                  if (stableMessageHandlers.current) {
                    // Note: stableMessageHandlers.current already has its own add/remove logic
                  }
                }}
                onSessionStatusChange={(isRunningValue) => {
                  console.log(`[中断按钮] onSessionStatusChange 回调触发: ${isRunningValue ? 'true' : 'false'}`);
                  setIsRunning(isRunningValue);
                  console.log(`[中断按钮] setIsRunning(${isRunningValue}) - 来源: onSessionStatusChange`);
                }}
                onSseFallbackActive={(active) => {
                  // 注释掉，减少干扰
                  // console.log('🔄 [SSE] Fallback status:', active);
                  setIsSseFallbackActive(active);
                }}
                onProjectStatusUpdate={handleProjectStatusUpdate}
                onPreviewReady={(url) => {
                  setPreviewUrl(url);
                  setCurrentRoute('/');
                  try { fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.ready.auto_switch', message: 'Auto switch to preview URL', level: 'info', metadata: { url } }) }); } catch {}
                }}
                onPreviewError={(message) => {
                  const msg = typeof message === 'string' && message.trim().length > 0 ? message : '预览启动失败';
                  setPreviewError(msg);
                  try { fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.error.ui', message: msg, level: 'error' }) }); } catch {}
                }}
                onPreviewPhaseChange={(phase) => {
                  setBackendPreviewPhase(phase);
                  if (phase === 'preview_starting' || phase === 'preview_installing' || phase === 'preview_running') {
                    setIsStartingPreview(true);
                  } else if (phase === 'preview_ready') {
                    setIsStartingPreview(false);
                  } else if (phase === 'error' || phase === 'preview_error') {
                    setIsStartingPreview(false);
                  }
                  // 不要响应 'stopped', 'idle', 'running' 来关闭加载，避免与启动流程冲突
                }}
                onPlanningCompleted={(planMd, requestId, isApproved) => {
                  // 如果这个 requestId 已经确认过，忽略后续的 planning_completed
                  if (approvedRequestIdsRef.current.has(requestId)) {
                    return;
                  }
                  setPlanContent(planMd);
                  // 如果已确认，不显示确认按钮；否则显示
                  if (isApproved) {
                    approvedRequestIdsRef.current.add(requestId);
                    setPendingPlanApproval(null);
                  } else {
                    setPendingPlanApproval({ requestId });
                  }
                  setActivePreviewTab('activity');
                }}
                onPlanApproved={(requestId) => {
                  approvedRequestIdsRef.current.add(requestId);
                  setPendingPlanApproval(null);
                  // 不关闭标签页，让 plan 内容继续显示
                }}
                onTodoUpdate={(todos) => {
                  setCurrentTodos(todos);
                }}
                onFileChange={(change) => {
                  setFileChanges(prev => {
                    const updated = [...prev, change];
                    // 限制最多保留100条，超出时移除最旧的
                    return updated.length > 100 ? updated.slice(-100) : updated;
                  });
                  // 有新的代码变更时，如果当前没有显示任何标签，自动显示执行动态标签
                  setActivePreviewTab(current => current === 'none' ? 'activity' : current);
                }}
                onDemoStart={(deployedUrl) => {
                  console.log('[DemoMode] Demo started, deployedUrl:', deployedUrl);
                  setIsDemo(true);
                  setDemoDeployedUrl(deployedUrl);
                }}
                onDemoReplayComplete={() => {
                  // sourceProjectId 模式回放完成后，自动启动预览
                  // 注：此回调只会被 sourceProjectId 模式触发（前端延迟回放），模板回放走后端 SSE 不会触发
                  console.log('[DemoMode] Replay complete, starting preview...');
                  start();
                }}
              />
              </ChatErrorBoundary>
            </div>
            
            {/* Simple input area */}
            <div className="p-4 rounded-bl-2xl">
              <ChatInput
                onSendMessage={async (message, images) => {
                  // Pass images to runAct
                  return await runAct(message, images);
                }}
                onStopTask={handleStopTask}
                disabled={isRunning}
                placeholder={mode === 'act' ? "写代码模式..." : "闲聊模式..."}
                mode={mode}
                onModeChange={setMode}
                projectId={projectId}
                preferredCli={preferredCli}
                selectedModel={selectedModel}
                thinkingMode={thinkingMode}
                onThinkingModeChange={setThinkingMode}
                modelOptions={modelOptions}
                onModelChange={handleModelChange}
                modelChangeDisabled={isUpdatingModel}
                cliOptions={cliOptions}
                onCliChange={handleCliChange}
                cliChangeDisabled={isUpdatingModel}
                isRunning={isRunning}
                onExposeFocus={(fn) => {
                  try {
                    if (!focusInputRefGlobal) {
                      focusInputRefGlobal = { fn } as any;
                    } else {
                      focusInputRefGlobal.fn = fn;
                    }
                  } catch {}
                }}
                onExposeInputControl={(control) => {
                  try {
                    if (!inputControlRefGlobal) {
                      inputControlRefGlobal = { control } as any;
                    } else {
                      inputControlRefGlobal.control = control;
                    }
                  } catch {}
                }}
              />
            </div>
              </>
            )}

            {/* Home View */}
            {currentView === 'home' && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-2xl">
                  <h1 className="text-4xl font-bold text-gray-900 mb-2 text-center">
                    开始新项目
                  </h1>
                  <p className="text-gray-600 mb-8 text-center">
                    描述你想要构建的应用，AI会帮你生成代码
                  </p>
                  <ChatInput
                    onSendMessage={async (message, images) => {
                      const success = await runAct(message, images);
                      if (success) {
                        setCurrentView('chat');
                      }
                      return success;
                    }}
                    disabled={isRunning}
                    placeholder="描述你想要创建的应用..."
                    mode={mode}
                    onModeChange={setMode}
                    projectId={projectId}
                    preferredCli={preferredCli}
                    selectedModel={selectedModel}
                    thinkingMode={thinkingMode}
                    onThinkingModeChange={setThinkingMode}
                    modelOptions={modelOptions}
                    onModelChange={handleModelChange}
                    modelChangeDisabled={isUpdatingModel}
                    cliOptions={cliOptions}
                    onCliChange={handleCliChange}
                    cliChangeDisabled={isUpdatingModel}
                    isRunning={isRunning}
                  />
                </div>
              </div>
            )}

            {/* Templates View */}
            {currentView === 'templates' && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Folder className="w-8 h-8 text-gray-400" />
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
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(305px, 1fr))' }}>
                    {projects.map((project: any) => (
                      <div
                        key={project.id}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => {
                          router.push(`/${project.id}/chat`);
                        }}
                      >
                        <h3 className="font-semibold text-gray-900 mb-2 truncate">
                          {project.name}
                        </h3>
                        <p className="text-sm text-gray-500 mb-3">
                          {new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt).toLocaleDateString()}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Edit functionality
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            编辑
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Delete functionality
                            }}
                            className="text-xs text-red-600 hover:text-red-800"
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
                    <HelpCircle className="w-8 h-8 text-gray-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">帮助文档</h2>
                  <p className="text-gray-500 mb-4">即将推出...</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Preview/Code area - Only show in chat view */}
          {currentView === 'chat' && (
            <div className="h-full flex-1 flex flex-col bg-black min-w-0 overflow-hidden">
            {/* Content area */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Controls Bar */}
              <div className="bg-white border-b border-gray-200 px-4 h-[73px] flex items-center relative">
                <div className="flex items-center gap-3">
                  {/* Toggle switch */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-1">
                      <button
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center ${
                          showPreview && !showConsole && !showSettings && !showAliyunDeploy
                            ? 'bg-white text-gray-900 '
                            : 'text-gray-600 hover:text-gray-900 '
                        }`}
                        onClick={() => { setShowPreview(true); setShowConsole(false); setShowSettings(false); setShowAliyunDeploy(false); try { fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.toggle', message: 'Show preview', level: 'info' }) }); } catch {} }}
                        title="Preview"
                      >
                        <span className="w-4 h-4 flex items-center justify-center"><Monitor size={16} /></span>
                        {showPreview && !showConsole && !showSettings && !showAliyunDeploy && <span className="ml-1">预览</span>}
                      </button>
                    <button
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center ${
                        !showPreview && !showConsole && !showSettings && !showAliyunDeploy
                          ? 'bg-white text-gray-900 '
                          : 'text-gray-600 hover:text-gray-900 '
                      }`}
                      onClick={() => {
                        setShowPreview(false);
                        setShowConsole(false);
                        setShowSettings(false);
                        setShowAliyunDeploy(false);
                        if (tree.length === 0) {
                          loadTreeRef.current?.('.');
                        }
                      }}
                      title="Code"
                    >
                      <span className="w-4 h-4 flex items-center justify-center"><Code size={16} /></span>
                      {!showPreview && !showConsole && !showSettings && !showAliyunDeploy && <span className="ml-1">代码</span>}
                    </button>
                    <button
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center ${
                        showConsole
                          ? 'bg-white text-gray-900 '
                          : 'text-gray-600 hover:text-gray-900 '
                      }`}
                      onClick={() => {
                        setShowConsole(true);
                        setShowPreview(false);
                        setShowSettings(false);
                        setShowAliyunDeploy(false);
                        loadTimelineContent();
                      }}
                      title="Console"
                    >
                      <span className="w-4 h-4 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="4 17 10 11 4 5"></polyline>
                          <line x1="12" y1="19" x2="20" y2="19"></line>
                        </svg>
                      </span>
                      {showConsole && <span className="ml-1">控制台</span>}
                    </button>
                    <button
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center ${
                        showSettings
                          ? 'bg-white text-gray-900 '
                          : 'text-gray-600 hover:text-gray-900 '
                      }`}
                      onClick={() => {
                        setShowSettings(true);
                        setShowPreview(false);
                        setShowConsole(false);
                        setShowAliyunDeploy(false);
                      }}
                      title="Settings"
                    >
                      <span className="w-4 h-4 flex items-center justify-center"><Settings size={16} /></span>
                      {showSettings && <span className="ml-1">设置</span>}
                    </button>
                    <button
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center ${
                        showAliyunDeploy
                          ? 'bg-white text-gray-900 '
                          : 'text-gray-600 hover:text-gray-900 '
                      }`}
                      onClick={() => {
                        setShowAliyunDeploy(true);
                        setShowPreview(false);
                        setShowConsole(false);
                        setShowSettings(false);
                      }}
                      title="Deploy"
                    >
                      <span className="w-4 h-4 flex items-center justify-center"><Share2 size={16} /></span>
                      {showAliyunDeploy && <span className="ml-1">发布</span>}
                    </button>
                  </div>
                  
                  {/* Center Controls */}
                  {showPreview && previewUrl && (
                    <div className="flex items-center gap-3">
                      {/* Route Navigation */}
                      <div className="h-9 flex items-center bg-gray-100 rounded-lg px-3 border border-gray-200 ">
                        <span className="text-gray-400 mr-2">
                          <Home size={12} />
                        </span>
                        {previewOrigin && (
                          <span className="text-sm text-gray-700 font-mono mr-1">{previewOrigin}</span>
                        )}
                        <span className="text-sm text-gray-500 mr-1">/</span>
                        <input
                          type="text"
                          value={currentRoute.startsWith('/') ? currentRoute.slice(1) : currentRoute}
                          onChange={(e) => {
                            const value = e.target.value;
                            setCurrentRoute(value ? `/${value}` : '/');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              navigateToRoute(currentRoute);
                            }
                          }}
                          className="bg-transparent text-sm text-gray-700 outline-none w-10"
                          placeholder="route"
                        />
                      <button
                        onClick={() => navigateToRoute(currentRoute)}
                        className="ml-2 text-gray-500 hover:text-gray-700 "
                      >
                        <ArrowRight size={12} />
                      </button>
                      </div>
                      
                      {/* Action Buttons Group */}
                      <div className="flex items-center gap-1.5">
                        <button 
                          className="h-9 w-9 flex items-center justify-center bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                        onClick={() => {
                          const iframe = document.querySelector('iframe');
                          if (iframe) {
                            iframe.src = iframe.src;
                          }
                          try { fetch(`${API_BASE}/api/projects/${projectId}/log/frontend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'preview.refresh', message: 'Refresh preview', level: 'info', metadata: { url: iframe?.src } }) }); } catch {}
                        }}
                        title="Refresh preview"
                      >
                        <RotateCcw size={14} />
                      </button>
                        
                        {/* Device Mode Toggle */}
                        <div className="h-9 flex items-center gap-1 bg-gray-100 rounded-lg px-1 border border-gray-200 ">
                          <button
                            aria-label="Desktop preview"
                            className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
                              deviceMode === 'desktop' 
                                ? 'text-blue-600 bg-blue-50 ' 
                                : 'text-gray-400 hover:text-gray-600 '
                            }`}
                            onClick={() => setDeviceMode('desktop')}
                          >
                            <Monitor size={14} />
                          </button>
                          <button
                            aria-label="Mobile preview"
                            className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
                              deviceMode === 'mobile'
                                ? 'text-blue-600 bg-blue-50 '
                                : 'text-gray-400 hover:text-gray-600 '
                            }`}
                            onClick={() => setDeviceMode('mobile')}
                          >
                            <Smartphone size={14} />
                          </button>
                          <button
                            aria-label="在浏览器中打开"
                            className="h-7 w-7 flex items-center justify-center rounded transition-colors text-gray-400 hover:text-gray-600"
                            onClick={() => {
                              if (previewUrl) {
                                window.open(previewUrl, '_blank');
                              }
                            }}
                            title="在浏览器中打开"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 ml-auto-bak">
                  {/* Preview Button - Show when preview is not running */}
                  {showPreview && !previewUrl && !isStartingPreview && (
                    <button
                      className="h-9 px-3 bg-black hover:bg-gray-900 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      onClick={start}
                    >
                      启动
                    </button>
                  )}

                  {/* Stop Button - Show when preview is running */}
                  {showPreview && previewUrl && (
                    <button
                      className="h-9 px-3 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={stop}
                      disabled={isStopping}
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 relative bg-black overflow-hidden">
                <AnimatePresence initial={false}>
                  {showAliyunDeploy ? (
                  <MotionDiv
                    key="aliyun-deploy"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col bg-white"
                  >
                    <AliyunDeployPage
                      projectId={projectId}
                      onClose={() => {
                        setShowAliyunDeploy(false);
                        setShowPreview(true);
                      }}
                      isDemo={isDemo}
                      deployedUrl={demoDeployedUrl}
                    />
                  </MotionDiv>
                  ) : showSettings ? (
                  <MotionDiv
                    key="settings"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col bg-white"
                  >
                    {/* Settings Header with Tabs */}
                    <div className="border-b border-gray-200 bg-white">
                      <div className="flex gap-2 p-4">
                        <button
                          onClick={() => setSettingsActiveTab('general')}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            settingsActiveTab === 'general'
                              ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          常规
                        </button>
                        <button
                          onClick={() => setSettingsActiveTab('ai-assistant')}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            settingsActiveTab === 'ai-assistant'
                              ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Agent
                        </button>
                        <button
                          onClick={() => setSettingsActiveTab('environment')}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            settingsActiveTab === 'environment'
                              ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          环境变量
                        </button>
                      </div>
                    </div>

                    {/* Settings Content */}
                    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
                      {settingsActiveTab === 'general' && (
                        <GeneralSettings
                          projectId={projectId}
                          projectName={projectName}
                          projectDescription={projectDescription ?? ''}
                          onProjectUpdated={({ name, description }) => {
                            setProjectName(name);
                            setProjectDescription(description ?? '');
                          }}
                        />
                      )}

                      {settingsActiveTab === 'ai-assistant' && (
                        <AIAssistantSettings projectId={projectId} />
                      )}

                      {settingsActiveTab === 'environment' && (
                        <EnvironmentSettings projectId={projectId} />
                      )}
                    </div>
                  </MotionDiv>
                  ) : showConsole ? (
                  <MotionDiv
                    key="console"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col bg-black"
                  >
                    {/* Console Header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
                      <div className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-green-400" strokeWidth="2">
                          <polyline points="4 17 10 11 4 5"></polyline>
                          <line x1="12" y1="19" x2="20" y2="19"></line>
                        </svg>
                        <span className="text-sm font-medium text-gray-300">Console Output</span>
                        {/* Real-time connection indicator */}
                        <div className="flex items-center gap-1.5 ml-2">
                          <div className={`w-2 h-2 rounded-full ${isTimelineSseConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                          <span className="text-xs text-gray-500">
                            {isTimelineSseConnected ? 'Live' : 'Offline'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={loadTimelineContent}
                        disabled={isLoadingTimeline}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                        title="Manual refresh (backup)"
                      >
                        {isLoadingTimeline ? 'Loading...' : 'Refresh'}
                      </button>
                    </div>

                    {/* Console Content */}
                    <div className="flex-1 overflow-y-auto bg-black p-4 font-mono text-sm custom-scrollbar">
                      {!timelineContent ? (
                        <div className="flex items-center justify-center h-full text-gray-600">
                          <div className="text-center">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mx-auto mb-3 text-gray-700" strokeWidth="1.5">
                              <polyline points="4 17 10 11 4 5"></polyline>
                              <line x1="12" y1="19" x2="20" y2="19"></line>
                            </svg>
                            <p className="text-sm">No console output yet</p>
                            <p className="text-xs text-gray-700 mt-1">Build and preview logs will appear here</p>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">
                          {timelineContent.split('\n').map((line, idx) => (
                            <div
                              key={idx}
                              className={`leading-relaxed ${
                                line.includes('error') || line.includes('ERROR')
                                  ? 'text-red-400'
                                  : line.includes('warn') || line.includes('WARN')
                                  ? 'text-yellow-400'
                                  : 'text-green-400'
                              }`}
                            >
                              {line}
                            </div>
                          ))}
                          <div ref={consoleEndRef} />
                        </div>
                      )}
                    </div>
                  </MotionDiv>
                  ) : showPreview ? (
                  <MotionDiv
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ height: '100%' }}
                  >
                {previewUrl ? (
                  <div className="relative w-full h-full bg-gray-100 flex items-center justify-center">
                    <div 
                      className={`bg-white ${
                        deviceMode === 'mobile' 
                          ? 'w-[375px] h-[667px] rounded-[25px] border-8 border-gray-800 shadow-2xl' 
                          : 'w-full h-full'
                      } overflow-hidden`}
                    >
                      {previewError && (
                        <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 shadow">
                          <span className="text-sm truncate flex-1 min-w-0">{previewError}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                              onClick={() => {
                                try {
                                  const guidance = `错误摘要：${previewError}\n请先查看后端日志：projects/${projectId}/logs/timeline.txt（最近200行），并据此给出修复建议。`;
                                  if (inputControlRefGlobal?.control) {
                                    inputControlRefGlobal.control.setMessage(guidance);
                                  }
                                } catch {}
                              }}
                            >复制到聊天框</button>
                            <button
                              className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                              onClick={() => setPreviewError(null)}
                            >关闭</button>
                          </div>
                        </div>
                      )}
                      <iframe
                        key={previewUrl || 'empty'}
                        ref={iframeRef}
                        className="w-full h-full border-none bg-white "
                        src={previewUrl || ''}
                        onError={() => {
                          // Show error overlay
                          const overlay = document.getElementById('iframe-error-overlay');
                          if (overlay) overlay.style.display = 'flex';
                        }}
                        onLoad={() => {
                          // Hide error overlay when loaded successfully
                          const overlay = document.getElementById('iframe-error-overlay');
                          if (overlay) overlay.style.display = 'none';
                        }}
                      />
                      
                      {/* Error overlay */}
                    <div 
                      id="iframe-error-overlay"
                      className="absolute inset-0 bg-gray-50 flex items-center justify-center z-10"
                      style={{ display: 'none' }}
                    >
                      <div className="text-center max-w-md mx-auto p-6">
                        <div className="text-4xl mb-4">🔄</div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          Connection Issue
                        </h3>
                        <p className="text-gray-600 mb-4">
                          The preview couldn&apos;t load properly. Try clicking the refresh button to reload the page.
                        </p>
                        <button
                          className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                          onClick={() => {
                            const iframe = document.querySelector('iframe');
                            if (iframe) {
                              iframe.src = iframe.src;
                            }
                            const overlay = document.getElementById('iframe-error-overlay');
                            if (overlay) overlay.style.display = 'none';
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Refresh Now
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gray-50 relative">
                    {/* Plan/Todo/Code 标签面板 */}
                    {(planContent || currentTodos.length > 0 || fileChanges.length > 0) && activePreviewTab !== 'none' && (
                      <PreviewTabs
                        planContent={planContent}
                        todos={currentTodos}
                        fileChanges={fileChanges}
                        activeTab={activePreviewTab}
                        onTabChange={setActivePreviewTab}
                        pendingApproval={!!pendingPlanApproval}
                        onApprovePlan={async () => {
                          if (pendingPlanApproval) {
                            const rid = pendingPlanApproval.requestId;
                            approvedRequestIdsRef.current.add(rid);
                            setPendingPlanApproval(null);
                            // 不关闭标签页，只隐藏确认按钮
                            try {
                              await fetch(`${API_BASE}/api/chat/${projectId}/approve-plan`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ requestId: rid, approve: true }),
                              });
                            } catch {}
                          }
                        }}
                      />
                    )}
                    {/* 标签按钮（当有内容但未选中时显示） */}
                    {(planContent || currentTodos.length > 0 || fileChanges.length > 0) && activePreviewTab === 'none' && (
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                        {/* 执行动态按钮 - 放在第一位 */}
                        {(planContent || fileChanges.length > 0) && (
                          <button
                            onClick={() => setActivePreviewTab('activity')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                              pendingPlanApproval
                                ? 'bg-gray-200 text-gray-900'
                                : 'bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            执行动态
                            <span className="text-gray-400">
                              {(planContent ? 1 : 0) + fileChanges.length}
                            </span>
                            {pendingPlanApproval && (
                              <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                            )}
                          </button>
                        )}
                        {/* 任务进度按钮 */}
                        {currentTodos.length > 0 && (
                          <button
                            onClick={() => setActivePreviewTab('todo')}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                          >
                            任务进度
                            <span className="text-gray-400">
                              {currentTodos.filter(t => t.status === 'completed').length}/{currentTodos.length}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                    {previewError && (
                      <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 shadow">
                        <span className="text-sm truncate flex-1 min-w-0">{previewError}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                              onClick={() => {
                                try {
                                  const guidance = `错误摘要：${previewError}\n请先查看后端日志：projects/${projectId}/logs/timeline.txt（最近200行），并据此给出修复建议。`;
                                  if (inputControlRefGlobal?.control) {
                                    inputControlRefGlobal.control.setMessage(guidance);
                                  }
                                } catch {}
                              }}
                            >复制到聊天框</button>
                          <button
                            className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                            onClick={() => setPreviewError(null)}
                          >关闭</button>
                        </div>
                      </div>
                    )}
                    {/* Content */}
                    <div className="relative w-full h-full flex items-center justify-center">
                    {isStartingPreview ? (
                      <MotionDiv
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                      >
                        {/* Loading spinner */}
                        <div className="w-16 h-16 mx-auto mb-6">
                          <div
                            className="w-full h-full border-4 rounded-full animate-spin"
                            style={{
                              borderTopColor: 'transparent',
                              borderRightColor: '#000000',
                              borderBottomColor: '#000000',
                              borderLeftColor: '#000000',
                            }}
                          />
                        </div>
                        
                        {/* Content */}
                        <h3 className="text-xl font-semibold text-gray-900 mb-3">
                          Starting Preview Server
                        </h3>
                        
                        <div className="flex items-center justify-center gap-1 text-gray-600 ">
                          <span>{previewInitializationMessage}</span>
                          <MotionDiv
                            className="flex gap-1 ml-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <MotionDiv
                              animate={{ opacity: [0, 1, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                              className="w-1 h-1 bg-gray-600 rounded-full"
                            />
                            <MotionDiv
                              animate={{ opacity: [0, 1, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                              className="w-1 h-1 bg-gray-600 rounded-full"
                            />
                            <MotionDiv
                              animate={{ opacity: [0, 1, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
                              className="w-1 h-1 bg-gray-600 rounded-full"
                            />
                          </MotionDiv>
                        </div>
                      </MotionDiv>
                    ) : (
                    <div className="text-center">
                      <MotionDiv
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      >
                        {/* Building Status */}
                        {(backendPreviewPhase === 'preview_starting' || backendPreviewPhase === 'preview_installing' || backendPreviewPhase === 'preview_running') ? (
                          <>
                            <h3 className="text-2xl font-bold mb-3 relative overflow-hidden inline-block">
                              <span 
                                className="relative"
                                style={{
                                  background: `linear-gradient(90deg, 
                                    #6b7280 0%, 
                                    #6b7280 30%, 
                                    #ffffff 50%, 
                                    #6b7280 70%, 
                                    #6b7280 100%)`,
                                  backgroundSize: '200% 100%',
                                  WebkitBackgroundClip: 'text',
                                  backgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  animation: 'shimmerText 5s linear infinite'
                                }}
                              >
                                Building...
                              </span>
                              <style>{`
                                @keyframes shimmerText {
                                  0% {
                                    background-position: 200% center;
                                  }
                                  100% {
                                    background-position: -200% center;
                                  }
                                }
                              `}</style>
                            </h3>
                          </>
                        ) : (
                          <>
                            <div
                              onClick={!isRunning && !isStartingPreview ? start : undefined}
                              className={`w-20 h-20 mx-auto mb-6 flex items-center justify-center ${!isRunning && !isStartingPreview ? 'cursor-pointer group' : ''}`}
                            >
                              {/* Icon in Center - Play or Loading */}
                              {isStartingPreview ? (
                                <div
                                  className="w-16 h-16 border-4 rounded-full animate-spin"
                                  style={{
                                    borderTopColor: 'transparent',
                                    borderRightColor: '#000000',
                                    borderBottomColor: '#000000',
                                    borderLeftColor: '#000000',
                                  }}
                                />
                              ) : (
                                <MotionDiv
                                  className="flex items-center justify-center"
                                  whileHover={{ scale: 1.2 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <Play
                                    size={48}
                                    className="text-gray-700"
                                  />
                                </MotionDiv>
                              )}
                            </div>

                            <h3 className="text-2xl font-bold text-gray-900 mb-3">
                              Preview Not Running
                            </h3>
                            
                            <p className="text-gray-600 max-w-lg mx-auto">
                              Start your development server to see live changes
                            </p>
                          </>
                        )}
                      </MotionDiv>
                    </div>
                    )}
                    </div>
                  </div>
                )}
                  </MotionDiv>
                ) : (
              <MotionDiv
                key="code"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex bg-white "
              >
                {/* Left Sidebar - File Explorer (VS Code style) */}
                <div className="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
                  {/* File Tree Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <Code className="text-gray-600" size={14} />
                      <span className="text-sm font-medium text-gray-700">代码</span>
                    </div>
                    <button
                      onClick={() => {
                        if (loadTreeRef.current) {
                          loadTreeRef.current('.');
                        }
                      }}
                      className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                      title="刷新文件树"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                  {/* File Tree */}
                  <div className="flex-1 overflow-y-auto bg-gray-50 custom-scrollbar">
                    {!tree || tree.length === 0 ? (
                      <div className="px-3 py-8 text-center text-[11px] text-gray-600 select-none">
                        No files found
                      </div>
                    ) : (
                      <TreeView 
                        entries={tree || []}
                        selectedFile={selectedFile}
                        expandedFolders={expandedFolders}
                        folderContents={folderContents}
                        onToggleFolder={toggleFolder}
                        onSelectFile={openFile}
                        onLoadFolder={handleLoadFolder}
                        level={0}
                        parentPath=""
                        getFileIcon={getFileIcon}
                      />
                    )}
                  </div>
                </div>

                {/* Right Editor Area */}
                <div className="flex-1 flex flex-col bg-white min-w-0">
                  {selectedFile ? (
                    <>
                      {/* File Tab */}
                      <div className="flex-shrink-0 bg-gray-100 ">
                        <div className="flex items-center gap-3 bg-white px-3 py-1.5 border-t-2 border-t-blue-500 ">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-4 h-4 flex items-center justify-center">
                              {getFileIcon(tree.find(e => e.path === selectedFile) || { path: selectedFile, type: 'file' })}
                            </span>
                            <span className="truncate text-[13px] text-gray-700 " style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
                              {selectedFile.split('/').pop()}
                            </span>
                          </div>
                          {hasUnsavedChanges && (
                            <span className="text-[11px] text-amber-600 ">
                              • Unsaved changes
                            </span>
                          )}
                          {!hasUnsavedChanges && saveFeedback === 'success' && (
                            <span className="text-[11px] text-green-600 ">
                              Saved
                            </span>
                          )}
                          {saveFeedback === 'error' && (
                            <span
                              className="text-[11px] text-red-600 truncate max-w-[160px]"
                              title={saveError ?? 'Failed to save file'}
                            >
                              Save error
                            </span>
                          )}
                          {!hasUnsavedChanges && saveFeedback !== 'success' && isFileUpdating && (
                            <span className="text-[11px] text-green-600 ">
                              Updated
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              className="px-3 py-1 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed "
                              onClick={handleSaveFile}
                              disabled={!hasUnsavedChanges || isSavingFile}
                              title="Save (Ctrl+S)"
                            >
                              {isSavingFile ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              className="text-gray-700 hover:bg-gray-200 px-1 rounded"
                              onClick={() => {
                                if (hasUnsavedChanges) {
                                  const confirmClose =
                                    typeof window !== 'undefined'
                                      ? window.confirm('You have unsaved changes. Close without saving?')
                                      : true;
                                  if (!confirmClose) {
                                    return;
                                  }
                                }
                                setSelectedFile('');
                                setContent('');
                                setEditedContent('');
                                editedContentRef.current = '';
                                setHasUnsavedChanges(false);
                                setSaveFeedback('idle');
                                setSaveError(null);
                                setIsFileUpdating(false);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Code Editor */}
                      <div className="flex-1 overflow-hidden">
                        <div className="w-full h-full flex bg-white overflow-hidden">
                          {/* Line Numbers */}
                          <div
                            ref={lineNumberRef}
                            className="bg-gray-50 px-3 py-4 select-none flex-shrink-0 overflow-y-auto overflow-x-hidden custom-scrollbar pointer-events-none"
                            aria-hidden="true"
                          >
                            <div className="text-[13px] font-mono text-gray-500 leading-[19px]">
                              {(editedContent || '').split('\n').map((_, index) => (
                                <div key={index} className="text-right pr-2">
                                  {index + 1}
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Code Content */}
                          <div className="relative flex-1">
                            <pre
                              ref={highlightRef}
                              aria-hidden="true"
                              className="absolute inset-0 m-0 p-4 overflow-hidden text-[13px] leading-[19px] font-mono text-gray-800 whitespace-pre pointer-events-none"
                              style={{ fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace" }}
                            >
                              <code
                                className={`language-${getFileLanguage(selectedFile)}`}
                                dangerouslySetInnerHTML={{ __html: highlightedCode }}
                              />
                              <span className="block h-full min-h-[1px]" />
                            </pre>
                            <textarea
                              ref={editorRef}
                              value={editedContent}
                              onChange={onEditorChange}
                              onScroll={handleEditorScroll}
                              onKeyDown={handleEditorKeyDown}
                              spellCheck={false}
                              autoCorrect="off"
                              autoCapitalize="none"
                              autoComplete="off"
                              wrap="off"
                              aria-label="Code editor"
                              className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-gray-800 outline-none font-mono text-[13px] leading-[19px] p-4 whitespace-pre overflow-auto custom-scrollbar"
                              style={{ fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace" }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Welcome Screen */
                    <div className="flex-1 flex items-center justify-center bg-white ">
                      <div className="text-center">
                        <span className="w-16 h-16 mb-4 opacity-10 text-gray-400 mx-auto flex items-center justify-center"><Code size={64} /></span>
                        <h3 className="text-lg font-medium text-gray-700 mb-2">
                          Welcome to Code Editor
                        </h3>
                        <p className="text-sm text-gray-500 ">
                          Select a file from the explorer to start viewing code
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </MotionDiv>
                )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

    </>
  );
}
