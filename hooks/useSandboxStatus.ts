'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface SandboxStatusData {
  success: boolean;
  active: boolean;
  healthy: boolean;
  status: {
    process: {
      pid: number;
      isRunning: boolean;
      memoryUsage?: number;
      uptime?: number;
      cpuUsage?: number;
    } | null;
    port: {
      port: number;
      accessible: boolean;
      responseTime?: number;
    };
    workingDirectory: string;
    lastHealthCheck: string;
    filesTracked: string[];
    sandboxId?: string;
    url?: string;
    portManagerStats?: {
      totalPorts: number;
      availablePorts: number;
      activePorts: number;
      reservedPorts: number;
      portRange: string;
    };
    uptime?: number;
    connectionHealth?: 'healthy' | 'unreachable' | 'checking';
  };
  message: string;
}

export type SandboxHealthStatus = 'healthy' | 'unreachable' | 'checking' | 'error';

interface UseSandboxStatusOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  onStatusChange?: (status: SandboxHealthStatus, data: SandboxStatusData | null) => void;
  onError?: (error: string) => void;
}

interface UseSandboxStatusReturn {
  statusData: SandboxStatusData | null;
  isLoading: boolean;
  error: string | null;
  overallStatus: SandboxHealthStatus;
  refresh: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

export function useSandboxStatus(options: UseSandboxStatusOptions = {}): UseSandboxStatusReturn {
  const {
    autoRefresh = true,
    refreshInterval = 3000,
    onStatusChange,
    onError
  } = options;

  const [statusData, setStatusData] = useState<SandboxStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    try {
      const response = await fetch('/api/sandbox-status');
      const data = await response.json();
      
      if (!mountedRef.current) return;
      
      if (data.success) {
        setStatusData(data);
        setError(null);
      } else {
        const errorMsg = data.error || 'Failed to fetch status';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [onError]);

  const getOverallStatus = useCallback((): SandboxHealthStatus => {
    if (error) return 'error';
    if (isLoading) return 'checking';
    if (!statusData) return 'error';
    
    return statusData.status.connectionHealth || 'unreachable';
  }, [error, isLoading, statusData]);

  const overallStatus = getOverallStatus();

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    setIsPolling(true);
    intervalRef.current = setInterval(fetchStatus, refreshInterval);
  }, [fetchStatus, refreshInterval]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh setup
  useEffect(() => {
    if (autoRefresh) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [autoRefresh, startPolling, stopPolling]);

  // Status change callback
  useEffect(() => {
    onStatusChange?.(overallStatus, statusData);
  }, [overallStatus, statusData, onStatusChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  // Update polling when interval changes
  useEffect(() => {
    if (isPolling) {
      stopPolling();
      startPolling();
    }
  }, [refreshInterval, isPolling, startPolling, stopPolling]);

  return {
    statusData,
    isLoading,
    error,
    overallStatus,
    refresh,
    startPolling,
    stopPolling,
    isPolling,
  };
}