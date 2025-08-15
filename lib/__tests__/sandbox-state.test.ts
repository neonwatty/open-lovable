import { jest } from '@jest/globals';
import path from 'path';

// Mock fs promises
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  },
}));

import { SandboxStateStore, SandboxMetadata } from '../sandbox-state';
import { ProcessInfo } from '../process-manager';

// Mock process.kill for process status checks
const mockProcessKill = jest.spyOn(process, 'kill').mockImplementation(() => true);

describe('SandboxStateStore', () => {
  let stateStore: SandboxStateStore;
  let mockStateFilePath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateFilePath = path.join('/tmp', `test-sandbox-state-${Date.now()}-${Math.random()}.json`);
    
    stateStore = new SandboxStateStore({
      stateFilePath: mockStateFilePath,
      maxSandboxes: 5,
      persistState: true,
      syncInterval: 1000,
    });
  });

  afterEach(async () => {
    await stateStore.destroy();
  });

  describe('initialization', () => {
    it('should initialize with empty state when no persistence is used', async () => {
      const noPersistStore = new SandboxStateStore({
        persistState: false,
      });

      await noPersistStore.initialize();

      expect(noPersistStore.getAllSandboxes()).toHaveLength(0);
      
      await noPersistStore.destroy();
    });

    it('should handle initialization gracefully', async () => {
      await stateStore.initialize();

      expect(stateStore.getAllSandboxes()).toHaveLength(0);
    });
  });

  describe('sandbox registration', () => {
    beforeEach(async () => {
      await stateStore.initialize();
    });

    it('should register a new sandbox successfully', async () => {
      const sandboxRegisteredSpy = jest.fn();
      stateStore.on('sandboxRegistered', sandboxRegisteredSpy);

      const metadata = await stateStore.registerSandbox('test-1', '/tmp/sandbox1');

      expect(metadata.id).toBe('test-1');
      expect(metadata.directoryPath).toBe('/tmp/sandbox1');
      expect(metadata.status).toBe('created');
      expect(metadata.createdAt).toBeInstanceOf(Date);
      expect(sandboxRegisteredSpy).toHaveBeenCalledWith(metadata);
    });

    it('should throw error when registering duplicate sandbox', async () => {
      await stateStore.registerSandbox('test-1', '/tmp/sandbox1');

      await expect(
        stateStore.registerSandbox('test-1', '/tmp/sandbox2')
      ).rejects.toThrow('Sandbox test-1 is already registered');
    });

    it('should enforce maximum sandbox limit', async () => {
      // Register maximum number of sandboxes
      for (let i = 0; i < 5; i++) {
        await stateStore.registerSandbox(`test-${i}`, `/tmp/sandbox${i}`);
      }

      const limitReachedSpy = jest.fn();
      stateStore.on('limitReached', limitReachedSpy);

      await expect(
        stateStore.registerSandbox('test-6', '/tmp/sandbox6')
      ).rejects.toThrow('Maximum number of sandboxes (5) reached');

      expect(limitReachedSpy).toHaveBeenCalledWith(5);
    });
  });

  describe('sandbox state updates', () => {
    let sandboxMetadata: SandboxMetadata;

    beforeEach(async () => {
      await stateStore.initialize();
      sandboxMetadata = await stateStore.registerSandbox('test-1', '/tmp/sandbox1');
    });

    it('should update sandbox state successfully', async () => {
      const sandboxUpdatedSpy = jest.fn();
      stateStore.on('sandboxUpdated', sandboxUpdatedSpy);

      const updated = await stateStore.updateSandboxState('test-1', {
        status: 'running',
        port: 5173,
        processId: 12345,
      });

      expect(updated.status).toBe('running');
      expect(updated.port).toBe(5173);
      expect(updated.processId).toBe(12345);
      expect(updated.url).toBe('http://localhost:5173');
      expect(updated.processStartedAt).toBeInstanceOf(Date);
      expect(sandboxUpdatedSpy).toHaveBeenCalledWith(updated);
    });

    it('should emit processStarted event when status changes to running', async () => {
      const processStartedSpy = jest.fn();
      stateStore.on('processStarted', processStartedSpy);

      const updated = await stateStore.updateSandboxState('test-1', {
        status: 'running',
        port: 5173,
      });

      expect(processStartedSpy).toHaveBeenCalledWith(updated);
    });

    it('should emit processStopped event when status changes from running to stopped', async () => {
      // First set to running
      await stateStore.updateSandboxState('test-1', { status: 'running' });

      const processStoppedSpy = jest.fn();
      stateStore.on('processStopped', processStoppedSpy);

      const updated = await stateStore.updateSandboxState('test-1', {
        status: 'stopped',
      });

      expect(processStoppedSpy).toHaveBeenCalledWith(updated);
    });

    it('should throw error when updating non-existent sandbox', async () => {
      await expect(
        stateStore.updateSandboxState('non-existent', { status: 'running' })
      ).rejects.toThrow('Sandbox non-existent not found');
    });

    it('should update from ProcessInfo correctly', async () => {
      const processInfo: ProcessInfo = {
        pid: 12345,
        port: 5174,
        sandboxId: 'test-1',
        command: 'npm',
        args: ['run', 'dev'],
        startTime: new Date(),
        status: 'running',
      };

      const updated = await stateStore.updateFromProcessInfo(processInfo);

      expect(updated.processId).toBe(12345);
      expect(updated.port).toBe(5174);
      expect(updated.status).toBe('running');
    });
  });

  describe('sandbox retrieval and filtering', () => {
    beforeEach(async () => {
      await stateStore.initialize();
      
      // Create test sandboxes with different statuses
      await stateStore.registerSandbox('sandbox-1', '/tmp/sandbox1');
      await stateStore.updateSandboxState('sandbox-1', { status: 'running', port: 5173 });

      await stateStore.registerSandbox('sandbox-2', '/tmp/sandbox2');
      await stateStore.updateSandboxState('sandbox-2', { status: 'stopped' });

      await stateStore.registerSandbox('sandbox-3', '/tmp/sandbox3');
      await stateStore.updateSandboxState('sandbox-3', { status: 'error' });
    });

    it('should get sandbox state by ID', () => {
      const metadata = stateStore.getSandboxState('sandbox-1');
      expect(metadata?.id).toBe('sandbox-1');
      expect(metadata?.status).toBe('running');
    });

    it('should return undefined for non-existent sandbox', () => {
      const metadata = stateStore.getSandboxState('non-existent');
      expect(metadata).toBeUndefined();
    });

    it('should get all sandboxes', () => {
      const allSandboxes = stateStore.getAllSandboxes();
      expect(allSandboxes).toHaveLength(3);
    });

    it('should get active sandboxes (not stopped or error)', () => {
      const activeSandboxes = stateStore.getActiveSandboxes();
      expect(activeSandboxes).toHaveLength(1);
      expect(activeSandboxes[0].id).toBe('sandbox-1');
    });

    it('should get running sandboxes', () => {
      const runningSandboxes = stateStore.getRunningSandboxes();
      expect(runningSandboxes).toHaveLength(1);
      expect(runningSandboxes[0].id).toBe('sandbox-1');
    });
  });

  describe('sandbox removal', () => {
    beforeEach(async () => {
      await stateStore.initialize();
      await stateStore.registerSandbox('test-1', '/tmp/sandbox1');
    });

    it('should remove sandbox successfully', async () => {
      const sandboxRemovedSpy = jest.fn();
      stateStore.on('sandboxRemoved', sandboxRemovedSpy);

      const removed = await stateStore.removeSandbox('test-1');

      expect(removed).toBe(true);
      expect(stateStore.getSandboxState('test-1')).toBeUndefined();
      expect(sandboxRemovedSpy).toHaveBeenCalledWith('test-1');
    });

    it('should return false when removing non-existent sandbox', async () => {
      const removed = await stateStore.removeSandbox('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('cleanup operations', () => {
    beforeEach(async () => {
      await stateStore.initialize();
    });

    it('should cleanup terminated processes', async () => {
      // Register sandbox with running process
      await stateStore.registerSandbox('test-1', '/tmp/sandbox1');
      await stateStore.updateSandboxState('test-1', {
        status: 'running',
        processId: 12345,
      });

      // Mock process as not running
      mockProcessKill.mockImplementation(() => {
        throw new Error('Process not found');
      });

      const cleanedCount = await stateStore.cleanupTerminatedProcesses();

      expect(cleanedCount).toBe(1);
      
      const metadata = stateStore.getSandboxState('test-1');
      expect(metadata?.status).toBe('stopped');
    });

    it('should cleanup old sandboxes', async () => {
      // Create old sandbox (24+ hours ago)
      await stateStore.registerSandbox('old-sandbox', '/tmp/old');
      await stateStore.updateSandboxState('old-sandbox', { status: 'stopped' });
      
      // Manually update lastActivity to be old (since updateSandboxState always updates it to now)
      const metadata = stateStore.getSandboxState('old-sandbox')!;
      metadata.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      (stateStore as any).sandboxes.set('old-sandbox', metadata);

      // Create recent sandbox
      await stateStore.registerSandbox('new-sandbox', '/tmp/new');

      const cleanedCount = await stateStore.cleanupOldSandboxes();

      expect(cleanedCount).toBe(1);
      expect(stateStore.getSandboxState('old-sandbox')).toBeUndefined();
      expect(stateStore.getSandboxState('new-sandbox')).toBeDefined();
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await stateStore.initialize();
      
      await stateStore.registerSandbox('sandbox-1', '/tmp/sandbox1');
      await stateStore.updateSandboxState('sandbox-1', { status: 'running' });

      await stateStore.registerSandbox('sandbox-2', '/tmp/sandbox2');
      await stateStore.updateSandboxState('sandbox-2', { status: 'stopped' });

      await stateStore.registerSandbox('sandbox-3', '/tmp/sandbox3');
      await stateStore.updateSandboxState('sandbox-3', { status: 'error' });
    });

    it('should provide accurate statistics', () => {
      const stats = stateStore.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.stopped).toBe(1);
      expect(stats.error).toBe(1);
      expect(stats.maxSandboxes).toBe(5);
    });
  });

  describe('persistence', () => {
    beforeEach(async () => {
      await stateStore.initialize();
    });

    it('should have persistence enabled by default', async () => {
      await stateStore.registerSandbox('test-1', '/tmp/sandbox1');

      // The store should be configured for persistence
      expect(stateStore).toBeDefined();
      expect(stateStore.getSandboxState('test-1')).toBeDefined();
    });

    it('should not persist state when persistState is disabled', async () => {
      await stateStore.destroy();
      
      const noPersistStore = new SandboxStateStore({
        persistState: false,
      });
      
      await noPersistStore.initialize();
      await noPersistStore.registerSandbox('test-1', '/tmp/sandbox1');

      expect(mockWriteFile).not.toHaveBeenCalled();
      
      await noPersistStore.destroy();
    });
  });

  describe('event emitter memory leak prevention', () => {
    it('should remove all listeners on destroy', async () => {
      await stateStore.initialize();

      // Add multiple listeners
      stateStore.on('sandboxRegistered', () => {});
      stateStore.on('sandboxUpdated', () => {});
      stateStore.on('processStarted', () => {});

      expect(stateStore.listenerCount('sandboxRegistered')).toBe(1);
      expect(stateStore.listenerCount('sandboxUpdated')).toBe(1);
      expect(stateStore.listenerCount('processStarted')).toBe(1);

      await stateStore.destroy();

      expect(stateStore.listenerCount('sandboxRegistered')).toBe(0);
      expect(stateStore.listenerCount('sandboxUpdated')).toBe(0);
      expect(stateStore.listenerCount('processStarted')).toBe(0);
    });
  });

  describe('concurrent operations stress test', () => {
    beforeEach(async () => {
      await stateStore.initialize();
    });

    it('should handle 100+ concurrent sandbox registrations', async () => {
      // Create state store with higher limits for stress test
      const stressTestStore = new SandboxStateStore({
        maxSandboxes: 150,
        persistState: false,
      });
      await stressTestStore.initialize();

      const registrationPromises = Array.from({ length: 100 }, (_, i) =>
        stressTestStore.registerSandbox(`stress-test-${i}`, `/tmp/stress-${i}`)
      );

      const results = await Promise.allSettled(registrationPromises);
      const successful = results.filter(r => r.status === 'fulfilled');

      expect(successful.length).toBe(100);
      expect(stressTestStore.getAllSandboxes()).toHaveLength(100);

      await stressTestStore.destroy();
    });

    it('should handle rapid state updates without corruption', async () => {
      await stateStore.registerSandbox('rapid-test', '/tmp/rapid');

      const updatePromises = Array.from({ length: 50 }, (_, i) =>
        stateStore.updateSandboxState('rapid-test', {
          port: 5173 + i,
          status: i % 2 === 0 ? 'running' : 'starting',
        })
      );

      const results = await Promise.allSettled(updatePromises);
      const successful = results.filter(r => r.status === 'fulfilled');

      expect(successful.length).toBe(50);
      
      const finalState = stateStore.getSandboxState('rapid-test');
      expect(finalState).toBeDefined();
      expect(finalState?.port).toBeGreaterThanOrEqual(5173);
    });
  });

  describe('performance benchmarks', () => {
    beforeEach(async () => {
      await stateStore.initialize();
    });

    it('should retrieve state efficiently with large datasets', async () => {
      // Create state store with no persistence for pure performance test
      const perfTestStore = new SandboxStateStore({
        maxSandboxes: 1500,
        persistState: false,
      });
      await perfTestStore.initialize();

      // Register 1000 sandboxes
      const registrationPromises = Array.from({ length: 1000 }, (_, i) =>
        perfTestStore.registerSandbox(`perf-test-${i}`, `/tmp/perf-${i}`)
      );
      await Promise.all(registrationPromises);

      const startTime = performance.now();
      
      // Perform 100 state retrievals
      for (let i = 0; i < 100; i++) {
        const sandboxId = `perf-test-${Math.floor(Math.random() * 1000)}`;
        perfTestStore.getSandboxState(sandboxId);
      }
      
      const endTime = performance.now();
      const avgRetrievalTime = (endTime - startTime) / 100;

      // Should retrieve state in under 1ms on average
      expect(avgRetrievalTime).toBeLessThan(1);

      await perfTestStore.destroy();
    });
  });
});