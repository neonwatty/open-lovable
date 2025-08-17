import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { PathSecurity, createPathSecurity, validateSafePath } from '../../lib/security/path-security';
import { SecureFileOperations, createSecureFileOps } from '../../lib/security/secure-file-ops';

describe('Path Traversal Protection', () => {
  let tempDir: string;
  let sandboxDir: string;
  let pathSecurity: PathSecurity;
  let secureFileOps: SecureFileOperations;

  beforeEach(async () => {
    // Create temporary sandbox directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-test-'));
    sandboxDir = path.join(tempDir, 'sandbox');
    await fs.mkdir(sandboxDir, { recursive: true });

    pathSecurity = createPathSecurity(sandboxDir, {
      enableLogging: false // Disable logging for tests
    });

    secureFileOps = createSecureFileOps(sandboxDir, {
      enableLogging: false,
      atomicWrites: true,
      backupOnUpdate: false // Disable backups for tests
    });

    // Suppress console.warn for tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Restore console.warn
    jest.restoreAllMocks();
    
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('PathSecurity', () => {
    describe('Basic Path Validation', () => {
      it('should accept valid relative paths', async () => {
        const validPaths = [
          'file.txt',
          'dir/file.txt',
          'deep/nested/path/file.js',
          'component.tsx',
          'styles/main.css'
        ];

        for (const testPath of validPaths) {
          const result = await pathSecurity.validatePath(testPath);
          expect(result.isValid).toBe(true);
          expect(result.resolvedPath).toBeDefined();
          expect(result.resolvedPath).toContain(sandboxDir);
        }
      });

      it('should reject absolute paths', async () => {
        const invalidPaths = [
          '/etc/passwd',
          '/home/user/secret.txt',
          'C:\\Windows\\System32\\config',
          '/var/log/system.log'
        ];

        for (const testPath of invalidPaths) {
          const result = await pathSecurity.validatePath(testPath);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('absolute');
          expect(result.violation?.type).toBe('path_traversal');
        }
      });

      it('should reject directory traversal attempts', async () => {
        const traversalPaths = [
          '../etc/passwd',
          '../../secret.txt',
          'dir/../../../etc/passwd',
          'normal/../../outside.txt',
          '..\\..\\windows\\system32\\config', // Windows style
          'dir\\..\\..\\..\\secret.txt'
        ];

        for (const testPath of traversalPaths) {
          const result = await pathSecurity.validatePath(testPath);
          expect(result.isValid).toBe(false);
          expect(result.error).toContain('traversal');
          expect(result.violation?.type).toBe('path_traversal');
        }
      });

      it('should reject paths with dangerous characters', async () => {
        const dangerousPaths = [
          'file\0.txt', // Null byte
          'file\x01.txt', // Control character
          'file<script>.txt',
          'file|command.txt',
          'file*.txt',
          'file?.txt'
        ];

        for (const testPath of dangerousPaths) {
          const result = await pathSecurity.validatePath(testPath);
          expect(result.isValid).toBe(false);
          expect(result.violation?.type).toBe('invalid_path');
        }
      });

      it('should handle URL-encoded attacks', async () => {
        const encodedPaths = [
          '%2e%2e%2f%2e%2e%2fetc%2fpasswd', // ../../../etc/passwd
          '%2e%2e%5c%2e%2e%5cetc%5cpasswd', // ..\..\etc\passwd
          'dir%2f%2e%2e%2f%2e%2e%2fsecret.txt'
        ];

        for (const testPath of encodedPaths) {
          const result = await pathSecurity.validatePath(testPath);
          expect(result.isValid).toBe(false);
          expect(result.violation?.type).toBe('path_traversal');
        }
      });

      it('should reject invalid input types', async () => {
        const invalidInputs = [
          null,
          undefined,
          '',
          123,
          {},
          []
        ];

        for (const input of invalidInputs) {
          const result = await pathSecurity.validatePath(input as any);
          expect(result.isValid).toBe(false);
          expect(result.violation?.type).toBe('invalid_path');
        }
      });
    });

    describe('File Extension Validation', () => {
      it('should accept allowed file extensions', async () => {
        const allowedFiles = [
          'script.js',
          'component.tsx',
          'styles.css',
          'data.json',
          'readme.md',
          'image.png'
        ];

        for (const testFile of allowedFiles) {
          const result = await pathSecurity.validatePath(testFile);
          expect(result.isValid).toBe(true);
        }
      });

      it('should reject blocked file extensions', async () => {
        const blockedFiles = [
          'malware.exe',
          'script.bat',
          'config.ini',
          'database.db',
          'archive.zip'
        ];

        for (const testFile of blockedFiles) {
          const result = await pathSecurity.validatePath(testFile);
          expect(result.isValid).toBe(false);
          expect(result.violation?.type).toBe('extension_blocked');
        }
      });
    });

    describe('Symlink Safety', () => {
      it('should detect symlink escape attempts', async () => {
        // Create a directory outside sandbox
        const outsideDir = path.join(tempDir, 'outside');
        await fs.mkdir(outsideDir);
        await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'secret content');

        // Create symlink in sandbox pointing outside
        const symlinkPath = path.join(sandboxDir, 'symlink');
        try {
          await fs.symlink(outsideDir, symlinkPath);
          
          const result = await pathSecurity.validatePath('symlink/secret.txt');
          expect(result.isValid).toBe(false);
          expect(result.violation?.type).toBe('symlink_escape');
        } catch (error) {
          // Symlink creation might fail on some systems, skip test
          console.warn('Symlink test skipped:', error);
        }
      });
    });

    describe('Security Logging', () => {
      it('should track security violations', async () => {
        // Enable logging for this test
        const loggingSecurity = createPathSecurity(sandboxDir, {
          enableLogging: true
        });

        await loggingSecurity.validatePath('../etc/passwd');
        await loggingSecurity.validatePath('/etc/passwd');
        await loggingSecurity.validatePath('malware.exe');

        const violations = loggingSecurity.getViolations();
        expect(violations).toHaveLength(3);
        expect(violations[0].type).toBe('path_traversal');
        expect(violations[1].type).toBe('path_traversal');
        expect(violations[2].type).toBe('extension_blocked');
      });

      it('should generate audit reports', async () => {
        const loggingSecurity = createPathSecurity(sandboxDir);

        await loggingSecurity.validatePath('../secret.txt');
        await loggingSecurity.validatePath('malware.exe');
        await loggingSecurity.validatePath('script.bat');

        const report = loggingSecurity.generateAuditReport();
        expect(report.totalViolations).toBe(3);
        expect(report.violationsByType['path_traversal']).toBe(1);
        expect(report.violationsByType['extension_blocked']).toBe(2);
      });
    });
  });

  describe('SecureFileOperations', () => {
    describe('Secure File Writing', () => {
      it('should write valid files successfully', async () => {
        const result = await secureFileOps.writeFile('test.txt', 'Hello, World!');
        
        expect(result.success).toBe(true);
        expect(result.operation).toBe('created');
        expect(result.path).toBe('test.txt');

        // Verify file was actually written
        const content = await fs.readFile(path.join(sandboxDir, 'test.txt'), 'utf8');
        expect(content).toBe('Hello, World!');
      });

      it('should reject files with path traversal attempts', async () => {
        const result = await secureFileOps.writeFile('../outside.txt', 'malicious content');
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('traversal');
      });

      it('should enforce file size limits', async () => {
        const largeContent = 'x'.repeat(20 * 1024 * 1024); // 20MB
        const result = await secureFileOps.writeFile('large.txt', largeContent);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('size');
      });

      it('should use atomic writes', async () => {
        // Write initial content
        await secureFileOps.writeFile('atomic.txt', 'initial content');
        
        // Simulate interruption during write by checking for temp files
        const writePromise = secureFileOps.writeFile('atomic.txt', 'updated content');
        await writePromise;
        
        // Check that no temp files remain
        const files = await fs.readdir(sandboxDir);
        const tempFiles = files.filter(file => file.includes('.tmp.'));
        expect(tempFiles).toHaveLength(0);
        
        // Verify content was updated
        const content = await fs.readFile(path.join(sandboxDir, 'atomic.txt'), 'utf8');
        expect(content).toBe('updated content');
      });
    });

    describe('Secure File Reading', () => {
      beforeEach(async () => {
        // Create test files
        await fs.writeFile(path.join(sandboxDir, 'readable.txt'), 'test content');
        await fs.mkdir(path.join(sandboxDir, 'subdir'));
        await fs.writeFile(path.join(sandboxDir, 'subdir', 'nested.txt'), 'nested content');
      });

      it('should read valid files successfully', async () => {
        const result = await secureFileOps.readFile('readable.txt');
        
        expect(result.success).toBe(true);
        expect(result.content).toBe('test content');
        expect(result.size).toBe('test content'.length);
      });

      it('should read nested files safely', async () => {
        const result = await secureFileOps.readFile('subdir/nested.txt');
        
        expect(result.success).toBe(true);
        expect(result.content).toBe('nested content');
      });

      it('should reject path traversal in reads', async () => {
        const result = await secureFileOps.readFile('../etc/passwd');
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('traversal');
      });

      it('should handle non-existent files gracefully', async () => {
        const result = await secureFileOps.readFile('nonexistent.txt');
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });
    });

    describe('Secure File Deletion', () => {
      beforeEach(async () => {
        await fs.writeFile(path.join(sandboxDir, 'deleteme.txt'), 'delete this');
      });

      it('should delete valid files successfully', async () => {
        const result = await secureFileOps.deleteFile('deleteme.txt');
        
        expect(result.success).toBe(true);
        
        // Verify file was deleted
        const exists = await secureFileOps.fileExists('deleteme.txt');
        expect(exists).toBe(false);
      });

      it('should reject path traversal in deletions', async () => {
        const result = await secureFileOps.deleteFile('../important.txt');
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('traversal');
      });
    });

    describe('Secure Directory Listing', () => {
      beforeEach(async () => {
        // Create test directory structure
        await fs.writeFile(path.join(sandboxDir, 'file1.txt'), 'content1');
        await fs.writeFile(path.join(sandboxDir, 'file2.js'), 'content2');
        await fs.mkdir(path.join(sandboxDir, 'subdir'));
        await fs.writeFile(path.join(sandboxDir, 'subdir', 'nested.txt'), 'nested');
      });

      it('should list files in root directory', async () => {
        const result = await secureFileOps.listFiles('');
        
        expect(result.success).toBe(true);
        expect(result.files).toContain('file1.txt');
        expect(result.files).toContain('file2.js');
        expect(result.directories).toContain('subdir');
      });

      it('should list files in subdirectories', async () => {
        const result = await secureFileOps.listFiles('subdir');
        
        expect(result.success).toBe(true);
        expect(result.files).toContain('subdir/nested.txt');
      });

      it('should reject path traversal in listings', async () => {
        const result = await secureFileOps.listFiles('../');
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('traversal');
      });
    });
  });

  describe('Utility Functions', () => {
    it('validateSafePath should work as shorthand', async () => {
      const validPath = await validateSafePath('valid.txt', sandboxDir);
      expect(validPath).toContain(sandboxDir);
      expect(validPath).toContain('valid.txt');

      await expect(validateSafePath('../invalid.txt', sandboxDir))
        .rejects.toThrow('traversal');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent operations safely', async () => {
      const promises = [];
      
      // Start multiple concurrent write operations
      for (let i = 0; i < 10; i++) {
        promises.push(secureFileOps.writeFile(`concurrent-${i}.txt`, `content ${i}`));
      }
      
      const results = await Promise.all(promises);
      
      // All operations should succeed
      for (const result of results) {
        expect(result.success).toBe(true);
      }
      
      // Verify all files were written
      for (let i = 0; i < 10; i++) {
        const exists = await secureFileOps.fileExists(`concurrent-${i}.txt`);
        expect(exists).toBe(true);
      }
    });

    it('should handle filesystem errors gracefully', async () => {
      // Try to write to a read-only location (simulate by creating invalid sandbox)
      const readOnlyOps = createSecureFileOps('/proc/invalid-sandbox');
      
      const result = await readOnlyOps.writeFile('test.txt', 'content');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should prevent resource exhaustion attacks', async () => {
      const stats = secureFileOps.getOperationStats();
      const initialOps = stats.activeOperations;
      
      // Try to exceed maximum concurrent operations
      const promises = [];
      for (let i = 0; i < stats.maxConcurrentOps + 5; i++) {
        promises.push(secureFileOps.writeFile(`flood-${i}.txt`, 'content'));
      }
      
      const results = await Promise.all(promises);
      
      // Some operations should be rejected due to concurrency limit
      const rejectedCount = results.filter(r => !r.success && r.error?.includes('concurrent')).length;
      expect(rejectedCount).toBeGreaterThan(0);
    });
  });
});