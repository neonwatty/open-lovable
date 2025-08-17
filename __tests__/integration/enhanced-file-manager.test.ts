import { createEnhancedFileManager, EnhancedFileManager } from '../../lib/security/enhanced-file-manager';
import { FileManager } from '../../lib/file-manager';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('EnhancedFileManager Integration', () => {
  let tempDir: string;
  let fileManager: EnhancedFileManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enhanced-fm-test-'));
    fileManager = createEnhancedFileManager({
      sandboxDir: tempDir,
      maxFileSize: 1024 * 1024 // 1MB for testing
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('Security Enhancement', () => {
    it('should prevent path traversal attacks that basic FileManager might allow', async () => {
      const result = await fileManager.writeFile('../escape.txt', 'malicious content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
      
      // Verify file was not created outside sandbox
      const outsideFile = path.join(path.dirname(tempDir), 'escape.txt');
      const exists = await fs.access(outsideFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should block absolute path attempts', async () => {
      const result = await fileManager.writeFile('/tmp/absolute.txt', 'content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('should prevent Windows path attacks on Unix systems', async () => {
      const result = await fileManager.writeFile('C:\\Windows\\System32\\attack.txt', 'content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('should reject dangerous file extensions', async () => {
      const result = await fileManager.writeFile('malware.exe', 'malicious executable');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('extension');
    });

    it('should enforce file size limits', async () => {
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const result = await fileManager.writeFile('large.txt', largeContent);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('size');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain FileManager interface for valid operations', async () => {
      // Test write
      const writeResult = await fileManager.writeFile('valid.txt', 'test content');
      expect(writeResult.success).toBe(true);
      expect(writeResult.operation).toBe('created');
      
      // Test read
      const content = await fileManager.readFile('valid.txt');
      expect(content).toBe('test content');
      
      // Test exists
      const exists = await fileManager.fileExists('valid.txt');
      expect(exists).toBe(true);
      
      // Test delete
      const deleted = await fileManager.deleteFile('valid.txt');
      expect(deleted).toBe(true);
      
      // Test exists after delete
      const existsAfterDelete = await fileManager.fileExists('valid.txt');
      expect(existsAfterDelete).toBe(false);
    });

    it('should support nested directory creation', async () => {
      const result = await fileManager.writeFile('nested/deep/file.txt', 'nested content');
      
      expect(result.success).toBe(true);
      
      const content = await fileManager.readFile('nested/deep/file.txt');
      expect(content).toBe('nested content');
    });

    it('should handle file updates correctly', async () => {
      // Create initial file
      const createResult = await fileManager.writeFile('update.txt', 'initial');
      expect(createResult.success).toBe(true);
      expect(createResult.operation).toBe('created');
      
      // Update file
      const updateResult = await fileManager.writeFile('update.txt', 'updated');
      expect(updateResult.success).toBe(true);
      expect(updateResult.operation).toBe('updated');
      
      const content = await fileManager.readFile('update.txt');
      expect(content).toBe('updated');
    });

    it('should list files correctly', async () => {
      // Create test files
      await fileManager.writeFile('file1.txt', 'content1');
      await fileManager.writeFile('file2.js', 'content2');
      await fs.mkdir(path.join(tempDir, 'subdir'));
      await fileManager.writeFile('subdir/nested.txt', 'nested');
      
      const files = await fileManager.listFiles();
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.js');
      expect(files).not.toContain('subdir'); // Should not include directories
      
      const subFiles = await fileManager.listFiles('subdir');
      expect(subFiles).toContain('subdir/nested.txt');
    });
  });

  describe('Security Audit Features', () => {
    it('should track security violations', async () => {
      // Trigger some violations
      await fileManager.writeFile('../attack1.txt', 'content');
      await fileManager.writeFile('/etc/attack2.txt', 'content');
      await fileManager.writeFile('malware.exe', 'content');
      
      const stats = fileManager.getSecurityStats();
      expect(stats.violations.totalViolations).toBe(3);
      expect(stats.violations.violationsByType.path_traversal).toBe(2);
      expect(stats.violations.violationsByType.extension_blocked).toBe(1);
    });

    it('should provide operation statistics', async () => {
      await fileManager.writeFile('test1.txt', 'content');
      await fileManager.writeFile('test2.txt', 'content');
      
      const stats = fileManager.getSecurityStats();
      expect(stats.operations.activeOperations).toBeGreaterThanOrEqual(0);
      expect(stats.operations.maxConcurrentOps).toBeGreaterThan(0);
    });

    it('should validate paths without performing operations', async () => {
      const validResult = await fileManager.validatePath('valid.txt');
      expect(validResult.isValid).toBe(true);
      expect(validResult.resolvedPath).toBeDefined();
      
      const invalidResult = await fileManager.validatePath('../invalid.txt');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.error).toContain('traversal');
    });
  });

  describe('Atomic Operations', () => {
    it('should perform atomic writes', async () => {
      const content = 'atomic write test';
      const result = await fileManager.writeFile('atomic.txt', content);
      
      expect(result.success).toBe(true);
      
      // Check that no temporary files remain
      const files = await fs.readdir(tempDir);
      const tempFiles = files.filter(file => file.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
      
      // Verify content
      const readContent = await fileManager.readFile('atomic.txt');
      expect(readContent).toBe(content);
    });

    it('should handle concurrent operations safely', async () => {
      const operations = [];
      
      // Start multiple write operations concurrently
      for (let i = 0; i < 10; i++) {
        operations.push(fileManager.writeFile(`concurrent-${i}.txt`, `content ${i}`));
      }
      
      const results = await Promise.all(operations);
      
      // All operations should succeed
      for (const result of results) {
        expect(result.success).toBe(true);
      }
      
      // Verify all files were written correctly
      for (let i = 0; i < 10; i++) {
        const exists = await fileManager.fileExists(`concurrent-${i}.txt`);
        expect(exists).toBe(true);
        
        const content = await fileManager.readFile(`concurrent-${i}.txt`);
        expect(content).toBe(`content ${i}`);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent file reads gracefully', async () => {
      await expect(fileManager.readFile('nonexistent.txt')).rejects.toThrow();
    });

    it('should handle invalid file paths gracefully', async () => {
      const result = await fileManager.writeFile('', 'content');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle permission errors gracefully', async () => {
      // Create a read-only directory to simulate permission errors
      const readOnlyDir = path.join(tempDir, 'readonly');
      await fs.mkdir(readOnlyDir);
      await fs.chmod(readOnlyDir, 0o444); // Read-only
      
      const result = await fileManager.writeFile('readonly/file.txt', 'content');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      
      // Restore permissions for cleanup
      await fs.chmod(readOnlyDir, 0o755);
    });
  });

  describe('Backup and Recovery', () => {
    it('should clean up old backups', async () => {
      // Create some files to trigger backup creation
      await fileManager.writeFile('backup-test.txt', 'initial');
      await fileManager.writeFile('backup-test.txt', 'updated'); // Should create backup
      
      const cleanedCount = await fileManager.cleanupBackups(0); // Clean all backups
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should handle different path separators', async () => {
      const windowsStyle = 'folder\\subfolder\\file.txt';
      const unixStyle = 'folder/subfolder/file.txt';
      
      const windowsResult = await fileManager.writeFile(windowsStyle, 'windows content');
      const unixResult = await fileManager.writeFile(unixStyle, 'unix content');
      
      expect(windowsResult.success).toBe(true);
      expect(unixResult.success).toBe(true);
    });

    it('should normalize different path formats consistently', async () => {
      const paths = [
        'normal/path.txt',
        'normal//double//slash.txt',
        'normal/./dot/path.txt',
        'normal\\backslash\\path.txt'
      ];
      
      for (const testPath of paths) {
        const result = await fileManager.writeFile(testPath, 'content');
        expect(result.success).toBe(true);
      }
    });
  });
});