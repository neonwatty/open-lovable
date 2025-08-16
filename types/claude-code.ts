/**
 * TypeScript definitions for Claude Code Integration Bridge
 */

export interface ClaudeCodeMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface ClaudeCodeSession {
  sessionId: string;
  startedAt: number;
  lastActivity: number;
  messages: ClaudeCodeMessage[];
  context: {
    sandboxId?: string;
    projectName?: string;
    currentFiles: Record<string, string>;
    editHistory: EditHistoryEntry[];
  };
}

export interface EditHistoryEntry {
  timestamp: number;
  userRequest: string;
  editType: 'create' | 'modify' | 'debug' | 'analyze';
  filesModified: string[];
  success: boolean;
  errorMessage?: string;
}

export interface ClaudeCodeFile {
  path: string;
  content: string;
  lastModified: number;
  size: number;
  language?: string;
}

export interface ClaudeCodeWorkspace {
  id: string;
  name: string;
  files: Record<string, ClaudeCodeFile>;
  structure: string;
  lastActivity: number;
}

export interface ClaudeCodePromptTemplate {
  name: string;
  type: 'create' | 'modify' | 'debug' | 'analyze';
  systemPrompt: string;
  userPromptTemplate: string;
  variables: string[];
  description: string;
}

export interface ClaudeCodeResponse {
  id: string;
  timestamp: number;
  model: string;
  prompt: string;
  response: string;
  files: Array<{
    path: string;
    content: string;
    action: 'create' | 'modify' | 'delete';
  }>;
  metadata: {
    tokensUsed?: number;
    responseTime?: number;
    errors?: string[];
    warnings?: string[];
  };
}

export interface ClaudeCodeStreamEvent {
  type: 'status' | 'stream' | 'file' | 'complete' | 'error' | 'warning';
  timestamp: number;
  data: any;
}

export interface ClaudeCodeStreamStatusEvent extends ClaudeCodeStreamEvent {
  type: 'status';
  data: {
    message: string;
    progress?: number;
  };
}

export interface ClaudeCodeStreamTextEvent extends ClaudeCodeStreamEvent {
  type: 'stream';
  data: {
    text: string;
    isRaw?: boolean;
  };
}

export interface ClaudeCodeStreamFileEvent extends ClaudeCodeStreamEvent {
  type: 'file';
  data: {
    path: string;
    content: string;
    action: 'create' | 'modify' | 'delete';
    language?: string;
  };
}

export interface ClaudeCodeStreamCompleteEvent extends ClaudeCodeStreamEvent {
  type: 'complete';
  data: {
    files: Array<{
      path: string;
      content: string;
      action: 'create' | 'modify' | 'delete';
    }>;
    metadata: {
      totalFiles: number;
      tokensUsed?: number;
      responseTime: number;
      warnings?: string[];
    };
  };
}

export interface ClaudeCodeStreamErrorEvent extends ClaudeCodeStreamEvent {
  type: 'error';
  data: {
    error: string;
    code?: string;
    details?: Record<string, any>;
  };
}

export interface ClaudeCodeStreamWarningEvent extends ClaudeCodeStreamEvent {
  type: 'warning';
  data: {
    message: string;
    code?: string;
    details?: Record<string, any>;
  };
}

export type ClaudeCodeStreamEvents = 
  | ClaudeCodeStreamStatusEvent
  | ClaudeCodeStreamTextEvent
  | ClaudeCodeStreamFileEvent
  | ClaudeCodeStreamCompleteEvent
  | ClaudeCodeStreamErrorEvent
  | ClaudeCodeStreamWarningEvent;

export interface ClaudeCodeBridge {
  // Session management
  createSession(workspaceId: string): Promise<ClaudeCodeSession>;
  getSession(sessionId: string): Promise<ClaudeCodeSession | null>;
  updateSession(sessionId: string, updates: Partial<ClaudeCodeSession>): Promise<void>;
  endSession(sessionId: string): Promise<void>;

  // Prompt formatting
  formatPrompt(
    userInput: string,
    context: any,
    options?: {
      type?: 'create' | 'modify' | 'debug' | 'analyze';
      model?: string;
      template?: string;
    }
  ): Promise<string>;

  // Response processing
  processResponse(response: string): Promise<{
    files: ClaudeCodeFile[];
    metadata: Record<string, any>;
    errors?: string[];
  }>;

  // Streaming interface
  streamRequest(
    prompt: string,
    options?: {
      sessionId?: string;
      model?: string;
      maxTokens?: number;
    }
  ): AsyncIterable<ClaudeCodeStreamEvents>;

  // File operations
  updateFiles(sessionId: string, files: ClaudeCodeFile[]): Promise<void>;
  getFiles(sessionId: string): Promise<Record<string, ClaudeCodeFile>>;
  
  // Workspace management
  createWorkspace(name: string): Promise<ClaudeCodeWorkspace>;
  getWorkspace(id: string): Promise<ClaudeCodeWorkspace | null>;
  updateWorkspace(id: string, updates: Partial<ClaudeCodeWorkspace>): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
}

export interface ClaudeCodeConfig {
  // Model configuration
  defaultModel: string;
  maxTokens: number;
  temperature?: number;
  
  // Session settings
  sessionTimeout: number; // milliseconds
  maxSessions: number;
  
  // File handling
  maxFileSize: number; // bytes
  allowedFileTypes: string[];
  
  // Security settings
  enableCodeValidation: boolean;
  allowedImports: string[];
  blockedPatterns: string[];
  
  // Performance settings
  responseTimeout: number; // milliseconds
  maxConcurrentRequests: number;
  
  // Logging
  enableRequestLogging: boolean;
  enableResponseLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface ClaudeCodeError extends Error {
  code: string;
  details?: Record<string, any>;
  timestamp: number;
}

// Utility types for working with Claude Code responses
export type FileAction = 'create' | 'modify' | 'delete';
export type PromptType = 'create' | 'modify' | 'debug' | 'analyze';
export type StreamEventType = 'status' | 'stream' | 'file' | 'complete' | 'error' | 'warning';

// Template types for common patterns
export interface CreatePromptContext {
  projectName?: string;
  framework: 'react' | 'vue' | 'angular' | 'vanilla';
  styling: 'tailwind' | 'css' | 'styled-components';
  requirements: string[];
}

export interface ModifyPromptContext {
  targetFiles: string[];
  changeDescription: string;
  preserveExisting: boolean;
  editType: 'style' | 'logic' | 'structure' | 'content';
}

export interface DebugPromptContext {
  errorMessage?: string;
  failingFiles: string[];
  expectedBehavior: string;
  currentBehavior: string;
}

export interface AnalyzePromptContext {
  analysisType: 'performance' | 'security' | 'structure' | 'quality';
  focusAreas: string[];
  depth: 'surface' | 'detailed' | 'comprehensive';
}