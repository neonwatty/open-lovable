import { NextRequest, NextResponse } from 'next/server';
import { createSandboxMiddleware } from '../../lib/security/sandbox-middleware';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Helper function to properly parse response JSON in test environment
async function parseResponseJson(response: NextResponse) {
  const rawData = await response.json();
  return typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
}

// Helper function to create NextRequest with working body for tests
function createTestRequest(url: string, options: any, bodyData?: any) {
  const req = new NextRequest(url, options);
  if (bodyData) {
    // Mock the json() method to return our test data
    req.json = jest.fn().mockResolvedValue(bodyData);
  }
  return req;
}

// Mock a simple middleware function for testing
async function createTestMiddleware() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'middleware-test-'));
  
  const middleware = createSandboxMiddleware(tempDir, {
    enableLogging: false,
    rateLimitViolations: 3,
    blockDurationMs: 1000,
    maxFileSize: 1024 * 1024
  });

  return { middleware, tempDir };
}

describe('Security Middleware Integration', () => {
  let testSetup: { middleware: any; tempDir: string };

  beforeEach(async () => {
    testSetup = await createTestMiddleware();
  });

  afterEach(async () => {
    try {
      await fs.rm(testSetup.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('API Route Protection', () => {
    it('should block malicious requests to API routes', async () => {
      const maliciousRequest = new NextRequest('http://localhost:3000/api/apply-ai-code?path=../etc/passwd', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const response = await testSetup.middleware.validateRequest(maliciousRequest, {
        pathParam: 'path'
      });

      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
      
      const data = await parseResponseJson(response!);
      expect(data.error).toContain('Security violation');
      expect(data.type).toBe('path_traversal');
    });

    it('should allow safe requests through middleware', async () => {
      const safeRequest = new NextRequest('http://localhost:3000/api/sandbox-status?id=safe-sandbox', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const response = await testSetup.middleware.validateRequest(safeRequest, {
        pathParam: 'id'
      });

      expect(response).toBeNull(); // Null means request is allowed
    });

    it('should detect and block Windows path attacks', async () => {
      const bodyData = {
        files: [{ path: 'C:\\Windows\\System32\\config', content: 'attack' }]
      };
      const windowsAttack = createTestRequest('http://localhost:3000/api/apply-ai-code', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1' 
        }),
        body: JSON.stringify(bodyData)
      }, bodyData);

      const response = await testSetup.middleware.validateRequest(windowsAttack, {
        bodyPathFields: ['files.0.path']
      });

      expect(response?.status).toBe(403);
      
      const data = await parseResponseJson(response!);
      expect(data.type).toBe('path_traversal');
    });

    it('should block UNC path attacks', async () => {
      const bodyData = {
        files: [{ path: '\\\\server\\share\\file.txt', content: 'attack' }]
      };
      const uncAttack = createTestRequest('http://localhost:3000/api/apply-ai-code', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1' 
        }),
        body: JSON.stringify(bodyData)
      }, bodyData);

      const response = await testSetup.middleware.validateRequest(uncAttack, {
        bodyPathFields: ['files.0.path']
      });

      expect(response?.status).toBe(403);
    });

    it('should handle URL encoded attacks', async () => {
      const encodedAttack = new NextRequest('http://localhost:3000/api/apply-ai-code?path=%2e%2e%2f%2e%2e%2fetc%2fpasswd', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const response = await testSetup.middleware.validateRequest(encodedAttack, {
        pathParam: 'path'
      });

      expect(response?.status).toBe(403);
    });
  });

  describe('IP Detection and Blocking', () => {
    it('should detect IP from x-forwarded-for header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test?path=../attack.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '203.0.113.1, 192.168.1.1' })
      });

      await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      
      const blockedIPs = testSetup.middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find((blocked: any) => blocked.ip === '203.0.113.1');
      expect(blockedIP).toBeDefined();
    });

    it('should detect IP from x-real-ip header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test?path=../attack.txt', {
        method: 'GET',
        headers: new Headers({ 'x-real-ip': '203.0.113.2' })
      });

      await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      
      const blockedIPs = testSetup.middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find((blocked: any) => blocked.ip === '203.0.113.2');
      expect(blockedIP).toBeDefined();
    });

    it('should detect IP from cf-connecting-ip header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test?path=../attack.txt', {
        method: 'GET',
        headers: new Headers({ 'cf-connecting-ip': '203.0.113.3' })
      });

      await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      
      const blockedIPs = testSetup.middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find((blocked: any) => blocked.ip === '203.0.113.3');
      expect(blockedIP).toBeDefined();
    });

    it('should handle missing IP headers gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/test?path=../attack.txt', {
        method: 'GET',
        headers: new Headers() // Empty headers but still a Headers object
      });

      const response = await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      
      expect(response?.status).toBe(403); // Should still block the attack
    });
  });

  describe('Rate Limiting Behavior', () => {
    it('should track violations per IP address', async () => {
      const attackingIP = '10.0.0.100';
      
      // Make multiple violation requests
      for (let i = 0; i < 3; i++) {
        const request = new NextRequest(`http://localhost:3000/api/test?path=../attack${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': attackingIP })
        });

        await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      }

      const blockedIPs = testSetup.middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find((blocked: any) => blocked.ip === attackingIP);
      
      expect(blockedIP).toBeDefined();
      expect(blockedIP.violationCount).toBe(3);
    });

    it('should block IP after reaching violation threshold', async () => {
      const attackingIP = '10.0.0.101';
      
      // Exceed violation threshold
      for (let i = 0; i < 4; i++) {
        const request = new NextRequest(`http://localhost:3000/api/test?path=../attack${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': attackingIP })
        });

        await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      }

      // Next request should be blocked due to rate limiting
      const blockedRequest = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': attackingIP })
      });

      const response = await testSetup.middleware.validateRequest(blockedRequest, { pathParam: 'path' });
      
      expect(response?.status).toBe(429);
      
      const data = await parseResponseJson(response!);
      expect(data.error).toContain('Access denied');
      expect(data.violationCount).toBeGreaterThan(0);
    });

    it('should isolate blocking by IP address', async () => {
      const maliciousIP = '10.0.0.102';
      const legitimateIP = '10.0.0.103';
      
      // Block malicious IP
      for (let i = 0; i < 4; i++) {
        const request = new NextRequest(`http://localhost:3000/api/test?path=../attack${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': maliciousIP })
        });

        await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      }

      // Legitimate IP should still be allowed
      const legitimateRequest = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': legitimateIP })
      });

      const response = await testSetup.middleware.validateRequest(legitimateRequest, { pathParam: 'path' });
      expect(response).toBeNull(); // Should be allowed
    });

    it('should unblock IPs after timeout period', async () => {
      const attackingIP = '10.0.0.104';
      
      // Trigger blocking
      for (let i = 0; i < 4; i++) {
        const request = new NextRequest(`http://localhost:3000/api/test?path=../attack${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': attackingIP })
        });

        await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      }

      // Verify IP is blocked
      let blockedRequest = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': attackingIP })
      });

      let response = await testSetup.middleware.validateRequest(blockedRequest, { pathParam: 'path' });
      expect(response?.status).toBe(429);

      // Wait for block to expire (test uses 1000ms)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be unblocked now
      blockedRequest = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': attackingIP })
      });

      response = await testSetup.middleware.validateRequest(blockedRequest, { pathParam: 'path' });
      expect(response).toBeNull(); // Should be allowed again
    });
  });

  describe('Request Body Validation', () => {
    it('should validate nested object paths in request body', async () => {
      const bodyData = {
        config: {
          file: {
            path: '../../../escape.txt'
          }
        }
      };
      const nestedAttack = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1' 
        }),
        body: JSON.stringify(bodyData)
      }, bodyData);

      const response = await testSetup.middleware.validateRequest(nestedAttack, {
        bodyPathFields: ['config.file.path']
      });

      expect(response?.status).toBe(403);
    });

    it('should handle arrays in request body', async () => {
      const bodyData = {
        files: [
          { path: 'valid.txt' },
          { path: '../attack.txt' }
        ]
      };
      const arrayAttack = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1' 
        }),
        body: JSON.stringify(bodyData)
      }, bodyData);

      const response = await testSetup.middleware.validateRequest(arrayAttack, {
        bodyPathFields: ['files.1.path']
      });

      expect(response?.status).toBe(403);
    });

    it('should handle malformed JSON gracefully', async () => {
      const malformedRequest = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1' 
        }),
        body: 'invalid json{'
      });

      // Mock the json() method to throw an error for malformed JSON
      malformedRequest.json = jest.fn().mockRejectedValue(new Error('Unexpected token { in JSON'));

      const response = await testSetup.middleware.validateRequest(malformedRequest, {
        bodyPathFields: ['files.0.path']
      });

      expect(response?.status).toBe(400);
      
      const data = await parseResponseJson(response!);
      expect(data.error).toContain('Invalid request body');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle requests without nextUrl gracefully', async () => {
      const requestWithoutUrl = {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' }),
        nextUrl: null, // Simulate missing nextUrl
        ip: '192.168.1.1',
        url: 'http://localhost:3000/api/test?path=../attack.txt'
      } as any;

      const response = await testSetup.middleware.validateRequest(requestWithoutUrl, {
        pathParam: 'path'
      });

      // Should not crash, may return null (allowed) or handle gracefully
      expect(response).toBeDefined();
    });

    it('should skip validation when requested', async () => {
      const maliciousRequest = new NextRequest('http://localhost:3000/api/test?path=../etc/passwd', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const response = await testSetup.middleware.validateRequest(maliciousRequest, {
        skipPathValidation: true
      });

      expect(response).toBeNull(); // Should be allowed when validation is skipped
    });

    it('should handle GET requests without body validation', async () => {
      const getRequest = new NextRequest('http://localhost:3000/api/test?safe=value', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const response = await testSetup.middleware.validateRequest(getRequest, {
        bodyPathFields: ['nonexistent.path'] // Should be ignored for GET
      });

      expect(response).toBeNull(); // Should be allowed
    });
  });

  describe('Security Statistics and Monitoring', () => {
    it('should provide comprehensive security statistics', async () => {
      // Generate some violations
      const request = new NextRequest('http://localhost:3000/api/test?path=../attack.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.200' })
      });

      await testSetup.middleware.validateRequest(request, { pathParam: 'path' });

      const stats = testSetup.middleware.getSecurityStats();
      
      expect(stats).toHaveProperty('blockedIPs');
      expect(stats).toHaveProperty('activeBlocks');
      expect(stats).toHaveProperty('violations');
      expect(stats).toHaveProperty('config');
      
      expect(typeof stats.blockedIPs).toBe('number');
      expect(typeof stats.activeBlocks).toBe('number');
      expect(stats.violations).toHaveProperty('totalViolations');
      expect(stats.violations).toHaveProperty('violationsByType');
    });

    it('should track different violation types', async () => {
      // Path traversal violation
      const traversalRequest = new NextRequest('http://localhost:3000/api/test?path=../attack.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.201' })
      });

      await testSetup.middleware.validateRequest(traversalRequest, { pathParam: 'path' });

      // Extension violation  
      const bodyData2 = {
        file: { path: 'malware.exe' }
      };
      const extensionRequest = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.202' 
        }),
        body: JSON.stringify(bodyData2)
      }, bodyData2);

      await testSetup.middleware.validateRequest(extensionRequest, {
        bodyPathFields: ['file.path']
      });

      const stats = testSetup.middleware.getSecurityStats();
      expect(stats.violations.totalViolations).toBeGreaterThanOrEqual(2);
    });

    it('should allow manual IP unblocking', async () => {
      const attackingIP = '10.0.0.105';
      
      // Block the IP
      for (let i = 0; i < 4; i++) {
        const request = new NextRequest(`http://localhost:3000/api/test?path=../attack${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': attackingIP })
        });

        await testSetup.middleware.validateRequest(request, { pathParam: 'path' });
      }

      // Verify IP is blocked
      let blockedRequest = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': attackingIP })
      });

      let response = await testSetup.middleware.validateRequest(blockedRequest, { pathParam: 'path' });
      expect(response?.status).toBe(429);

      // Manually unblock
      const unblocked = testSetup.middleware.unblockIP(attackingIP);
      expect(unblocked).toBe(true);

      // Should be unblocked immediately
      response = await testSetup.middleware.validateRequest(blockedRequest, { pathParam: 'path' });
      expect(response).toBeNull(); // Should be allowed
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const concurrentRequests = [];
      
      for (let i = 0; i < 50; i++) {
        const request = new NextRequest(`http://localhost:3000/api/test?file=valid${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': `192.168.1.${i % 255}` })
        });

        concurrentRequests.push(
          testSetup.middleware.validateRequest(request, { pathParam: 'file' })
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(concurrentRequests);
      const endTime = Date.now();

      // All valid requests should be allowed
      const allowedCount = results.filter(r => r === null).length;
      expect(allowedCount).toBe(50);

      // Should complete reasonably quickly
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max
    });
  });
});