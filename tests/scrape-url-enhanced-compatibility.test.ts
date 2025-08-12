import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/scrape-url-enhanced/route';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console to avoid noise in tests
const mockConsole = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('scrape-url-enhanced API compatibility tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockRequest = (url: string) => {
    return new NextRequest('http://localhost:3000/api/scrape-url-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  };

  const createMockResponse = (html: string, status: number = 200, contentType: string = 'text/html; charset=utf-8') => {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Map([['content-type', contentType]]),
      text: () => Promise.resolve(html),
    } as Response;
  };

  describe('Firecrawl API response format compatibility', () => {
    it('should return response structure identical to Firecrawl format', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="Test description">
          <meta name="keywords" content="test, page">
          <meta name="author" content="Test Author">
          <meta property="og:image" content="https://example.com/image.jpg">
        </head>
        <body>
          <h1>Main Heading</h1>
          <p>Test content</p>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Check top-level response structure
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('content');
      expect(data).toHaveProperty('structured');
      expect(data).toHaveProperty('metadata');
      expect(data).toHaveProperty('message');

      // Verify data types
      expect(typeof data.success).toBe('boolean');
      expect(typeof data.url).toBe('string');
      expect(typeof data.content).toBe('string');
      expect(typeof data.structured).toBe('object');
      expect(typeof data.metadata).toBe('object');
      expect(typeof data.message).toBe('string');

      // Check structured object properties
      expect(data.structured).toHaveProperty('title');
      expect(data.structured).toHaveProperty('description');
      expect(data.structured).toHaveProperty('content');
      expect(data.structured).toHaveProperty('url');

      // Check metadata object properties
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

      // Verify specific values
      expect(data.success).toBe(true);
      expect(data.url).toBe(testUrl);
      expect(data.structured.url).toBe(testUrl);
      expect(data.metadata.url).toBe(testUrl);
      expect(data.metadata.scraper).toBe('local-fetch');
      expect(data.metadata.cached).toBe(false);
    });

    it('should format content string exactly like Firecrawl', async () => {
      const testUrl = 'https://example.com/article';
      const testHtml = `
        <html>
        <head>
          <title>Article Title</title>
          <meta name="description" content="Article description">
        </head>
        <body>
          <h1>Main Heading</h1>
          <p>Paragraph content</p>
          <ul>
            <li>List item 1</li>
            <li>List item 2</li>
          </ul>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Content should follow Firecrawl format
      const expectedPattern = /^Title: .*\nDescription: .*\nURL: .*\n\nMain Content:\n/;
      expect(data.content).toMatch(expectedPattern);
      
      // Should start with Title:
      expect(data.content.startsWith('Title: Article Title')).toBe(true);
      
      // Should contain Description:
      expect(data.content).toContain('Description: Article description');
      
      // Should contain URL:
      expect(data.content).toContain(`URL: ${testUrl}`);
      
      // Should have Main Content section
      expect(data.content).toContain('Main Content:');
      
      // Should be properly trimmed (no trailing newlines)
      expect(data.content.endsWith('\n')).toBe(false);
    });

    it('should handle sanitizeQuotes function compatibility', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head>
          <title>"Smart Quotes" and 'Apostrophes' — Test</title>
          <meta name="description" content="Content with…ellipsis and non-breaking spaces">
        </head>
        <body>
          <p>"Smart quotes" should be normalized…</p>
          <p>Em—dashes and en–dashes too.</p>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Check that smart quotes are sanitized in all places
      expect(data.structured.title).toBe('"Smart Quotes" and \'Apostrophes\' - Test');
      expect(data.structured.description).toBe('Content with...ellipsis and non-breaking spaces');
      expect(data.content).toContain('"Smart Quotes"');
      expect(data.content).toContain('\'Apostrophes\'');
      expect(data.content).toContain('"Smart quotes"');
      expect(data.content).toContain('...ellipsis');
      expect(data.content).toContain('Em-dashes and en-dashes');
      
      // Should not contain any unsanitized characters
      expect(data.content).not.toContain('\u201C'); // Left double quote
      expect(data.content).not.toContain('\u201D'); // Right double quote
      expect(data.content).not.toContain('\u2018'); // Left single quote
      expect(data.content).not.toContain('\u2019'); // Right single quote
      expect(data.content).not.toContain('\u2014'); // Em dash
      expect(data.content).not.toContain('\u2013'); // En dash
      expect(data.content).not.toContain('\u2026'); // Ellipsis
    });

    it('should handle empty or missing metadata gracefully like Firecrawl', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <body>
          <p>Content without metadata</p>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Should still return all required fields, even if empty
      expect(data.structured.title).toBe('');
      expect(data.structured.description).toBe('');
      expect(data.metadata.title).toBe('');
      expect(data.metadata.description).toBe('');
      expect(data.metadata.keywords).toBe('');
      expect(data.metadata.author).toBe('');
      expect(data.metadata.publishedTime).toBe('');
      expect(data.metadata.image).toBe('');
      
      // Content should still be formatted properly
      expect(data.content).toContain('Title: ');
      expect(data.content).toContain('Description: ');
      expect(data.content).toContain('URL: https://example.com');
      expect(data.content).toContain('Main Content:');
      expect(data.content).toContain('Content without metadata');
    });

    it('should match Firecrawl timestamp format', async () => {
      const testUrl = 'https://example.com';
      const testHtml = '<html><body><p>Test</p></body></html>';

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Should be ISO 8601 format
      expect(data.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Should be a valid date
      const timestamp = new Date(data.metadata.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
      
      // Should be recent (within last few seconds)
      const now = new Date();
      const timeDiff = Math.abs(now.getTime() - timestamp.getTime());
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });

    it('should calculate contentLength like Firecrawl', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head><title>Test Title</title></head>
        <body><p>Test content</p></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // contentLength should match the actual content string length
      expect(data.metadata.contentLength).toBe(data.content.length);
      expect(typeof data.metadata.contentLength).toBe('number');
      expect(data.metadata.contentLength).toBeGreaterThan(0);
    });
  });

  describe('Error response format compatibility', () => {
    it('should return Firecrawl-compatible error format for invalid URLs', async () => {
      const request = createMockRequest('invalid-url');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('error');
      expect(data.success).toBe(false);
      expect(typeof data.error).toBe('string');
      expect(data.error).toBeTruthy();
      
      // Should not have success response fields
      expect(data).not.toHaveProperty('url');
      expect(data).not.toHaveProperty('content');
      expect(data).not.toHaveProperty('structured');
      expect(data).not.toHaveProperty('metadata');
    });

    it('should return Firecrawl-compatible error format for network errors', async () => {
      const testUrl = 'https://nonexistent.example.com';
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Network error');
      expect(typeof data.error).toBe('string');
    });

    it('should return 408 for timeout errors like Firecrawl', async () => {
      const testUrl = 'https://slow.example.com';
      const abortError = new Error('Request timeout');
      abortError.name = 'AbortError';
      
      mockFetch.mockRejectedValueOnce(abortError);

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(408);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Request timeout - URL took too long to respond');
    });

    it('should return 400 for missing URL like Firecrawl', async () => {
      const request = new NextRequest('http://localhost:3000/api/scrape-url-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('URL is required');
    });
  });

  describe('Message field compatibility', () => {
    it('should return appropriate success message', async () => {
      const testUrl = 'https://example.com';
      const testHtml = '<html><body><p>Test</p></body></html>';

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      expect(data.message).toBe('URL scraped successfully with local fetch');
      expect(typeof data.message).toBe('string');
    });

    it('should update scraper identifier in metadata', async () => {
      const testUrl = 'https://example.com';
      const testHtml = '<html><body><p>Test</p></body></html>';

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Should indicate local scraper instead of firecrawl
      expect(data.metadata.scraper).toBe('local-fetch');
      expect(data.metadata.cached).toBe(false); // Local scraper doesn't cache
    });
  });

  describe('Field presence and type validation', () => {
    it('should ensure all required fields are present with correct types', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head>
          <title>Complete Test</title>
          <meta name="description" content="Complete description">
          <meta name="keywords" content="test, complete">
          <meta name="author" content="Test Author">
          <meta property="article:published_time" content="2023-06-15T10:00:00Z">
          <meta property="og:image" content="https://example.com/image.jpg">
        </head>
        <body>
          <h1>Test Content</h1>
          <p>Complete test content</p>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Validate top-level response types
      expect(typeof data.success).toBe('boolean');
      expect(typeof data.url).toBe('string');
      expect(typeof data.content).toBe('string');
      expect(typeof data.structured).toBe('object');
      expect(typeof data.metadata).toBe('object');
      expect(typeof data.message).toBe('string');

      // Validate structured object types
      expect(typeof data.structured.title).toBe('string');
      expect(typeof data.structured.description).toBe('string');
      expect(typeof data.structured.content).toBe('string');
      expect(typeof data.structured.url).toBe('string');

      // Validate metadata object types
      expect(typeof data.metadata.scraper).toBe('string');
      expect(typeof data.metadata.timestamp).toBe('string');
      expect(typeof data.metadata.contentLength).toBe('number');
      expect(typeof data.metadata.cached).toBe('boolean');
      expect(typeof data.metadata.title).toBe('string');
      expect(typeof data.metadata.description).toBe('string');
      expect(typeof data.metadata.keywords).toBe('string');
      expect(typeof data.metadata.author).toBe('string');
      expect(typeof data.metadata.publishedTime).toBe('string');
      expect(typeof data.metadata.image).toBe('string');
      expect(typeof data.metadata.url).toBe('string');

      // Validate field content
      expect(data.structured.title).toBe('Complete Test');
      expect(data.structured.description).toBe('Complete description');
      expect(data.metadata.keywords).toBe('test, complete');
      expect(data.metadata.author).toBe('Test Author');
      expect(data.metadata.publishedTime).toBe('2023-06-15T10:00:00Z');
      expect(data.metadata.image).toBe('https://example.com/image.jpg');
    });

    it('should handle arrays and objects in metadata consistently', async () => {
      const testUrl = 'https://example.com';
      const testHtml = '<html><body><p>Test</p></body></html>';

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Metadata should be a flat object, not nested arrays or complex objects
      Object.values(data.metadata).forEach(value => {
        const type = typeof value;
        expect(['string', 'number', 'boolean'].includes(type)).toBe(true);
      });

      // Structured should also be a flat object
      Object.values(data.structured).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('Content consistency validation', () => {
    it('should ensure structured.content matches processed main content', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head><title>Test Title</title></head>
        <body>
          <h1>Main Heading</h1>
          <p>Test paragraph</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // structured.content should contain the markdown-converted content
      expect(data.structured.content).toContain('# Main Heading');
      expect(data.structured.content).toContain('Test paragraph');
      expect(data.structured.content).toContain('- Item 1');
      expect(data.structured.content).toContain('- Item 2');

      // content should contain the formatted version with title/description/url
      expect(data.content).toContain('Title: Test Title');
      expect(data.content).toContain('Main Content:');
      expect(data.content).toContain(data.structured.content);
    });

    it('should ensure metadata fields match structured fields where applicable', async () => {
      const testUrl = 'https://example.com';
      const testHtml = `
        <html>
        <head>
          <title>Consistency Test</title>
          <meta name="description" content="Test description for consistency">
        </head>
        <body><p>Content</p></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(testHtml));

      const request = createMockRequest(testUrl);
      const response = await POST(request);
      const data = await response.json();

      // Title should match between structured and metadata
      expect(data.structured.title).toBe(data.metadata.title);
      
      // Description should match between structured and metadata  
      expect(data.structured.description).toBe(data.metadata.description);
      
      // URL should match between structured and metadata
      expect(data.structured.url).toBe(data.metadata.url);
      expect(data.structured.url).toBe(data.url);
    });
  });
});