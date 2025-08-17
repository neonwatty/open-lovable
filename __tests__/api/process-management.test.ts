/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as killSandbox } from '../../app/api/kill-sandbox/route';
import { POST as restartVite } from '../../app/api/restart-vite/route';
import { POST as runCommand } from '../../app/api/run-command/route';
import { GET as sandboxStatus } from '../../app/api/sandbox-status/route';
import { processCleanupManager } from '../../lib/process-cleanup-manager';
import { spawn } from 'child_process';
import fs from 'fs/promises';

// Mock child_process
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('../../lib/process-cleanup-manager');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe.skip('API Routes - Process Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.viteProcess = null;
    
    // Mock fs.access to simulate working directory exists
    mockFs.access = jest.fn().mockResolvedValue(undefined);
  });

  describe('kill-sandbox API', () => {
    it('should terminate Vite process and clean up resources', async () => {
      // Mock PID file exists
      mockFs.readFile.mockResolvedValue('12345');
      mockFs.unlink.mockResolvedValue(undefined);
      
      // Mock process cleanup manager
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.unregisterProcess.mockResolvedValue(true);
      mockProcessCleanupManager.getProcesses.mockReturnValue([]);

      const response = await killSandbox();
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('cleaned up successfully');
    });

    it('should handle missing PID file gracefully', async () => {
      // Mock PID file doesn't exist
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.unlink.mockResolvedValue(undefined);

      const response = await killSandbox();
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should clean up global process reference', async () => {
      const mockProcess = { kill: jest.fn(), pid: 12345 };
      global.viteProcess = mockProcess;

      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.unlink.mockResolvedValue(undefined);

      await killSandbox();
      
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(global.viteProcess).toBeNull();
    });
  });

  describe('restart-vite API', () => {
    it('should restart Vite server with proper configuration', async () => {
      const mockChildProcess = {
        pid: 54321,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockChildProcess as any);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.registerProcess.mockReturnValue({
        id: 'vite-server',
        pid: 54321,
        command: 'npm',
        args: ['run', 'dev'],
        workingDir: '/tmp/sandbox-workspace',
        startTime: new Date(),
        lastActivity: new Date(),
        status: 'running',
        type: 'vite'
      });

      const response = await restartVite();
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.pid).toBe(54321);
      expect(data.data.port).toBe(5173);
    });

    it('should handle Vite startup failure', async () => {
      mockSpawn.mockReturnValue({
        pid: undefined,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      } as any);

      const response = await restartVite();
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Failed to start Vite process');
    });

    it('should kill existing process before starting new one', async () => {
      // Mock existing PID file
      mockFs.readFile.mockResolvedValue('11111');
      
      const mockNewProcess = {
        pid: 22222,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockNewProcess as any);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);

      // Mock process.kill for existing process
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

      await restartVite();
      
      expect(killSpy).toHaveBeenCalledWith(11111, 'SIGTERM');
      expect(mockSpawn).toHaveBeenCalledWith('npm', ['run', 'dev'], expect.any(Object));
      
      killSpy.mockRestore();
    });
  });

  describe('run-command API', () => {
    it('should execute allowed commands successfully', async () => {
      const mockChildProcess = {
        pid: 99999,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0, null), 10); // Simulate successful completion
          }
        }),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockChildProcess as any);

      const request = new NextRequest('http://localhost:3000/api/run-command', {
        method: 'POST',
        body: JSON.stringify({ command: 'npm install' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await runCommand(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.command).toBe('npm install');
    });

    it('should block dangerous commands', async () => {
      const dangerousCommands = [
        'rm -rf /',
        'sudo rm -rf /',
        'cat /etc/passwd',
        'ls > /tmp/test.txt',
        'echo "test" | grep test'
      ];

      for (const command of dangerousCommands) {
        const request = new NextRequest('http://localhost:3000/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await runCommand(request);
        
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('Command blocked');
      }
    });

    it('should validate npm subcommands', async () => {
      const allowedCommands = ['npm install', 'npm run dev', 'npm test'];
      const blockedCommands = ['npm publish', 'npm config set'];

      for (const command of allowedCommands) {
        const request = new NextRequest('http://localhost:3000/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await runCommand(request);
        expect(response.status).not.toBe(403);
      }

      for (const command of blockedCommands) {
        const request = new NextRequest('http://localhost:3000/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await runCommand(request);
        expect(response.status).toBe(403);
      }
    });

    it('should handle command timeout', async () => {
      const mockChildProcess = {
        pid: 88888,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockChildProcess as any);

      const request = new NextRequest('http://localhost:3000/api/run-command', {
        method: 'POST',
        body: JSON.stringify({ 
          command: 'npm install',
          timeout: 100 // Very short timeout
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await runCommand(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.exitCode).toBe(124); // Timeout exit code
    });

    it('should register process with cleanup manager', async () => {
      const mockChildProcess = {
        pid: 77777,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      };

      mockSpawn.mockReturnValue(mockChildProcess as any);
      
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.registerProcess.mockReturnValue({
        id: 'command-test',
        pid: 77777,
        command: 'npm',
        args: ['install'],
        workingDir: '/tmp/sandbox-workspace',
        startTime: new Date(),
        lastActivity: new Date(),
        status: 'running',
        type: 'command'
      });

      const request = new NextRequest('http://localhost:3000/api/run-command', {
        method: 'POST',
        body: JSON.stringify({ command: 'npm install' }),
        headers: { 'Content-Type': 'application/json' }
      });

      await runCommand(request);
      
      expect(mockProcessCleanupManager.registerProcess).toHaveBeenCalledWith(
        expect.stringContaining('command-'),
        mockChildProcess,
        'npm',
        ['install'],
        expect.any(String),
        'command'
      );
    });
  });

  describe('sandbox-status API', () => {
    it('should return process status information', async () => {
      // Mock process.kill to simulate running process
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
      mockFs.readFile.mockResolvedValue('12345');

      const response = await sandboxStatus();
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.process).toBeDefined();
      expect(data.port).toBeDefined();
      
      killSpy.mockRestore();
    });

    it('should handle non-running process', async () => {
      // Mock process.kill to throw (process not running)
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });
      mockFs.readFile.mockResolvedValue('12345');

      const response = await sandboxStatus();
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.process).toBeNull();
      
      killSpy.mockRestore();
    });

    it('should perform health checks via GET', async () => {
      const response = await sandboxStatus();
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});