"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowUp, MessageSquare, Image as ImageIcon, Wrench, Square } from 'lucide-react';
import SlashCommandMenu from './SlashCommandMenu';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

interface UploadedImage {
  id: string;
  filename: string;
  path: string;
  url: string;
  assetUrl?: string;
   publicUrl?: string;
}

interface ModelPickerOption {
  id: string;
  name: string;
  cli: string;
  cliName: string;
  available: boolean;
}

interface CliPickerOption {
  id: string;
  name: string;
  available: boolean;
}

interface ChatInputProps {
  onSendMessage: (message: string, images?: UploadedImage[]) => Promise<boolean>;
  onStopTask?: () => void;
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: string;
  mode?: 'act' | 'chat';
  onModeChange?: (mode: 'act' | 'chat') => void;
  workMode?: 'code' | 'work';
  onWorkModeChange?: (mode: 'code' | 'work') => void;
  work_directory?: string;
  onWork_directoryChange?: (directory: string) => void;
  projectId?: string;
  preferredCli?: string;
  selectedModel?: string;
  thinkingMode?: boolean;
  onThinkingModeChange?: (enabled: boolean) => void;
  modelOptions?: ModelPickerOption[];
  onModelChange?: (option: any) => void;
  modelChangeDisabled?: boolean;
  cliOptions?: CliPickerOption[];
  onCliChange?: (cliId: string) => void;
  cliChangeDisabled?: boolean;
  projectType?: 'nextjs' | 'python-fastapi';
  onProjectTypeChange?: (type: 'nextjs' | 'python-fastapi') => void;
  isRunning?: boolean;
  onExposeFocus?: (fn: () => void) => void;
  onExposeInputControl?: (control: { focus: () => void; setMessage: (msg: string) => void }) => void;
}

