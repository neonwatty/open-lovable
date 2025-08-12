import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/scrape-url-enhanced/route';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console.log to avoid noise in tests
const mockConsole = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('/api/scrape-url-enhanced API tests', () => {
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
      statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Internal Server Error',
      headers: new Map([['content-type', contentType]]),
      text: () => Promise.resolve(html),
    } as Response;
  };

  describe('Input validation', () => {
    it('should return 400 when URL is missing', async () => {
      const request = createMockRequest({});
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('URL is required');
    });

    it('should return error for invalid URL format', async () => {
      const request = createMockRequest({ url: 'not-a-valid-url' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid URL format');
    });

    it('should return error for non-HTTP/HTTPS protocols', async () => {
      const request = createMockRequest({ url: 'ftp://example.com' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Only HTTP and HTTPS URLs are allowed');
    });
  });

  describe('Successful scraping', () => {
    it('should successfully scrape a simple HTML page', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="A test page">
          <meta name="keywords" content="test, page">
        </head>
        <body>
          <h1>Welcome</h1>
          <p>This is a test paragraph.</p>
          <a href="https://link.com">Test Link</a>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.url).toBe(testUrl);
      expect(data.structured.title).toBe('Test Page');
      expect(data.structured.description).toBe('A test page');
      expect(data.content).toContain('Title: Test Page');
      expect(data.content).toContain('Description: A test page');
      expect(data.content).toContain('# Welcome');
      expect(data.content).toContain('This is a test paragraph.');
      expect(data.content).toContain('[Test Link](https://link.com)');
      expect(data.metadata.scraper).toBe('local-fetch');
      expect(data.metadata.cached).toBe(false);
    });

    it('should handle pages with complex metadata', async () => {
      const testUrl = 'https://example.com/article';
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Article Title</title>
          <meta name="description" content="Article description">
          <meta name="author" content="John Doe">
          <meta name="keywords" content="article, test, content">
          <meta property="og:title" content="OG Article Title">
          <meta property="og:description" content="OG Article description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta name="twitter:title" content="Twitter Article Title">
          <meta property="article:published_time" content="2023-06-15T10:30:00Z">
        </head>
        <body>
          <h1>Main Heading</h1>
          <h2>Subheading</h2>
          <p>First paragraph with <strong>bold text</strong>.</p>
          <ul>
            <li>List item 1</li>
            <li>List item 2</li>
          </ul>
          <ol>
            <li>Numbered item 1</li>
            <li>Numbered item 2</li>
          </ol>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.structured.title).toBe('Article Title'); // Should prefer <title> over OG
      expect(data.structured.description).toBe('Article description');
      expect(data.content).toContain('# Main Heading');
      expect(data.content).toContain('## Subheading');
      expect(data.content).toContain('- List item 1');
      expect(data.content).toContain('1. Numbered item 1');
      expect(data.metadata.author).toBe('John Doe');
      expect(data.metadata.keywords).toBe('article, test, content');
      expect(data.metadata.publishedTime).toBe('2023-06-15T10:30:00Z');
      expect(data.metadata.image).toBe('https://example.com/image.jpg');
    });

    it('should sanitize special characters', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test "Smart Quotes" and 'Apostrophes'</title>
          <meta name="description" content="Content with—dashes and…ellipsis">
        </head>
        <body>
          <p>"Smart quotes" and 'smart apostrophes' should be—normalized…</p>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.structured.title).toContain('"Smart Quotes"');
      expect(data.structured.title).toContain("'Apostrophes'");
      expect(data.structured.description).toContain('-dashes');
      expect(data.structured.description).toContain('...ellipsis');
      expect(data.content).toContain('"Smart quotes"');
      expect(data.content).toContain("'smart apostrophes'");
      expect(data.content).toContain('-normalized...');
    });

    it('should remove script and style elements', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Clean Content</title>
          <style>body { color: red; }</style>
        </head>
        <body>
          <p>Visible content</p>
          <script>alert('malicious');</script>
          <p>More visible content</p>
          <noscript>No script content</noscript>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.content).toContain('Visible content');
      expect(data.content).toContain('More visible content');
      expect(data.content).not.toContain('alert');
      expect(data.content).not.toContain('color: red');
      expect(data.content).not.toContain('malicious');
    });
  });

  describe('Error handling', () => {
    it('should handle HTTP error responses', async () => {
      const testUrl = 'https://example.com/404';
      mockFetch.mockResolvedValueOnce(createMockResponse('Not Found', 404));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('HTTP error! status: 404');
    });

    it('should handle non-HTML content types', async () => {
      const testUrl = 'https://example.com/data.json';
      mockFetch.mockResolvedValueOnce(createMockResponse('{"data": "json"}', 200, 'application/json'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('URL does not return HTML content');
    });

    it('should handle empty content', async () => {
      const testUrl = 'https://example.com/empty';
      mockFetch.mockResolvedValueOnce(createMockResponse('', 200, 'text/html'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('No content found at URL');
    });

    it('should handle network timeouts', async () => {
      const testUrl = 'https://slow-example.com';
      
      // Create a custom AbortError
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

    it('should handle network errors', async () => {
      const testUrl = 'https://unreachable-example.com';
      mockFetch.mockRejectedValueOnce(new Error('Network error: ENOTFOUND'));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Network error: ENOTFOUND');
    });
  });

  describe('Request headers', () => {
    it('should send appropriate headers', async () => {
      const testUrl = 'https://example.com';
      const testHtml = '<html><body><p>Test</p></body></html>';
      
      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest({ url: testUrl });
      await POST(request);

      expect(mockFetch).toHaveBeenCalledWith(
        testUrl,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'User-Agent': 'Mozilla/5.0 (compatible; Open-Lovable-Bot/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          }),
          signal: expect.any(AbortSignal),
          redirect: 'follow',
        })
      );
    });
  });

  describe('Response format compatibility', () => {
    it('should return response in expected format', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      // Check required fields exist
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('content');
      expect(data).toHaveProperty('structured');
      expect(data).toHaveProperty('metadata');
      expect(data).toHaveProperty('message');

      // Check structured object format
      expect(data.structured).toHaveProperty('title');
      expect(data.structured).toHaveProperty('description');
      expect(data.structured).toHaveProperty('content');
      expect(data.structured).toHaveProperty('url');

      // Check metadata format
      expect(data.metadata).toHaveProperty('scraper');
      expect(data.metadata).toHaveProperty('timestamp');
      expect(data.metadata).toHaveProperty('contentLength');
      expect(data.metadata).toHaveProperty('cached');
      expect(data.metadata).toHaveProperty('title');
      expect(data.metadata).toHaveProperty('description');
      expect(data.metadata).toHaveProperty('keywords');
      expect(data.metadata).toHaveProperty('author');
      expect(data.metadata).toHaveProperty('publishedTime');
      expect(data.metadata).toHaveProperty('image');
      expect(data.metadata).toHaveProperty('url');

      // Check metadata values
      expect(data.metadata.scraper).toBe('local-fetch');
      expect(data.metadata.cached).toBe(false);
      expect(typeof data.metadata.timestamp).toBe('string');
      expect(typeof data.metadata.contentLength).toBe('number');
    });

    it('should format content with proper structure', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="Test description">
        </head>
        <body><p>Test content</p></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest({ url: testUrl });
      const response = await POST(request);
      const data = await response.json();

      // Check content format matches expected structure
      expect(data.content).toContain('Title: Test Page');
      expect(data.content).toContain('Description: Test description');
      expect(data.content).toContain('URL: https://example.com');
      expect(data.content).toContain('Main Content:');
      expect(data.content).toContain('Test content');
      
      // Content should be properly trimmed
      expect(data.content.startsWith('Title:')).toBe(true);
      expect(data.content.endsWith('\n')).toBe(false);
    });
  });
});