/**
 * Project Hook
 * Manages project state and operations
 */
import { useState, useCallback, useEffect } from 'react';
import { Project, ProjectSettings } from '@/types/project';

interface UseProjectOptions {
  projectId: string;
}

export function useProject({ projectId }: UseProjectOptions) {
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load project
  const loadProject = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error('Failed to load project');
      
      const data = await response.json();
      setProject(data);
    } catch (error) {
      console.error('Failed to load project:', error);
      setError('Failed to load project');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load project settings
  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch(`/api/chat/${projectId}/cli-preference`);
      if (!response.ok) throw new Error('Failed to load settings');
      
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setError('Failed to load settings');
    }
  }, [projectId]);

  // Update CLI preference
  const updateCLIPreference = useCallback(async (
    preferredCli: string,
    fallbackEnabled: boolean
  ) => {
    try {
      const response = await fetch(`/api/chat/${projectId}/cli-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_cli: preferredCli,
          fallback_enabled: fallbackEnabled
        })
      });
      
      if (!response.ok) throw new Error('Failed to update CLI preference');
      
      const data = await response.json();
      setSettings(prev => prev ? {
        ...prev,
        preferred_cli: data.preferred_cli,
        fallback_enabled: data.fallback_enabled
      } : null);
      
      return data;
    } catch (error) {
      console.error('Failed to update CLI preference:', error);
      throw error;
    }
  }, [projectId]);

  // Start preview
  const startPreview = useCallback(async (port?: number) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/preview/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      });
      
      if (!response.ok) throw new Error('Failed to start preview');
      
      const data = await response.json();
      setProject(prev => prev ? {
        ...prev,
        status: 'preview_running',
        preview_url: data.url
      } : null);
      
      return data;
    } catch (error) {
      console.error('Failed to start preview:', error);
      throw error;
    }
  }, [projectId]);

  // Stop preview
  const stopPreview = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/preview/stop`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to stop preview');
      
      setProject(prev => prev ? {
        ...prev,
        status: 'idle',
        preview_url: undefined
      } : null);
    } catch (error) {
      console.error('Failed to stop preview:', error);
      throw error;
    }
  }, [projectId]);

  // Get preview status
  const getPreviewStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/preview/status`);
      if (!response.ok) throw new Error('Failed to get preview status');
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get preview status:', error);
      throw error;
    }
  }, [projectId]);

  // Load on mount
  useEffect(() => {
    loadProject();
    loadSettings();
  }, [loadProject, loadSettings]);

  return {
    project,
    settings,
    isLoading,
    error,
    loadProject,
    loadSettings,
    updateCLIPreference,
    startPreview,
    stopPreview,
    getPreviewStatus
  };
}