export default function ChatInput({
  onSendMessage,
  onStopTask,
  disabled = false,
  placeholder = "Ask Goodable...",
  defaultValue = '',
  mode = 'act',
  onModeChange,
  workMode = 'code',
  onWorkModeChange,
  work_directory = '',
  onWork_directoryChange,
  projectId,
  preferredCli = 'claude',
  selectedModel = '',
  thinkingMode = false,
  onThinkingModeChange,
  modelOptions = [],
  onModelChange,
  modelChangeDisabled = false,
  cliOptions = [],
  onCliChange,
  cliChangeDisabled = false,
  projectType = 'nextjs',
  onProjectTypeChange,
  isRunning = false,
  onExposeFocus,
  onExposeInputControl
}: ChatInputProps) {
  const [message, setMessage] = useState(defaultValue);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submissionLockRef = useRef(false);
  const supportsImageUpload = preferredCli !== 'cursor' && preferredCli !== 'qwen' && preferredCli !== 'glm';

  const modelOptionsForCli = useMemo(
    () => modelOptions.filter(option => option.cli === preferredCli),
    [modelOptions, preferredCli]
  );

  const selectedModelValue = useMemo(() => {
    return modelOptionsForCli.some(opt => opt.id === selectedModel) ? selectedModel : '';
  }, [modelOptionsForCli, selectedModel]);

  useEffect(() => {
    if (!disabled && !cliChangeDisabled && !modelChangeDisabled) {
      textareaRef.current?.focus();
    }
  }, [disabled, cliChangeDisabled, modelChangeDisabled]);

  useEffect(() => {
    if (onExposeFocus) {
      onExposeFocus(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.style.height = '40px';
          const h = el.scrollHeight;
          el.style.height = `${Math.min(h, 200)}px`;
        }
      });
    }
  }, [onExposeFocus]);

  useEffect(() => {
    if (onExposeInputControl) {
      onExposeInputControl({
        focus: () => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.style.height = '40px';
            const h = el.scrollHeight;
            el.style.height = `${Math.min(h, 200)}px`;
          }
        },
        setMessage: (msg: string) => {
          setMessage(msg);
          setTimeout(() => {
            const el = textareaRef.current;
            if (el) {
              el.focus();
              el.style.height = '40px';
              const h = el.scrollHeight;
              el.style.height = `${Math.min(h, 200)}px`;
            }
          }, 0);
        }
      });
    }
  }, [onExposeInputControl]);

  // 简单日志：按钮显示/隐藏
  useEffect(() => {
    try {
      if (isRunning && onStopTask) {
        console.log('显示停止按钮');
      } else {
        console.log('显示发送按钮');
      }
    } catch {}
  }, [isRunning, onStopTask]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Prevent multiple submissions with both state and ref locks
    if (isSubmitting || disabled || isUploading || isRunning || submissionLockRef.current) {
      return;
    }

    if (!message.trim() && uploadedImages.length === 0) {
      return;
    }

    // Set both state and ref locks immediately
    setIsSubmitting(true);
    submissionLockRef.current = true;

    try {
      // Send message and images separately - unified_manager will add image references
      const success = await onSendMessage(message.trim(), uploadedImages);

      // Only clear input if submission was successful
      if (success) {
        setMessage('');
        setUploadedImages([]);
        if (textareaRef.current) {
          textareaRef.current.style.height = '40px';
        }
      }
    } finally {
      // Reset submission locks after a reasonable delay
      setTimeout(() => {
        setIsSubmitting(false);
        submissionLockRef.current = false;
      }, 200);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Check if IME is composing (prevents submission during Chinese input)
      if (e.nativeEvent.isComposing || isComposing) {
        return;
      }

      e.preventDefault();
      // Check all locks before submitting
      if (!isSubmitting && !disabled && !isUploading && !isRunning && !submissionLockRef.current && (message.trim() || uploadedImages.length > 0)) {
        handleSubmit();
      }
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '40px';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await handleFiles(files);
  };

  const removeImage = (id: string) => {
    setUploadedImages(prev => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.url);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  // Handle files (for both drag drop and file input)
  const handleFiles = useCallback(async (files: FileList) => {
    if (!projectId) {
      console.error('❌ No project ID available for image upload');
      alert('No project selected. Please choose a project first.');
      return;
    }

    if (!supportsImageUpload) {
      console.error('❌ Current CLI does not support image upload:', preferredCli);
      alert(`Only Claude CLI supports image uploads.\nCurrent CLI: ${preferredCli}\nSwitch to Claude CLI.`);
      return;
    }

    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Check if file is an image
        if (!file.type.startsWith('image/')) {
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/api/assets/${projectId}/upload`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Upload failed for ${file.name}:`, response.status, errorText);
          throw new Error(`Failed to upload ${file.name}: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        const imageUrl = URL.createObjectURL(file);

        const newImage: UploadedImage = {
          id: crypto.randomUUID(),
          filename: result.filename,
          path: result.absolute_path,
          url: imageUrl,
          assetUrl: `/api/assets/${projectId}/${result.filename}`,
          publicUrl: typeof result.public_url === 'string' ? result.public_url : undefined
        };

        setUploadedImages(prev => [...prev, newImage]);
      }
    } catch (error) {
      console.error('❌ Image upload failed:', error);
      alert('Image upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [projectId, supportsImageUpload, preferredCli]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  // Handle clipboard paste for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!projectId || !supportsImageUpload) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }
      
      if (imageFiles.length > 0) {
        e.preventDefault();
        const fileList = {
          length: imageFiles.length,
          item: (index: number) => imageFiles[index],
          [Symbol.iterator]: function* () {
            for (let i = 0; i < imageFiles.length; i++) {
              yield imageFiles[i];
            }
          }
        } as FileList;
        
        // Convert to FileList-like object
        Object.defineProperty(fileList, 'length', { value: imageFiles.length });
        imageFiles.forEach((file, index) => {
          Object.defineProperty(fileList, index, { value: file });
        });
        
        handleFiles(fileList);
      }
    };
    
    document.addEventListener('paste', handlePaste);
    
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [projectId, supportsImageUpload, handleFiles]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (projectId && supportsImageUpload) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (projectId && supportsImageUpload) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!projectId || !supportsImageUpload) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full max-w-4xl mx-auto"
    >
      {/* Code/Work Mode Tabs - temporarily hidden */}
      {/* {!projectId && onWorkModeChange && (
        <div className="flex items-center gap-1 mb-[-1px] ml-4">
          <button
            type="button"
            onClick={() => onWorkModeChange('code')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors border border-b-0 ${
              workMode === 'code'
                ? 'bg-green-100 text-green-800 border-green-300'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            Code 模式
          </button>
          <button
            type="button"
            onClick={() => onWorkModeChange('work')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors border border-b-0 ${
              workMode === 'work'
                ? 'bg-green-100 text-green-800 border-green-300'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            Work 模式
          </button>
        </div>
      )} */}

      {/* Single border container */}
      <div className={`bg-white rounded-[28px] border shadow-xl overflow-visible transition-all duration-200 ${
        isDragOver ? 'border-blue-400' : 'border-gray-200'
      }`}>
        {/* Drag & Drop Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-50/90 rounded-[28px] z-50 pointer-events-none border-2 border-dashed border-blue-400">
            <div className="text-blue-600 text-lg font-medium mb-2">Drop images here</div>
            <div className="text-blue-500 text-sm">Drag and drop your image files</div>
            <div className="mt-4">
              <svg className="w-12 h-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
          </div>
        )}

        {/* Uploaded Images Preview - no extra background/border */}
        {uploadedImages.length > 0 && (
          <div className="px-4 pt-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {uploadedImages.map((image) => (
                <div key={image.id} className="relative group">
                  <div className="w-20 h-20 rounded-lg overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs hover:bg-red-600"
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Text Input Area - transparent background, no border */}
        <div className="relative px-4 py-3">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            className="w-full resize-none text-base leading-relaxed bg-transparent p-2 pb-12 text-gray-900 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
            id="chatinput"
            placeholder={placeholder}
            disabled={disabled || isUploading || isSubmitting}
            style={{ minHeight: '120px' }}
          />

          {/* Bottom Toolbar - Inside textarea, clean design */}
          <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {/* Work Mode: Only show directory selector */}
              {!projectId && workMode === 'work' && onWork_directoryChange && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (typeof window !== 'undefined' && (window as any).desktopAPI?.selectDirectory) {
                        try {
                          const result = await (window as any).desktopAPI.selectDirectory();
                          if (result?.success && result?.path) {
                            onWork_directoryChange(result.path);
                          } else if (!result?.canceled) {
                            alert('Failed to select directory: ' + (result?.error || 'Unknown error'));
                          }
                        } catch (error) {
                          console.error('Error selecting directory:', error);
                          alert('Failed to select directory');
                        }
                      } else {
                        alert('Directory selection is not supported in this environment. Please use the desktop client.');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    {work_directory ? '更换目录' : '选择目录'}
                  </button>
                  {work_directory && (
                    <span className="text-xs text-gray-500 truncate max-w-[200px]" title={work_directory}>
                      {work_directory.split(/[/\\]/).pop() || work_directory}
                    </span>
                  )}
                </div>
              )}

              {/* Code Mode: Show smart params toggle and advanced options */}
              {workMode === 'code' && (
                <>
                  {/* Advanced Options Toggle - iOS style */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">智能参数</span>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        !showAdvanced ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      role="switch"
                      aria-checked={!showAdvanced}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          !showAdvanced ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Advanced Options - shown when toggle is on */}
                  {showAdvanced && (
                    <>
                      {/* Slash Command Menu */}
                      <SlashCommandMenu
                        onSelectCommand={(command) => {
                          setMessage(command);
                          // Auto-submit the command
                          setTimeout(() => {
                            if (!isSubmitting && !disabled && !isUploading && !isRunning && !submissionLockRef.current) {
                              handleSubmit();
                            }
                          }, 100);
                        }}
                        disabled={disabled || isUploading || isSubmitting || isRunning}
                      />

                      {/* Image Upload Button - transparent */}
                      {projectId && supportsImageUpload && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
                          title="Upload images"
                          disabled={isUploading || disabled}
                        >
                          <ImageIcon className="h-4 w-4" />
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleImageUpload}
                            disabled={isUploading || disabled}
                            className="hidden"
                          />
                        </button>
                      )}

                      {/* Mode Toggle - single button shows current mode */}
                      {onModeChange && (
                        <button
                          type="button"
                          onClick={() => onModeChange(mode === 'act' ? 'chat' : 'act')}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                          title={mode === 'act' ? 'Act Mode: AI can modify code (click to switch to Chat)' : 'Chat Mode: AI provides answers only (click to switch to Act)'}
                        >
                          {mode === 'act' ? (
                            <>
                              <Wrench className="h-3 w-3" />
                              <span>Act</span>
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-3 w-3" />
                              <span>Chat</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Model Selector - minimal button style */}
                      <select
                        value={selectedModelValue}
                        onChange={(e) => {
                          const option = modelOptionsForCli.find(opt => opt.id === e.target.value);
                          if (option) {
                            onModelChange?.(option);
                            requestAnimationFrame(() => textareaRef.current?.focus());
                          }
                        }}
                        disabled={modelChangeDisabled || !onModelChange || modelOptionsForCli.length === 0}
                        className="text-xs text-gray-600 bg-transparent border-0 focus:outline-none focus:ring-0 disabled:opacity-60 cursor-pointer hover:text-gray-900"
                      >
                        {modelOptionsForCli.length === 0 && <option value="">No models</option>}
                        {modelOptionsForCli.length > 0 && selectedModelValue === '' && (
                          <option value="" disabled>Select model</option>
                        )}
                        {modelOptionsForCli.map(option => (
                          <option key={option.id} value={option.id} disabled={!option.available}>
                            {option.name}
                          </option>
                        ))}
                      </select>

                      {/* Project Type Selector - only show on home page */}
                      {!projectId && onProjectTypeChange && (
                        <>
                          <span className="text-gray-300">|</span>
                          <select
                            value={projectType}
                            onChange={(e) => {
                              onProjectTypeChange(e.target.value as 'nextjs' | 'python-fastapi');
                              requestAnimationFrame(() => textareaRef.current?.focus());
                            }}
                            className="text-xs text-gray-600 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer hover:text-gray-900"
                          >
                            <option value="nextjs">Next.js</option>
                            <option value="python-fastapi">Python FastAPI</option>
                          </select>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Assistant Selector - hidden but functional */}
              <select
                value={preferredCli}
                onChange={(e) => {
                  onCliChange?.(e.target.value);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                disabled={cliChangeDisabled || !onCliChange}
                className="hidden"
              >
                {cliOptions.length === 0 && <option value={preferredCli}>{preferredCli}</option>}
                {cliOptions.map(option => (
                  <option key={option.id} value={option.id} disabled={!option.available}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Send/Stop Button - clean round button */}
            {isRunning && onStopTask ? (
              <button
                type="button"
                onClick={onStopTask}
                className="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all active:scale-95"
                title="Stop task"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                id="chatinput-send-message-button"
                type="submit"
                className="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full hover:bg-gray-800 hover:scale-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                disabled={disabled || isSubmitting || isUploading || (!message.trim() && uploadedImages.length === 0) || isRunning}
                title="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
