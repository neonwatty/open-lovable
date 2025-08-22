'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SandboxStatusData {
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

interface SandboxStatusIndicatorProps {
  className?: string;
  showDetails?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

function StatusIcon({ status, className = "w-3 h-3" }: { status: 'healthy' | 'unreachable' | 'checking' | 'error'; className?: string }) {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return '#10B981'; // green
      case 'checking': return '#F59E0B'; // yellow
      case 'unreachable': return '#EF4444'; // red
      case 'error': return '#EF4444'; // red
      default: return '#6B7280'; // gray
    }
  };

  return (
    <div 
      className={`rounded-full ${className}`}
      style={{ backgroundColor: getStatusColor() }}
    >
      {status === 'checking' && (
        <motion.div
          className="w-full h-full rounded-full bg-white opacity-50"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  );
}

function formatUptime(uptimeMs?: number): string {
  if (!uptimeMs) return 'N/A';
  
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatMemory(bytes?: number): string {
  if (!bytes) return 'N/A';
  
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function SandboxStatusIndicator({ 
  className = '', 
  showDetails = false, 
  autoRefresh = true,
  refreshInterval = 3000 
}: SandboxStatusIndicatorProps) {
  const [statusData, setStatusData] = useState<SandboxStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(showDetails);

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

  const getStatusMessage = (): string => {
    if (error) return `Error: ${error}`;
    if (isLoading) return 'Checking status...';
    if (!statusData) return 'No status data';
    
    return statusData.message;
  };

  const overallStatus = getOverallStatus();
  const statusMessage = getStatusMessage();

  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg p-3 ${className}`}>
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <StatusIcon status={overallStatus} />
          
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              Local Development Server
            </div>
            <div className="text-xs text-gray-400 truncate">
              {statusData?.status.port.port ? `Port ${statusData.status.port.port}` : 'No port assigned'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {statusData?.status.url && (
            <a 
              href={statusData.status.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-white"
              onClick={(e) => e.stopPropagation()}
            >
              Open
            </a>
          )}
          
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-gray-400"
          >
            ▼
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-3 space-y-2 border-t border-gray-700 pt-3"
          >
            <div className="text-xs text-gray-300">
              <div className="font-medium mb-1">Status: {statusMessage}</div>
            </div>
            
            {statusData && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <div className="text-gray-400 font-medium">Process</div>
                  <div className="text-gray-300">
                    PID: {statusData.status.process?.pid || 'N/A'}
                  </div>
                  <div className="text-gray-300">
                    Running: {statusData.status.process?.isRunning ? '✓' : '✗'}
                  </div>
                  <div className="text-gray-300">
                    Memory: {formatMemory(statusData.status.process?.memoryUsage)}
                  </div>
                  <div className="text-gray-300">
                    Uptime: {formatUptime(statusData.status.uptime)}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-gray-400 font-medium">Network</div>
                  <div className="text-gray-300">
                    Port: {statusData.status.port.port}
                  </div>
                  <div className="text-gray-300">
                    Accessible: {statusData.status.port.accessible ? '✓' : '✗'}
                  </div>
                  <div className="text-gray-300">
                    Response: {statusData.status.port.responseTime ? `${statusData.status.port.responseTime}ms` : 'N/A'}
                  </div>
                  <div className="text-gray-300">
                    Health: {statusData.status.connectionHealth || 'unknown'}
                  </div>
                </div>
              </div>
            )}
            
            {statusData?.status.portManagerStats && (
              <div className="text-xs mt-3 pt-2 border-t border-gray-700">
                <div className="text-gray-400 font-medium mb-1">Port Manager</div>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <div>Range: {statusData.status.portManagerStats.portRange}</div>
                  <div>Active: {statusData.status.portManagerStats.activePorts}</div>
                  <div>Available: {statusData.status.portManagerStats.availablePorts}</div>
                  <div>Reserved: {statusData.status.portManagerStats.reservedPorts}</div>
                </div>
              </div>
            )}
            
            <div className="text-xs text-gray-500 mt-2">
              Last checked: {statusData?.status.lastHealthCheck ? 
                new Date(statusData.status.lastHealthCheck).toLocaleTimeString() : 
                'Never'
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}