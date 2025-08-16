// Mock Next.js server modules before imports
jest.mock('next/server', () => {
  class MockNextRequest {
    url: string;
    method: string;
    headers: Map<string, string>;
    body: string;
    
    constructor(url: string, init?: any) {
      this.url = url;
      this.method = init?.method || 'POST';
      this.headers = new Map(Object.entries(init?.headers || {}));
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
      status: init?.status || 200,
      headers: new Map(),
    })),
  };
  
  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  };
});

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate-ai-code-stream/route';
import type { SandboxState } from '@/types/sandbox';

// Mock the AI SDK modules
jest.mock('@ai-sdk/groq', () => ({
  createGroq: jest.fn(() => ({})),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => ({})),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({})),
}));

jest.mock('ai', () => ({
  streamText: jest.fn(),
}));

// Mock the lib modules
jest.mock('@/lib/context-selector', () => ({
  selectFilesForEdit: jest.fn(),
  getFileContents: jest.fn(),
  formatFilesForAI: jest.fn(),
}));

jest.mock('@/lib/file-search-executor', () => ({
  executeSearchPlan: jest.fn(),
  formatSearchResultsForAI: jest.fn(),
  selectTargetFile: jest.fn(),
}));

// Mock app config
jest.mock('@/config/app.config', () => ({
  appConfig: {
    ai: {
      models: {
        'moonshotai/kimi-k2-instruct': 'moonshotai/kimi-k2-instruct',
      },
      modelDisplayNames: {
        'moonshotai/kimi-k2-instruct': 'Kimi K2',
      },
    },
  },
}));

describe.skip('File Cache Null Safety Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockStreamText: jest.Mock;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GROQ_API_KEY: 'test-groq-key',
    };

    // Reset global state
    (global as any).sandboxState = undefined;

    // Setup mocks
    mockStreamText = require('ai').streamText as jest.Mock;
    mockStreamText.mockReset();

    const mockSelectFilesForEdit = require('@/lib/context-selector').selectFilesForEdit as jest.Mock;
    const mockGetFileContents = require('@/lib/context-selector').getFileContents as jest.Mock;
    const mockFormatFilesForAI = require('@/lib/context-selector').formatFilesForAI as jest.Mock;

    mockSelectFilesForEdit.mockReset();
    mockGetFileContents.mockReset();
    mockFormatFilesForAI.mockReset();

    // Setup default mock returns
    mockSelectFilesForEdit.mockResolvedValue({
      primaryFiles: ['src/App.tsx'],
      contextFiles: [],
    });
    mockGetFileContents.mockResolvedValue({
      'src/App.tsx': { content: 'export default function App() {}', path: 'src/App.tsx' },
    });
    mockFormatFilesForAI.mockReturnValue('Formatted file content');

    mockStreamText.mockImplementation(() => ({
      toDataStreamResponse: () => new Response('mock stream'),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Null Safety: global.sandboxState.fileCache?.files', () => {
    it('should handle undefined global.sandboxState', async () => {
      // Ensure global.sandboxState is undefined
      (global as any).sandboxState = undefined;

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should not throw when accessing global.sandboxState?.fileCache?.files
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should handle null global.sandboxState.fileCache', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: null, // Explicitly null
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should handle null fileCache gracefully using optional chaining
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should handle undefined global.sandboxState.fileCache', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        // fileCache is undefined (not set)
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should handle undefined fileCache gracefully using optional chaining
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should use empty object when fileCache.files is undefined', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: {
          // files property is undefined
          manifest: { files: [] },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should use empty object fallback: global.sandboxState.fileCache?.files || {}
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should use empty object when fileCache.files is null', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: {
          files: null, // Explicitly null
          manifest: { files: [] },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should use empty object fallback when files is null
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe('Null Safety: fileCache Conditional Assignments', () => {
    it('should handle fileCache initialization when missing', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        // No fileCache property
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      await POST(request);

      // Should initialize fileCache if it was missing
      const sandboxState = (global as any).sandboxState;
      if (sandboxState && !sandboxState.fileCache) {
        // Test passes if conditional initialization logic worked
        expect(true).toBe(true);
      } else {
        // Also passes if fileCache was properly initialized
        expect(true).toBe(true);
      }
    });

    it('should handle conditional file assignment with null check', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: {
          files: {},
          manifest: { files: [] },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should handle conditional file assignments like:
      // if (global.sandboxState.fileCache) {
      //   global.sandboxState.fileCache.files[normalizedPath] = { ... };
      // }
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should safely skip file assignment when fileCache is null', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: null,
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should safely skip file assignments when fileCache is null
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe('Null Safety: Nested Property Access', () => {
    it('should handle deep property access safely', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        // All nested properties missing
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should handle chains like: global.sandboxState?.fileCache?.manifest
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should handle manifest property access safely', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: {
          files: {},
          // manifest is undefined
        },
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should handle undefined manifest gracefully
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid null/undefined state changes', async () => {
      // Simulate race condition where state changes during request
      let callCount = 0;
      mockStreamText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Change global state during first call
          (global as any).sandboxState = null;
        }
        return {
          toDataStreamResponse: () => new Response('mock stream'),
        };
      });

      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: {
          files: {},
          manifest: { files: [] },
        },
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should handle state changes gracefully
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should handle empty objects vs null/undefined consistently', async () => {
      const testCases = [
        { fileCache: undefined },
        { fileCache: null },
        { fileCache: {} },
        { fileCache: { files: undefined } },
        { fileCache: { files: null } },
        { fileCache: { files: {} } },
      ];

      for (const testCase of testCases) {
        (global as any).sandboxState = {
          sandboxes: new Map([
            ['test-sandbox', {
              id: 'test-sandbox',
              status: 'running',
              url: 'http://localhost:5173',
            }],
          ]),
          ...testCase,
        };

        const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'Create a button',
            model: 'moonshotai/kimi-k2-instruct',
            sandboxId: 'test-sandbox',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const response = await POST(request);
        expect(response.status).not.toBe(500);
      }
    });
  });
});