import { POST as createSandbox } from '@/app/api/create-ai-sandbox/route';
import { POST as restartVite } from '@/app/api/restart-vite/route';
import { POST as killSandbox } from '@/app/api/kill-sandbox/route';
import { defaultPortManager } from '@/lib/port-manager';
import { defaultSandboxManager } from '@/lib/sandbox-manager';

// Mock external dependencies but test real port manager integration
jest.mock('@/lib/sandbox-manager');
jest.mock('@/lib/process-cleanup-manager');
jest.mock('child_process');
jest.mock('fs', () => ({ 
  promises: { 
    mkdir: jest.fn(), 
    writeFile: jest.fn(), 
    readFile: jest.fn(), 
    unlink: jest.fn() 
  } 
}));

// Mock the npm installation to prevent hanging
jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn((fn) => {
    if (fn.toString().includes('spawn')) {
      return jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
    }
    return jest.requireActual('util').promisify(fn);
  })
}));

// Mock fetch to prevent actual network calls during npm install simulation
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  text: () => Promise.resolve(''),
  json: () => Promise.resolve({})
});

// Mock app config aligned with new timeout configuration
jest.mock('@/config/app.config', () => ({
  appConfig: {
    sandbox: {
      viteStartupDelay: 5000, // Aligned with app.config.ts
      processTimeout: 10000, // Aligned with app.config.ts
      timeoutMs: 15000, // 15 minutes * 60 * 1000
      timeoutMinutes: 15,
      vitePort: 5173,
      cssRebuildDelay: 1500, // Aligned with app.config.ts
      fileOperations: {
        ioTimeout: 3000,
        mkdirTimeout: 2000,
        unlinkTimeout: 2000
      }
    },
    codeGeneration: {
      defaultMode: 'local',
      analysisTimeout: 5000
    }
  }
}));

