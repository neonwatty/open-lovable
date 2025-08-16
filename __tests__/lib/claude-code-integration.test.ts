/**
 * @jest-environment node
 */

import { 
  claudeCodeStreamText, 
  ClaudeCodeTextStream,
  ClaudeCodeResult,
  checkClaudeCodeAvailability 
} from '../../lib/claude-code-integration';

describe('ClaudeCodeIntegration', () => {
  describe('ClaudeCodeTextStream', () => {
    it('should split response into streamable parts', async () => {
      const response = `# Test Response

Some introductory text.

<file path="src/App.jsx">
import React from 'react';

export default function App() {
  return <div>Hello World</div>;
}
</file>

More text after the file.`;

      const stream = new ClaudeCodeTextStream(response, 0); // No delay for testing
      const parts: string[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts.length).toBeGreaterThan(1);
      expect(parts.join('')).toBe(response);
      
      // Should have file content as separate parts
      const filePartIndex = parts.findIndex(part => part.includes('<file path="src/App.jsx">'));
      expect(filePartIndex).toBeGreaterThan(-1);
    });

    it('should handle empty response', async () => {
      const stream = new ClaudeCodeTextStream('', 0);
      const parts: string[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      // Empty string still creates one chunk in new implementation
      expect(parts).toHaveLength(1);
      expect(parts[0]).toBe('');
    });

    it('should handle response with only file blocks', async () => {
      const response = `<file path="test.js">
console.log('test');
</file>`;

      const stream = new ClaudeCodeTextStream(response, 0);
      const parts: string[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      // New implementation streams line by line, so we expect 3 chunks
      expect(parts).toHaveLength(3);
      expect(parts.join('')).toBe(response);
      expect(parts[0]).toContain('<file path="test.js">');
    });
  });

  describe('ClaudeCodeResult', () => {
    it('should create result with text stream', () => {
      const response = 'Test response';
      const result = new ClaudeCodeResult(response);

      expect(result.textStream).toBeInstanceOf(ClaudeCodeTextStream);
    });
  });

  describe('claudeCodeStreamText', () => {
    it('should handle create request', async () => {
      const options = {
        model: jest.fn(),
        messages: [
          { role: 'system' as const, content: 'You are a React developer' },
          { role: 'user' as const, content: 'Create a button component' }
        ]
      };

      const result = await claudeCodeStreamText(options);
      expect(result).toBeInstanceOf(ClaudeCodeResult);

      // Stream should contain file content
      const parts: string[] = [];
      for await (const part of result.textStream) {
        parts.push(part);
      }

      const fullResponse = parts.join('');
      expect(fullResponse).toContain('<file path=');
      expect(fullResponse).toContain('React');
    });

    it('should handle edit request', async () => {
      const options = {
        model: jest.fn(),
        messages: [
          { role: 'system' as const, content: 'EDIT MODE ACTIVE - This is an edit to an existing application' },
          { role: 'user' as const, content: 'Update the header component' }
        ]
      };

      const result = await claudeCodeStreamText(options);
      const parts: string[] = [];
      
      for await (const part of result.textStream) {
        parts.push(part);
      }

      const fullResponse = parts.join('');
      expect(fullResponse).toContain('Updated');
      expect(fullResponse).toContain('<file path=');
    });

    it('should handle generic request', async () => {
      const options = {
        model: jest.fn(),
        messages: [
          { role: 'system' as const, content: 'System prompt' },
          { role: 'user' as const, content: 'Analyze this code' }
        ]
      };

      const result = await claudeCodeStreamText(options);
      const parts: string[] = [];
      
      for await (const part of result.textStream) {
        parts.push(part);
      }

      const fullResponse = parts.join('');
      expect(fullResponse).toContain('Claude Code Integration');
      expect(fullResponse).toContain('demo');
    });

    it('should handle errors gracefully', async () => {
      // Mock console.error to avoid error output in tests
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Force an error by passing invalid options
      const options = {
        model: jest.fn(() => { throw new Error('Test error'); }),
        messages: []
      };

      const result = await claudeCodeStreamText(options);
      const parts: string[] = [];
      
      for await (const part of result.textStream) {
        parts.push(part);
      }

      const fullResponse = parts.join('');
      expect(fullResponse).toContain('Error');
      expect(fullResponse).toContain('error.js');

      consoleSpy.mockRestore();
    });

    it('should include session ID in options', async () => {
      const options = {
        model: jest.fn(),
        messages: [
          { role: 'system' as const, content: 'System' },
          { role: 'user' as const, content: 'User message' }
        ],
        sessionId: 'test-session-123'
      };

      const result = await claudeCodeStreamText(options);
      expect(result).toBeInstanceOf(ClaudeCodeResult);
      
      // Session ID should be handled internally (not visible in response)
      const parts: string[] = [];
      for await (const part of result.textStream) {
        parts.push(part);
      }
      
      expect(parts.length).toBeGreaterThan(0);
    });
  });

  describe('checkClaudeCodeAvailability', () => {
    // Mock child_process for testing
    const mockSpawn = jest.fn();
    
    beforeEach(() => {
      jest.doMock('child_process', () => ({
        spawn: mockSpawn
      }));
      mockSpawn.mockClear();
    });

    it('should detect available Claude Code', async () => {
      // Mock successful claude --version command
      const mockProcess = {
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('claude 1.0.0'));
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0); // Success exit code
          }
        })
      };
      
      mockSpawn.mockReturnValue(mockProcess);

      const result = await checkClaudeCodeAvailability();
      
      expect(result.available).toBe(true);
      expect(result.version).toBe('claude 1.0.0');
      expect(result.error).toBeUndefined();
    });

    it('should detect unavailable Claude Code', async () => {
      // Mock failed claude --version command
      const mockProcess = {
        stdout: {
          on: jest.fn()
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(1); // Error exit code
          }
        })
      };
      
      mockSpawn.mockReturnValue(mockProcess);

      const result = await checkClaudeCodeAvailability();
      
      expect(result.available).toBe(false);
      expect(result.error).toContain('exited with code 1');
    });

    it('should handle spawn errors', async () => {
      // Mock spawn error
      const mockProcess = {
        stdout: {
          on: jest.fn()
        },
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Command not found'));
          }
        })
      };
      
      mockSpawn.mockReturnValue(mockProcess);

      const result = await checkClaudeCodeAvailability();
      
      expect(result.available).toBe(false);
      expect(result.error).toBe('Command not found');
    });
  });
});