import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SandboxMiddleware, createSandboxMiddleware, withSandboxSecurity } from '../../lib/security/sandbox-middleware';

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

describe('Sandbox Middleware', () => {
  let tempDir: string;
  let sandboxDir: string;
  let middleware: SandboxMiddleware;

  beforeEach(async () => {
    // Create temporary sandbox directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'middleware-test-'));
    sandboxDir = path.join(tempDir, 'sandbox');
    await fs.mkdir(sandboxDir, { recursive: true });

    middleware = createSandboxMiddleware(sandboxDir, {
      enableLogging: false, // Disable logging for tests
      rateLimitViolations: 3, // Lower limit for testing
      blockDurationMs: 1000 // Short duration for testing
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('Request Validation', () => {
    it('should allow valid requests', async () => {
      const req = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const result = await middleware.validateRequest(req, {
        pathParam: 'path'
      });

      expect(result).toBeNull(); // Null means valid request
    });

    it('should reject requests with path traversal in URL params', async () => {
      const req = new NextRequest('http://localhost:3000/api/test?path=../etc/passwd', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const result = await middleware.validateRequest(req, {
        pathParam: 'path'
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
      
      const responseData = await parseResponseJson(result!);
      expect(responseData.error).toContain('Security violation');
      expect(responseData.type).toBe('path_traversal');
    });

    it('should reject requests with path traversal in body', async () => {
      const bodyData = {
        filePath: '../etc/passwd',
        content: 'malicious'
      };
      const req = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        }),
        body: JSON.stringify(bodyData)
      }, bodyData);

      const result = await middleware.validateRequest(req, {
        bodyPathFields: ['filePath']
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should handle nested body fields', async () => {
      const bodyData = {
        file: {
          path: '../secret.txt'
        }
      };
      const req = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        }),
        body: JSON.stringify(bodyData)
      }, bodyData);

      const result = await middleware.validateRequest(req, {
        bodyPathFields: ['file.path']
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });

    it('should handle invalid JSON gracefully', async () => {
      const req = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({ 
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        }),
        body: 'invalid json{'
      });

      // Mock the json() method to throw an error for malformed JSON
      req.json = jest.fn().mockRejectedValue(new Error('Unexpected token { in JSON'));

      const result = await middleware.validateRequest(req, {
        bodyPathFields: ['filePath']
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(400);
      
      const responseData = await parseResponseJson(result!);
      expect(responseData.error).toContain('Invalid request body');
    });

    it('should skip validation when requested', async () => {
      const req = new NextRequest('http://localhost:3000/api/test?path=../etc/passwd', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const result = await middleware.validateRequest(req, {
        skipPathValidation: true
      });

      expect(result).toBeNull(); // Should be allowed when validation is skipped
    });
  });

  describe('IP Blocking and Rate Limiting', () => {
    it('should track violations per IP', async () => {
      const ip = '192.168.1.100';
      
      // Make multiple violations from the same IP
      for (let i = 0; i < 3; i++) {
        const req = new NextRequest(`http://localhost:3000/api/test?path=../violation${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': ip })
        });

        await middleware.validateRequest(req, { pathParam: 'path' });
      }

      const blockedIPs = middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find(blocked => blocked.ip === ip);
      
      expect(blockedIP).toBeDefined();
      expect(blockedIP?.violationCount).toBe(3);
    });

    it('should block IPs after reaching violation threshold', async () => {
      const ip = '192.168.1.101';
      
      // Exceed violation threshold
      for (let i = 0; i < 4; i++) {
        const req = new NextRequest(`http://localhost:3000/api/test?path=../violation${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': ip })
        });

        await middleware.validateRequest(req, { pathParam: 'path' });
      }

      // Next request should be blocked
      const req = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': ip })
      });

      const result = await middleware.validateRequest(req, { pathParam: 'path' });
      
      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
      
      const responseData = await parseResponseJson(result!);
      expect(responseData.error).toContain('Access denied');
      expect(responseData.violationCount).toBeGreaterThan(0);
    });

    it('should unblock IPs after timeout', async () => {
      const ip = '192.168.1.102';
      
      // Trigger blocking
      for (let i = 0; i < 4; i++) {
        const req = new NextRequest(`http://localhost:3000/api/test?path=../violation${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': ip })
        });

        await middleware.validateRequest(req, { pathParam: 'path' });
      }

      // Wait for block to expire (short duration for testing)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be unblocked now
      const req = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': ip })
      });

      const result = await middleware.validateRequest(req, { pathParam: 'path' });
      expect(result).toBeNull(); // Should be allowed again
    });

    it('should manually unblock IPs', async () => {
      const ip = '192.168.1.103';
      
      // Trigger blocking
      for (let i = 0; i < 4; i++) {
        const req = new NextRequest(`http://localhost:3000/api/test?path=../violation${i}.txt`, {
          method: 'GET',
          headers: new Headers({ 'x-forwarded-for': ip })
        });

        await middleware.validateRequest(req, { pathParam: 'path' });
      }

      // Manually unblock
      const unblocked = middleware.unblockIP(ip);
      expect(unblocked).toBe(true);

      // Should be unblocked immediately
      const req = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': ip })
      });

      const result = await middleware.validateRequest(req, { pathParam: 'path' });
      expect(result).toBeNull();
    });
  });

  describe('Client IP Detection', () => {
    it('should detect IP from x-forwarded-for header', async () => {
      const req = new NextRequest('http://localhost:3000/api/test?path=../test.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '203.0.113.1, 192.168.1.1' })
      });

      await middleware.validateRequest(req, { pathParam: 'path' });
      
      const blockedIPs = middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find(blocked => blocked.ip === '203.0.113.1');
      expect(blockedIP).toBeDefined();
    });

    it('should detect IP from x-real-ip header', async () => {
      const req = new NextRequest('http://localhost:3000/api/test?path=../test.txt', {
        method: 'GET',
        headers: new Headers({ 'x-real-ip': '203.0.113.2' })
      });

      await middleware.validateRequest(req, { pathParam: 'path' });
      
      const blockedIPs = middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find(blocked => blocked.ip === '203.0.113.2');
      expect(blockedIP).toBeDefined();
    });

    it('should detect IP from cf-connecting-ip header', async () => {
      const req = new NextRequest('http://localhost:3000/api/test?path=../test.txt', {
        method: 'GET',
        headers: new Headers({ 'cf-connecting-ip': '203.0.113.3' })
      });

      await middleware.validateRequest(req, { pathParam: 'path' });
      
      const blockedIPs = middleware.getBlockedIPs();
      const blockedIP = blockedIPs.find(blocked => blocked.ip === '203.0.113.3');
      expect(blockedIP).toBeDefined();
    });
  });

  describe('File Content Validation', () => {
    it('should validate file size', async () => {
      const smallContent = 'small content';
      const largeContent = 'x'.repeat(20 * 1024 * 1024); // 20MB

      const smallResult = middleware.validateFileContent(smallContent);
      expect(smallResult.isValid).toBe(true);

      const largeResult = middleware.validateFileContent(largeContent);
      expect(largeResult.isValid).toBe(false);
      expect(largeResult.error).toContain('size');
    });

    it('should validate buffer content', async () => {
      const smallBuffer = Buffer.from('small content');
      const largeBuffer = Buffer.alloc(20 * 1024 * 1024); // 20MB

      const smallResult = middleware.validateFileContent(smallBuffer);
      expect(smallResult.isValid).toBe(true);

      const largeResult = middleware.validateFileContent(largeBuffer);
      expect(largeResult.isValid).toBe(false);
    });
  });

  describe('Security Statistics', () => {
    it('should provide security statistics', async () => {
      // Generate some violations
      const req = new NextRequest('http://localhost:3000/api/test?path=../test.txt', {
        method: 'GET',
        headers: new Headers({ 'x-forwarded-for': '192.168.1.200' })
      });

      await middleware.validateRequest(req, { pathParam: 'path' });

      const stats = middleware.getSecurityStats();
      expect(stats.blockedIPs).toBeGreaterThanOrEqual(0);
      expect(stats.violations).toBeDefined();
      expect(stats.config).toBeDefined();
    });
  });

  describe('Middleware Wrapper Functions', () => {
    it('should wrap handlers with security', async () => {
      const mockHandler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          headers: new Headers({ 'content-type': 'application/json' })
        })
      );

      const secureHandler = withSandboxSecurity(
        mockHandler,
        middleware,
        { pathParam: 'path' }
      );

      // Valid request should reach handler
      const validReq = new NextRequest('http://localhost:3000/api/test?path=valid.txt', {
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const validResult = await secureHandler(validReq);
      expect(mockHandler).toHaveBeenCalled();
      expect(validResult.status).toBe(200);

      // Invalid request should be blocked before handler
      mockHandler.mockClear();
      const invalidReq = new NextRequest('http://localhost:3000/api/test?path=../secret.txt', {
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const invalidResult = await secureHandler(invalidReq);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(invalidResult.status).toBe(403);
    });

    it('should create Next.js middleware', async () => {
      const nextMiddleware = middleware.createNextMiddleware({
        pathParam: 'path'
      });

      const req = new NextRequest('http://localhost:3000/api/test?path=../test.txt', {
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const result = await nextMiddleware(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });
  });

  describe('Error Handling', () => {
    it('should handle middleware errors gracefully', async () => {
      // Create middleware with invalid configuration to trigger errors
      const brokenMiddleware = new SandboxMiddleware({
        sandboxDir: '/proc/invalid-sandbox-path',
        enableLogging: false
      });

      const req = new NextRequest('http://localhost:3000/api/test?path=../trigger-error.txt', {
        headers: new Headers({ 'x-forwarded-for': '192.168.1.1' })
      });

      const result = await brokenMiddleware.validateRequest(req, {
        pathParam: 'path'
      });

      // Should return error response instead of throwing
      expect(result).not.toBeNull();
      expect(result?.status).toBe(403); // Security violation detected before filesystem error
    });
  });
});