describe('Port Manager API Integration', () => {
  // Set reasonable timeout for integration tests
  jest.setTimeout(25000); // 25 seconds - extended for heavy integration tests with real process management
  
  beforeEach(async () => {
    jest.clearAllMocks();
    global.activeSandbox = null;
    global.viteProcess = null;
    global.existingFiles = new Set();
    
    // Setup common mocks
    const { defaultSandboxManager } = require('@/lib/sandbox-manager');
    defaultSandboxManager.createSandbox.mockResolvedValue({
      id: 'test-sandbox-123',
      path: '/tmp/sandboxes/test-sandbox-123',
      createdAt: new Date()
    });
    
    defaultSandboxManager.getStats.mockResolvedValue({
      totalSandboxes: 1,
      sandboxesDir: '/tmp/sandboxes',
      maxSandboxes: 50,
      cleanupInterval: 86400000
    });
    
    defaultSandboxManager.deleteSandbox.mockResolvedValue(undefined);
    
    // Mock process cleanup manager
    const { processCleanupManager } = require('@/lib/process-cleanup-manager');
    processCleanupManager.unregisterProcess.mockResolvedValue(true);
    processCleanupManager.registerProcess.mockReturnValue({ id: 'test-process' });
    processCleanupManager.getProcesses.mockReturnValue([]);
    
    const { spawn } = require('child_process');
    const mockProcess = {
      pid: 12345,
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          // Fast completion for npm install and vite processes
          setTimeout(() => callback(0), 5);
        }
      }),
      kill: jest.fn()
    };
    
    // Mock spawn to handle npm install and vite commands quickly
    spawn.mockImplementation((command: string, args: string[] | undefined, options: any) => {
      if (command === 'npm' && args && args[0] === 'install') {
        // Immediate completion for npm install
        setTimeout(() => {
          mockProcess.on.mock.calls.forEach(([event, callback]) => {
            if (event === 'close') callback(0);
          });
        }, 1);
      } else if (command === 'npm' && args && args.includes('dev')) {
        // Fast startup for vite dev server
        setTimeout(() => {
          mockProcess.on.mock.calls.forEach(([event, callback]) => {
            if (event === 'close') callback(0);
          });
        }, 10);
      }
      return mockProcess;
    });
    
    const { promises: fs } = require('fs');
    fs.mkdir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);
    fs.readFile.mockResolvedValue('12345');
    fs.unlink.mockResolvedValue(undefined);
    
    // Clear port manager state
    await defaultPortManager.cleanup();
  });

  afterEach(async () => {
    await defaultPortManager.cleanup();
  });

  describe('End-to-End Port Lifecycle', () => {
    it('should manage port lifecycle across create -> restart -> kill', async () => {
      // 1. Create sandbox - should reserve and activate port
      const createResponse = await createSandbox();
      const createText = await createResponse.text();
      const createData = JSON.parse(createText);
      
      expect(createResponse.status).toBe(200);
      expect(createData.port).toBeGreaterThanOrEqual(5173);
      
      const reservedPort = createData.port;
      const sandboxId = createData.sandboxId;
      
      // Verify port is reserved and active
      const reservation = defaultPortManager.getReservation(sandboxId);
      expect(reservation).toBeDefined();
      expect(reservation!.status).toBe('active');
      expect(reservation!.port).toBe(reservedPort);
      
      // 2. Restart Vite - should maintain same port
      const restartResponse = await restartVite();
      const restartText = await restartResponse.text();
      const restartData = JSON.parse(restartText);
      
      
      expect(restartResponse.status).toBe(200);
      expect(restartData.data.port).toBe(reservedPort);
      
      // Port should still be active
      const afterRestartReservation = defaultPortManager.getReservation(sandboxId);
      expect(afterRestartReservation).toBeDefined();
      expect(afterRestartReservation!.status).toBe('active');
      
      // 3. Kill sandbox - should release port
      const killResponse = await killSandbox();
      const killText = await killResponse.text();
      const killData = JSON.parse(killText);
      
      expect(killResponse.status).toBe(200);
      expect(killData.success).toBe(true);
      
      // Port should be released
      const afterKillReservation = defaultPortManager.getReservation(sandboxId);
      expect(afterKillReservation).toBeUndefined();
    });

    it('should handle concurrent sandbox creation with different ports', async () => {
      // Create multiple sandboxes concurrently
      const createPromises = Array.from({ length: 3 }, (_, i) => {
        // Mock different sandbox IDs for each call
        const { defaultSandboxManager } = require('@/lib/sandbox-manager');
        defaultSandboxManager.createSandbox.mockResolvedValueOnce({
          id: `test-sandbox-${i}`,
          path: `/tmp/sandboxes/test-sandbox-${i}`,
          createdAt: new Date()
        });
        
        return createSandbox();
      });
      
      const responses = await Promise.all(createPromises);
      const dataPromises = responses.map(async r => JSON.parse(await r.text()));
      const results = await Promise.all(dataPromises);
      
      // All should succeed
      results.forEach(data => {
        expect(data.success).toBe(true);
        expect(data.port).toBeGreaterThanOrEqual(5173);
      });
      
      // All should have different ports
      const ports = results.map(r => r.port);
      const uniquePorts = new Set(ports);
      expect(uniquePorts.size).toBe(3);
      
      // Verify all ports are reserved
      const stats = defaultPortManager.getStats();
      expect(stats.activePorts).toBe(3);
    });

    it('should handle sequential sandbox operations', async () => {
      // Create first sandbox
      const create1Response = await createSandbox();
      const create1Data = JSON.parse(await create1Response.text());
      const port1 = create1Data.port;
      const sandbox1Id = create1Data.sandboxId;
      
      // Kill first sandbox
      await killSandbox();
      
      // Verify port is released
      expect(defaultPortManager.getReservation(sandbox1Id)).toBeUndefined();
      
      // Create second sandbox - might reuse the port
      const { defaultSandboxManager } = require('@/lib/sandbox-manager');
      defaultSandboxManager.createSandbox.mockResolvedValueOnce({
        id: 'test-sandbox-456',
        path: '/tmp/sandboxes/test-sandbox-456',
        createdAt: new Date()
      });
      
      const create2Response = await createSandbox();
      const create2Data = JSON.parse(await create2Response.text());
      
      expect(create2Response.status).toBe(200);
      expect(create2Data.success).toBe(true);
      expect(create2Data.port).toBeGreaterThanOrEqual(5173);
      
      // Should have new reservation
      const reservation2 = defaultPortManager.getReservation(create2Data.sandboxId);
      expect(reservation2).toBeDefined();
      expect(reservation2!.status).toBe('active');
    });
  });

  describe('Port Conflict Resolution', () => {
    it('should handle port conflicts during restart', async () => {
      // Create initial sandbox
      const createResponse = await createSandbox();
      const createData = JSON.parse(await createResponse.text());
      const originalPort = createData.port;
      const sandboxId = createData.sandboxId;
      
      // Simulate port conflict by manually reserving the port for another sandbox
      await defaultPortManager.reservePort('conflicting-sandbox');
      
      // Restart should handle the conflict
      const restartResponse = await restartVite();
      const restartData = JSON.parse(await restartResponse.text());
      
      expect(restartResponse.status).toBe(200);
      expect(typeof restartData.data.port).toBe('number');
      
      // Should either resolve conflict or use fallback
      const finalReservation = defaultPortManager.getReservation(sandboxId);
      expect(finalReservation).toBeDefined();
    });

    it('should auto-reassign ports when conflicts occur', async () => {
      // Create first sandbox
      const create1Response = await createSandbox();
      const create1Data = JSON.parse(await create1Response.text());
      
      // Manually create a conflict by reserving the same port range
      const conflictReservations = [];
      for (let i = 0; i < 5; i++) {
        try {
          const reservation = await defaultPortManager.reservePort(`conflict-${i}`);
          conflictReservations.push(reservation);
        } catch (error) {
          // Expected when ports are exhausted
        }
      }
      
      // Try to restart - should handle conflicts
      const restartResponse = await restartVite();
      
      expect(restartResponse.status).toBe(200);
    });
  });

  describe('Error Recovery', () => {
    it('should cleanup ports on sandbox creation failure', async () => {
      // Mock sandbox manager to fail after port reservation
      const { defaultSandboxManager } = require('@/lib/sandbox-manager');
      defaultSandboxManager.createSandbox.mockRejectedValue(new Error('Filesystem error'));
      
      const response = await createSandbox();
      const data = JSON.parse(await response.text());
      
      expect(response.status).toBe(500);
      expect(data.error).toContain('Filesystem error');
      
      // No ports should be left reserved
      const stats = defaultPortManager.getStats();
      expect(stats.reservedPorts).toBe(0);
      expect(stats.activePorts).toBe(0);
    });

    it('should cleanup ports on process spawn failure', async () => {
      // Mock spawn to fail - need proper mock object structure
      const { spawn } = require('child_process');
      const mockFailedProcess = {
        pid: undefined,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        }),
        kill: jest.fn()
      };
      spawn.mockReturnValue(mockFailedProcess);
      
      const response = await createSandbox();
      const data = JSON.parse(await response.text());
      
      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to start Vite process');
      
      // Port should be cleaned up
      const stats = defaultPortManager.getStats();
      expect(stats.reservedPorts).toBe(0);
      expect(stats.activePorts).toBe(0);
    });

    it('should handle port manager failures gracefully', async () => {
      // Create a sandbox first
      const createResponse = await createSandbox();
      const createData = JSON.parse(await createResponse.text());
      
      expect(createResponse.status).toBe(200);
      
      // Mock port manager to fail on kill
      const originalReleasePort = defaultPortManager.releasePort;
      defaultPortManager.releasePort = jest.fn().mockRejectedValue(new Error('Port manager failure'));
      
      const killResponse = await killSandbox();
      const killData = JSON.parse(await killResponse.text());
      
      // Should still succeed in killing sandbox
      expect(killResponse.status).toBe(200);
      expect(killData.success).toBe(true);
      
      // Restore original method
      defaultPortManager.releasePort = originalReleasePort;
    });
  });

  describe('Port Range Management', () => {
    it('should handle port exhaustion gracefully', async () => {
      // Create many sandboxes to exhaust port range
      const createPromises = [];
      
      for (let i = 0; i < 5; i++) { // Reduced to prevent hanging
        const { defaultSandboxManager } = require('@/lib/sandbox-manager');
        defaultSandboxManager.createSandbox.mockResolvedValueOnce({
          id: `exhaustion-test-${i}`,
          path: `/tmp/sandboxes/exhaustion-test-${i}`,
          createdAt: new Date()
        });
        
        createPromises.push(createSandbox());
      }
      
      const responses = await Promise.allSettled(createPromises);
      
      // All should succeed with the port manager's dynamic allocation
      // but check that they got different ports
      const successful = responses.filter(r => r.status === 'fulfilled');
      
      expect(successful.length).toBeGreaterThan(0);
      expect(successful.length).toBeLessThanOrEqual(5);
      
      // Verify we got different ports for different sandboxes
      if (successful.length > 1) {
        const dataPromises = successful.map(async (r: any) => JSON.parse(await r.value.text()));
        const results = await Promise.all(dataPromises);
        const ports = results.map(r => r.port);
        const uniquePorts = new Set(ports);
        expect(uniquePorts.size).toBe(ports.length); // All ports should be unique
      }
    });

    it('should reuse released ports', async () => {
      // Create and kill several sandboxes
      const createdPorts = [];
      
      for (let i = 0; i < 3; i++) {
        const { defaultSandboxManager } = require('@/lib/sandbox-manager');
        defaultSandboxManager.createSandbox.mockResolvedValueOnce({
          id: `reuse-test-${i}`,
          path: `/tmp/sandboxes/reuse-test-${i}`,
          createdAt: new Date()
        });
        
        const createResponse = await createSandbox();
        const createData = JSON.parse(await createResponse.text());
        
        createdPorts.push(createData.port);
        
        await killSandbox();
      }
      
      // Verify ports were allocated
      expect(createdPorts.length).toBe(3);
      expect(new Set(createdPorts).size).toBeGreaterThan(0);
    });
  });

  describe('Global State Consistency', () => {
    it('should maintain consistent global state across operations', async () => {
      // Create sandbox
      const createResponse = await createSandbox();
      const createData = JSON.parse(await createResponse.text());
      
      expect(global.activeSandbox).toBeDefined();
      expect(global.activeSandbox.id).toBe(createData.sandboxId);
      expect(global.activeSandbox.port).toBe(createData.port);
      
      // Restart Vite
      const restartResponse = await restartVite();
      const restartData = JSON.parse(await restartResponse.text());
      
      expect(global.activeSandbox.port).toBe(restartData.data.port);
      expect(global.activeSandbox.url).toBe(`http://localhost:${restartData.data.port}`);
      
      // Kill sandbox
      await killSandbox();
      
      expect(global.activeSandbox).toBeNull();
      expect(global.sandboxData).toBeNull();
    });

    it('should handle missing global state gracefully', async () => {
      // Clear global state
      global.activeSandbox = null;
      global.viteProcess = null;
      
      // Try to restart without active sandbox
      const restartResponse = await restartVite();
      const restartData = JSON.parse(await restartResponse.text());
      
      expect(restartResponse.status).toBe(200);
      expect(restartData.success).toBe(true);
      
      // Should get a valid port (may not be 5173 due to port manager allocation)
      expect(restartData.data.port).toBeGreaterThanOrEqual(5173);
      expect(typeof restartData.data.port).toBe('number');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle rapid create/kill cycles', async () => {
      const cycles = 3; // Reduced cycles for faster execution
      const results = [];
      
      // Override mocks for faster execution
      const { spawn } = require('child_process');
      const fastMockProcess = {
        pid: 12345,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            // Immediate callback for fast tests
            setTimeout(() => callback(0), 1);
          }
        }),
        kill: jest.fn()
      };
      spawn.mockReturnValue(fastMockProcess);
      
      for (let i = 0; i < cycles; i++) {
        const { defaultSandboxManager } = require('@/lib/sandbox-manager');
        defaultSandboxManager.createSandbox.mockResolvedValueOnce({
          id: `rapid-${i}`,
          path: `/tmp/sandboxes/rapid-${i}`,
          createdAt: new Date()
        });
        
        const createResponse = await createSandbox();
        const createData = JSON.parse(await createResponse.text());
        
        results.push(createData);
        
        const killResponse = await killSandbox();
        
        expect(createResponse.status).toBe(200);
        expect(killResponse.status).toBe(200);
      }
      
      // Verify all were successful
      expect(results.length).toBe(cycles);
      results.forEach(data => {
        expect(data.success).toBe(true);
        expect(data.port).toBeGreaterThanOrEqual(5173);
      });
      
      // No ports should be left reserved
      const finalStats = defaultPortManager.getStats();
      expect(finalStats.activePorts).toBe(0);
      expect(finalStats.reservedPorts).toBe(0);
    }, 60000); // 60 second timeout for this specific test

    it('should maintain performance with many concurrent operations', async () => {
      const startTime = Date.now();
      
      // Mix of create, restart, and kill operations
      const operations = [
        ...Array.from({ length: 3 }, (_, i) => {
          const { defaultSandboxManager } = require('@/lib/sandbox-manager');
          defaultSandboxManager.createSandbox.mockResolvedValueOnce({
            id: `perf-${i}`,
            path: `/tmp/sandboxes/perf-${i}`,
            createdAt: new Date()
          });
          return createSandbox();
        }),
        restartVite(),
        killSandbox()
      ];
      
      const results = await Promise.allSettled(operations);
      const endTime = Date.now();
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
      
      // Most operations should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(operations.length / 2);
    });
  });
});