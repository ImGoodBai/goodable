/**
 * CLI Hook
 * Manages CLI configuration and status
 */
import { useState, useCallback, useEffect } from 'react';
import { CLIOption, CLIStatus, CLIPreference, CLI_OPTIONS } from '@/types/cli';

interface UseCLIOptions {
  projectId: string;
}

export function useCLI({ projectId }: UseCLIOptions) {
  const [cliOptions, setCLIOptions] = useState<CLIOption[]>(CLI_OPTIONS);
  const [preference, setPreference] = useState<CLIPreference | null>(null);
  const [statuses, setStatuses] = useState<Record<string, CLIStatus>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Load CLI preference
  const loadPreference = useCallback(async () => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080';
      const response = await fetch(`${API_BASE}/api/chat/${projectId}/cli/available`);
      if (!response.ok) throw new Error('Failed to load CLI preference');
      
      const data = await response.json();
      // Map API response to preference format
      setPreference({
        preferred_cli: data.current_preference,
        selected_model: data.current_model,
        fallback_enabled: data.fallback_enabled
      });
    } catch (error) {
      console.error('Failed to load CLI preference:', error);
    }
  }, [projectId]);

  // Load all CLI statuses
  const loadStatuses = useCallback(async () => {
    try {
      setIsLoading(true);
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080';
      const response = await fetch(`${API_BASE}/api/chat/${projectId}/cli-status`);
      if (!response.ok) throw new Error('Failed to load CLI statuses');
      
      const data = await response.json();
      setStatuses(data);
      
      // Update CLI options with status
      setCLIOptions(prevOptions => 
        prevOptions.map(option => ({
          ...option,
          available: data[option.id]?.available || false,
          configured: data[option.id]?.configured || false
        }))
      );
    } catch (error) {
      console.error('Failed to load CLI statuses:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Check single CLI status
  const checkCLIStatus = useCallback(async (cliType: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080';
      const response = await fetch(`${API_BASE}/api/chat/${projectId}/cli-status/${cliType}`);
      if (!response.ok) throw new Error(`Failed to check ${cliType} status`);
      
      const status = await response.json();
      setStatuses(prev => ({ ...prev, [cliType]: status }));
      
      // Update CLI option with status
      setCLIOptions(prevOptions =>
        prevOptions.map(option =>
          option.id === cliType
            ? { ...option, available: status.available, configured: status.configured }
            : option
        )
      );
      
      return status;
    } catch (error) {
      console.error(`Failed to check ${cliType} status:`, error);
      throw error;
    }
  }, [projectId]);

  // Update CLI preference
  const updatePreference = useCallback(async (preferredCli: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080';
      const response = await fetch(`${API_BASE}/api/chat/${projectId}/cli-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_cli: preferredCli
        })
      });
      
      if (!response.ok) throw new Error('Failed to update CLI preference');
      
      const data = await response.json();
      setPreference(data);
      return data;
    } catch (error) {
      console.error('Failed to update CLI preference:', error);
      throw error;
    }
  }, [projectId]);

  // Update model preference
  const updateModelPreference = useCallback(async (modelId: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080';
      const response = await fetch(`${API_BASE}/api/chat/${projectId}/model-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId })
      });
      
      if (!response.ok) throw new Error('Failed to update model preference');
      
      const data = await response.json();
      setPreference(prev => prev ? {
        ...prev,
        selected_model: data.selected_model
      } : null);
      
      return data;
    } catch (error) {
      console.error('Failed to update model preference:', error);
      throw error;
    }
  }, [projectId]);


  // Load on mount
  useEffect(() => {
    loadPreference();
    loadStatuses();
  }, [loadPreference, loadStatuses]);

  return {
    cliOptions,
    preference,
    statuses,
    isLoading,
    checkCLIStatus,
    updatePreference,
    updateModelPreference,
    reload: () => {
      loadPreference();
      loadStatuses();
    }
  };
}