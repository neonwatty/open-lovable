'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface SandboxStatusData {
  success: boolean;
  active: boolean;
  healthy: boolean;
  status: {
    process?: {
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
    url?: string;
    connectionHealth?: 'healthy' | 'unreachable' | 'checking';
  };
  message: string;
}

interface SandboxStatusBadgeProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onStatusChange?: (status: 'healthy' | 'unreachable' | 'checking' | 'error') => void;
}

function StatusDot({ status, animate = false }: { status: 'healthy' | 'unreachable' | 'checking' | 'error'; animate?: boolean }) {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'checking': return 'bg-yellow-500';
      case 'unreachable': return 'bg-red-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="relative">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      {animate && status === 'checking' && (
        <motion.div
          className="absolute inset-0 w-2 h-2 rounded-full bg-yellow-400 opacity-75"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  );
}

export default function SandboxStatusBadge({ 
  className = '', 
  autoRefresh = true,
  refreshInterval = 5000,
  onStatusChange
}: SandboxStatusBadgeProps) {
  const [statusData, setStatusData] = useState<SandboxStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/sandbox-status');
      const data = await response.json();
      
      if (data.success) {
        setStatusData(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    if (autoRefresh) {
      const interval = setInterval(fetchStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const getOverallStatus = (): 'healthy' | 'unreachable' | 'checking' | 'error' => {
    if (error) return 'error';
    if (isLoading) return 'checking';
    if (!statusData) return 'error';
    
    return statusData.status.connectionHealth || 'unreachable';
  };

  const overallStatus = getOverallStatus();

  useEffect(() => {
    onStatusChange?.(overallStatus);
  }, [overallStatus, onStatusChange]);

  const getStatusText = () => {
    if (error) return 'Error';
    if (isLoading) return 'Checking...';
    if (!statusData) return 'Unknown';
    
    switch (overallStatus) {
      case 'healthy': 
        const processStatus = statusData.status.process?.isRunning ? '🟢' : '⚪';
        return `${processStatus} Port ${statusData.status.port.port}`;
      case 'checking': return 'Checking...';
      case 'unreachable': return '🔴 Offline';
      case 'error': return '🔴 Error';
      default: return 'Unknown';
    }
  };

  const handleClick = () => {
    if (statusData?.status.url && overallStatus === 'healthy') {
      window.open(statusData.status.url, '_blank');
    } else {
      fetchStatus(); // Refresh status on click if not healthy
    }
  };

  return (
    <div 
      className={`inline-flex items-center space-x-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-full text-xs cursor-pointer hover:bg-gray-750 transition-colors ${className}`}
      onClick={handleClick}
      title={statusData?.message || 'Click to refresh'}
    >
      <StatusDot status={overallStatus} animate={overallStatus === 'checking'} />
      <span className="text-gray-300 font-medium">
        {getStatusText()}
      </span>
      {statusData?.status.port.responseTime && overallStatus === 'healthy' && (
        <span className="text-gray-500">
          ({statusData.status.port.responseTime}ms)
        </span>
      )}
      {statusData?.status.process?.memoryUsage && overallStatus === 'healthy' && (
        <span className="text-gray-500 text-xs ml-1">
          {Math.round(statusData.status.process.memoryUsage / (1024 * 1024))}MB
        </span>
      )}
    </div>
  );
}