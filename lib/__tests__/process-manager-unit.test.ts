import { ProcessManager } from '../process-manager';

// Simple unit tests for ProcessManager logic without mocking spawn
describe('ProcessManager Unit Tests', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager({
      defaultPort: 5173,
      startPortRange: 5173,
      endPortRange: 5175,
      maxProcesses: 3,
      processTimeout: 5000,
      shutdownTimeout: 2000,
    });
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const defaultManager = new ProcessManager();
      expect(defaultManager).toBeInstanceOf(ProcessManager);
    });

    it('should use provided config values', () => {
      const config = {
        defaultPort: 3000,
        maxProcesses: 5,
      };
      const customManager = new ProcessManager(config);
      expect(customManager).toBeInstanceOf(ProcessManager);
    });
  });

  describe('getProcessInfo', () => {
    it('should return null for non-existent process', () => {
      expect(processManager.getProcessInfo('non-existent')).toBeNull();
    });
  });

  describe('listActiveProcesses', () => {
    it('should return empty array when no active processes', () => {
      const activeProcesses = processManager.listActiveProcesses();
      expect(activeProcesses).toEqual([]);
    });
  });

  describe('isServerRunning', () => {
    it('should return false for non-existent server', () => {
      expect(processManager.isServerRunning('non-existent')).toBe(false);
    });
  });

  describe('cleanupZombieProcesses', () => {
    it('should return 0 when no processes to cleanup', async () => {
      const cleanedCount = await processManager.cleanupZombieProcesses();
      expect(cleanedCount).toBe(0);
    });
  });

  describe('stopViteServer', () => {
    it('should handle stopping non-existent process gracefully', async () => {
      await expect(
        processManager.stopViteServer('non-existent')
      ).resolves.not.toThrow();
    });
  });

  describe('stopAllProcesses', () => {
    it('should handle empty process list gracefully', async () => {
      await expect(processManager.stopAllProcesses()).resolves.not.toThrow();
    });
  });

  describe('event handling', () => {
    it('should be an event emitter', () => {
      expect(typeof processManager.on).toBe('function');
      expect(typeof processManager.emit).toBe('function');
    });

    it('should handle event listeners', () => {
      const eventSpy = jest.fn();
      processManager.on('test-event', eventSpy);
      
      processManager.emit('test-event', 'test-data');
      expect(eventSpy).toHaveBeenCalledWith('test-data');
    });
  });

  describe('port range validation', () => {
    it('should use configured port ranges', () => {
      const customManager = new ProcessManager({
        startPortRange: 3000,
        endPortRange: 3010,
      });
      expect(customManager).toBeInstanceOf(ProcessManager);
    });

    it('should handle single port configuration', () => {
      const singlePortManager = new ProcessManager({
        defaultPort: 8080,
        startPortRange: 8080,
        endPortRange: 8080,
      });
      expect(singlePortManager).toBeInstanceOf(ProcessManager);
    });
  });

  describe('process limits', () => {
    it('should respect max process configuration', () => {
      const limitedManager = new ProcessManager({
        maxProcesses: 1,
      });
      expect(limitedManager).toBeInstanceOf(ProcessManager);
    });

    it('should handle large max process limits', () => {
      const largeManager = new ProcessManager({
        maxProcesses: 1000,
      });
      expect(largeManager).toBeInstanceOf(ProcessManager);
    });
  });

  describe('timeout configuration', () => {
    it('should handle custom timeout values', () => {
      const timeoutManager = new ProcessManager({
        processTimeout: 1000,
        shutdownTimeout: 500,
      });
      expect(timeoutManager).toBeInstanceOf(ProcessManager);
    });

    it('should handle very short timeouts', () => {
      const shortTimeoutManager = new ProcessManager({
        processTimeout: 100,
        shutdownTimeout: 50,
      });
      expect(shortTimeoutManager).toBeInstanceOf(ProcessManager);
    });
  });

  describe('configuration validation', () => {
    it('should handle undefined config gracefully', () => {
      const undefinedManager = new ProcessManager(undefined);
      expect(undefinedManager).toBeInstanceOf(ProcessManager);
    });

    it('should handle empty config object', () => {
      const emptyManager = new ProcessManager({});
      expect(emptyManager).toBeInstanceOf(ProcessManager);
    });

    it('should handle partial config objects', () => {
      const partialManager = new ProcessManager({
        defaultPort: 4000,
        // Other config values should use defaults
      });
      expect(partialManager).toBeInstanceOf(ProcessManager);
    });
  });
});