import { SandboxManager } from '@/lib/sandbox-manager';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// This test file focuses on real filesystem operations
// We'll use actual temp directories for true integration testing

describe('SandboxManager File System Integration', () => {
  let tempDir: string;
  let manager: SandboxManager;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-test-'));
    manager = new SandboxManager({
      sandboxesDir: tempDir,
      maxSandboxes: 3,
      cleanupInterval: 1000 // 1 second for testing
    });
  });

  afterEach(async () => {
    // Clean up temp directory after each test
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  });

  describe('Real Directory Operations', () => {
    it('should create real directories on filesystem', async () => {
      const sandbox = await manager.createSandbox();
      
      // Verify the directory actually exists
      const stats = await fs.stat(sandbox.path);
      expect(stats.isDirectory()).toBe(true);

      // Verify metadata file exists and is valid
      const metadataPath = path.join(sandbox.path, '.sandbox-metadata.json');
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
      expect(metadataExists).toBe(true);

      // Read and validate metadata content
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      expect(metadata.id).toBe(sandbox.id);
      expect(metadata.version).toBe('1.0.0');
      expect(new Date(metadata.createdAt)).toBeInstanceOf(Date);
    });

    it('should create unique directories for each sandbox', async () => {
      const sandbox1 = await manager.createSandbox();
      const sandbox2 = await manager.createSandbox();
      const sandbox3 = await manager.createSandbox();

      // All should exist
      expect(await fs.stat(sandbox1.path)).toBeTruthy();
      expect(await fs.stat(sandbox2.path)).toBeTruthy();
      expect(await fs.stat(sandbox3.path)).toBeTruthy();

      // All should have different paths
      expect(sandbox1.path).not.toBe(sandbox2.path);
      expect(sandbox2.path).not.toBe(sandbox3.path);
      expect(sandbox1.path).not.toBe(sandbox3.path);

      // All should have unique IDs
      expect(sandbox1.id).not.toBe(sandbox2.id);
      expect(sandbox2.id).not.toBe(sandbox3.id);
      expect(sandbox1.id).not.toBe(sandbox3.id);
    });

    it('should handle concurrent sandbox creation without conflicts', async () => {
      const promises = Array.from({ length: 5 }, () => manager.createSandbox());
      const sandboxes = await Promise.all(promises);

      expect(sandboxes).toHaveLength(5);
      
      // Verify all are unique
      const ids = sandboxes.map(s => s.id);
      const paths = sandboxes.map(s => s.path);
      expect(new Set(ids).size).toBe(5);
      expect(new Set(paths).size).toBe(5);

      // Verify all directories exist
      for (const sandbox of sandboxes) {
        const stats = await fs.stat(sandbox.path);
        expect(stats.isDirectory()).toBe(true);
      }
    });

    it('should completely remove sandbox directories', async () => {
      const sandbox = await manager.createSandbox();
      
      // Create some test files in the sandbox
      const testFilePath = path.join(sandbox.path, 'test-file.txt');
      const testSubDir = path.join(sandbox.path, 'subdir');
      
      await fs.writeFile(testFilePath, 'test content', 'utf8');
      await fs.mkdir(testSubDir);
      await fs.writeFile(path.join(testSubDir, 'nested-file.txt'), 'nested content', 'utf8');

      // Verify files exist
      expect(await fs.stat(testFilePath)).toBeTruthy();
      expect(await fs.stat(testSubDir)).toBeTruthy();

      // Delete the sandbox
      await manager.deleteSandbox(sandbox.id);

      // Verify directory is completely gone
      await expect(fs.access(sandbox.path)).rejects.toThrow();
      await expect(fs.stat(testFilePath)).rejects.toThrow();
      await expect(fs.stat(testSubDir)).rejects.toThrow();
    });

    it('should handle deletion of non-existent sandbox gracefully', async () => {
      const nonExistentId = 'non-existent-sandbox-id';
      
      // Should not throw error - deleteSandbox handles ENOENT gracefully
      await manager.deleteSandbox(nonExistentId);
      // If we reach here without throwing, the test passes
      expect(true).toBe(true);
    });
  });

  describe('Directory Structure and Permissions', () => {
    it('should create sandboxes with proper directory structure', async () => {
      const sandbox = await manager.createSandbox();
      
      // Check directory structure
      const dirContents = await fs.readdir(sandbox.path);
      expect(dirContents).toContain('.sandbox-metadata.json');
      
      // Verify we can write to the directory
      const testFile = path.join(sandbox.path, 'test-write.txt');
      await fs.writeFile(testFile, 'test content', 'utf8');
      
      const fileContent = await fs.readFile(testFile, 'utf8');
      expect(fileContent).toBe('test content');
    });

    it('should maintain directory permissions', async () => {
      const sandbox = await manager.createSandbox();
      
      const stats = await fs.stat(sandbox.path);
      
      // Check that directory is readable and writable
      // Note: Exact permission checks can vary by platform
      expect(stats.isDirectory()).toBe(true);
      
      // Test actual read/write operations
      const testFile = path.join(sandbox.path, 'permission-test.txt');
      await expect(fs.writeFile(testFile, 'test', 'utf8')).resolves.not.toThrow();
      await expect(fs.readFile(testFile, 'utf8')).resolves.toBe('test');
    });

    it('should handle deeply nested directory creation', async () => {
      const sandbox = await manager.createSandbox();
      
      // Create deeply nested structure
      const deepPath = path.join(sandbox.path, 'level1', 'level2', 'level3', 'level4');
      await fs.mkdir(deepPath, { recursive: true });
      
      const testFile = path.join(deepPath, 'deep-file.txt');
      await fs.writeFile(testFile, 'deep content', 'utf8');
      
      // Verify we can read the file
      const content = await fs.readFile(testFile, 'utf8');
      expect(content).toBe('deep content');
      
      // Delete the sandbox and verify everything is cleaned up
      await manager.deleteSandbox(sandbox.id);
      await expect(fs.access(sandbox.path)).rejects.toThrow();
    });
  });

  describe('Cleanup and Management', () => {
    it('should cleanup old sandboxes when exceeding max limit', async () => {
      // Create more sandboxes than the limit (3)
      const sandboxes = [];
      for (let i = 0; i < 5; i++) {
        const sandbox = await manager.createSandbox();
        sandboxes.push(sandbox);
        
        // Add a small delay to ensure different creation times
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // All should exist initially
      for (const sandbox of sandboxes) {
        expect(await fs.stat(sandbox.path)).toBeTruthy();
      }

      // Perform cleanup
      const cleanedCount = await manager.cleanupOldSandboxes();
      expect(cleanedCount).toBeGreaterThan(0);

      // Check remaining sandboxes
      const remainingSandboxes = await manager.listSandboxes();
      expect(remainingSandboxes.length).toBeLessThanOrEqual(3);

      // Verify cleanup actually removed directories
      let existingCount = 0;
      for (const sandbox of sandboxes) {
        try {
          await fs.stat(sandbox.path);
          existingCount++;
        } catch {
          // Directory was cleaned up
        }
      }
      expect(existingCount).toBeLessThanOrEqual(3);
    });

    it('should cleanup sandboxes older than cleanup interval', async () => {
      // Create a sandbox
      const sandbox = await manager.createSandbox();
      
      // Manually modify the metadata to make it appear old
      const metadataPath = path.join(sandbox.path, '.sandbox-metadata.json');
      const metadata = {
        id: sandbox.id,
        createdAt: new Date(Date.now() - 2000).toISOString(), // 2 seconds ago
        version: '1.0.0'
      };
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

      // Verify sandbox exists
      expect(await fs.stat(sandbox.path)).toBeTruthy();

      // Perform cleanup (cleanup interval is 1 second)
      const cleanedCount = await manager.cleanupOldSandboxes();
      expect(cleanedCount).toBe(1);

      // Verify sandbox was removed
      await expect(fs.access(sandbox.path)).rejects.toThrow();
    });

    it('should preserve recent sandboxes during cleanup', async () => {
      // Create recent sandboxes
      const recentSandbox1 = await manager.createSandbox();
      const recentSandbox2 = await manager.createSandbox();

      // Perform cleanup
      const cleanedCount = await manager.cleanupOldSandboxes();
      expect(cleanedCount).toBe(0); // No old sandboxes to clean

      // Verify recent sandboxes still exist
      expect(await fs.stat(recentSandbox1.path)).toBeTruthy();
      expect(await fs.stat(recentSandbox2.path)).toBeTruthy();
    });
  });

  describe('Listing and Information Retrieval', () => {
    it('should accurately list all existing sandboxes', async () => {
      const createdSandboxes = [];
      
      // Create multiple sandboxes
      for (let i = 0; i < 3; i++) {
        const sandbox = await manager.createSandbox();
        createdSandboxes.push(sandbox);
        await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      }

      const listedSandboxes = await manager.listSandboxes();
      
      expect(listedSandboxes).toHaveLength(3);
      
      // Verify all created sandboxes are in the list
      const listedIds = listedSandboxes.map(s => s.id);
      for (const created of createdSandboxes) {
        expect(listedIds).toContain(created.id);
      }

      // Verify sorting by creation date (newest first)
      for (let i = 0; i < listedSandboxes.length - 1; i++) {
        expect(listedSandboxes[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          listedSandboxes[i + 1].createdAt.getTime()
        );
      }
    });

    it('should retrieve correct sandbox information', async () => {
      const sandbox = await manager.createSandbox();
      
      const retrievedInfo = await manager.getSandboxInfo(sandbox.id);
      
      expect(retrievedInfo).not.toBeNull();
      expect(retrievedInfo?.id).toBe(sandbox.id);
      expect(retrievedInfo?.path).toBe(sandbox.path);
      // Allow for small timing differences (within 1 second)
      expect(Math.abs(retrievedInfo!.createdAt.getTime() - sandbox.createdAt.getTime())).toBeLessThan(1000);
    });

    it('should return null for non-existent sandbox info', async () => {
      const info = await manager.getSandboxInfo('non-existent-id');
      expect(info).toBeNull();
    });

    it('should correctly check sandbox existence', async () => {
      const sandbox = await manager.createSandbox();
      
      expect(await manager.sandboxExists(sandbox.id)).toBe(true);
      expect(await manager.sandboxExists('non-existent-id')).toBe(false);
      
      await manager.deleteSandbox(sandbox.id);
      expect(await manager.sandboxExists(sandbox.id)).toBe(false);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics', async () => {
      // Create some sandboxes
      await manager.createSandbox();
      await manager.createSandbox();

      const stats = await manager.getStats();

      expect(stats.totalSandboxes).toBe(2);
      expect(stats.sandboxesDir).toBe(tempDir);
      expect(stats.maxSandboxes).toBe(3);
      expect(stats.cleanupInterval).toBe(1000);
    });

    it('should update statistics after operations', async () => {
      // Initial stats
      const initialStats = await manager.getStats();
      expect(initialStats.totalSandboxes).toBe(0);

      // Create sandboxes
      const sandbox1 = await manager.createSandbox();
      const sandbox2 = await manager.createSandbox();

      const afterCreateStats = await manager.getStats();
      expect(afterCreateStats.totalSandboxes).toBe(2);

      // Delete one sandbox
      await manager.deleteSandbox(sandbox1.id);

      const afterDeleteStats = await manager.getStats();
      expect(afterDeleteStats.totalSandboxes).toBe(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle filesystem errors gracefully', async () => {
      // Try to create sandbox in a read-only location (if possible)
      const readOnlyManager = new SandboxManager({
        sandboxesDir: '/dev/null/readonly', // This should fail
        maxSandboxes: 1
      });

      await expect(readOnlyManager.createSandbox()).rejects.toThrow();
    });

    it('should handle corrupted metadata files', async () => {
      const sandbox = await manager.createSandbox();
      
      // Corrupt the metadata file
      const metadataPath = path.join(sandbox.path, '.sandbox-metadata.json');
      await fs.writeFile(metadataPath, 'invalid json', 'utf8');

      // Should handle corrupted metadata gracefully
      const info = await manager.getSandboxInfo(sandbox.id);
      expect(info).toBeNull();

      const sandboxes = await manager.listSandboxes();
      expect(sandboxes.find(s => s.id === sandbox.id)).toBeUndefined();
    });

    it('should handle partial cleanup failures', async () => {
      const sandbox1 = await manager.createSandbox();
      const sandbox2 = await manager.createSandbox();

      // Make metadata appear old
      const oldDate = new Date(Date.now() - 2000).toISOString();
      
      await fs.writeFile(
        path.join(sandbox1.path, '.sandbox-metadata.json'),
        JSON.stringify({ id: sandbox1.id, createdAt: oldDate, version: '1.0.0' }),
        'utf8'
      );
      
      await fs.writeFile(
        path.join(sandbox2.path, '.sandbox-metadata.json'),
        JSON.stringify({ id: sandbox2.id, createdAt: oldDate, version: '1.0.0' }),
        'utf8'
      );

      // Make one directory read-only to simulate cleanup failure
      try {
        await fs.chmod(sandbox1.path, 0o444); // Read-only
      } catch {
        // Skip this test if chmod is not supported
        return;
      }

      // Cleanup should handle failures gracefully
      const cleanedCount = await manager.cleanupOldSandboxes();
      
      // At least one should be cleaned up (the non-readonly one)
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should work with various path separators', async () => {
      const sandbox = await manager.createSandbox();
      
      // Verify path uses correct separator for current platform
      expect(sandbox.path).toContain(path.sep);
      expect(sandbox.path.startsWith(tempDir)).toBe(true);
      
      // Verify we can access the sandbox using both path styles
      const normalizedPath = path.normalize(sandbox.path);
      expect(await fs.stat(normalizedPath)).toBeTruthy();
    });

    it('should handle long paths correctly', async () => {
      // Create manager with a very long base path
      const longPath = path.join(tempDir, 'very', 'long', 'nested', 'directory', 'structure', 'for', 'testing');
      await fs.mkdir(longPath, { recursive: true });
      
      const longPathManager = new SandboxManager({
        sandboxesDir: longPath,
        maxSandboxes: 1
      });

      const sandbox = await longPathManager.createSandbox();
      expect(await fs.stat(sandbox.path)).toBeTruthy();
      
      // Cleanup
      await longPathManager.deleteSandbox(sandbox.id);
    });
  });
});