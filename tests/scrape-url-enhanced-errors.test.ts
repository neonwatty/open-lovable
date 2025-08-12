import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/scrape-url-enhanced/route';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console to avoid noise in tests
const mockConsole = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('scrape-url-enhanced error handling tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/scrape-url-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const createMockResponse = (html: string, status: number = 200, contentType: string = 'text/html') => {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: getStatusText(status),
      headers: new Map([['content-type', contentType]]),
      text: () => Promise.resolve(html),
    } as Response;
  };

  const getStatusText = (status: number): string => {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return statusTexts[status] || 'Unknown';
  };

  describe('URL validation errors', () => {
    it('should reject malformed URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'http://',
        'https://',
        '://example.com',
        'htp://example.com',
        'http://[invalid-ipv6',
        'http://example..com',
        'http://.example.com',
      ];

      for (const url of invalidUrls) {
        const request = createMockRequest({ url });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Invalid URL format');
      }
    });

    it('should reject non-HTTP/HTTPS protocols', async () => {
      const invalidProtocols = [
        'ftp://example.com',
        'file:///path/to/file',
        'data:text/html,<h1>Hello</h1>',
        'javascript:alert("xss")',
        'mailto:test@example.com',
        'tel:+1234567890',
        'ssh://user@example.com',
      ];

      for (const url of invalidProtocols) {
        const request = createMockRequest({ url });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Only HTTP and HTTPS URLs are allowed');
      }
    });

    it('should accept valid HTTP and HTTPS URLs', async () => {
      const validUrls = [
        'http://example.com',
        'https://example.com',
        'https://subdomain.example.com',
        'https://example.com:8080',
        'https://example.com/path/to/resource',
        'https://example.com/path?query=value',
        'https://example.com/path#fragment',
        'https://192.168.1.1',
        'https://[2001:db8::1]',
      ];

      const mockHtml = '<html><head><title>Test</title></head><body><p>Content</p></body></html>';

      for (const url of validUrls) {
        mockFetch.mockResolvedValueOnce(createMockResponse(mockHtml));
        
        const request = createMockRequest({ url });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.url).toBe(url);
      }
    });
  });

  describe('HTTP status code errors', () => {
    const errorCodes = [
      { code: 400, text: 'Bad Request' },
      { code: 401, text: 'Unauthorized' },
      { code: 403, text: 'Forbidden' },
      { code: 404, text: 'Not Found' },
      { code: 500, text: 'Internal Server Error' },
      { code: 502, text: 'Bad Gateway' },
      { code: 503, text: 'Service Unavailable' },
      { code: 504, text: 'Gateway Timeout' },
    ];

    errorCodes.forEach(({ code, text }) => {
      it(`should handle ${code} ${text} responses`, async () => {
        const testUrl = 'https://example.com';
        mockFetch.mockResolvedValueOnce(createMockResponse('Error content', code));

        const request = createMockRequest({ url: testUrl });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toContain(`HTTP error! status: ${code} ${text}`);
      });
    });
  });

  describe('Content type validation errors', () => {
    const nonHtmlContentTypes = [
      'application/json',
      'application/xml',
      'text/plain',
      'text/css',
      'text/javascript',
      'application/javascript',
      'image/png',
      'image/jpeg',
      'image/gif',
      'application/pdf',
      'application/zip',
      'video/mp4',
      'audio/mpeg',
    ];

    nonHtmlContentTypes.forEach((contentType) => {
      it(`should reject ${contentType} content type`, async () => {
        const testUrl = 'https://example.com';
        const content = contentType.startsWith('application/json') ? '{"data": "test"}' : 'Content';
        
        mockFetch.mockResolvedValueOnce(createMockResponse(content, 200, contentType));

        const request = createMockRequest({ url: testUrl });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe('URL does not return HTML content');
      });
    });

    it('should accept text/html content type', async () => {
      const testUrl = 'https://example.com';
      const html = '<html><head><title>Test</title></head><body><p>Content</p></body></html>';
      
      mockFetch.mockResolvedValueOnce(createMockResponse(html, 200, 'text/html; charset=utf-8'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should accept application/xhtml+xml content type', async () => {
      const testUrl = 'https://example.com';
      const xhtml = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Test</title></head><body><p>Content</p></body></html>';
      
      mockFetch.mockResolvedValueOnce(createMockResponse(xhtml, 200, 'application/xhtml+xml'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Empty content errors', () => {
    it('should handle empty response body', async () => {
      const testUrl = 'https://example.com';
      mockFetch.mockResolvedValueOnce(createMockResponse('', 200, 'text/html'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('No content found at URL');
    });

    it('should handle whitespace-only response body', async () => {
      const testUrl = 'https://example.com';
      mockFetch.mockResolvedValueOnce(createMockResponse('   \n\t  \r\n  ', 200, 'text/html'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('No content found at URL');
    });
  });

  describe('Network timeout errors', () => {
    it('should handle AbortError (timeout)', async () => {
      const testUrl = 'https://slow-example.com';
      
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      mockFetch.mockRejectedValueOnce(abortError);

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(408);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Request timeout - URL took too long to respond');
    });

    it('should handle fetch timeout with different AbortError variations', async () => {
      const testUrl = 'https://timeout-example.com';
      
      // Test different AbortError variations
      const abortErrors = [
        { name: 'AbortError', message: 'The user aborted a request.' },
        { name: 'AbortError', message: 'Request was aborted' },
        { name: 'AbortError', message: 'signal is aborted without reason' },
      ];

      for (const errorProps of abortErrors) {
        mockFetch.mockClear();
        const abortError = new Error(errorProps.message);
        abortError.name = errorProps.name;
        
        mockFetch.mockRejectedValueOnce(abortError);

        const request = createMockRequest({ url: testUrl });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(408);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Request timeout - URL took too long to respond');
      }
    });
  });

  describe('Network connection errors', () => {
    const networkErrors = [
      'ENOTFOUND example.com',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ETIMEDOUT',
      'ECONNRESET',
      'EPIPE',
      'Network request failed',
      'fetch is not defined',
      'TypeError: Failed to fetch',
    ];

    networkErrors.forEach((errorMessage) => {
      it(`should handle network error: ${errorMessage}`, async () => {
        const testUrl = 'https://unreachable-example.com';
        mockFetch.mockRejectedValueOnce(new Error(errorMessage));

        const request = createMockRequest({ url: testUrl });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe(errorMessage);
      });
    });
  });

  describe('Malformed response errors', () => {
    it('should handle response.text() throwing an error', async () => {
      const testUrl = 'https://broken-example.com';
      
      const brokenResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/html']]),
        text: () => Promise.reject(new Error('Failed to read response body')),
      } as Response;

      mockFetch.mockResolvedValueOnce(brokenResponse);

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to read response body');
    });

    it('should handle missing content-type header', async () => {
      const testUrl = 'https://no-content-type-example.com';
      const html = '<html><body><p>Content</p></body></html>';
      
      const responseWithoutContentType = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(), // No content-type header
        text: () => Promise.resolve(html),
      } as Response;

      mockFetch.mockResolvedValueOnce(responseWithoutContentType);

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('URL does not return HTML content');
    });
  });

  describe('Request parsing errors', () => {
    it('should handle invalid JSON in request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/scrape-url-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"url": invalid json}',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unexpected token');
    });

    it('should handle empty request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/scrape-url-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unexpected end of JSON input');
    });
  });

  describe('Edge case errors', () => {
    it('should handle extremely large responses gracefully', async () => {
      const testUrl = 'https://large-content-example.com';
      // Create a large HTML string (1MB+)
      const largeContent = '<p>' + 'x'.repeat(1024 * 1024) + '</p>';
      const largeHtml = `<html><head><title>Large Page</title></head><body>${largeContent}</body></html>`;
      
      mockFetch.mockResolvedValueOnce(createMockResponse(largeHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      // Should still succeed, just with large content
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.metadata.contentLength).toBeGreaterThan(1024 * 1024);
    });

    it('should handle malformed HTML gracefully', async () => {
      const testUrl = 'https://malformed-html-example.com';
      const malformedHtml = '<html><head><title>Test</title><body><p>Unclosed paragraph<div>Nested content</html>';
      
      mockFetch.mockResolvedValueOnce(createMockResponse(malformedHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      // Cheerio should handle malformed HTML gracefully
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.structured.title).toBe('Test');
      expect(data.content).toContain('Unclosed paragraph');
    });

    it('should handle binary data disguised as HTML', async () => {
      const testUrl = 'https://binary-example.com';
      // Create binary data that might be returned with text/html content-type
      const binaryData = '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00...';
      
      mockFetch.mockResolvedValueOnce(createMockResponse(binaryData, 200, 'text/html'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      // Should handle binary data gracefully
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});