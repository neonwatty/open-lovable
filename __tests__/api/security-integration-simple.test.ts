import { createSandboxMiddleware } from '../../lib/security/sandbox-middleware';
import { createSecureFileOps } from '../../lib/security/secure-file-ops';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Security Integration - Core Logic', () => {
  let tempDir: string;
  let sandboxMiddleware: ReturnType<typeof createSandboxMiddleware>;
  let secureFileOps: ReturnType<typeof createSecureFileOps>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-simple-test-'));
    
    sandboxMiddleware = createSandboxMiddleware(tempDir, {
      enableLogging: false,
      rateLimitViolations: 3,
      blockDurationMs: 1000,
      maxFileSize: 1024 * 1024
    });

    secureFileOps = createSecureFileOps(tempDir, {
      enableLogging: false,
      atomicWrites: true,
      backupOnUpdate: false,
      maxFileSize: 1024 * 1024, // 1MB
      maxConcurrentOps: 200 // Higher limit for performance tests
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('Path Validation Security', () => {
    it('should block path traversal attempts', async () => {
      const result = await secureFileOps.writeFile('../../../etc/passwd', 'malicious');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should allow valid file operations', async () => {
      const result = await secureFileOps.writeFile('components/Button.tsx', 'export const Button = () => <button />');
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe('created');
    });

    it('should block absolute paths', async () => {
      const result = await secureFileOps.writeFile('/etc/passwd', 'malicious');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('should block Windows paths on Unix systems', async () => {
      const result = await secureFileOps.writeFile('C:\\Windows\\System32\\config', 'malicious');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('should block dangerous file extensions', async () => {
      const result = await secureFileOps.writeFile('malware.exe', 'malicious executable');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('extension');
    });

    it('should enforce file size limits', async () => {
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const result = await secureFileOps.writeFile('large.txt', largeContent);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('size');
    });
  });

  describe('File Operations Security', () => {
    it('should validate read operations', async () => {
      const result = await secureFileOps.readFile('../../../etc/passwd');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should validate delete operations', async () => {
      const result = await secureFileOps.deleteFile('../../../important.txt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should validate directory listing operations', async () => {
      const result = await secureFileOps.listFiles('../../../');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should handle concurrent operations safely', async () => {
      const operations = [];
      
      for (let i = 0; i < 10; i++) {
        operations.push(secureFileOps.writeFile(`concurrent-${i}.txt`, `content ${i}`));
      }
      
      const results = await Promise.all(operations);
      
      // All valid operations should succeed
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe('File Size Validation', () => {
    it('should reject files exceeding size limit', async () => {
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      const result = sandboxMiddleware.validateFileContent(largeContent);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('size');
    });

    it('should accept files within size limit', async () => {
      const smallContent = 'small file content';
      
      const result = sandboxMiddleware.validateFileContent(smallContent);
      expect(result.isValid).toBe(true);
    });

    it('should validate buffer content size', async () => {
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      const smallBuffer = Buffer.from('small content');
      
      const largeResult = sandboxMiddleware.validateFileContent(largeBuffer);
      expect(largeResult.isValid).toBe(false);
      
      const smallResult = sandboxMiddleware.validateFileContent(smallBuffer);
      expect(smallResult.isValid).toBe(true);
    });
  });

  describe('Security Statistics', () => {
    it('should track security violations', async () => {
      // Generate some violations
      await secureFileOps.writeFile('../attack1.txt', 'content');
      await secureFileOps.writeFile('/etc/attack2.txt', 'content');
      await secureFileOps.writeFile('malware.exe', 'content');

      const stats = secureFileOps.getOperationStats();
      expect(stats.securityStats.totalViolations).toBe(3);
    });

    it('should provide middleware statistics', async () => {
      const stats = sandboxMiddleware.getSecurityStats();
      
      expect(stats).toHaveProperty('blockedIPs');
      expect(stats).toHaveProperty('activeBlocks');
      expect(stats).toHaveProperty('violations');
      expect(stats).toHaveProperty('config');
    });
  });

  describe('Cross-Platform Security', () => {
    it('should handle different path separators', async () => {
      const windowsStyle = 'folder\\subfolder\\file.txt';
      const unixStyle = 'folder/subfolder/file.txt';
      
      const windowsResult = await secureFileOps.writeFile(windowsStyle, 'windows content');
      const unixResult = await secureFileOps.writeFile(unixStyle, 'unix content');
      
      expect(windowsResult.success).toBe(true);
      expect(unixResult.success).toBe(true);
    });

    it('should normalize different path formats consistently', async () => {
      const paths = [
        'normal/path.txt',
        'normal//double//slash.txt',
        'normal/./dot/path.txt'
      ];
      
      for (const testPath of paths) {
        const result = await secureFileOps.writeFile(testPath, 'content');
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle permission errors gracefully', async () => {
      // Try to create a file in a read-only location
      const result = await secureFileOps.writeFile('/proc/invalid-file.txt', 'content');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle non-existent file reads gracefully', async () => {
      const result = await secureFileOps.readFile('nonexistent.txt');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle invalid file paths gracefully', async () => {
      const result = await secureFileOps.writeFile('', 'content');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('URL Encoding Attacks', () => {
    it('should detect URL-encoded path traversal', async () => {
      const encodedPaths = [
        '%2e%2e%2f%2e%2e%2fetc%2fpasswd', // ../../../etc/passwd
        '%2e%2e%5c%2e%2e%5cetc%5cpasswd', // ..\..\etc\passwd
        'dir%2f%2e%2e%2f%2e%2e%2fsecret.txt'
      ];

      for (const encodedPath of encodedPaths) {
        const result = await secureFileOps.writeFile(decodeURIComponent(encodedPath), 'content');
        expect(result.success).toBe(false);
        expect(result.error).toContain('traversal');
      }
    });
  });

  describe('Null Byte Injection', () => {
    it('should block null byte injection attempts', async () => {
      const nullBytePaths = [
        'valid.txt\0../../../etc/passwd',
        'file\0.exe',
        'upload\0\0.php'
      ];

      for (const nullPath of nullBytePaths) {
        const result = await secureFileOps.writeFile(nullPath, 'content');
        expect(result.success).toBe(false);
        expect(result.error).toContain('illegal characters');
      }
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple concurrent validations efficiently', async () => {
      const validPaths = Array.from({ length: 100 }, (_, i) => `file${i}.txt`);
      
      const startTime = Date.now();
      
      const results = await Promise.all(
        validPaths.map(path => secureFileOps.writeFile(path, `content ${path}`))
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 100 operations
    });

    it('should handle mixed valid and invalid operations efficiently', async () => {
      const operations = [
        ...Array.from({ length: 50 }, (_, i) => 
          secureFileOps.writeFile(`valid${i}.txt`, 'content')
        ),
        ...Array.from({ length: 50 }, (_, i) => 
          secureFileOps.writeFile(`../invalid${i}.txt`, 'content')
        )
      ];
      
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const endTime = Date.now();
      
      const validCount = results.filter(r => r.success).length;
      const invalidCount = results.filter(r => !r.success).length;
      
      expect(validCount).toBe(50);
      expect(invalidCount).toBe(50);
      expect(endTime - startTime).toBeLessThan(3000); // 3 seconds
    });
  });
});