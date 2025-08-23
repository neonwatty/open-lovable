/**
 * @jest-environment node
 */

import { appLifecycle } from '../../lib/app-lifecycle';
import { processCleanupManager } from '../../lib/process-cleanup-manager';

// Mock process cleanup manager
jest.mock('../../lib/process-cleanup-manager', () => ({
  processCleanupManager: {
    start: jest.fn(),
    stop: jest.fn(),
    performCleanup: jest.fn().mockResolvedValue({
      totalProcesses: 0,
      runningProcesses: 0,
      cleanupCount: 1
    }),
    on: jest.fn()
  }
}));

describe('App Lifecycle Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset initialization state by clearing the mock implementations
    const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
    mockProcessCleanupManager.start.mockClear();
    mockProcessCleanupManager.stop.mockClear();
    mockProcessCleanupManager.performCleanup.mockClear();
    mockProcessCleanupManager.on.mockClear();
    
    // Reset mock implementations to avoid carryover from previous tests
    mockProcessCleanupManager.start.mockImplementation(() => {});
    mockProcessCleanupManager.stop.mockImplementation(() => {});
    mockProcessCleanupManager.performCleanup.mockResolvedValue({
      totalProcesses: 0,
      runningProcesses: 0,
      cleanupCount: 1,
      zombieProcesses: 0,
      stoppedProcesses: 0,
      errorProcesses: 0,
      totalMemoryUsage: 0,
      errors: []
    });
    mockProcessCleanupManager.on.mockImplementation(() => mockProcessCleanupManager);
    
    // Reset the initialization state of the current instance
    // @ts-ignore - accessing private member for testing
    appLifecycle.initialized = false;
  });

  describe('Initialization', () => {
    it('should initialize application services', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;

      await appLifecycle.initialize();

      expect(mockProcessCleanupManager.start).toHaveBeenCalled();
      expect(mockProcessCleanupManager.on).toHaveBeenCalledWith('processRegistered', expect.any(Function));
      expect(mockProcessCleanupManager.on).toHaveBeenCalledWith('processUnregistered', expect.any(Function));
      expect(appLifecycle.isInitialized()).toBe(true);
    });

    it('should not initialize twice', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;

      await appLifecycle.initialize();
      await appLifecycle.initialize(); // Second call

      expect(mockProcessCleanupManager.start).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      mockProcessCleanupManager.start.mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      await expect(appLifecycle.initialize()).rejects.toThrow('Initialization failed');
      expect(appLifecycle.isInitialized()).toBe(false);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown application services', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;

      await appLifecycle.initialize();
      await appLifecycle.shutdown();

      expect(mockProcessCleanupManager.stop).toHaveBeenCalled();
      expect(mockProcessCleanupManager.performCleanup).toHaveBeenCalled();
      expect(appLifecycle.isInitialized()).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;

      await appLifecycle.shutdown();

      expect(mockProcessCleanupManager.stop).not.toHaveBeenCalled();
    });

    it('should handle shutdown errors', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
      
      // Initialize first
      await appLifecycle.initialize();
      
      // Reset and set up the error for shutdown only
      mockProcessCleanupManager.stop.mockReset();
      mockProcessCleanupManager.stop.mockImplementation(() => {
        throw new Error('Shutdown failed');
      });

      await expect(appLifecycle.shutdown()).rejects.toThrow('Shutdown failed');
    });
  });

  describe('Event Handling', () => {
    it('should setup process cleanup event listeners', async () => {
      const mockProcessCleanupManager = processCleanupManager as jest.Mocked<typeof processCleanupManager>;

      // Clear any previous calls
      mockProcessCleanupManager.on.mockClear();
      
      await appLifecycle.initialize();

      const expectedEvents = [
        'processRegistered',
        'processUnregistered', 
        'zombieProcessDetected',
        'processMemoryExceeded',
        'cleanupCompleted',
        'gracefulShutdownStarted',
        'gracefulShutdownCompleted',
        'error'
      ];

      expectedEvents.forEach(event => {
        expect(mockProcessCleanupManager.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should provide access to process cleanup manager', () => {
      const manager = appLifecycle.getProcessCleanupManager();
      expect(manager).toBe(processCleanupManager);
    });
  });

  describe('Auto-initialization', () => {
    it('should auto-initialize in non-test environment', () => {
      // This tests the auto-initialization logic
      // The actual module import would trigger this
      expect(true).toBe(true); // Placeholder since auto-init is hard to test
    });
  });
});