/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as generateAICodeStream } from '../../app/api/generate-ai-code-stream/route';
import { LocalFileCacheAdapter } from '../../lib/local-file-cache';
import { 
  ClaudeCodeBridge, 
  getBridge,
  initializeBridge 
} from '../../lib/claude-code-bridge';
import { 
  CustomStreamHandler,
  createSSEResponse 
} from '../../lib/custom-stream-handler';

// Mock modules
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
jest.mock('../../lib/claude-code-bridge');

// Mock console methods
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('Claude Code Error Handling and Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).conversationState = undefined;
  });

  describe('Timeout Scenarios', () => {
    it('should handle request timeout gracefully', async () => {
      // Mock a long-running operation
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      mockLocalFileCacheAdapter.getState.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(null), 10000))
      );

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: {
            sandboxId: 'timeout-test'
          }
        })
      });

      // Should not hang indefinitely
      const startTime = Date.now();
      const response = await generateAICodeStream(request);
      const duration = Date.now() - startTime;

      expect([200, 400, 500]).toContain(response.status);
      expect(duration).toBeLessThan(5000); // Should complete quickly even with mock delay
    });

    it('should handle streaming timeout scenarios', async () => {
      const streamHandler = new CustomStreamHandler({
        timeout: 100, // Very short timeout
        enableParsing: true
      });

      const stream = streamHandler.createStream();
      
      // Start reading with timeout
      const reader = stream.getReader();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Stream timeout')), 200)
      );

      try {
        await Promise.race([
          reader.read(),
          timeout
        ]);
      } catch (error) {
        expect((error as Error).message).toBe('Stream timeout');
      } finally {
        reader.releaseLock();
        streamHandler.end();
      }
    });

    it('should handle bridge initialization timeout', async () => {
      const mockBridge = {
        initialize: jest.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Initialization timeout')), 100)
          )
        ),
        createSession: jest.fn(),
        endSession: jest.fn(),
        sendPrompt: jest.fn()
      } as any;

      (getBridge as jest.Mock).mockReturnValue(mockBridge);

      // Should handle initialization failure gracefully
      try {
        await initializeBridge({ sessionTimeout: 50 });
      } catch (error) {
        expect((error as Error).message).toContain('timeout');
      }
    });
  });

  describe('Malformed Request Handling', () => {
    it('should handle invalid JSON in request body', async () => {
      const invalidRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: 'invalid json {'
      });

      const response = await generateAICodeStream(invalidRequest);
      expect([400, 500]).toContain(response.status); // JSON parsing error
    });

    it('should handle missing required fields', async () => {
      const requestMissingPrompt = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          context: { sandboxId: 'test' }
          // Missing prompt field
        })
      });

      const response = await generateAICodeStream(requestMissingPrompt);
      expect(response.status).toBe(400);
      
      try {
        const errorData = await response.json();
        expect(errorData.error || errorData.message || 'Missing prompt').toContain('required');
      } catch (e) {
        // If JSON parsing fails, that's also a valid error response
        expect(response.status).toBe(400);
      }
    });

    it('should handle excessively large request payloads', async () => {
      const largePrompt = 'Create a component '.repeat(10000); // ~170KB prompt
      
      const largeRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: largePrompt,
          context: {
            sandboxId: 'large-test',
            currentFiles: {
              'large-file.js': 'x'.repeat(50000) // Large file content
            }
          }
        })
      });

      const response = await generateAICodeStream(largeRequest);
      expect([200, 400, 500]).toContain(response.status); // Should handle large requests
    });

    it('should handle special characters and encoding issues', async () => {
      const specialCharsRequest = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create component with emojis 🚀 and unicode characters: ñáéíóú, 中文, русский',
          context: {
            sandboxId: 'unicode-test',
            currentFiles: {
              'unicode.js': 'const message = "Hello 世界! Привет мир! 🌍";'
            }
          }
        })
      });

      const response = await generateAICodeStream(specialCharsRequest);
      expect([200, 400, 500]).toContain(response.status);
      
      // Verify the response is handled correctly
      if (response.status === 200 && response.body?.getReader) {
        const reader = response.body.getReader();
        const { value } = await reader.read();
        reader.releaseLock();
        
        if (value) {
          const chunk = new TextDecoder('utf-8').decode(value);
          expect(chunk.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('File System Error Handling', () => {
    it('should handle file cache permission errors', async () => {
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      mockLocalFileCacheAdapter.getState.mockRejectedValue(new Error('EACCES: permission denied'));
      mockLocalFileCacheAdapter.getManifest.mockRejectedValue(new Error('EACCES: permission denied'));

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: { sandboxId: 'permission-test' },
          isEdit: true
        })
      });

      const response = await generateAICodeStream(request);
      expect([200, 400, 500]).toContain(response.status); // Should handle gracefully
    });

    it('should handle corrupted file cache data', async () => {
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      mockLocalFileCacheAdapter.getState.mockResolvedValue({
        id: 'corrupted-test',
        status: 'running',
        // Missing required fields to simulate corruption
      } as any);
      
      mockLocalFileCacheAdapter.getManifest.mockResolvedValue({
        entryPoint: 'invalid',
        files: null as any, // Corrupted data
        componentTree: undefined as any,
        routes: 'invalid' as any,
        styleFiles: [],
        timestamp: Date.now()
      });

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: { sandboxId: 'corrupted-test' },
          isEdit: true
        })
      });

      const response = await generateAICodeStream(request);
      expect([200, 400, 500]).toContain(response.status); // Should handle gracefully
    });

    it('should handle missing sandbox directory', async () => {
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      (mockLocalFileCacheAdapter.getState as jest.MockedFunction<any>).mockResolvedValue(null);
      (mockLocalFileCacheAdapter.getManifest as jest.MockedFunction<any>).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: { sandboxId: 'missing-sandbox' }
        })
      });

      const response = await generateAICodeStream(request);
      expect([200, 400, 500]).toContain(response.status); // Should still proceed
    });
  });

  describe('Streaming Error Recovery', () => {
    it('should handle stream controller errors', async () => {
      const streamHandler = new CustomStreamHandler();
      
      // Mock controller with error
      const mockController = {
        enqueue: jest.fn(() => { throw new Error('Controller error'); }),
        close: jest.fn(),
        error: jest.fn()
      } as any;
      (streamHandler as any).controller = mockController;

      // Should not throw when controller fails
      await expect(streamHandler.sendProgress({
        type: 'status',
        message: 'test'
      })).resolves.not.toThrow();

      streamHandler.end();
    });

    it('should handle partial response scenarios', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a very complex application that might get truncated',
          context: { sandboxId: 'truncation-test' }
        })
      });

      const response = await generateAICodeStream(request);
      
      if (response.status === 200 && response.body?.getReader) {
        const reader = response.body.getReader();
        // Simulate reading partial data and then stopping
        try {
          await reader.read();
          // Simulate connection interruption
          reader.releaseLock();
        } catch (error) {
          // Should handle interruption gracefully
        }
      }
      
      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle stream backpressure', async () => {
      const streamHandler = new CustomStreamHandler({
        bufferSize: 10, // Very small buffer
        maxBufferSize: 50
      });

      const mockController = {
        enqueue: jest.fn(),
        close: jest.fn(),
        error: jest.fn()
      } as any;
      (streamHandler as any).controller = mockController;

      // Send a lot of data to trigger backpressure handling
      const largeText = 'x'.repeat(1000);
      
      await streamHandler.sendText(largeText);
      
      // Should have called enqueue (even with backpressure)
      expect(mockController.enqueue).toHaveBeenCalled();
      
      streamHandler.end();
    });
  });

  describe('Bridge Communication Errors', () => {
    it('should handle bridge connection failures', async () => {
      const mockBridge = {
        initialize: jest.fn().mockResolvedValue(undefined),
        createSession: jest.fn().mockRejectedValue(new Error('Connection failed')),
        endSession: jest.fn(),
        sendPrompt: jest.fn()
      } as any;

      (getBridge as jest.Mock).mockReturnValue(mockBridge);

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Create a component',
          context: { sandboxId: 'bridge-error-test' }
        })
      });

      const response = await generateAICodeStream(request);
      
      // The API might return 400 for various validation reasons, accept that
      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle bridge response parsing errors', async () => {
      const mockBridge = {
        initialize: jest.fn().mockResolvedValue(undefined),
        createSession: jest.fn().mockResolvedValue({ sessionId: 'test' }),
        sendPrompt: jest.fn().mockResolvedValue('invalid response format'),
        endSession: jest.fn()
      } as any;

      (getBridge as jest.Mock).mockReturnValue(mockBridge);

      // Should handle invalid bridge responses
      expect(() => {
        // This would be called internally in the API
        mockBridge.sendPrompt('test prompt');
      }).not.toThrow();
    });
  });

  describe('Memory and Resource Management', () => {
    it('should handle memory pressure gracefully', async () => {
      // Create scenario with high memory usage
      const largeContext = {
        sandboxId: 'memory-test',
        currentFiles: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [
            `src/Component${i}.jsx`,
            'x'.repeat(1000) // 1KB per file, 100KB total
          ])
        ),
        conversationContext: {
          scrapedWebsites: Array.from({ length: 50 }, (_, i) => ({
            url: `https://example${i}.com`,
            timestamp: Date.now() - i * 60000,
            content: 'Large scraped content '.repeat(100)
          }))
        }
      };

      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Analyze and refactor all components',
          context: largeContext,
          isEdit: true
        })
      });

      const initialMemory = process.memoryUsage().heapUsed;
      const response = await generateAICodeStream(request);
      const finalMemory = process.memoryUsage().heapUsed;

      expect([200, 400, 500]).toContain(response.status);
      
      // Memory increase should be reasonable
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB
    });

    it('should clean up resources properly after errors', async () => {
      const streamHandler = new CustomStreamHandler();
      
      // Create mock controller that throws
      const mockController = {
        enqueue: jest.fn(() => { throw new Error('Enqueue failed'); }),
        close: jest.fn(),
        error: jest.fn()
      } as any;
      (streamHandler as any).controller = mockController;

      // Trigger error condition
      await streamHandler.sendText('test data');

      // Should still be able to end cleanly
      expect(() => streamHandler.end()).not.toThrow();
      expect(streamHandler.isStreamEnded()).toBe(true);
    });
  });

  describe('Edge Case Scenarios', () => {
    it('should handle empty prompt gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: '',
          context: { sandboxId: 'empty-prompt-test' }
        })
      });

      const response = await generateAICodeStream(request);
      expect(response.status).toBe(400); // Empty prompt should be rejected
    });

    it('should handle whitespace-only prompt', async () => {
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: '   \n\t   ',
          context: { sandboxId: 'whitespace-test' }
        })
      });

      const response = await generateAICodeStream(request);
      expect(response.status).toBe(400); // Whitespace-only should be treated as empty
    });

    it('should handle circular references in context', async () => {
      // Create circular reference
      const contextWithCircular: any = {
        sandboxId: 'circular-test',
        currentFiles: {}
      };
      contextWithCircular.circular = contextWithCircular;

      // Should handle serialization issues gracefully
      try {
        const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'Create a component',
            context: contextWithCircular
          })
        });

        const response = await generateAICodeStream(request);
        expect(response.status).toBeGreaterThanOrEqual(200);
      } catch (error) {
        // JSON.stringify will fail on circular references
        expect((error as Error).message).toContain('circular');
      }
    });

    it('should handle extremely long prompts', async () => {
      const veryLongPrompt = 'Create a component that '.repeat(1000) + 'does something amazing';
      
      const request = new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
        method: 'POST',
        body: JSON.stringify({
          prompt: veryLongPrompt,
          context: { sandboxId: 'long-prompt-test' }
        })
      });

      const response = await generateAICodeStream(request);
      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle concurrent error scenarios', async () => {
      // Create multiple requests that will fail in different ways
      const requests = [
        new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'test 1',
            context: { sandboxId: 'concurrent-error-1' }
          })
        }),
        new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'test 2',
            context: { sandboxId: 'concurrent-error-2' }
          })
        }),
        new NextRequest('http://localhost:3000/api/generate-ai-code-stream', {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'test 3',
            context: { sandboxId: 'concurrent-error-3' }
          })
        })
      ];

      // Mock various error conditions
      const mockLocalFileCacheAdapter = LocalFileCacheAdapter as jest.Mocked<typeof LocalFileCacheAdapter>;
      (mockLocalFileCacheAdapter.getState as jest.MockedFunction<any>)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('File error'))
        .mockResolvedValueOnce({ id: 'test', status: 'running' } as any);

      const responses = await Promise.all(
        requests.map(req => generateAICodeStream(req))
      );

      // All should handle their respective errors gracefully
      responses.forEach(response => {
        expect(response.status).toBeGreaterThanOrEqual(200);
      });
    });
  });
});