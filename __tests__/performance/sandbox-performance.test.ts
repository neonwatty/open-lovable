import { SandboxManager } from '@/lib/sandbox-manager';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Performance testing utilities
interface PerformanceMetrics {
  duration: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
  };
  operationsPerSecond?: number;
}

class PerformanceMonitor {
  private startTime: number = 0;
  private startMemory: NodeJS.MemoryUsage = process.memoryUsage();
  private peakMemory: NodeJS.MemoryUsage = process.memoryUsage();

  start(): void {
    // Force garbage collection if available (requires --expose-gc flag)
    if (global.gc) {
      global.gc();
    }
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage();
    this.peakMemory = { ...this.startMemory };
  }

  updatePeak(): void {
    const current = process.memoryUsage();
    if (this.peakMemory && current.heapUsed > this.peakMemory.heapUsed) {
      this.peakMemory = current;
    }
  }

  end(): PerformanceMetrics {
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    return {
      duration: endTime - this.startTime,
      memoryUsage: {
        before: this.startMemory,
        after: endMemory,
        peak: this.peakMemory
      }
    };
  }
}

describe('SandboxManager Performance Tests', () => {
  let tempDir: string;
  let manager: SandboxManager;
  let monitor: PerformanceMonitor;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-perf-test-'));
    manager = new SandboxManager({
      sandboxesDir: tempDir,
      maxSandboxes: 100,
      cleanupInterval: 60000
    });
    monitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  });

  describe('Individual Operation Performance', () => {
    it('should create sandbox within performance threshold', async () => {
      monitor.start();
      const sandbox = await manager.createSandbox();
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(1000); // Less than 1 second
      expect(sandbox.id).toBeDefined();
      
      // Memory usage should be reasonable
      const memoryDelta = metrics.memoryUsage.after.heapUsed - metrics.memoryUsage.before.heapUsed;
      expect(memoryDelta).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });

    it('should delete sandbox efficiently', async () => {
      // Create sandbox first
      const sandbox = await manager.createSandbox();
      
      // Add some content to make deletion more realistic
      const testFile = path.join(sandbox.path, 'large-file.txt');
      await fs.writeFile(testFile, 'x'.repeat(1024 * 1024), 'utf8'); // 1MB file

      monitor.start();
      await manager.deleteSandbox(sandbox.id);
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(500); // Less than 500ms
      
      // Verify deletion actually happened
      await expect(fs.access(sandbox.path)).rejects.toThrow();
    });

    it('should list sandboxes quickly even with many sandboxes', async () => {
      // Create multiple sandboxes
      const sandboxCount = 20;
      for (let i = 0; i < sandboxCount; i++) {
        await manager.createSandbox();
      }

      monitor.start();
      const sandboxes = await manager.listSandboxes();
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(1000); // Less than 1 second
      expect(sandboxes).toHaveLength(sandboxCount);
    });

    it('should get sandbox info quickly', async () => {
      const sandbox = await manager.createSandbox();

      monitor.start();
      const info = await manager.getSandboxInfo(sandbox.id);
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(100); // Less than 100ms
      expect(info).not.toBeNull();
      expect(info?.id).toBe(sandbox.id);
    });

    it('should check sandbox existence efficiently', async () => {
      const sandbox = await manager.createSandbox();

      monitor.start();
      const exists = await manager.sandboxExists(sandbox.id);
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(50); // Less than 50ms
      expect(exists).toBe(true);
    });
  });

  describe('Batch Operations Performance', () => {
    it('should handle batch sandbox creation efficiently', async () => {
      const batchSize = 10;
      
      monitor.start();
      const promises = Array.from({ length: batchSize }, () => manager.createSandbox());
      const sandboxes = await Promise.all(promises);
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(5000); // Less than 5 seconds for 10 sandboxes
      expect(sandboxes).toHaveLength(batchSize);
      
      // Calculate operations per second
      const opsPerSecond = (batchSize / metrics.duration) * 1000;
      expect(opsPerSecond).toBeGreaterThan(1); // At least 1 operation per second
      
      console.log(`Batch creation: ${opsPerSecond.toFixed(2)} ops/sec`);
    });

    it('should handle sequential operations without performance degradation', async () => {
      const operationCount = 15;
      const durations: number[] = [];

      for (let i = 0; i < operationCount; i++) {
        monitor.start();
        const sandbox = await manager.createSandbox();
        const metrics = monitor.end();
        
        durations.push(metrics.duration);
        
        // Immediately delete to keep sandbox count stable
        await manager.deleteSandbox(sandbox.id);
      }

      // Check that performance doesn't significantly degrade over time
      const firstHalf = durations.slice(0, Math.floor(operationCount / 2));
      const secondHalf = durations.slice(Math.floor(operationCount / 2));
      
      const avgFirstHalf = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
      
      // Second half should not be more than 100% slower than first half (performance degradation check)
      expect(avgSecondHalf).toBeLessThan(avgFirstHalf * 2.0);
      
      console.log(`Average first half: ${avgFirstHalf.toFixed(2)}ms, second half: ${avgSecondHalf.toFixed(2)}ms`);
    });

    it('should handle large batch deletion efficiently', async () => {
      const batchSize = 15;
      
      // Create sandboxes first
      const sandboxes = await Promise.all(
        Array.from({ length: batchSize }, () => manager.createSandbox())
      );

      monitor.start();
      const deletePromises = sandboxes.map(sandbox => manager.deleteSandbox(sandbox.id));
      await Promise.all(deletePromises);
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(3000); // Less than 3 seconds
      
      // Verify all were deleted
      for (const sandbox of sandboxes) {
        const exists = await manager.sandboxExists(sandbox.id);
        expect(exists).toBe(false);
      }
      
      const opsPerSecond = (batchSize / metrics.duration) * 1000;
      console.log(`Batch deletion: ${opsPerSecond.toFixed(2)} ops/sec`);
    });
  });

  describe('Cleanup Performance', () => {
    it('should cleanup large number of sandboxes efficiently', async () => {
      const sandboxCount = 25;
      
      // Create many sandboxes
      const sandboxes = await Promise.all(
        Array.from({ length: sandboxCount }, () => manager.createSandbox())
      );

      // Make them all appear old by modifying metadata
      const oldDate = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
      
      for (const sandbox of sandboxes) {
        const metadataPath = path.join(sandbox.path, '.sandbox-metadata.json');
        const metadata = {
          id: sandbox.id,
          createdAt: oldDate,
          version: '1.0.0'
        };
        await fs.writeFile(metadataPath, JSON.stringify(metadata), 'utf8');
      }

      monitor.start();
      const cleanedCount = await manager.cleanupOldSandboxes();
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(5000); // Less than 5 seconds
      expect(cleanedCount).toBe(sandboxCount);
      
      const opsPerSecond = (cleanedCount / metrics.duration) * 1000;
      console.log(`Cleanup: ${opsPerSecond.toFixed(2)} ops/sec`);
    });

    it('should handle mixed cleanup scenarios efficiently', async () => {
      // Create mix of old and new sandboxes
      const oldSandboxes = await Promise.all(
        Array.from({ length: 10 }, () => manager.createSandbox())
      );
      
      const newSandboxes = await Promise.all(
        Array.from({ length: 5 }, () => manager.createSandbox())
      );

      // Make only some appear old
      const oldDate = new Date(Date.now() - 120000).toISOString();
      
      for (const sandbox of oldSandboxes) {
        const metadataPath = path.join(sandbox.path, '.sandbox-metadata.json');
        const metadata = {
          id: sandbox.id,
          createdAt: oldDate,
          version: '1.0.0'
        };
        await fs.writeFile(metadataPath, JSON.stringify(metadata), 'utf8');
      }

      monitor.start();
      const cleanedCount = await manager.cleanupOldSandboxes();
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(3000); // Less than 3 seconds
      expect(cleanedCount).toBe(10); // Only old ones cleaned
      
      // Verify new sandboxes still exist
      for (const sandbox of newSandboxes) {
        const exists = await manager.sandboxExists(sandbox.id);
        expect(exists).toBe(true);
      }
    });
  });

  describe('Memory Usage Performance', () => {
    it('should maintain reasonable memory usage during operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many operations
      for (let i = 0; i < 10; i++) {
        const sandbox = await manager.createSandbox();
        await manager.getSandboxInfo(sandbox.id);
        await manager.listSandboxes();
        await manager.deleteSandbox(sandbox.id);
        
        // Update peak memory tracking
        monitor.updatePeak();
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory growth should be minimal (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
      
      console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should not have memory leaks during repeated operations', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const memoryReadings: number[] = [];
      
      for (let cycle = 0; cycle < 5; cycle++) {
        // Perform a set of operations
        for (let i = 0; i < 5; i++) {
          const sandbox = await manager.createSandbox();
          await manager.deleteSandbox(sandbox.id);
        }
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        memoryReadings.push(process.memoryUsage().heapUsed);
      }
      
      // Memory should not continuously grow
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const memoryIncrease = lastReading - firstReading;
      
      // Allow for some memory increase but not excessive
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024); // Less than 20MB increase
      
      console.log(`Memory readings: ${memoryReadings.map(r => (r / 1024 / 1024).toFixed(2)).join(', ')}MB`);
    });
  });

  describe('Concurrent Access Performance', () => {
    it('should handle concurrent read operations efficiently', async () => {
      // Create some sandboxes first
      const sandboxes = await Promise.all(
        Array.from({ length: 5 }, () => manager.createSandbox())
      );

      monitor.start();
      
      // Simulate concurrent read operations
      const readOperations = [
        ...Array.from({ length: 10 }, () => manager.listSandboxes()),
        ...sandboxes.map(s => manager.getSandboxInfo(s.id)),
        ...sandboxes.map(s => manager.sandboxExists(s.id)),
        manager.getStats()
      ];
      
      await Promise.all(readOperations);
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(2000); // Less than 2 seconds
      
      const totalOps = readOperations.length;
      const opsPerSecond = (totalOps / metrics.duration) * 1000;
      console.log(`Concurrent reads: ${opsPerSecond.toFixed(2)} ops/sec`);
    });

    it('should handle mixed concurrent operations', async () => {
      monitor.start();
      
      // Mix of create, read, and delete operations
      const operations = [
        manager.createSandbox(),
        manager.createSandbox(),
        manager.listSandboxes(),
        manager.getStats(),
        manager.createSandbox()
      ];
      
      const results = await Promise.all(operations);
      
      // Delete the created sandboxes
      const createdSandboxes = results.filter(r => r && 'id' in r) as any[];
      await Promise.all(createdSandboxes.map(s => manager.deleteSandbox(s.id)));
      
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(3000); // Less than 3 seconds
      expect(createdSandboxes).toHaveLength(3); // 3 create operations
    });
  });

  describe('Stress Testing', () => {
    it('should handle high-frequency operations without degradation', async () => {
      const operationsPerRound = 5;
      const rounds = 3;
      const roundDurations: number[] = [];

      for (let round = 0; round < rounds; round++) {
        monitor.start();
        
        // Rapid fire operations
        for (let i = 0; i < operationsPerRound; i++) {
          const sandbox = await manager.createSandbox();
          await manager.sandboxExists(sandbox.id);
          await manager.getSandboxInfo(sandbox.id);
          await manager.deleteSandbox(sandbox.id);
        }
        
        const metrics = monitor.end();
        roundDurations.push(metrics.duration);
      }

      // Performance should remain consistent across rounds
      const avgDuration = roundDurations.reduce((a, b) => a + b) / roundDurations.length;
      
      for (const duration of roundDurations) {
        // No round should be more than 100% slower than average (more lenient for CI)
        expect(duration).toBeLessThan(avgDuration * 2);
      }
      
      console.log(`Round durations: ${roundDurations.map(d => d.toFixed(2)).join(', ')}ms`);
    });

    it('should maintain performance with filesystem stress', async () => {
      // Create sandboxes with large files
      const sandboxes = [];
      
      monitor.start();
      
      for (let i = 0; i < 5; i++) {
        const sandbox = await manager.createSandbox();
        sandboxes.push(sandbox);
        
        // Create large files to stress filesystem
        const largeFile = path.join(sandbox.path, `large-file-${i}.txt`);
        await fs.writeFile(largeFile, 'x'.repeat(1024 * 512), 'utf8'); // 512KB file
        
        // Create nested directory structure
        const nestedDir = path.join(sandbox.path, 'nested', 'deep', 'structure');
        await fs.mkdir(nestedDir, { recursive: true });
      }
      
      // Perform operations on stressed filesystem
      await manager.listSandboxes();
      await manager.getStats();
      
      // Cleanup
      for (const sandbox of sandboxes) {
        await manager.deleteSandbox(sandbox.id);
      }
      
      const metrics = monitor.end();

      expect(metrics.duration).toBeLessThan(10000); // Less than 10 seconds
      
      console.log(`Filesystem stress test: ${metrics.duration.toFixed(2)}ms`);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet baseline performance requirements', async () => {
      const benchmarks = {
        createSandbox: 1000, // max 1000ms
        deleteSandbox: 500,  // max 500ms
        listSandboxes: 1000, // max 1000ms (for 20 sandboxes)
        getSandboxInfo: 100, // max 100ms
        sandboxExists: 50,   // max 50ms
        cleanup: 5000        // max 5000ms (for 20 sandboxes)
      };

      // Setup: create some sandboxes for list/info operations
      const setupSandboxes = await Promise.all(
        Array.from({ length: 20 }, () => manager.createSandbox())
      );

      // Test createSandbox
      monitor.start();
      const newSandbox = await manager.createSandbox();
      const createMetrics = monitor.end();
      expect(createMetrics.duration).toBeLessThan(benchmarks.createSandbox);

      // Test deleteSandbox
      monitor.start();
      await manager.deleteSandbox(newSandbox.id);
      const deleteMetrics = monitor.end();
      expect(deleteMetrics.duration).toBeLessThan(benchmarks.deleteSandbox);

      // Test listSandboxes
      monitor.start();
      await manager.listSandboxes();
      const listMetrics = monitor.end();
      expect(listMetrics.duration).toBeLessThan(benchmarks.listSandboxes);

      // Test getSandboxInfo
      monitor.start();
      await manager.getSandboxInfo(setupSandboxes[0].id);
      const infoMetrics = monitor.end();
      expect(infoMetrics.duration).toBeLessThan(benchmarks.getSandboxInfo);

      // Test sandboxExists
      monitor.start();
      await manager.sandboxExists(setupSandboxes[0].id);
      const existsMetrics = monitor.end();
      expect(existsMetrics.duration).toBeLessThan(benchmarks.sandboxExists);

      // Test cleanup (make all sandboxes appear old first)
      const oldDate = new Date(Date.now() - 120000).toISOString();
      for (const sandbox of setupSandboxes) {
        const metadataPath = path.join(sandbox.path, '.sandbox-metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify({
          id: sandbox.id,
          createdAt: oldDate,
          version: '1.0.0'
        }), 'utf8');
      }

      monitor.start();
      await manager.cleanupOldSandboxes();
      const cleanupMetrics = monitor.end();
      expect(cleanupMetrics.duration).toBeLessThan(benchmarks.cleanup);

      console.log('Performance benchmarks:', {
        create: `${createMetrics.duration.toFixed(2)}ms`,
        delete: `${deleteMetrics.duration.toFixed(2)}ms`,
        list: `${listMetrics.duration.toFixed(2)}ms`,
        info: `${infoMetrics.duration.toFixed(2)}ms`,
        exists: `${existsMetrics.duration.toFixed(2)}ms`,
        cleanup: `${cleanupMetrics.duration.toFixed(2)}ms`
      });
    });
  });
});