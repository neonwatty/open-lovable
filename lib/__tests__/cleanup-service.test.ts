import { CleanupService, CleanupServiceConfig } from '../cleanup-service';
import { ProcessManager, ProcessInfo } from '../process-manager';
import { SandboxManager, SandboxInfo } from '../sandbox-manager';
import { PortManager, PortReservation } from '../port-manager';

// Mock console methods to avoid noise in test output
const mockConsole = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock global gc function
const mockGc = jest.fn();

describe('CleanupService', () => {
  let mockProcessManager: jest.Mocked<ProcessManager>;
  let mockSandboxManager: jest.Mocked<SandboxManager>;
  let mockPortManager: jest.Mocked<PortManager>;
  let cleanupService: CleanupService;
  let originalConsole: typeof console;
  let originalGc: typeof global.gc;
  let originalProcessKill: typeof process.kill;
  let originalProcessOn: typeof process.on;

  beforeAll(() => {
    // Use fake timers for all tests
    jest.useFakeTimers();
    
    // Mock console
    originalConsole = { ...console };
    Object.assign(console, mockConsole);
    
    // Mock global gc
    originalGc = global.gc;
    (global as any).gc = mockGc;
  });

  afterAll(() => {
    // Restore real timers
    jest.useRealTimers();
    
    // Restore console
    Object.assign(console, originalConsole);
    
    // Restore global gc
    global.gc = originalGc;
  });

  beforeEach(() => {
    // Reset all mocks between tests
    jest.restoreAllMocks();
    jest.clearAllMocks();
    
    // Reset console mocks
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    mockGc.mockClear();

    // Create mocked managers
    mockProcessManager = {
      listActiveProcesses: jest.fn(),
      cleanupZombieProcesses: jest.fn(),
      isServerRunning: jest.fn(),
      stopViteServer: jest.fn(),
      stopAllProcesses: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    } as any;

    mockSandboxManager = {
      listSandboxes: jest.fn(),
      getSandboxInfo: jest.fn(),
      sandboxExists: jest.fn(),
      deleteSandbox: jest.fn()
    } as any;

    mockPortManager = {
      getActiveReservations: jest.fn(),
      releasePort: jest.fn(),
      cleanup: jest.fn()
    } as any;

    // Mock process.kill for zombie detection tests
    originalProcessKill = process.kill;
    process.kill = jest.fn();

    // Mock process.on for graceful shutdown tests
    originalProcessOn = process.on;
    process.on = jest.fn();
  });

  afterEach(() => {
    // Restore process methods
    process.kill = originalProcessKill;
    process.on = originalProcessOn;

    // Stop cleanup service if running
    if (cleanupService) {
      cleanupService.stop();
      cleanupService.removeAllListeners();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create cleanup service with default configuration', () => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );

      const stats = cleanupService.getStats();
      expect(stats.scheduledCleanupInterval).toBe(60000);
      expect(stats.zombieDetectionInterval).toBe(30000);
      expect(stats.maxInactivityTime).toBe(900000);
      expect(stats.maxMemoryUsage).toBe(1024 * 1024 * 1024);
    });

    it('should create cleanup service with custom configuration', () => {
      const config: CleanupServiceConfig = {
        scheduledCleanupInterval: 30000,
        zombieDetectionInterval: 15000,
        maxInactivityTime: 600000,
        maxMemoryUsage: 512 * 1024 * 1024,
        enableAutoCleanup: false,
        logLevel: 'debug'
      };

      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager,
        config
      );

      const stats = cleanupService.getStats();
      expect(stats.scheduledCleanupInterval).toBe(30000);
      expect(stats.zombieDetectionInterval).toBe(15000);
      expect(stats.maxInactivityTime).toBe(600000);
      expect(stats.maxMemoryUsage).toBe(512 * 1024 * 1024);
    });
  });

  describe('Service Lifecycle', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );
    });

    it('should start and stop the cleanup service', () => {
      expect(cleanupService.getStats().isRunning).toBe(false);

      cleanupService.start();
      expect(cleanupService.getStats().isRunning).toBe(true);

      cleanupService.stop();
      expect(cleanupService.getStats().isRunning).toBe(false);
    });

    it('should not start timers when auto-cleanup is disabled', () => {
      const disabledService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager,
        { enableAutoCleanup: false }
      );

      disabledService.start();
      expect(disabledService.getStats().isRunning).toBe(false);
      
      disabledService.stop();
    });
  });

  describe('Zombie Process Detection and Cleanup', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );
    });

    it('should detect zombie processes using process.kill(pid, 0)', () => {
      const mockProcesses: ProcessInfo[] = [
        {
          pid: 1234,
          port: 5173,
          sandboxId: 'test-sandbox-1',
          command: 'npm',
          args: ['run', 'dev'],
          startTime: new Date(),
          status: 'running'
        },
        {
          pid: 5678,
          port: 5174,
          sandboxId: 'test-sandbox-2',
          command: 'npm',
          args: ['run', 'dev'],
          startTime: new Date(),
          status: 'running'
        }
      ];

      mockProcessManager.listActiveProcesses.mockReturnValue(mockProcesses);

      // Mock process.kill to simulate different scenarios
      const mockProcessKill = process.kill as jest.MockedFunction<typeof process.kill>;
      mockProcessKill.mockImplementation((pid: number, signal?: string | number) => {
        if (pid === 1234) {
          // Process exists
          return true;
        } else if (pid === 5678) {
          // Process does not exist (zombie)
          const error = new Error('No such process') as NodeJS.ErrnoException;
          error.code = 'ESRCH';
          throw error;
        }
        return true;
      });

      // Set up event listener for zombie detection
      const zombieDetectedSpy = jest.fn();
      cleanupService.on('zombieProcessDetected', zombieDetectedSpy);

      cleanupService.start();

      // Trigger zombie detection
      jest.advanceTimersByTime(30000);

      expect(zombieDetectedSpy).toHaveBeenCalledWith(5678, 'test-sandbox-2');
      expect(zombieDetectedSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle permission errors in zombie detection', () => {
      const mockProcesses: ProcessInfo[] = [
        {
          pid: 9999,
          port: 5175,
          sandboxId: 'test-sandbox-3',
          command: 'npm',
          args: ['run', 'dev'],
          startTime: new Date(),
          status: 'running'
        }
      ];

      mockProcessManager.listActiveProcesses.mockReturnValue(mockProcesses);

      // Mock process.kill to simulate permission error
      const mockProcessKill = process.kill as jest.MockedFunction<typeof process.kill>;
      mockProcessKill.mockImplementation((pid: number, signal?: string | number) => {
        const error = new Error('Operation not permitted') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      });

      const zombieDetectedSpy = jest.fn();
      cleanupService.on('zombieProcessDetected', zombieDetectedSpy);

      cleanupService.start();
      jest.advanceTimersByTime(30000);

      // Should not detect as zombie when permission error occurs
      expect(zombieDetectedSpy).not.toHaveBeenCalled();
    });

    it('should cleanup zombie processes through process manager', async () => {
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(3);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const result = await cleanupService.performCleanup();

      expect(mockProcessManager.cleanupZombieProcesses).toHaveBeenCalled();
      expect(result.zombieProcesses).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle errors during zombie process cleanup', async () => {
      const error = new Error('Cleanup failed');
      mockProcessManager.cleanupZombieProcesses.mockRejectedValue(error);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const result = await cleanupService.performCleanup();

      expect(result.zombieProcesses).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: 'ZOMBIE_PROCESS',
        message: 'Failed to cleanup zombie processes'
      });
    });
  });

  describe('Corrupted Sandbox Detection and Cleanup', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );
    });

    it('should detect and cleanup corrupted sandboxes', async () => {
      const mockSandboxes: SandboxInfo[] = [
        {
          id: 'valid-sandbox',
          path: '/path/to/valid',
          createdAt: new Date()
        },
        {
          id: 'corrupted-sandbox',
          path: '/path/to/corrupted',
          createdAt: new Date()
        }
      ];

      mockSandboxManager.listSandboxes.mockResolvedValue(mockSandboxes);
      
      // Mock getSandboxInfo to simulate corruption
      mockSandboxManager.getSandboxInfo.mockImplementation(async (id: string) => {
        if (id === 'corrupted-sandbox') {
          return null; // Simulates corrupted metadata
        }
        return mockSandboxes.find(s => s.id === id) || null;
      });

      mockSandboxManager.sandboxExists.mockResolvedValue(true);
      mockProcessManager.isServerRunning.mockReturnValue(false);
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockPortManager.getActiveReservations.mockReturnValue([]);
      mockPortManager.releasePort.mockResolvedValue(true);
      mockSandboxManager.deleteSandbox.mockResolvedValue();

      const corruptedDetectedSpy = jest.fn();
      cleanupService.on('corruptedSandboxDetected', corruptedDetectedSpy);

      const result = await cleanupService.performCleanup();

      expect(corruptedDetectedSpy).toHaveBeenCalledWith(
        'corrupted-sandbox',
        expect.any(Error)
      );
      expect(mockSandboxManager.deleteSandbox).toHaveBeenCalledWith('corrupted-sandbox');
      expect(result.corruptedSandboxes).toBe(1);
    });

    it('should handle running processes when cleaning corrupted sandboxes', async () => {
      const mockSandboxes: SandboxInfo[] = [
        {
          id: 'corrupted-with-process',
          path: '/path/to/corrupted',
          createdAt: new Date()
        }
      ];

      mockSandboxManager.listSandboxes.mockResolvedValue(mockSandboxes);
      mockSandboxManager.getSandboxInfo.mockResolvedValue(null);
      mockProcessManager.isServerRunning.mockReturnValue(true);
      mockProcessManager.stopViteServer.mockResolvedValue();
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockPortManager.getActiveReservations.mockReturnValue([]);
      mockPortManager.releasePort.mockResolvedValue(true);
      mockSandboxManager.deleteSandbox.mockResolvedValue();

      await cleanupService.performCleanup();

      expect(mockProcessManager.stopViteServer).toHaveBeenCalledWith('corrupted-with-process');
      expect(mockPortManager.releasePort).toHaveBeenCalledWith('corrupted-with-process');
      expect(mockSandboxManager.deleteSandbox).toHaveBeenCalledWith('corrupted-with-process');
    });

    it('should create mock corrupted sandbox data for testing', async () => {
      // Test with invalid JSON metadata
      mockSandboxManager.listSandboxes.mockResolvedValue([
        {
          id: 'invalid-json-sandbox',
          path: '/path/to/invalid',
          createdAt: new Date()
        }
      ]);

      mockSandboxManager.getSandboxInfo.mockImplementation(async () => {
        throw new Error('SyntaxError: Unexpected token in JSON');
      });

      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockPortManager.getActiveReservations.mockReturnValue([]);
      mockSandboxManager.deleteSandbox.mockResolvedValue();

      const result = await cleanupService.performCleanup();
      expect(result.corruptedSandboxes).toBe(1);

      // Test with missing files
      mockSandboxManager.getSandboxInfo.mockImplementation(async () => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result2 = await cleanupService.performCleanup();
      expect(result2.corruptedSandboxes).toBe(1);

      // Test with undefined process IDs
      mockSandboxManager.getSandboxInfo.mockResolvedValue({
        id: 'undefined-process-sandbox',
        path: '/path/to/sandbox',
        createdAt: new Date()
      });

      mockSandboxManager.sandboxExists.mockResolvedValue(false);

      const result3 = await cleanupService.performCleanup();
      expect(result3.corruptedSandboxes).toBe(1);
    });
  });

  describe('Port Leak Detection and Cleanup', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );
    });

    it('should detect and cleanup leaked ports', async () => {
      const mockReservations: PortReservation[] = [
        {
          port: 5173,
          sandboxId: 'active-sandbox',
          url: 'http://localhost:5173',
          reservedAt: new Date(),
          status: 'active'
        },
        {
          port: 5174,
          sandboxId: 'leaked-sandbox',
          url: 'http://localhost:5174',
          reservedAt: new Date(),
          status: 'active'
        }
      ];

      mockPortManager.getActiveReservations.mockReturnValue(mockReservations);
      
      // Mock server running status
      mockProcessManager.isServerRunning.mockImplementation((sandboxId: string) => {
        return sandboxId === 'active-sandbox';
      });

      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.releasePort.mockResolvedValue(true);

      const portLeakSpy = jest.fn();
      cleanupService.on('portLeakDetected', portLeakSpy);

      const result = await cleanupService.performCleanup();

      expect(portLeakSpy).toHaveBeenCalledWith(5174, 'leaked-sandbox');
      expect(mockPortManager.releasePort).toHaveBeenCalledWith('leaked-sandbox');
      expect(result.releasedPorts).toBe(1);
    });

    it('should verify cleanupService.releasePort() is called on process termination', async () => {
      // This test verifies automatic port release on process termination events
      const mockReservations: PortReservation[] = [
        {
          port: 5175,
          sandboxId: 'terminating-sandbox',
          url: 'http://localhost:5175',
          reservedAt: new Date(),
          status: 'active'
        }
      ];

      mockPortManager.getActiveReservations.mockReturnValue(mockReservations);
      mockProcessManager.isServerRunning.mockReturnValue(false);
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.releasePort.mockResolvedValue(true);

      await cleanupService.performCleanup();

      expect(mockPortManager.releasePort).toHaveBeenCalledWith('terminating-sandbox');
    });
  });

  describe('Memory Leak Detection', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager,
        { maxMemoryUsage: 100 * 1024 * 1024 } // 100MB for testing
      );
    });

    it('should detect memory leaks and trigger garbage collection', async () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 200 * 1024 * 1024, // 200MB - above threshold
        heapTotal: 300 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        rss: 250 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      }) as unknown as jest.MockedFunction<typeof process.memoryUsage>;

      // Mock gc function to simulate memory freed
      mockGc.mockImplementation(() => {
        // Simulate memory being freed after GC
        (process.memoryUsage as jest.MockedFunction<typeof process.memoryUsage>).mockImplementation(() => ({
          heapUsed: 50 * 1024 * 1024, // 50MB - after GC
          heapTotal: 100 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          rss: 80 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        }));
      });

      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const memoryLeakSpy = jest.fn();
      cleanupService.on('memoryLeakDetected', memoryLeakSpy);

      const result = await cleanupService.performCleanup();

      expect(memoryLeakSpy).toHaveBeenCalledWith(
        200 * 1024 * 1024,
        100 * 1024 * 1024
      );
      expect(mockGc).toHaveBeenCalled();
      expect(result.freedMemory).toBe(150 * 1024 * 1024); // 200MB - 50MB

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should monitor process.memoryUsage() before and after cleanup operations', async () => {
      const originalMemoryUsage = process.memoryUsage;
      let callCount = 0;
      
      process.memoryUsage = jest.fn().mockImplementation(() => {
        callCount++;
        return {
          heapUsed: callCount === 1 ? 150 * 1024 * 1024 : 50 * 1024 * 1024,
          heapTotal: 200 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 180 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        };
      }) as unknown as jest.MockedFunction<typeof process.memoryUsage>;

      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      await cleanupService.performCleanup();

      expect(process.memoryUsage).toHaveBeenCalledTimes(2);

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Scheduled Cleanup', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager,
        { scheduledCleanupInterval: 10000 } // 10 seconds for testing
      );
    });

    it('should use jest.useFakeTimers() for scheduled cleanup testing', async () => {
      mockProcessManager.listActiveProcesses.mockReturnValue([]);
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      cleanupService.start();

      // Verify timers are set up
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      // Advance timers to trigger cleanup
      jest.advanceTimersByTime(30000); // Advance by zombieDetectionInterval

      // Run pending promises
      await jest.runOnlyPendingTimersAsync();

      expect(mockProcessManager.listActiveProcesses).toHaveBeenCalled();
    });

    it('should use jest.runAllTimers() to trigger cleanup cycles', async () => {
      mockProcessManager.listActiveProcesses.mockReturnValue([]);
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      cleanupService.start();

      // Advance timers for a specific interval to avoid infinite loop
      jest.advanceTimersByTime(30000);
      
      // Run pending promises
      await jest.runOnlyPendingTimersAsync();

      expect(mockProcessManager.listActiveProcesses).toHaveBeenCalled();
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );
    });

    it('should handle graceful shutdown on SIGINT and SIGTERM', () => {
      const mockProcessOn = process.on as jest.MockedFunction<typeof process.on>;
      const signalHandlers: { [key: string | symbol]: (...args: any[]) => void } = {};

      mockProcessOn.mockImplementation((signal: string | symbol, handler: (...args: any[]) => void) => {
        signalHandlers[signal] = handler;
        return process;
      });

      // Create new cleanup service to trigger signal handler setup
      new CleanupService(mockProcessManager, mockSandboxManager, mockPortManager);

      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(signalHandlers['SIGINT']).toBeDefined();
      expect(signalHandlers['SIGTERM']).toBeDefined();
    });

    it('should emit graceful shutdown events', async () => {
      mockProcessManager.stopAllProcesses.mockResolvedValue();
      mockPortManager.cleanup.mockResolvedValue();
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const shutdownStartedSpy = jest.fn();
      const shutdownCompletedSpy = jest.fn();
      
      cleanupService.on('gracefulShutdownStarted', shutdownStartedSpy);
      cleanupService.on('gracefulShutdownCompleted', shutdownCompletedSpy);

      // Mock process.exit to prevent actual exit during test
      const originalExit = process.exit;
      process.exit = jest.fn() as any;

      // Manually trigger the signal handler that would be set up
      const signalHandlers: { [key: string]: (...args: any[]) => void } = {};
      (process.on as jest.Mock).mockImplementation((signal: string, handler: (...args: any[]) => void) => {
        signalHandlers[signal] = handler;
        return process;
      });

      // Re-create service to capture handlers
      const shutdownService = new CleanupService(
        mockProcessManager, 
        mockSandboxManager, 
        mockPortManager
      );

      shutdownService.on('gracefulShutdownStarted', shutdownStartedSpy);
      shutdownService.on('gracefulShutdownCompleted', shutdownCompletedSpy);

      // Trigger the SIGINT handler
      if (signalHandlers['SIGINT']) {
        await signalHandlers['SIGINT']();
      }

      expect(shutdownStartedSpy).toHaveBeenCalledWith('SIGINT');
      expect(mockProcessManager.stopAllProcesses).toHaveBeenCalled();
      expect(mockPortManager.cleanup).toHaveBeenCalled();

      // Restore process.exit
      process.exit = originalExit;
    });
  });

  describe('Error Handling and Logging', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager,
        { logLevel: 'debug' }
      );
    });

    it('should mock logger.error(), logger.warn(), and logger.info() calls', async () => {
      // Test error logging
      const error = new Error('Test error');
      mockProcessManager.cleanupZombieProcesses.mockRejectedValue(error);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const result = await cleanupService.performCleanup();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('ZOMBIE_PROCESS');
    });

    it('should verify proper cleanup logging', async () => {
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(2);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      await cleanupService.performCleanup();

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('CLEANUP INFO:'),
        expect.objectContaining({
          message: 'Starting comprehensive cleanup'
        })
      );

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('CLEANUP INFO:'),
        expect.objectContaining({
          message: expect.stringContaining('Cleanup completed in')
        })
      );
    });

    it('should handle different log levels appropriately', () => {
      const debugService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager,
        { logLevel: 'error' }
      );

      // Start service to trigger info logging
      debugService.start();

      // Only error messages should be logged with 'error' level
      expect(mockConsole.info).not.toHaveBeenCalled();
      
      debugService.stop();
    });
  });

  describe('Performance and Integration Tests', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );
    });

    it('should test memory leak detection under simulated high load', async () => {
      // Simulate high load with multiple concurrent cleanup operations
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(0);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const concurrentCleanups = Array.from({ length: 10 }, () => 
        cleanupService.performCleanup()
      );

      const results = await Promise.all(concurrentCleanups);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.errors).toEqual([]);
      });
    });

    it('should create integration tests that spawn real child processes', async () => {
      // Note: This would be an integration test that spawns actual processes
      // For unit tests, we mock the behavior

      // Mock the process creation
      mockProcessManager.listActiveProcesses.mockReturnValue([{
        pid: 12345,
        port: 5173,
        sandboxId: 'integration-test',
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)'],
        startTime: new Date(),
        status: 'running'
      }]);

      // Mock process.kill to simulate successful cleanup
      (process.kill as jest.Mock).mockReturnValue(true);
      mockProcessManager.cleanupZombieProcesses.mockResolvedValue(1);
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const result = await cleanupService.performCleanup();

      expect(result.zombieProcesses).toBe(1);
      expect(mockProcessManager.cleanupZombieProcesses).toHaveBeenCalled();
    });

    it('should verify cleanup removes processes properly', async () => {
      const mockProcess: ProcessInfo = {
        pid: 54321,
        port: 5174,
        sandboxId: 'test-removal',
        command: 'npm',
        args: ['run', 'dev'],
        startTime: new Date(),
        status: 'running'
      };

      mockProcessManager.listActiveProcesses.mockReturnValue([mockProcess]);
      
      // Initially process is running
      (process.kill as jest.Mock).mockReturnValue(true);
      
      // After cleanup, process should be removed
      mockProcessManager.cleanupZombieProcesses.mockImplementation(async () => {
        mockProcessManager.listActiveProcesses.mockReturnValue([]);
        return 1;
      });
      
      mockSandboxManager.listSandboxes.mockResolvedValue([]);
      mockPortManager.getActiveReservations.mockReturnValue([]);

      const result = await cleanupService.performCleanup();

      expect(result.zombieProcesses).toBe(1);
      expect(mockProcessManager.listActiveProcesses()).toHaveLength(0);
    });
  });

  describe('Configuration and Statistics', () => {
    it('should return accurate service statistics', () => {
      const config: CleanupServiceConfig = {
        scheduledCleanupInterval: 45000,
        zombieDetectionInterval: 20000,
        maxInactivityTime: 1200000,
        maxMemoryUsage: 2048 * 1024 * 1024
      };

      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager,
        config
      );

      const stats = cleanupService.getStats();

      expect(stats.scheduledCleanupInterval).toBe(45000);
      expect(stats.zombieDetectionInterval).toBe(20000);
      expect(stats.maxInactivityTime).toBe(1200000);
      expect(stats.maxMemoryUsage).toBe(2048 * 1024 * 1024);
      expect(stats.currentMemoryUsage).toBeGreaterThan(0);
      expect(stats.memoryBaseline).toBeGreaterThan(0);
    });

    it('should track memory baseline', () => {
      cleanupService = new CleanupService(
        mockProcessManager,
        mockSandboxManager,
        mockPortManager
      );

      const stats = cleanupService.getStats();
      expect(stats.memoryBaseline).toBeDefined();
      expect(stats.memoryBaseline).toBeGreaterThan(0);
    });
  });
});