/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as killSandbox } from '../../app/api/kill-sandbox/route';
import { POST as restartVite } from '../../app/api/restart-vite/route';
import { GET as processCleanupGet, POST as processCleanupPost, DELETE as processCleanupDelete } from '../../app/api/process-cleanup/route';
import { processCleanupManager } from '../../lib/process-cleanup-manager';
import { appLifecycle } from '../../lib/app-lifecycle';

// Mock dependencies
jest.mock('../../lib/process-cleanup-manager');
jest.mock('../../lib/app-lifecycle');
jest.mock('child_process');
jest.mock('fs/promises');

describe.skip('API Routes Integration with Process Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Process Cleanup API Integration', () => {
    it('should get process status from cleanup manager', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.getStats.mockReturnValue({
        totalProcesses: 3,
        runningProcesses: 2,
        zombieProcesses: 0,
        stoppedProcesses: 1,
        errorProcesses: 0,
        totalMemoryUsage: 1048576,
        cleanupCount: 5,
        errors: []
      });
      
      mockProcessCleanupManager.getProcesses.mockReturnValue([
        {
          id: 'vite-1',
          pid: 12345,
          command: 'npm',
          args: ['run', 'dev'],
          workingDir: '/tmp/test',
          startTime: new Date(),
          lastActivity: new Date(),
          status: 'running',
          type: 'vite'
        },
        {
          id: 'command-1',
          pid: 54321,
          command: 'git',
          args: ['status'],
          workingDir: '/tmp/test',
          startTime: new Date(),
          lastActivity: new Date(),
          status: 'running',
          type: 'command'
        }
      ]);

      const response = await processCleanupGet();
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.stats.totalProcesses).toBe(3);
      expect(data.processes).toHaveLength(2);
    });

    it('should perform manual cleanup', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.performCleanup.mockResolvedValue({
        totalProcesses: 2,
        runningProcesses: 1,
        zombieProcesses: 1,
        stoppedProcesses: 0,
        errorProcesses: 0,
        totalMemoryUsage: 524288,
        cleanupCount: 6,
        errors: [],
        lastCleanupTime: new Date()
      });

      const request = new NextRequest('http://localhost:3000/api/process-cleanup', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup' })
      });

      const response = await processCleanupPost(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.action).toBe('cleanup');
      expect(data.stats.zombieProcesses).toBe(1);
    });

    it('should stop all processes', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.stopAllProcesses.mockResolvedValue();

      const request = new NextRequest('http://localhost:3000/api/process-cleanup', {
        method: 'POST',
        body: JSON.stringify({ action: 'stop-all' })
      });

      const response = await processCleanupPost(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.action).toBe('stop-all');
      expect(mockProcessCleanupManager.stopAllProcesses).toHaveBeenCalled();
    });

    it('should delete specific process', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.unregisterProcess.mockResolvedValue(true);

      const request = new NextRequest('http://localhost:3000/api/process-cleanup?id=test-process&force=true', {
        method: 'DELETE'
      });

      const response = await processCleanupDelete(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(mockProcessCleanupManager.unregisterProcess).toHaveBeenCalledWith('test-process', true);
    });

    it('should handle unknown action', async () => {
      const request = new NextRequest('http://localhost:3000/api/process-cleanup', {
        method: 'POST',
        body: JSON.stringify({ action: 'unknown-action' })
      });

      const response = await processCleanupPost(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unknown action');
    });
  });

  describe('Workflow Integration', () => {
    it('should coordinate kill-sandbox and restart-vite operations', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.unregisterProcess.mockResolvedValue(true);
      mockProcessCleanupManager.getProcesses.mockReturnValue([]);

      // Step 1: Kill sandbox
      const killResponse = await killSandbox();
      expect(killResponse.status).toBe(200);

      // Step 2: Restart Vite (this would normally wait for port to be available)
      const restartResponse = await restartVite();
      expect(restartResponse.status).toBe(200);

      // Verify process manager interactions
      expect(mockProcessCleanupManager.unregisterProcess).toHaveBeenCalled();
    });

    it('should handle lifecycle coordination', async () => {
      const mockAppLifecycle = appLifecycle as jest.Mocked<typeof appLifecycle>;
      mockAppLifecycle.initialize.mockResolvedValue();
      mockAppLifecycle.shutdown.mockResolvedValue();
      mockAppLifecycle.isInitialized.mockReturnValue(true);

      await appLifecycle.initialize();
      expect(appLifecycle.isInitialized()).toBe(true);

      await appLifecycle.shutdown();
      expect(mockAppLifecycle.shutdown).toHaveBeenCalled();
    });
  });
});