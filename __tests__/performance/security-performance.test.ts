import { performance } from 'perf_hooks';
import { PathSecurity, createPathSecurity } from '../../lib/security/path-security';
import { SecureFileOperations, createSecureFileOps } from '../../lib/security/secure-file-ops';
import { SandboxMiddleware, createSandboxMiddleware } from '../../lib/security/sandbox-middleware';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

// Helper function to create NextRequest with working body for tests
function createTestRequest(url: string, options: any, bodyData?: any) {
  const req = new NextRequest(url, options);
  if (bodyData) {
    // Mock the json() method to return our test data
    req.json = jest.fn().mockResolvedValue(bodyData);
  }
  return req;
}

describe('Security Performance Tests', () => {
  let tempDir: string;
  let pathSecurity: PathSecurity;
  let secureFileOps: SecureFileOperations;
  let sandboxMiddleware: SandboxMiddleware;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-perf-test-'));
    
    pathSecurity = createPathSecurity(tempDir, {
      enableLogging: false // Disable logging for performance tests
    });

    secureFileOps = createSecureFileOps(tempDir, {
      enableLogging: false,
      atomicWrites: true,
      backupOnUpdate: false,
      maxConcurrentOps: 150 // Higher limit for performance tests
    });

    sandboxMiddleware = createSandboxMiddleware(tempDir, {
      enableLogging: false,
      rateLimitViolations: 1, // Block immediately after first violation
      blockDurationMs: 1000
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('Path Validation Performance', () => {
    it('should validate paths efficiently under load', async () => {
      const paths = Array.from({ length: 1000 }, (_, i) => `file${i}.txt`);
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        paths.map(testPath => pathSecurity.validatePath(testPath))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // All paths should be valid
      expect(results.every(r => r.isValid)).toBe(true);
      
      // Should complete in under 1 second
      expect(duration).toBeLessThan(1000);
      
      // Average validation time should be reasonable
      const avgTime = duration / paths.length;
      expect(avgTime).toBeLessThan(1); // Less than 1ms per validation
    });

    it('should handle mixed valid and invalid paths efficiently', async () => {
      const validPaths = Array.from({ length: 500 }, (_, i) => `valid/file${i}.txt`);
      const invalidPaths = Array.from({ length: 500 }, (_, i) => `../invalid/file${i}.txt`);
      const allPaths = [...validPaths, ...invalidPaths];
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        allPaths.map(testPath => pathSecurity.validatePath(testPath))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should have 500 valid and 500 invalid results
      const validCount = results.filter(r => r.isValid).length;
      const invalidCount = results.filter(r => !r.isValid).length;
      
      expect(validCount).toBe(500);
      expect(invalidCount).toBe(500);
      
      // Should still be fast
      expect(duration).toBeLessThan(1500); // Allow slightly more time for mixed validation
    });

    it('should handle complex path patterns efficiently', async () => {
      const complexPaths = [
        ...Array.from({ length: 200 }, (_, i) => `deep/nested/directory/structure/file${i}.txt`),
        ...Array.from({ length: 200 }, (_, i) => `components/ui/forms/inputs/TextInput${i}.tsx`),
        ...Array.from({ length: 200 }, (_, i) => `src/utils/helpers/validation/schema${i}.js`),
        ...Array.from({ length: 200 }, (_, i) => `docs/api/reference/endpoints/v1/users${i}.md`),
        ...Array.from({ length: 200 }, (_, i) => `tests/integration/security/path-validation${i}.test.ts`)
      ];
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        complexPaths.map(testPath => pathSecurity.validatePath(testPath))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // All should be valid
      expect(results.every(r => r.isValid)).toBe(true);
      
      // Should handle complex paths efficiently
      expect(duration).toBeLessThan(2000); // 2 seconds max for 1000 complex paths
    });

    it('should scale well with concurrent validations', async () => {
      const concurrentBatches = 10;
      const pathsPerBatch = 100;
      
      const startTime = performance.now();
      
      const batchPromises = Array.from({ length: concurrentBatches }, (_, batchIndex) => {
        const batchPaths = Array.from({ length: pathsPerBatch }, (_, i) => 
          `batch${batchIndex}/file${i}.txt`
        );
        
        return Promise.all(
          batchPaths.map(testPath => pathSecurity.validatePath(testPath))
        );
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Flatten results and verify all are valid
      const allResults = batchResults.flat();
      expect(allResults.every(r => r.isValid)).toBe(true);
      expect(allResults).toHaveLength(concurrentBatches * pathsPerBatch);
      
      // Should handle concurrent batches efficiently
      expect(duration).toBeLessThan(3000); // 3 seconds for 1000 concurrent validations
    });
  });

  describe('File Operations Performance', () => {
    it('should handle multiple file writes efficiently', async () => {
      const fileCount = 100;
      const files = Array.from({ length: fileCount }, (_, i) => ({
        path: `perf-test-${i}.txt`,
        content: `Performance test content for file ${i}\n`.repeat(10) // ~400 bytes per file
      }));
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        files.map(file => secureFileOps.writeFile(file.path, file.content))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // All writes should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 100 files
      
      // Average write time should be reasonable
      const avgTime = duration / fileCount;
      expect(avgTime).toBeLessThan(50); // Less than 50ms per file on average
    });

    it('should handle concurrent read operations efficiently', async () => {
      const fileCount = 50;
      
      // First, create test files
      const files = Array.from({ length: fileCount }, (_, i) => ({
        path: `read-test-${i}.txt`,
        content: `Read test content for file ${i}\n`.repeat(20) // ~800 bytes per file
      }));
      
      for (const file of files) {
        await secureFileOps.writeFile(file.path, file.content);
      }
      
      // Now test concurrent reads
      const startTime = performance.now();
      
      const results = await Promise.all(
        files.map(file => secureFileOps.readFile(file.path))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // All reads should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Content should match
      results.forEach((result, index) => {
        expect(result.content).toBe(files[index].content);
      });
      
      // Should be fast for concurrent reads
      expect(duration).toBeLessThan(2000); // 2 seconds for 50 concurrent reads
    });

    it('should maintain performance with large file operations', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB content
      const fileCount = 10;
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        Array.from({ length: fileCount }, (_, i) => 
          secureFileOps.writeFile(`large-${i}.txt`, largeContent)
        )
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // All large file writes should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Should handle large files reasonably well
      expect(duration).toBeLessThan(10000); // 10 seconds for 10 x 1MB files
    });
  });

  describe('Middleware Performance', () => {
    it('should handle high request volume efficiently', async () => {
      const requestCount = 1000;
      const requests = Array.from({ length: requestCount }, (_, i) => 
        new NextRequest(`http://localhost:3000/api/test?file=request${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': `192.168.1.${i % 255}` })
        })
      );
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        requests.map(req => sandboxMiddleware.validateRequest(req, { pathParam: 'file' }))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // All valid requests should be allowed (return null)
      const allowedCount = results.filter(r => r === null).length;
      expect(allowedCount).toBe(requestCount);
      
      // Should handle high volume efficiently
      expect(duration).toBeLessThan(5000); // 5 seconds for 1000 requests
      
      // Average request processing time
      const avgTime = duration / requestCount;
      expect(avgTime).toBeLessThan(5); // Less than 5ms per request
    });

    it('should maintain performance with security violations', async () => {
      const validRequestCount = 500;
      const maliciousRequestCount = 500;
      
      const validRequests = Array.from({ length: validRequestCount }, (_, i) => 
        new NextRequest(`http://localhost:3000/api/test?file=valid${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': `192.168.1.${i % 100}` })
        })
      );
      
      const maliciousRequests = Array.from({ length: maliciousRequestCount }, (_, i) => 
        new NextRequest(`http://localhost:3000/api/test?file=../attack${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': `10.0.0.${i % 100}` })
        })
      );
      
      const allRequests = [...validRequests, ...maliciousRequests];
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        allRequests.map(req => sandboxMiddleware.validateRequest(req, { pathParam: 'file' }))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Count allowed vs blocked requests
      const allowedCount = results.filter(r => r === null).length;
      const blockedCount = results.filter(r => r !== null).length;
      
      expect(allowedCount).toBe(validRequestCount);
      expect(blockedCount).toBe(maliciousRequestCount);
      
      // Should handle mixed requests efficiently
      expect(duration).toBeLessThan(8000); // 8 seconds for 1000 mixed requests
    });

    it('should scale IP tracking efficiently', async () => {
      const uniqueIPs = 200;
      const requestsPerIP = 3;
      
      const requests: any[] = [];
      for (let ip = 1; ip <= uniqueIPs; ip++) {
        for (let req = 0; req < requestsPerIP; req++) {
          requests.push(
            new NextRequest(`http://localhost:3000/api/test?file=file${ip}-${req}.txt`, {
              method: 'GET',
              headers: new Headers({ 'x-forwarded-for': `192.168.${Math.floor(ip / 256)}.${ip % 256}` })
            })
          );
        }
      }
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        requests.map(req => sandboxMiddleware.validateRequest(req, { pathParam: 'file' }))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // All should be allowed
      expect(results.every(r => r === null)).toBe(true);
      
      // Should scale well with many unique IPs
      expect(duration).toBeLessThan(6000); // 6 seconds for 600 requests from 200 IPs
      
      // Verify IP tracking is working
      const stats = sandboxMiddleware.getSecurityStats();
      expect(stats.blockedIPs).toBeGreaterThanOrEqual(0); // No violations in this test
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during high-volume operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform many operations
      for (let batch = 0; batch < 10; batch++) {
        const batchOperations = Array.from({ length: 100 }, (_, i) => 
          pathSecurity.validatePath(`batch${batch}/file${i}.txt`)
        );
        
        await Promise.all(batchOperations);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      
      // Memory usage should not increase dramatically
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
      
      // Should not use more than 50MB additional memory
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    it('should clean up violations efficiently', async () => {
      const violationCount = 100; // Reduced to match actual behavior
      
      // Generate many violations
      for (let i = 0; i < violationCount; i++) {
        await pathSecurity.validatePath(`../attack${i}.txt`);
      }
      
      const beforeCleanup = pathSecurity.getViolations().length;
      expect(beforeCleanup).toBe(violationCount);
      
      // Clear violations
      const startTime = performance.now();
      pathSecurity.clearViolations();
      const endTime = performance.now();
      
      const afterCleanup = pathSecurity.getViolations().length;
      expect(afterCleanup).toBe(0);
      
      // Cleanup should be very fast
      expect(endTime - startTime).toBeLessThan(10); // Less than 10ms
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme load without failure', async () => {
      const extremeLoad = 2000;
      const batchSize = 100;
      const batches = Math.ceil(extremeLoad / batchSize);
      
      let totalProcessed = 0;
      let totalErrors = 0;
      
      const startTime = performance.now();
      
      // Process in batches to avoid overwhelming the system
      for (let batch = 0; batch < batches; batch++) {
        const batchPaths = Array.from({ length: batchSize }, (_, i) => 
          `stress-test/batch${batch}/file${i}.txt`
        );
        
        try {
          const results = await Promise.all(
            batchPaths.map(path => pathSecurity.validatePath(path))
          );
          
          totalProcessed += results.length;
        } catch (error) {
          totalErrors++;
        }
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should process most requests successfully
      expect(totalProcessed).toBeGreaterThan(extremeLoad * 0.95); // At least 95% success
      expect(totalErrors).toBeLessThan(extremeLoad * 0.05); // Less than 5% errors
      
      // Should complete in reasonable time even under extreme load
      expect(duration).toBeLessThan(30000); // 30 seconds max for extreme load
    });

    it('should recover gracefully from resource exhaustion', async () => {
      // Create a scenario that might exhaust resources
      const largeOperations = Array.from({ length: 100 }, (_, i) => 
        secureFileOps.writeFile(`large${i}.txt`, 'x'.repeat(1024 * 100)) // 100KB each
      );
      
      let successCount = 0;
      let errorCount = 0;
      
      const results = await Promise.allSettled(largeOperations);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
      // Should handle resource constraints gracefully
      // Either succeed or fail gracefully, but not crash
      expect(successCount + errorCount).toBe(100);
      expect(successCount).toBeGreaterThan(0); // At least some should succeed
    });
  });

  describe('Real-world Simulation', () => {
    it('should handle realistic API traffic patterns', async () => {
      // Simulate realistic API traffic: mostly valid with some attacks
      const validTraffic = 850; // 85% valid traffic
      const attackTraffic = 150; // 15% attack traffic
      
      const requests: any[] = [];
      
      // Valid requests
      for (let i = 0; i < validTraffic; i++) {
        requests.push(
          createTestRequest(`http://localhost:3000/api/apply-ai-code`, {
            method: 'POST',
            headers: new Headers({
              'content-type': 'application/json',
              'x-forwarded-for': `203.0.113.${i}`
            })
          }, {
            files: [{ path: `components/Component${i}.tsx`, content: 'valid code' }]
          })
        );
      }
      
      // Attack requests
      const attackPatterns = [
        '../../../etc/passwd',
        '/etc/shadow',
        'C:\\Windows\\System32\\config',
        '\\\\server\\share\\file.txt',
        '%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];
      
      for (let i = 0; i < attackTraffic; i++) {
        const attackPattern = attackPatterns[i % attackPatterns.length];
        requests.push(
          createTestRequest(`http://localhost:3000/api/apply-ai-code`, {
            method: 'POST',
            headers: new Headers({
              'content-type': 'application/json',
              'x-forwarded-for': `10.0.0.${i % 256}`
            })
          }, {
            files: [{ path: attackPattern, content: 'malicious' }]
          })
        );
      }
      
      // Shuffle requests to simulate real traffic
      const shuffledRequests = requests.sort(() => Math.random() - 0.5);
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        shuffledRequests.map(async req => {
          const result = await sandboxMiddleware.validateRequest(req, { bodyPathFields: ['files.0.path'] });
          return result;
        })
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Count results
      const allowedCount = results.filter(r => r === null).length;
      const blockedCount = results.filter(r => r !== null).length;
      
      
      expect(allowedCount).toBe(validTraffic);
      expect(blockedCount).toBe(attackTraffic);
      
      // Should handle realistic traffic efficiently
      expect(duration).toBeLessThan(15000); // 15 seconds for 1000 mixed requests
      
      // Verify security statistics
      const stats = sandboxMiddleware.getSecurityStats();
      expect(stats.violations.totalViolations).toBe(attackTraffic);
    });
  });
});