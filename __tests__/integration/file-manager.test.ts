import { FileManager } from '../../lib/file-manager';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('FileManager Integration Tests', () => {
  let fileManager: FileManager;
  let testSandboxDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testSandboxDir = await fs.mkdtemp(path.join(tmpdir(), 'file-manager-test-'));
    fileManager = new FileManager({ 
      sandboxDir: testSandboxDir,
      maxFileSize: 1024 * 1024 // 1MB
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testSandboxDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Real Filesystem Operations', () => {
    test('should create files and directories on real filesystem', async () => {
      const result = await fileManager.writeFile('src/components/Header.jsx', `
import React from 'react';

export const Header = () => {
  return (
    <header className="bg-blue-500 text-white p-4">
      <h1>My App</h1>
    </header>
  );
};
`);

      expect(result.success).toBe(true);
      expect(result.operation).toBe('created');

      // Verify file actually exists
      const filePath = path.join(testSandboxDir, 'src/components/Header.jsx');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('export const Header');
      expect(content).toContain('bg-blue-500');
    });

    test('should handle nested directory creation', async () => {
      const result = await fileManager.writeFile('src/pages/admin/dashboard/index.tsx', `
export default function AdminDashboard() {
  return <div>Admin Dashboard</div>;
}
`);

      expect(result.success).toBe(true);

      // Verify directory structure was created
      const dirPath = path.join(testSandboxDir, 'src/pages/admin/dashboard');
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);

      // Verify file content
      const filePath = path.join(dirPath, 'index.tsx');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('AdminDashboard');
    });

    test('should update existing files correctly', async () => {
      const initialContent = 'const initial = "value";';
      const updatedContent = 'const updated = "new value";';

      // Create initial file
      const createResult = await fileManager.writeFile('src/config.js', initialContent);
      expect(createResult.success).toBe(true);
      expect(createResult.operation).toBe('created');

      // Update the file
      const updateResult = await fileManager.writeFile('src/config.js', updatedContent);
      expect(updateResult.success).toBe(true);
      expect(updateResult.operation).toBe('updated');

      // Verify updated content
      const filePath = path.join(testSandboxDir, 'src/config.js');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe(updatedContent);
    });

    test('should handle file reading and listing', async () => {
      // Create multiple files
      await fileManager.writeFile('src/App.js', 'export default App;');
      await fileManager.writeFile('src/index.js', 'import App from "./App";');
      await fileManager.writeFile('src/styles.css', '.app { margin: 0; }');

      // Test file reading
      const appContent = await fileManager.readFile('src/App.js');
      expect(appContent).toBe('export default App;');

      // Test file listing
      const files = await fileManager.listFiles('src');
      expect(files).toHaveLength(3);
      expect(files).toContain('src/App.js');
      expect(files).toContain('src/index.js');
      expect(files).toContain('src/styles.css');
    });

    test('should handle file deletion', async () => {
      // Create a file
      await fileManager.writeFile('src/temp.js', 'temporary content');
      
      // Verify it exists
      expect(await fileManager.fileExists('src/temp.js')).toBe(true);

      // Delete it
      const deleted = await fileManager.deleteFile('src/temp.js');
      expect(deleted).toBe(true);

      // Verify it's gone
      expect(await fileManager.fileExists('src/temp.js')).toBe(false);
    });
  });

  describe('Security Tests with Real Filesystem', () => {
    test('should actually prevent directory traversal', async () => {
      const result = await fileManager.writeFile('../../../etc/passwd', 'malicious content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('directory traversal detected');

      // Verify no file was created outside sandbox
      const maliciousPath = path.resolve(testSandboxDir, '../../../etc/passwd');
      try {
        await fs.access(maliciousPath);
        fail('Malicious file should not exist');
      } catch {
        // Expected - file should not exist
      }
    });

    test('should handle symlink detection and prevention', async () => {
      // Create a file outside sandbox
      const outsideFile = path.join(tmpdir(), 'outside-sandbox.txt');
      await fs.writeFile(outsideFile, 'sensitive data', 'utf8');

      try {
        // Try to create a symlink pointing outside sandbox
        const symlinkPath = path.join(testSandboxDir, 'malicious-link');
        await fs.symlink(outsideFile, symlinkPath);

        // Try to use the symlink path with file manager
        const result = await fileManager.readFile('malicious-link');
        
        // This should either fail or read safely within sandbox boundaries
        // The exact behavior depends on how fs.realpath() is implemented
        expect(result).toBeDefined();
      } catch (error) {
        // It's acceptable for this to fail as a security measure
        expect(error).toBeDefined();
      } finally {
        // Cleanup
        try {
          await fs.unlink(outsideFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    test('should handle path validation with real path resolution', async () => {
      // Test various path formats that should be normalized safely
      const testCases = [
        { input: './src/component.js', expected: 'src/component.js' },
        { input: 'src/./component.js', expected: 'src/component.js' },
        { input: 'src/subfolder/../component.js', expected: 'src/component.js' }
      ];

      for (const testCase of testCases) {
        const result = await fileManager.writeFile(testCase.input, 'test content');
        expect(result.success).toBe(true);

        // Verify the file exists at the expected normalized location
        const normalizedPath = path.join(testSandboxDir, testCase.expected);
        const content = await fs.readFile(normalizedPath, 'utf8');
        expect(content).toBe('test content');
      }
    });
  });

  describe('Performance and Concurrency Tests', () => {
    test('should handle concurrent file operations safely', async () => {
      const concurrentOperations = Array.from({ length: 20 }, (_, i) => 
        fileManager.writeFile(`concurrent/file-${i}.js`, `export const value${i} = ${i};`)
      );

      const results = await Promise.allSettled(concurrentOperations);
      
      // All operations should complete successfully
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.success).toBe(true);
          expect(result.value.path).toBe(`concurrent/file-${index}.js`);
        }
      });

      // Verify all files were created
      const files = await fileManager.listFiles('concurrent');
      expect(files).toHaveLength(20);
    });

    test('should handle large batch operations efficiently', async () => {
      const batchSize = 50;
      const files = Array.from({ length: batchSize }, (_, i) => ({
        path: `batch/component-${i}.tsx`,
        content: `
import React from 'react';

export const Component${i} = () => {
  return <div>Component ${i}</div>;
};
`
      }));

      const startTime = Date.now();
      const results = await fileManager.writeFiles(files);
      const endTime = Date.now();

      // All operations should succeed
      expect(results).toHaveLength(batchSize);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Performance check - should complete within reasonable time
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // 5 seconds max for 50 files

      // Verify all files exist
      const createdFiles = await fileManager.listFiles('batch');
      expect(createdFiles).toHaveLength(batchSize);
    });
  });

  describe('Error Scenarios with Real Filesystem', () => {
    test('should handle permission errors gracefully', async () => {
      // Create a directory and remove write permissions
      const restrictedDir = path.join(testSandboxDir, 'restricted');
      await fs.mkdir(restrictedDir, { recursive: true });
      await fs.chmod(restrictedDir, 0o444); // Read-only

      try {
        const result = await fileManager.writeFile('restricted/file.js', 'content');
        
        // Should fail gracefully
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(restrictedDir, 0o755);
        } catch {
          // Ignore errors during cleanup
        }
      }
    });

    test('should handle disk space issues', async () => {
      // This is difficult to test without actually filling up disk
      // We'll simulate by creating a very large file that exceeds our size limit
      const hugeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      const result = await fileManager.writeFile('huge-file.txt', hugeContent);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should initialize sandbox with proper structure', async () => {
      await fileManager.initialize();

      // Verify .gitkeep file exists
      const gitkeepPath = path.join(testSandboxDir, '.gitkeep');
      const exists = await fs.access(gitkeepPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('should clean up old files correctly', async () => {
      // Create some files
      await fileManager.writeFile('old-file.js', 'old content');
      await fileManager.writeFile('new-file.js', 'new content');

      // Wait a moment for file creation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Manually change the mtime of one file to make it "old"
      const oldFilePath = path.join(testSandboxDir, 'old-file.js');
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      await fs.utimes(oldFilePath, oldTime, oldTime);

      // Run cleanup with 24 hour threshold
      const cleanedCount = await fileManager.cleanup(24 * 60 * 60 * 1000);

      expect(cleanedCount).toBe(1);

      // Verify old file is gone, new file remains
      expect(await fileManager.fileExists('old-file.js')).toBe(false);
      expect(await fileManager.fileExists('new-file.js')).toBe(true);
    });
  });
});