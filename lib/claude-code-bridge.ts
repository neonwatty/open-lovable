/**
 * Claude Code Integration Bridge
 * 
 * Provides bidirectional communication between Next.js app and Claude Code CLI.
 * Uses file-based communication for reliability and simplicity.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import type { 
  ClaudeCodeSession, 
  ClaudeCodeMessage, 
  ClaudeCodeResponse,
  ClaudeCodeStreamEvents 
} from '../types/claude-code';

export interface BridgeConfig {
  workingDirectory: string;
  sessionTimeout: number; // milliseconds
  maxConcurrentSessions: number;
  claudeCodePath?: string; // Path to Claude Code CLI
  communicationMethod: 'file' | 'stdio' | 'websocket';
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

export interface BridgeRequest {
  id: string;
  sessionId: string;
  type: 'prompt' | 'file_update' | 'session_end';
  payload: any;
  timestamp: number;
  timeout?: number;
}

export interface BridgeResponse {
  id: string;
  sessionId: string;
  type: 'success' | 'error' | 'stream' | 'complete';
  payload: any;
  timestamp: number;
  error?: string;
}

export class ClaudeCodeBridge extends EventEmitter {
  private config: BridgeConfig;
  private sessions: Map<string, ClaudeCodeSession>;
  private pendingRequests: Map<string, BridgeRequest>;
  private processes: Map<string, ChildProcess>;
  private communicationDir: string;
  private isShuttingDown: boolean = false;

  constructor(config: Partial<BridgeConfig> = {}) {
    super();
    
    this.config = {
      workingDirectory: process.cwd(),
      sessionTimeout: 15 * 60 * 1000, // 15 minutes
      maxConcurrentSessions: 5,
      communicationMethod: 'file',
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };

    this.sessions = new Map();
    this.pendingRequests = new Map();
    this.processes = new Map();
    this.communicationDir = join(this.config.workingDirectory, '.claude-code-bridge');
    
    this.setupCleanup();
  }

  /**
   * Initialize the bridge and create communication directories
   */
  async initialize(): Promise<void> {
    try {
      // Create communication directory
      await fs.mkdir(this.communicationDir, { recursive: true });
      await fs.mkdir(join(this.communicationDir, 'requests'), { recursive: true });
      await fs.mkdir(join(this.communicationDir, 'responses'), { recursive: true });
      await fs.mkdir(join(this.communicationDir, 'sessions'), { recursive: true });

      // Clean up any existing files
      await this.cleanupCommunicationFiles();

      console.log('[ClaudeCodeBridge] Initialized successfully');
      this.emit('initialized');
    } catch (error) {
      console.error('[ClaudeCodeBridge] Failed to initialize:', error);
      throw new Error(`Bridge initialization failed: ${error}`);
    }
  }

  /**
   * Create a new Claude Code session
   */
  async createSession(workspaceId: string): Promise<ClaudeCodeSession> {
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error('Maximum concurrent sessions reached');
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: ClaudeCodeSession = {
      sessionId,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      messages: [],
      context: {
        sandboxId: workspaceId,
        projectName: `project_${workspaceId}`,
        currentFiles: {},
        editHistory: []
      }
    };

    this.sessions.set(sessionId, session);

    // Create session directory
    const sessionDir = join(this.communicationDir, 'sessions', sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    // Write session metadata
    await fs.writeFile(
      join(sessionDir, 'metadata.json'),
      JSON.stringify(session, null, 2)
    );

    console.log(`[ClaudeCodeBridge] Created session: ${sessionId}`);
    this.emit('sessionCreated', session);

    return session;
  }

  /**
   * Send a prompt to Claude Code
   */
  async sendPrompt(
    sessionId: string, 
    prompt: string, 
    context?: any
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const request: BridgeRequest = {
      id: requestId,
      sessionId,
      type: 'prompt',
      payload: {
        prompt,
        context: context || session.context,
        sessionMetadata: {
          messageCount: session.messages.length,
          lastActivity: session.lastActivity
        }
      },
      timestamp: Date.now(),
      timeout: 30000 // 30 seconds default timeout
    };

    // Store the request
    this.pendingRequests.set(requestId, request);

    try {
      // Send request using configured communication method
      const responseId = await this.sendRequest(request);
      
      // Wait for response
      const response = await this.waitForResponse(responseId, request.timeout);
      
      // Update session
      session.lastActivity = Date.now();
      session.messages.push({
        role: 'user',
        content: prompt,
        timestamp: Date.now()
      });

      if (response.type === 'success') {
        session.messages.push({
          role: 'assistant',
          content: response.payload.content || '',
          timestamp: Date.now()
        });

        return response.payload.content || '';
      } else {
        throw new Error(response.error || 'Unknown error occurred');
      }
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  /**
   * Send a request using the configured communication method
   */
  private async sendRequest(request: BridgeRequest): Promise<string> {
    switch (this.config.communicationMethod) {
      case 'file':
        return this.sendFileRequest(request);
      case 'stdio':
        return this.sendStdioRequest(request);
      case 'websocket':
        return this.sendWebSocketRequest(request);
      default:
        throw new Error(`Unsupported communication method: ${this.config.communicationMethod}`);
    }
  }

  /**
   * Send request via file-based communication
   */
  private async sendFileRequest(request: BridgeRequest): Promise<string> {
    const requestFile = join(this.communicationDir, 'requests', `${request.id}.json`);
    const responseFile = join(this.communicationDir, 'responses', `${request.id}.json`);

    // Write request file
    await fs.writeFile(requestFile, JSON.stringify(request, null, 2));

    // Create a marker file to signal Claude Code
    await fs.writeFile(
      join(this.communicationDir, 'pending_request.marker'),
      request.id
    );

    console.log(`[ClaudeCodeBridge] Sent file request: ${request.id}`);
    return request.id;
  }

  /**
   * Send request via stdio communication
   */
  private async sendStdioRequest(request: BridgeRequest): Promise<string> {
    const sessionId = request.sessionId;
    let process = this.processes.get(sessionId);

    if (!process || process.killed) {
      // Start new Claude Code process for this session
      process = this.startClaudeCodeProcess(sessionId);
      this.processes.set(sessionId, process);
    }

    return new Promise((resolve, reject) => {
      if (!process || !process.stdin) {
        reject(new Error('Process not available'));
        return;
      }

      // Send request via stdin
      const requestData = JSON.stringify(request) + '\n';
      process.stdin.write(requestData);

      // Set up response handler
      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === request.id) {
            process?.stdout?.off('data', responseHandler);
            resolve(response.id);
          }
        } catch (error) {
          // Ignore parsing errors, might be partial data
        }
      };

      process.stdout?.on('data', responseHandler);

      // Set up timeout
      setTimeout(() => {
        process?.stdout?.off('data', responseHandler);
        reject(new Error('Request timeout'));
      }, request.timeout || 30000);
    });
  }

  /**
   * Send request via WebSocket communication
   */
  private async sendWebSocketRequest(request: BridgeRequest): Promise<string> {
    // TODO: Implement WebSocket communication
    throw new Error('WebSocket communication not yet implemented');
  }

  /**
   * Wait for a response to a request
   */
  private async waitForResponse(responseId: string, timeout: number = 30000): Promise<BridgeResponse> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkForResponse = async () => {
        try {
          const responseFile = join(this.communicationDir, 'responses', `${responseId}.json`);
          
          try {
            const responseData = await fs.readFile(responseFile, 'utf-8');
            const response: BridgeResponse = JSON.parse(responseData);
            
            // Clean up response file
            await fs.unlink(responseFile).catch(() => {});
            
            resolve(response);
            return;
          } catch (error) {
            // Response file doesn't exist yet, continue waiting
          }

          // Check timeout
          if (Date.now() - startTime > timeout) {
            reject(new Error('Response timeout'));
            return;
          }

          // Check again in 100ms
          setTimeout(checkForResponse, 100);
        } catch (error) {
          reject(error);
        }
      };

      checkForResponse();
    });
  }

  /**
   * Start a Claude Code process for stdio communication
   */
  private startClaudeCodeProcess(sessionId: string): ChildProcess {
    const claudeCodePath = this.config.claudeCodePath || 'claude';
    
    const process = spawn(claudeCodePath, ['--interactive', '--session', sessionId], {
      cwd: this.config.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    process.on('error', (error) => {
      console.error(`[ClaudeCodeBridge] Process error for session ${sessionId}:`, error);
      this.emit('processError', { sessionId, error });
    });

    process.on('exit', (code) => {
      console.log(`[ClaudeCodeBridge] Process exited for session ${sessionId} with code ${code}`);
      this.processes.delete(sessionId);
      this.emit('processExit', { sessionId, code });
    });

    return process;
  }

  /**
   * End a session and clean up resources
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Clean up process if using stdio
    const process = this.processes.get(sessionId);
    if (process && !process.killed) {
      process.kill('SIGTERM');
      this.processes.delete(sessionId);
    }

    // Remove session
    this.sessions.delete(sessionId);

    // Clean up session files
    const sessionDir = join(this.communicationDir, 'sessions', sessionId);
    await fs.rm(sessionDir, { recursive: true, force: true });

    console.log(`[ClaudeCodeBridge] Ended session: ${sessionId}`);
    this.emit('sessionEnded', { sessionId });
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): ClaudeCodeSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * List all active sessions
   */
  listSessions(): ClaudeCodeSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clean up old communication files
   */
  private async cleanupCommunicationFiles(): Promise<void> {
    try {
      const dirs = ['requests', 'responses'];
      
      for (const dir of dirs) {
        const dirPath = join(this.communicationDir, dir);
        const files = await fs.readdir(dirPath).catch(() => []);
        
        for (const file of files) {
          await fs.unlink(join(dirPath, file)).catch(() => {});
        }
      }

      // Remove marker files
      const markerFiles = await fs.readdir(this.communicationDir).catch(() => []);
      for (const file of markerFiles) {
        if (file.endsWith('.marker')) {
          await fs.unlink(join(this.communicationDir, file)).catch(() => {});
        }
      }
    } catch (error) {
      console.warn('[ClaudeCodeBridge] Failed to cleanup communication files:', error);
    }
  }

  /**
   * Setup cleanup handlers
   */
  private setupCleanup(): void {
    const cleanup = async () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log('[ClaudeCodeBridge] Shutting down...');

      // End all sessions
      const sessionIds = Array.from(this.sessions.keys());
      for (const sessionId of sessionIds) {
        await this.endSession(sessionId).catch(console.error);
      }

      // Clean up communication files
      await this.cleanupCommunicationFiles();

      this.emit('shutdown');
    };

    // Avoid adding too many listeners in tests
    if (process.env.NODE_ENV !== 'test') {
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      process.on('exit', cleanup);
    }
  }

  /**
   * Health check for the bridge
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeSessions: number;
    pendingRequests: number;
    details: any;
  }> {
    const activeSessions = this.sessions.size;
    const pendingRequests = this.pendingRequests.size;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (pendingRequests > 10) {
      status = 'degraded';
    }
    
    if (activeSessions >= this.config.maxConcurrentSessions || pendingRequests > 20) {
      status = 'unhealthy';
    }

    return {
      status,
      activeSessions,
      pendingRequests,
      details: {
        communicationMethod: this.config.communicationMethod,
        maxConcurrentSessions: this.config.maxConcurrentSessions,
        communicationDir: this.communicationDir,
        processCount: this.processes.size
      }
    };
  }
}

/**
 * Global bridge instance
 */
let globalBridge: ClaudeCodeBridge | null = null;

/**
 * Get or create the global bridge instance
 */
export function getBridge(config?: Partial<BridgeConfig>): ClaudeCodeBridge {
  if (!globalBridge) {
    globalBridge = new ClaudeCodeBridge(config);
  }
  return globalBridge;
}

/**
 * Initialize the global bridge
 */
export async function initializeBridge(config?: Partial<BridgeConfig>): Promise<ClaudeCodeBridge> {
  const bridge = getBridge(config);
  await bridge.initialize();
  return bridge;
}

/**
 * Utility function to create a simple Claude Code request
 */
export async function sendToClaudeCode(
  prompt: string,
  context?: any,
  sessionId?: string
): Promise<string> {
  const bridge = getBridge();
  
  // Create session if not provided
  if (!sessionId) {
    const session = await bridge.createSession('default');
    sessionId = session.sessionId;
  }

  return bridge.sendPrompt(sessionId, prompt, context);
}

/**
 * Utility function for streaming Claude Code responses
 */
export async function* streamFromClaudeCode(
  prompt: string,
  context?: any,
  sessionId?: string
): AsyncGenerator<ClaudeCodeStreamEvents, void, unknown> {
  // TODO: Implement streaming support
  // For now, just send the prompt and yield the complete response
  const response = await sendToClaudeCode(prompt, context, sessionId);
  
  yield {
    type: 'stream',
    timestamp: Date.now(),
    data: { text: response }
  };
  
  yield {
    type: 'complete',
    timestamp: Date.now(),
    data: { 
      files: [], 
      metadata: { 
        totalFiles: 0, 
        tokensUsed: 0, 
        responseTime: 0,
        warnings: []
      } 
    }
  };
}