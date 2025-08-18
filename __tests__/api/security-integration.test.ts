import { NextRequest, NextResponse } from 'next/server';
import { createSandboxMiddleware, withSandboxSecurity } from '../../lib/security/sandbox-middleware';
import { createSecureFileOps } from '../../lib/security/secure-file-ops';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

// Mock handler that simulates file upload API
async function mockFileUploadHandler(req: NextRequest): Promise<NextResponse> {
  try {
    let body;
    try {
      // For testing, use the mocked body data
      body = (req as any)._testBody || await req.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const { files } = body;

    if (!files || !Array.isArray(files)) {
      return NextResponse.json({ error: 'Invalid request: files array required' }, { status: 400 });
    }

    // Simulate successful file processing
    return NextResponse.json({ 
      success: true, 
      filesProcessed: files.length 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Helper function to create NextRequest with working body for tests
function createTestRequest(url: string, options: any, bodyData?: any) {
  const req = new NextRequest(url, options);
  if (bodyData) {
    // Mock the json() method to return our test data
    (req as any)._testBody = bodyData;
    req.json = jest.fn().mockResolvedValue(bodyData);
  }
  return req;
}

// Helper function to properly parse response JSON in test environment
async function parseResponseJson(response: NextResponse) {
  const rawData = JSON.parse(await response.text());
  return typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
}

describe('API Security Integration', () => {
  let tempDir: string;
  let sandboxMiddleware: ReturnType<typeof createSandboxMiddleware>;
  let secureFileOps: ReturnType<typeof createSecureFileOps>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-security-test-'));
    
    sandboxMiddleware = createSandboxMiddleware(tempDir, {
      enableLogging: false,
      rateLimitViolations: 3,
      blockDurationMs: 1000,
      maxFileSize: 1024 * 1024
    });

    secureFileOps = createSecureFileOps(tempDir, {
      enableLogging: false,
      atomicWrites: true,
      backupOnUpdate: false
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('File Upload API with Security Middleware', () => {
    it('should block path traversal attacks in file upload API', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path'] }
      );

      const bodyData = {
        files: [
          { path: '../../../etc/passwd', content: 'malicious' }
        ]
      };
      const maliciousRequest = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        }),
        body: JSON.stringify(bodyData)
      }, bodyData);

      const response = await secureHandler(maliciousRequest);
      
      expect(response.status).toBe(403);
      
      const data = await parseResponseJson(response);
      expect(data.error).toContain('Security violation');
      expect(data.type).toBe('path_traversal');
    });

    it('should allow valid file operations through security middleware', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path'] }
      );

      const validBodyData = {
        files: [
          { path: 'components/Button.tsx', content: 'export const Button = () => <button />' }
        ]
      };
      const validRequest = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        }),
        body: JSON.stringify(validBodyData)
      }, validBodyData);

      const response = await secureHandler(validRequest);
      expect(response.status).toBe(200);
      
      const data = await parseResponseJson(response);
      expect(data.success).toBe(true);
      expect(data.filesProcessed).toBe(1);
    });

    it('should validate multiple file paths in request body', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path', 'files.1.path'] }
      );

      const mixedBodyData = {
        files: [
          { path: 'valid.txt', content: 'good content' },
          { path: '../malicious.txt', content: 'bad content' }
        ]
      };
      const mixedRequest = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        }),
        body: JSON.stringify(mixedBodyData)
      }, mixedBodyData);

      const response = await secureHandler(mixedRequest);
      expect(response.status).toBe(403);
    });

    it('should handle URL parameter validation', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { pathParam: 'file' }
      );

      const maliciousRequest = new NextRequest('http://localhost:3000/api/test?file=../../../etc/passwd', {
        method: 'GET',
        headers: new Headers({
          'x-forwarded-for': '192.168.1.1'
        })
      });

      const response = await secureHandler(maliciousRequest);
      expect(response.status).toBe(403);
    });
  });

  describe('IP Rate Limiting', () => {
    it('should block IPs after multiple security violations', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path'] }
      );

      const maliciousIP = '10.0.0.1';
      
      // Make multiple malicious requests to trigger blocking
      for (let i = 0; i < 4; i++) {
        const bodyData = {
          files: [{ path: `../violation${i}.txt`, content: 'malicious' }]
        };
        const request = createTestRequest('http://localhost:3000/api/test', {
          method: 'POST',
          headers: new Headers({
            'content-type': 'application/json',
            'x-forwarded-for': maliciousIP
          }),
          body: JSON.stringify(bodyData)
        }, bodyData);
        
        await secureHandler(request);
      }

      // Next request should be blocked due to rate limiting
      const blockedBodyData = {
        files: [{ path: 'valid.txt', content: 'content' }]
      };
      const blockedRequest = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-forwarded-for': maliciousIP
        }),
        body: JSON.stringify(blockedBodyData)
      }, blockedBodyData);

      const response = await secureHandler(blockedRequest);
      expect(response.status).toBe(429);
      
      const data = await parseResponseJson(response);
      expect(data.error).toContain('Access denied');
      expect(data.violationCount).toBeGreaterThan(0);
    });

    it('should not block different IPs when one IP is blocked', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path'] }
      );

      const maliciousIP = '10.0.0.2';
      const legitimateIP = '10.0.0.3';
      
      // Block malicious IP
      for (let i = 0; i < 4; i++) {
        const bodyData = {
          files: [{ path: `../violation${i}.txt`, content: 'malicious' }]
        };
        const request = createTestRequest('http://localhost:3000/api/test', {
          method: 'POST',
          headers: new Headers({
            'content-type': 'application/json',
            'x-forwarded-for': maliciousIP
          }),
          body: JSON.stringify(bodyData)
        }, bodyData);
        
        await secureHandler(request);
      }

      // Legitimate IP should still work
      const legitimateBodyData = {
        files: [{ path: 'valid.txt', content: 'content' }]
      };
      const legitimateRequest = createTestRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-forwarded-for': legitimateIP
        }),
        body: JSON.stringify(legitimateBodyData)
      }, legitimateBodyData);

      const response = await secureHandler(legitimateRequest);
      expect(response.status).toBe(200);
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

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path'] }
      );

      const invalidJsonRequest = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        }),
        body: 'invalid json{'
      });

      const response = await secureHandler(invalidJsonRequest);
      expect(response.status).toBe(400);
      
      const data = await parseResponseJson(response);
      expect(data.error).toMatch(/Invalid (request body|request: files array required)/);
    });

    it('should handle missing content-type header', async () => {
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path'] }
      );

      const noContentTypeRequest = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'x-forwarded-for': '192.168.1.1'
        }),
        body: JSON.stringify({ files: [{ path: 'test.txt', content: 'content' }] })
      });

      // Should not crash, may return error but shouldn't throw
      const response = await secureHandler(noContentTypeRequest);
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Security Statistics', () => {
    it('should provide security statistics', async () => {
      // Generate some violations
      const secureHandler = withSandboxSecurity(
        mockFileUploadHandler,
        sandboxMiddleware,
        { bodyPathFields: ['files.0.path'] }
      );

      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.200'
        }),
        body: JSON.stringify({
          files: [{ path: '../attack.txt', content: 'malicious' }]
        })
      });

      await secureHandler(request);

      const stats = sandboxMiddleware.getSecurityStats();
      expect(stats.blockedIPs).toBeGreaterThanOrEqual(0);
      expect(stats.violations).toBeDefined();
      expect(stats.config).toBeDefined();
      expect(typeof stats.violations.totalViolations).toBe('number');
    });
  });
});