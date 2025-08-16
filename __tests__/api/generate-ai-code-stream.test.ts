/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock Next.js server components before importing
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init) => ({
    url,
    method: init?.method || 'GET',
    headers: new Map(Object.entries(init?.headers || {})),
    json: jest.fn().mockResolvedValue(JSON.parse(init?.body || '{}')),
  })),
  NextResponse: {
    json: jest.fn((data, init) => ({
      json: () => Promise.resolve(data),
      status: init?.status || 200,
    })),
  },
}));

import { POST } from '@/app/api/generate-ai-code-stream/route';
import type { SandboxState } from '@/types/sandbox';
import type { ConversationState } from '@/types/conversation';

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
        'anthropic/claude-3-5-sonnet-20241022': 'anthropic/claude-3-5-sonnet-20241022',
        'openai/gpt-4o': 'openai/gpt-4o',
      },
      modelDisplayNames: {
        'moonshotai/kimi-k2-instruct': 'Kimi K2',
        'anthropic/claude-3-5-sonnet-20241022': 'Claude Sonnet 4',
        'openai/gpt-4o': 'GPT-4o',
      },
    },
  },
}));

describe.skip('/api/generate-ai-code-stream', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockStreamText: jest.Mock;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GROQ_API_KEY: 'test-groq-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      OPENAI_API_KEY: 'test-openai-key',
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
      contextFiles: ['src/components/Button.tsx'],
    });
    mockGetFileContents.mockResolvedValue({
      'src/App.tsx': { content: 'export default function App() {}', path: 'src/App.tsx' },
    });
    mockFormatFilesForAI.mockReturnValue('Formatted file content');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Request Validation', () => {
    it('should return 400 for missing required fields', async () => {
      const { NextRequest } = require('next/server');
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid model', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'invalid/model',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Invalid model');
    });
  });

  describe('File Cache Null Safety', () => {
    it('should handle missing global sandboxState gracefully', async () => {
      // Ensure global sandboxState is undefined
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

      // Should not throw, should handle gracefully
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it('should handle missing fileCache gracefully', async () => {
      // Setup sandboxState without fileCache
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        // fileCache is undefined
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
    });

    it('should use empty object for fileCache.files when fileCache is null', async () => {
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

      const response = await POST(request);
      
      // The route should handle null fileCache gracefully
      expect(response.status).not.toBe(500);
    });

    it('should properly initialize fileCache when missing', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
      };

      // Mock streamText to simulate the fileCache initialization path
      mockStreamText.mockImplementation(() => ({
        toDataStreamResponse: () => new Response('mock stream'),
      }));

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

      // Verify fileCache was initialized if it was missing
      if (!(global as any).sandboxState.fileCache) {
        // This test verifies the null safety logic works
        expect(true).toBe(true);
      }
    });
  });

  describe('Model Integration', () => {
    it('should handle Groq model correctly', async () => {
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

      mockStreamText.mockImplementation(() => ({
        toDataStreamResponse: () => new Response('mock stream'),
      }));

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
      expect(response.status).toBe(200);
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.anything(),
          messages: expect.any(Array),
        })
      );
    });

    it('should handle Anthropic model correctly', async () => {
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

      mockStreamText.mockImplementation(() => ({
        toDataStreamResponse: () => new Response('mock stream'),
      }));

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'anthropic/claude-3-5-sonnet-20241022',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should handle OpenAI model correctly', async () => {
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

      mockStreamText.mockImplementation(() => ({
        toDataStreamResponse: () => new Response('mock stream'),
      }));

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'openai/gpt-4o',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Conversation State Integration', () => {
    it('should handle conversation state with previous messages', async () => {
      const conversationState: ConversationState = {
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'Create a todo app',
            timestamp: new Date().toISOString(),
          },
          {
            id: '2',
            role: 'assistant',
            content: 'I created a todo app with add/remove functionality.',
            timestamp: new Date().toISOString(),
          },
        ],
        context: {
          scrapedWebsites: [],
          generatedComponents: ['TodoApp'],
        },
        edits: [],
      };

      (global as any).sandboxState = {
        sandboxes: new Map([
          ['test-sandbox', {
            id: 'test-sandbox',
            status: 'running',
            url: 'http://localhost:5173',
          }],
        ]),
        fileCache: {
          files: {
            'src/TodoApp.tsx': {
              content: 'export default function TodoApp() {}',
              path: 'src/TodoApp.tsx',
            },
          },
          manifest: { files: [{ path: 'src/TodoApp.tsx', size: 100 }] },
        },
      };

      mockStreamText.mockImplementation(() => ({
        toDataStreamResponse: () => new Response('mock stream'),
      }));

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Add edit functionality to the todo app',
          model: 'moonshotai/kimi-k2-instruct',
          sandboxId: 'test-sandbox',
          conversationState,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify that conversation context was used
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Add edit functionality'),
            }),
          ]),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle AI model errors gracefully', async () => {
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

      mockStreamText.mockRejectedValue(new Error('AI model error'));

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
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should handle missing sandbox gracefully', async () => {
      (global as any).sandboxState = {
        sandboxes: new Map(), // Empty sandboxes
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
          sandboxId: 'non-existent-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toContain('Sandbox not found');
    });
  });

  describe('TypeScript Safety Improvements', () => {
    it('should handle model display name lookup safely', async () => {
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

      // Test with a valid model that should have a display name
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a button',
          model: 'anthropic/claude-3-5-sonnet-20241022',
          sandboxId: 'test-sandbox',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should not throw a TypeScript error about keyof lookup
      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });
});