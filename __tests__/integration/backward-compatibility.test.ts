/**
 * @jest-environment node
 */

// Mock Next.js server components before importing
jest.mock('next/server', () => {
  class MockNextRequest {
    url: string;
    method: string;
    headers: Map<string, string>;
    body: string;
    
    constructor(url: string, init?: any) {
      this.url = url;
      this.method = init?.method || 'GET';
      this.headers = new Map();
      
      // Handle headers - could be Headers object or plain object
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value: string, key: string) => {
            this.headers.set(key, value);
          });
        } else {
          Object.entries(init.headers).forEach(([key, value]) => {
            this.headers.set(key, value as string);
          });
        }
      }
      
      this.body = init?.body || '';
    }
    
    async json() {
      return JSON.parse(this.body || '{}');
    }
    
    async text() {
      return this.body;
    }
  }
  
  const MockNextResponse = {
    json: jest.fn((data: any, init?: any) => ({
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
      status: init?.status || 200,
      headers: new Map([
        ['Content-Type', 'application/json']
      ]),
      get: function(name: string) {
        return this.headers.get(name);
      }
    })),
  };
  
  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  };
});

import { NextRequest } from 'next/server';
import { POST as generateAICodeStream } from '../../app/api/generate-ai-code-stream/route';
import { LocalFileCacheAdapter } from '../../lib/local-file-cache';

// Mock file cache
jest.mock('../../lib/local-file-cache', () => ({
  LocalFileCacheAdapter: {
    getFiles: jest.fn(),
    updateFile: jest.fn(),
    getManifest: jest.fn(),
    setManifest: jest.fn(),
    getState: jest.fn()
  },
  initializeLocalFileCache: jest.fn(),
  getCachedFile: jest.fn(),
  updateCacheFile: jest.fn()
}));

