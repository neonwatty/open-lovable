/**
 * @jest-environment node
 */

import { ClaudeCodeBridge, getBridge, initializeBridge } from '../../lib/claude-code-bridge';
import { promises as fs, PathLike } from 'fs';
import { FileHandle } from 'fs/promises';
import { join } from 'path';

// Mock fs for testing
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    readdir: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn()
  }
}));

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ClaudeCodeBridge', () => {
  let bridge: ClaudeCodeBridge;
  let testWorkingDir: string;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    testWorkingDir = '/test/working/dir';
    bridge = new ClaudeCodeBridge({
      workingDirectory: testWorkingDir,
      sessionTimeout: 5000,
      maxConcurrentSessions: 2,
      communicationMethod: 'file'
    });

    // Mock fs operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.rm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Clean up any timers or listeners
    bridge.removeAllListeners();
  });

  describe('initialization', () => {
    it('should initialize bridge and create directories', async () => {
      await bridge.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join(testWorkingDir, '.claude-code-bridge'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join(testWorkingDir, '.claude-code-bridge', 'requests'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join(testWorkingDir, '.claude-code-bridge', 'responses'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join(testWorkingDir, '.claude-code-bridge', 'sessions'),
        { recursive: true }
      );
    });

    it('should emit initialized event', async () => {
      const initializePromise = new Promise((resolve) => {
        bridge.on('initialized', resolve);
      });

      await bridge.initialize();
      await initializePromise;
    });

    it('should handle initialization errors', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(bridge.initialize()).rejects.toThrow('Bridge initialization failed');
    });
  });

  describe('session management', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should create a new session', async () => {
      const session = await bridge.createSession('workspace1');

      expect(session).toBeDefined();
      expect(session.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(session.context.sandboxId).toBe('workspace1');
      expect(session.startedAt).toBeGreaterThan(0);
      expect(session.messages).toEqual([]);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(session.sessionId),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.stringContaining(session.sessionId)
      );
    });

    it('should enforce maximum concurrent sessions', async () => {
      // Create maximum allowed sessions
      await bridge.createSession('workspace1');
      await bridge.createSession('workspace2');

      // Third session should fail
      await expect(bridge.createSession('workspace3')).rejects.toThrow(
        'Maximum concurrent sessions reached'
      );
    });

    it('should end a session and clean up resources', async () => {
      const session = await bridge.createSession('workspace1');
      
      await bridge.endSession(session.sessionId);

      expect(bridge.getSession(session.sessionId)).toBeNull();
      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining(session.sessionId),
        { recursive: true, force: true }
      );
    });

    it('should list all active sessions', async () => {
      const session1 = await bridge.createSession('workspace1');
      const session2 = await bridge.createSession('workspace2');

      const sessions = bridge.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.sessionId)).toContain(session1.sessionId);
      expect(sessions.map(s => s.sessionId)).toContain(session2.sessionId);
    });
  });

  describe('file communication', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should send file-based request', async () => {
      const session = await bridge.createSession('workspace1');
      
      // Mock file operations for request/response
      let responseResolve: (value: string) => void;
      const responsePromise = new Promise<string>((resolve) => {
        responseResolve = resolve;
      });

      // Mock readFile to simulate response file
      mockFs.readFile.mockImplementation(async (path: PathLike | FileHandle) => {
        const pathStr = path.toString();
        if (pathStr.includes('responses') && pathStr.includes('.json')) {
          // Simulate Claude Code response
          const response = {
            id: expect.any(String),
            sessionId: session.sessionId,
            type: 'success',
            payload: {
              content: 'Mock Claude Code response'
            },
            timestamp: Date.now()
          };
          return JSON.stringify(response);
        }
        throw new Error('File not found');
      });

      // Simulate response file creation after a delay
      setTimeout(() => {
        responseResolve('response ready');
      }, 100);

      const result = await bridge.sendPrompt(
        session.sessionId, 
        'Create a React component'
      );

      expect(result).toBe('Mock Claude Code response');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/requests\/req_.*\.json$/),
        expect.stringContaining('Create a React component')
      );
    });

    it('should handle request timeout', async () => {
      const session = await bridge.createSession('workspace1');
      
      // Mock readFile to never find response file
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      // Use very short timeout for testing
      const originalSendPrompt = bridge.sendPrompt;
      const sendPromptSpy = jest.spyOn(bridge, 'sendPrompt').mockImplementation(
        async function(this: ClaudeCodeBridge, sessionId: string, prompt: string, context?: any) {
          // Reduce timeout for testing
          const request = {
            id: `req_${Date.now()}_test`,
            sessionId,
            type: 'prompt' as const,
            payload: { prompt, context },
            timestamp: Date.now(),
            timeout: 100 // Very short timeout
          };
          
          try {
            await (this as any).sendRequest(request);
            await (this as any).waitForResponse(request.id, request.timeout);
            return 'success';
          } catch (error) {
            throw error;
          }
        }
      );

      await expect(
        bridge.sendPrompt(session.sessionId, 'Test prompt')
      ).rejects.toThrow('Response timeout');

      sendPromptSpy.mockRestore();
    });
  });

  describe('health check', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should return healthy status with no sessions', async () => {
      const health = await bridge.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.activeSessions).toBe(0);
      expect(health.pendingRequests).toBe(0);
      expect(health.details.communicationMethod).toBe('file');
    });

    it('should return degraded status with many pending requests', async () => {
      // Simulate many pending requests
      for (let i = 0; i < 15; i++) {
        (bridge as any).pendingRequests.set(`req_${i}`, {});
      }

      const health = await bridge.healthCheck();
      expect(health.status).toBe('degraded');
      expect(health.pendingRequests).toBe(15);
    });

    it('should return unhealthy status when at capacity', async () => {
      // Create maximum sessions
      await bridge.createSession('workspace1');
      await bridge.createSession('workspace2');

      // Add many pending requests
      for (let i = 0; i < 25; i++) {
        (bridge as any).pendingRequests.set(`req_${i}`, {});
      }

      const health = await bridge.healthCheck();
      expect(health.status).toBe('unhealthy');
      expect(health.activeSessions).toBe(2);
      expect(health.pendingRequests).toBe(25);
    });
  });

  describe('global bridge instance', () => {
    it('should return same instance when called multiple times', () => {
      const bridge1 = getBridge();
      const bridge2 = getBridge();

      expect(bridge1).toBe(bridge2);
    });

    it('should initialize global bridge', async () => {
      const bridge = await initializeBridge({
        workingDirectory: '/test/global',
        communicationMethod: 'file'
      });

      expect(bridge).toBeInstanceOf(ClaudeCodeBridge);
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.claude-code-bridge'),
        { recursive: true }
      );
    });
  });
});