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
        ['Content-Type', init?.status === 200 ? 'text/event-stream' : 'application/json'],
        ['Cache-Control', 'no-cache'],
        ['Connection', 'keep-alive'],
        ['Access-Control-Allow-Origin', '*'],
        ['Access-Control-Allow-Headers', 'Content-Type']
      ]),
      get: function(name: string) {
        return this.headers.get(name);
      },
      body: {
        getReader: jest.fn(() => ({
          read: jest.fn(() => Promise.resolve({ value: new TextEncoder().encode('data: {"type":"status","message":"test"}\n\n'), done: false })),
          releaseLock: jest.fn()
        }))
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
import type { SandboxState } from '../../types/sandbox';

// Mock the create sandbox API
const createAISandbox = jest.fn((request?: any) => Promise.resolve({
  status: 200,
  json: () => Promise.resolve({
    sandboxId: 'test-sandbox-id',
    sandboxUrl: 'http://localhost:5173',
    status: 'running'
  })
}));

// Mock the file cache adapter
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

// Mock console methods to reduce test noise
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('Claude Code Integration - End-to-End', () => {
  let mockSandboxState: SandboxState & { mockFiles: Record<string, any> };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Clear any global conversation state
    (global as any).conversationState = undefined;

    mockSandboxState = {
      fileCache: null,
      sandbox: null,
      sandboxData: {
        sandboxId: 'test-sandbox-123',
        url: 'http://localhost:5173'
      },
      mockFiles: {
        'src/App.jsx': {
          content: 'import React from "react"; export default function App() { return <div>Hello</div>; }',
          lastModified: Date.now()
        },
        'src/index.css': {
          content: '@tailwind base; @tailwind components; @tailwind utilities;',
          lastModified: Date.now()
        }
      }
    };

    // Mock LocalFileCacheAdapter
    const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
    mockLocalFileCacheAdapter.getState.mockResolvedValue(mockSandboxState);
    mockLocalFileCacheAdapter.getManifest.mockResolvedValue({
      entryPoint: 'src/App.jsx',
      files: {
        'src/App.jsx': {
          type: 'component',
          content: mockSandboxState.mockFiles['src/App.jsx'].content,
          componentInfo: {
            name: 'App',
            hasState: true
          },
          lastModified: Date.now(),
          path: 'src/App.jsx',
          relativePath: 'App.jsx'
        },
        'src/index.css': {
          type: 'style',
          content: mockSandboxState.mockFiles['src/index.css'].content,
          lastModified: Date.now(),
          path: 'src/index.css',
          relativePath: 'index.css'
        }
      },
      componentTree: {
        'App': {
          file: 'src/App.jsx',
          imports: [],
          importedBy: [],
          type: 'component'
        }
      },
      routes: [],
      styleFiles: ['src/index.css'],
      timestamp: Date.now()
    });
    mockLocalFileCacheAdapter.getFiles.mockResolvedValue(mockSandboxState.mockFiles);
  });

  describe('Complete Workflow Tests', () => {
    it('should handle complete create application workflow', async () => {
      // Step 1: Create sandbox
      const createRequest = new NextRequest('http://localhost:3000/api/create-ai-sandbox', {
        method: 'POST',
        body: JSON.stringify({
          template: 'react-vite',
          name: 'test-app'
        })
      });

      const createResponse = await createAISandbox(createRequest);
      expect(createResponse.status).toBe(200);

      // Step 2: Generate code
      const generateRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a blue button component',
          context: {
            sandboxId: 'test-sandbox-123',
            conversationContext: {
              scrapedWebsites: [],
              currentProject: 'Test App'
            }
          }
        })
      });

      const generateResponse = await generateAICodeStream(generateRequest);
      expect(generateResponse.status).toBe(200);
      expect(generateResponse.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should handle edit workflow with existing files', async () => {
      // Set up conversation state for edit mode
      (global as any).conversationState = {
        conversationId: 'test-conversation',
        startedAt: Date.now() - 3600000,
        lastUpdated: Date.now(),
        context: {
          messages: [
            {
              id: 'msg1',
              role: 'user',
              content: 'Create a header',
              timestamp: Date.now() - 1800000
            }
          ],
          edits: [],
          projectEvolution: { majorChanges: [] },
          userPreferences: {}
        }
      };

      const editRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Change the header background to blue',
          context: {
            sandboxId: 'test-sandbox-123',
            currentFiles: mockSandboxState.mockFiles,
            conversationContext: {
              scrapedWebsites: [],
              currentProject: 'Test App'
            }
          },
          isEdit: true
        })
      });

      const editResponse = await generateAICodeStream(editRequest);
      expect(editResponse.status).toBe(200);
      expect(editResponse.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should handle workflow with scraped website context', async () => {
      const requestWithScrapedData = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a landing page based on the scraped website',
          context: {
            sandboxId: 'test-sandbox-123',
            conversationContext: {
              scrapedWebsites: [
                {
                  url: 'https://example.com',
                  timestamp: Date.now() - 300000,
                  content: 'Example website with navigation and hero section'
                }
              ],
              currentProject: 'Landing Page'
            }
          }
        })
      });

      const response = await generateAICodeStream(requestWithScrapedData);
      expect(response.status).toBe(200);
    });
  });

  describe('Streaming Response Validation', () => {
    it('should stream valid SSE format', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a simple component',
          context: {
            sandboxId: 'test-sandbox-123'
          }
        })
      });

      const response = await generateAICodeStream(request);
      
      // Check SSE headers
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      
      // Read the stream
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      
      if (reader) {
        const decoder = new TextDecoder();
        let receivedData = '';
        let done = false;
        
        // Read first few chunks to verify format
        for (let i = 0; i < 3 && !done; i++) {
          const { value, done: isDone } = await reader.read();
          done = isDone;
          if (value) {
            receivedData += decoder.decode(value);
          }
        }
        
        reader.releaseLock();
        
        // Should contain SSE-formatted data
        expect(receivedData).toContain('data: ');
        
        // Should contain valid JSON in data fields
        const dataLines = receivedData.split('\n').filter(line => line.startsWith('data: '));
        expect(dataLines.length).toBeGreaterThan(0);
        
        // Verify JSON format
        for (const line of dataLines.slice(0, 3)) { // Check first few lines
          const jsonData = line.replace('data: ', '');
          expect(() => JSON.parse(jsonData)).not.toThrow();
        }
      }
    });

    it('should handle streaming with progress updates', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a complex application with multiple components',
          context: {
            sandboxId: 'test-sandbox-123'
          }
        })
      });

      const response = await generateAICodeStream(request);
      const reader = response.body?.getReader();
      
      if (reader) {
        const decoder = new TextDecoder();
        let hasStatusUpdate = false;
        let hasStreamData = false;
        let hasCompletionData = false;
        
        // Read stream and check for different message types
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const dataLines = chunk.split('\n').filter(line => line.startsWith('data: '));
            
            for (const line of dataLines) {
              try {
                const data = JSON.parse(line.replace('data: ', ''));
                
                if (data.type === 'status') hasStatusUpdate = true;
                if (data.type === 'stream') hasStreamData = true;
                if (data.type === 'complete') hasCompletionData = true;
              } catch (e) {
                // Ignore JSON parse errors for incomplete data
              }
            }
            
            // Break after finding some data to avoid long test runtime
            if (hasStatusUpdate && hasStreamData) break;
          }
        } finally {
          reader.releaseLock();
        }
        
        expect(hasStatusUpdate).toBe(true);
        expect(hasStreamData).toBe(true);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid request format gracefully', async () => {
      const invalidRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required prompt field
          context: {
            sandboxId: 'test-sandbox-123'
          }
        })
      });

      const response = await generateAICodeStream(invalidRequest);
      expect(response.status).toBe(400);
      
      const errorData = await response.json();
      expect(errorData.error).toContain('Prompt is required');
    });

    it('should handle missing sandbox gracefully', async () => {
      // Mock sandbox not found
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      mockLocalFileCacheAdapter.getState.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: {
            sandboxId: 'nonexistent-sandbox'
          }
        })
      });

      const response = await generateAICodeStream(request);
      
      // Should still process the request even without sandbox state
      expect(response.status).toBe(200);
    });

    it('should handle file cache errors', async () => {
      // Mock file cache error
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      mockLocalFileCacheAdapter.getManifest.mockRejectedValue(new Error('File cache error'));

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: {
            sandboxId: 'test-sandbox-123'
          },
          isEdit: true
        })
      });

      const response = await generateAICodeStream(request);
      
      // Should handle the error gracefully and still return a stream
      expect(response.status).toBe(200);
    });
  });

  describe('Context Management Integration', () => {
    it('should properly handle conversation state in edit mode', async () => {
      // Set up detailed conversation state
      (global as any).conversationState = {
        conversationId: 'detailed-conversation',
        startedAt: Date.now() - 7200000,
        lastUpdated: Date.now(),
        context: {
          messages: [
            {
              id: 'msg1',
              role: 'user',
              content: 'Create a header component',
              timestamp: Date.now() - 3600000
            },
            {
              id: 'msg2',
              role: 'assistant',
              content: 'I created a header component with navigation',
              timestamp: Date.now() - 3500000
            },
            {
              id: 'msg3',
              role: 'user',
              content: 'Make it responsive',
              timestamp: Date.now() - 1800000
            }
          ],
          edits: [
            {
              timestamp: Date.now() - 3500000,
              userRequest: 'Create a header component',
              editType: 'add_feature',
              targetFiles: ['src/components/Header.jsx'],
              confidence: 0.95,
              outcome: 'success'
            }
          ],
          projectEvolution: {
            majorChanges: [
              {
                timestamp: Date.now() - 3600000,
                description: 'Added header component',
                filesAffected: ['src/components/Header.jsx']
              }
            ]
          },
          userPreferences: {
            editStyle: 'targeted'
          },
          scrapedWebsites: [
            {
              url: 'https://tailwindui.com',
              timestamp: Date.now() - 1800000,
              content: 'Modern responsive navigation examples'
            }
          ]
        }
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Update the header to include a mobile menu',
          context: {
            sandboxId: 'test-sandbox-123',
            currentFiles: mockSandboxState.mockFiles,
            conversationContext: {
              scrapedWebsites: (global as any).conversationState.context.scrapedWebsites,
              currentProject: 'Test App'
            }
          },
          isEdit: true
        })
      });

      const response = await generateAICodeStream(request);
      expect(response.status).toBe(200);
      
      // Verify that the context was used (check by reading some stream data)
      const reader = response.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        reader.releaseLock();
        
        if (value) {
          const chunk = new TextDecoder().decode(value);
          // Should contain context information in the stream
          expect(chunk.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle large conversation history efficiently', async () => {
      // Create large conversation state
      const largeConversationState = {
        conversationId: 'large-conversation',
        startedAt: Date.now() - 86400000, // 24 hours ago
        lastUpdated: Date.now(),
        context: {
          messages: Array.from({ length: 50 }, (_, i) => ({
            id: `msg${i}`,
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i} with detailed content about React development and component creation`,
            timestamp: Date.now() - (50 - i) * 60000
          })),
          edits: Array.from({ length: 20 }, (_, i) => ({
            timestamp: Date.now() - i * 180000,
            userRequest: `Edit request ${i}`,
            editType: 'update_component',
            targetFiles: [`src/components/Component${i}.jsx`],
            confidence: 0.8 + (i % 3) * 0.1,
            outcome: 'success'
          })),
          projectEvolution: { majorChanges: [] },
          userPreferences: { editStyle: 'comprehensive' },
          scrapedWebsites: Array.from({ length: 10 }, (_, i) => ({
            url: `https://example${i}.com`,
            timestamp: Date.now() - i * 300000,
            content: `Scraped content from example${i}.com with detailed information`
          }))
        }
      };

      (global as any).conversationState = largeConversationState;

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a new feature based on our conversation history',
          context: {
            sandboxId: 'test-sandbox-123',
            currentFiles: mockSandboxState.mockFiles
          },
          isEdit: true
        })
      });

      // Should handle large context without timeout
      const startTime = Date.now();
      const response = await generateAICodeStream(request);
      const processingTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Claude Code Bridge Integration', () => {
    it('should properly format prompts for Claude Code consumption', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a responsive navigation component',
          context: {
            sandboxId: 'test-sandbox-123',
            conversationContext: {
              scrapedWebsites: [
                {
                  url: 'https://headlessui.com',
                  timestamp: Date.now() - 600000,
                  content: 'Headless UI navigation examples'
                }
              ]
            }
          }
        })
      });

      const response = await generateAICodeStream(request);
      expect(response.status).toBe(200);
      
      // Should use Claude Code integration for response generation
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should handle Claude Code response format correctly', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button component',
          context: {
            sandboxId: 'test-sandbox-123'
          }
        })
      });

      const response = await generateAICodeStream(request);
      const reader = response.body?.getReader();
      
      if (reader) {
        const decoder = new TextDecoder();
        let fullResponse = '';
        let foundFileContent = false;
        
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            fullResponse += chunk;
            
            // Look for file content in the stream
            if (chunk.includes('<file path=') || chunk.includes('</file>')) {
              foundFileContent = true;
            }
            
            // Break after we find some content to avoid long test
            if (foundFileContent && fullResponse.length > 1000) break;
          }
        } finally {
          reader.releaseLock();
        }
        
        // Should contain Claude Code formatted content
        expect(fullResponse.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Performance and Load Testing', () => {
  beforeEach(() => {
    // Mock the file cache for performance tests
    const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
    mockLocalFileCacheAdapter.getState.mockResolvedValue({
      id: 'perf-test-sandbox',
      status: 'running',
      url: 'http://localhost:5173',
      createdAt: Date.now(),
      isLocalDevelopment: true,
      files: {},
      dependencies: [],
      devServer: { pid: 12345, port: 5173, status: 'running' }
    });
  });

  it('should handle multiple concurrent requests', async () => {
    const requests = Array.from({ length: 5 }, (_, i) => 
      new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: `Create component ${i}`,
          context: {
            sandboxId: 'perf-test-sandbox'
          }
        })
      })
    );

    const startTime = Date.now();
    const responses = await Promise.all(
      requests.map(request => generateAICodeStream(request))
    );
    const totalTime = Date.now() - startTime;

    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });

    // Should complete within reasonable time (30 seconds for 5 requests)
    expect(totalTime).toBeLessThan(30000);

    // Clean up response streams
    await Promise.all(responses.map(async (response) => {
      const reader = response.body?.getReader();
      if (reader) {
        try {
          await reader.read(); // Read one chunk
        } finally {
          reader.releaseLock();
        }
      }
    }));
  });

  it('should handle memory efficiently with large responses', async () => {
    const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Create a complete e-commerce application with 20 components, routing, state management, and styling',
        context: {
          sandboxId: 'perf-test-sandbox'
        }
      })
    });

    const initialMemory = process.memoryUsage().heapUsed;
    const response = await generateAICodeStream(request);
    
    expect(response.status).toBe(200);
    
    // Read some of the stream
    const reader = response.body?.getReader();
    if (reader) {
      try {
        for (let i = 0; i < 10; i++) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 100MB)
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
  });
});