// Mock console methods
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('Backward Compatibility Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).conversationState = undefined;

    // Setup default mock responses
    const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
    mockLocalFileCacheAdapter.getFiles.mockResolvedValue({
      'src/App.jsx': {
        content: 'import React from "react"; export default function App() { return <div>Hello</div>; }',
        lastModified: Date.now()
      }
    });
    mockLocalFileCacheAdapter.getManifest.mockResolvedValue({
      files: {
        'src/App.jsx': {
          content: 'import React from "react";',
          type: 'component',
          lastModified: Date.now(),
          path: 'src/App.jsx',
          relativePath: 'App.jsx'
        }
      },
      routes: [],
      componentTree: {},
      entryPoint: 'src/App.jsx',
      styleFiles: [],
      timestamp: Date.now()
    });
  });

  describe('Legacy API Request Format Compatibility', () => {
    it('should handle legacy request format without context wrapper', async () => {
      // Old format that frontend might still use
      const legacyRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          prompt: 'Create a button component',
          sandboxId: 'compat-test-sandbox',
          // No context wrapper - direct fields
          model: 'claude-3-5-sonnet'
        })
      });

      const response = await generateAICodeStream(legacyRequest);
      
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should handle mixed format with some legacy fields', async () => {
      const mixedRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Update header styling',
          sandboxId: 'compat-test-sandbox', // Legacy field
          context: {
            // New format context
            conversationContext: {
              scrapedWebsites: []
            }
          },
          isEdit: true
        })
      });

      const response = await generateAICodeStream(mixedRequest);
      expect(response.status).toBe(200);
    });

    it('should handle requests without model specification', async () => {
      const requestWithoutModel = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a footer',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
          // No model specified - should use default
        })
      });

      const response = await generateAICodeStream(requestWithoutModel);
      expect(response.status).toBe(200);
    });
  });

  describe('Legacy Response Format Compatibility', () => {
    it('should maintain expected SSE message types', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a simple component',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(request);
      const reader = response.body?.getReader();
      
      if (reader) {
        const decoder = new TextDecoder();
        const messageTypes = new Set<string>();
        let messagesProcessed = 0;
        
        try {
          while (messagesProcessed < 10) { // Process first 10 messages
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const dataLines = chunk.split('\n').filter(line => line.startsWith('data: '));
            
            for (const line of dataLines) {
              try {
                const data = JSON.parse(line.replace('data: ', ''));
                if (data.type) {
                  messageTypes.add(data.type);
                }
                messagesProcessed++;
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        // Should include expected legacy message types
        const expectedTypes = ['status', 'stream'];
        expectedTypes.forEach(type => {
          expect(messageTypes.has(type)).toBe(true);
        });
      }
    });

    it('should include legacy fields in stream messages', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component with packages',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(request);
      const reader = response.body?.getReader();
      
      if (reader) {
        const decoder = new TextDecoder();
        let foundLegacyFields = false;
        
        try {
          for (let i = 0; i < 10; i++) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const dataLines = chunk.split('\n').filter(line => line.startsWith('data: '));
            
            for (const line of dataLines) {
              try {
                const data = JSON.parse(line.replace('data: ', ''));
                
                // Check for legacy fields that frontend expects
                if (data.type === 'stream' && 'text' in data) {
                  foundLegacyFields = true;
                }
                if (data.type === 'complete' && 'generatedCode' in data) {
                  foundLegacyFields = true;
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
            
            if (foundLegacyFields) break;
          }
        } finally {
          reader.releaseLock();
        }
        
        expect(foundLegacyFields).toBe(true);
      }
    });
  });

  describe('Frontend Integration Compatibility', () => {
    it('should maintain EventSource compatible format', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a test component',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(request);
      
      // Check EventSource compatibility
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      
      // Check CORS headers for frontend access
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });

    it('should handle browser-specific request formats', async () => {
      // Simulate browser fetch request
      const browserRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          prompt: 'Create a modal component',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(browserRequest);
      expect(response.status).toBe(200);
    });

    it('should handle requests with different content-type headers', async () => {
      const requestWithCharset = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          prompt: 'Create a form component',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(requestWithCharset);
      expect(response.status).toBe(200);
    });
  });

  describe('Error Response Compatibility', () => {
    it('should maintain legacy error format for invalid requests', async () => {
      const invalidRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          // Missing prompt
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(invalidRequest);
      expect(response.status).toBe(400);
      
      const errorData = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(typeof errorData.error).toBe('string');
    });

    it('should handle errors in streaming format for compatibility', async () => {
      // Mock an error condition
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      mockLocalFileCacheAdapter.getState.mockRejectedValue(new Error('Test error'));

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: {
            sandboxId: 'error-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(request);
      expect(response.status).toBe(200); // Should still stream errors
    });
  });

  describe('Legacy Feature Support', () => {
    it('should support legacy conversation format', async () => {
      // Set up old-style conversation state
      (global as any).conversationState = {
        conversationId: 'legacy-conversation',
        startedAt: Date.now() - 3600000,
        lastUpdated: Date.now(),
        context: {
          messages: [
            {
              id: 'msg1',
              role: 'user',
              content: 'Create a button',
              timestamp: Date.now() - 1800000
            }
          ],
          edits: [],
          projectEvolution: { majorChanges: [] },
          userPreferences: {}
        }
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Update the button styling',
          context: {
            sandboxId: 'compat-test-sandbox'
          },
          isEdit: true
        })
      });

      const response = await generateAICodeStream(request);
      expect(response.status).toBe(200);
    });

    it('should handle legacy scraping format', async () => {
      const legacyScrapingRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Build a landing page',
          context: {
            sandboxId: 'compat-test-sandbox',
            conversationContext: {
              scrapedWebsites: [
                {
                  url: 'https://example.com',
                  content: 'Example content', // Legacy format without timestamp
                }
              ]
            }
          }
        })
      });

      const response = await generateAICodeStream(legacyScrapingRequest);
      expect(response.status).toBe(200);
    });

    it('should support legacy edit intent format', async () => {
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      mockLocalFileCacheAdapter.getManifest.mockResolvedValue({
        entryPoint: 'src/App.jsx',
        files: {
          'src/App.jsx': {
            type: 'component',
            content: 'export default function App() {}',
            componentInfo: { name: 'App', hasState: false },
            lastModified: Date.now(),
            path: 'src/App.jsx',
            relativePath: 'App.jsx'
          }
        },
        componentTree: {},
        routes: [],
        styleFiles: [],
        timestamp: Date.now()
      });

      const legacyEditRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Update App component',
          context: {
            sandboxId: 'compat-test-sandbox',
            currentFiles: {
              'src/App.jsx': 'export default function App() {}'
            }
          },
          isEdit: true
        })
      });

      const response = await generateAICodeStream(legacyEditRequest);
      expect(response.status).toBe(200);
    });
  });

  describe('Performance Regression Testing', () => {
    it('should not significantly increase response times', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a simple button',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const startTime = Date.now();
      const response = await generateAICodeStream(request);
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });

    it('should handle legacy large request formats efficiently', async () => {
      const largeContextRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a dashboard',
          context: {
            sandboxId: 'compat-test-sandbox',
            currentFiles: Object.fromEntries(
              Array.from({ length: 50 }, (_, i) => [
                `src/Component${i}.jsx`,
                `export default function Component${i}() { return <div>Component ${i}</div>; }`
              ])
            ),
            structure: Array.from({ length: 50 }, (_, i) => `src/Component${i}.jsx`).join('\n')
          },
          isEdit: true
        })
      });

      const startTime = Date.now();
      const response = await generateAICodeStream(largeContextRequest);
      const processingTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(processingTime).toBeLessThan(10000); // Should handle large requests within 10 seconds
    });
  });

  describe('Data Format Consistency', () => {
    it('should maintain consistent field names across versions', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a navbar',
          context: {
            sandboxId: 'compat-test-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(request);
      const reader = response.body?.getReader();
      
      if (reader) {
        const decoder = new TextDecoder();
        const requiredFields: Record<string, string[]> = {
          status: ['type', 'message'],
          stream: ['type', 'text'],
          complete: ['type', 'generatedCode']
        };
        
        const foundFields: Record<string, string[]> = {};
        
        try {
          for (let i = 0; i < 20; i++) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const dataLines = chunk.split('\n').filter(line => line.startsWith('data: '));
            
            for (const line of dataLines) {
              try {
                const data = JSON.parse(line.replace('data: ', ''));
                if (data.type && requiredFields[data.type]) {
                  foundFields[data.type] = Object.keys(data);
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
        
        // Verify required fields are present
        Object.entries(requiredFields).forEach(([type, fields]) => {
          if (foundFields[type]) {
            fields.forEach(field => {
              expect(foundFields[type]).toContain(field);
            });
          }
        });
      }
    });
  });
});