import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CodeApplicationState {
  stage: 'setting-up' | 'installing' | 'starting-server' | 'generating' | 'applying' | 'complete' | null;
  packages?: string[];
  installedPackages?: string[];
  filesGenerated?: string[];
  message?: string;
  serverStatus?: 'starting' | 'running' | 'stopped' | 'error';
}

interface CodeApplicationProgressProps {
  state: CodeApplicationState;
}

export default function CodeApplicationProgress({ state }: CodeApplicationProgressProps) {
  if (!state.stage || state.stage === 'complete') return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="loading"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="inline-block bg-gray-100 rounded-[10px] p-3 mt-2"
      >
        <div className="flex items-center gap-3">
          {/* Rotating loading indicator */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-4 h-4"
          >
            <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
              <circle 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round"
                strokeDasharray="31.416"
                strokeDashoffset="10"
                className="text-gray-700"
              />
            </svg>
          </motion.div>

          {/* Dynamic progress text and status */}
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-gray-700">
              {getStageMessage(state.stage)}
            </div>
            {state.serverStatus && (
              <ServerStatusIndicator status={state.serverStatus} />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function getStageMessage(stage: CodeApplicationState['stage']): string {
  switch (stage) {
    case 'setting-up':
      return 'Setting up local workspace...';
    case 'installing':
      return 'Installing dependencies...';
    case 'starting-server':
      return 'Starting Vite development server...';
    case 'generating':
      return 'Generating code...';
    case 'applying':
      return 'Applying changes to local files...';
    default:
      return 'Processing...';
  }
}

function ServerStatusIndicator({ status }: { status: CodeApplicationState['serverStatus'] }) {
  const getStatusConfig = () => {
    switch (status) {
      case 'starting':
        return { color: 'bg-yellow-400', label: 'Starting' };
      case 'running':
        return { color: 'bg-green-400', label: 'Running' };
      case 'stopped':
        return { color: 'bg-red-400', label: 'Stopped' };
      case 'error':
        return { color: 'bg-red-500', label: 'Error' };
      default:
        return { color: 'bg-gray-400', label: 'Unknown' };
    }
  };

  const { color, label } = getStatusConfig();

  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}