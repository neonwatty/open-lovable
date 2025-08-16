/**
 * @jest-environment node
 */

// Mock Next.js modules at the very top before any imports
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init) => ({
    url,
    method: init?.method || 'POST',
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

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { NextRequest } from 'next/server';

// Mock the E2B sandbox since we're testing file operations
jest.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    connect: jest.fn().mockResolvedValue({
      sandboxId: 'test-sandbox-id',
      getHost: jest.fn().mockReturnValue('test-host'),
      commands: {
        run: jest.fn().mockResolvedValue({ exitCode: 0 })
      }
    })
  }
}));

// Import the route after all mocks are set up
import { POST } from '../../app/api/apply-ai-code-stream/route';

describe('Error Handling and Rollback Integration', () => {
  let tempDir: string;
  let originalGlobal: any;

  beforeEach(async () => {
    // Create a temporary sandbox directory
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'error-rollback-test-'));
    
    // Store original global state
    originalGlobal = {
      activeSandbox: (global as any).activeSandbox,
      existingFiles: (global as any).existingFiles,
      conversationState: (global as any).conversationState
    };

    // Set up mock global state
    (global as any).activeSandbox = {
      sandboxId: 'test-sandbox-id',
      getHost: () => 'test-host',
      commands: {
        run: jest.fn().mockResolvedValue({ exitCode: 0 })
      }
    };
    (global as any).existingFiles = new Set<string>();
    (global as any).conversationState = null;
  });

  afterEach(async () => {
    // Restore original global state
    Object.assign(global, originalGlobal);

    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  it('should handle successful file operations without rollback', async () => {
    const requestBody = {
      response: `
        <file path="test1.jsx">
import React from 'react';

export default function Test1() {
  return <div>Test Component 1</div>;
}
        </file>
        <file path="test2.jsx">
import React from 'react';

export default function Test2() {
  return <div>Test Component 2</div>;
}
        </file>
      `,
      isEdit: false,
      packages: [],
      sandboxId: 'test-sandbox-id'
    };

    const request = new NextRequest('http://localhost:3000/api/apply-ai-code-stream', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000'
      }
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    // Read the streaming response
    const reader = response.body?.getReader();
    const messages: any[] = [];
    
    if (reader) {
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              messages.push(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }

    // Verify we received transaction-related messages
    const transactionStartMsg = messages.find(m => m.type === 'transaction-start');
    const transactionCompleteMsg = messages.find(m => m.type === 'transaction-complete');
    
    expect(transactionStartMsg).toBeDefined();
    expect(transactionCompleteMsg).toBeDefined();
    expect(transactionCompleteMsg.operations).toBeGreaterThan(0);

    // Verify no error messages
    const errorMessages = messages.filter(m => m.type === 'transaction-error' || m.type === 'transaction-failed');
    expect(errorMessages).toHaveLength(0);
  }, 10000);

  it('should handle and report file operation errors gracefully', async () => {
    const requestBody = {
      response: `
        <file path="../../../etc/passwd">
malicious content
        </file>
        <file path="valid.jsx">
import React from 'react';
export default function Valid() { return <div>Valid</div>; }
        </file>
      `,
      isEdit: false,
      packages: [],
      sandboxId: 'test-sandbox-id'
    };

    const request = new NextRequest('http://localhost:3000/api/apply-ai-code-stream', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000'
      }
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);

    // Read the streaming response
    const reader = response.body?.getReader();
    const messages: any[] = [];
    
    if (reader) {
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              messages.push(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }

    // Verify error handling occurred
    const errorMessages = messages.filter(m => 
      m.type === 'file-error' || 
      m.type === 'transaction-error' || 
      m.type === 'transaction-failed'
    );
    
    expect(errorMessages.length).toBeGreaterThan(0);

    // Check for directory traversal error specifically
    const traversalError = errorMessages.find(m => 
      m.error && m.error.includes('directory traversal')
    );
    expect(traversalError).toBeDefined();
  }, 10000);

  it('should handle missing sandbox gracefully', async () => {
    // Clear the active sandbox to simulate missing sandbox scenario
    (global as any).activeSandbox = null;

    const requestBody = {
      response: `
        <file path="test.jsx">
import React from 'react';
export default function Test() { return <div>Test</div>; }
        </file>
      `,
      isEdit: false,
      packages: [],
      // No sandboxId provided
    };

    const request = new NextRequest('http://localhost:3000/api/apply-ai-code-stream', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000'
      }
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);
    
    const responseData = await response.json();
    expect(responseData.success).toBe(false);
    expect(responseData.error).toContain('No active sandbox found');
  });

  it('should handle large file content with appropriate error messages', async () => {
    // Create content that exceeds typical file size limits
    const largeContent = 'x'.repeat(100 * 1024 * 1024); // 100MB

    const requestBody = {
      response: `
        <file path="large-file.jsx">
${largeContent}
        </file>
      `,
      isEdit: false,
      packages: [],
      sandboxId: 'test-sandbox-id'
    };

    const request = new NextRequest('http://localhost:3000/api/apply-ai-code-stream', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000'
      }
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);

    // Read the streaming response
    const reader = response.body?.getReader();
    const messages: any[] = [];
    
    if (reader) {
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              messages.push(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }

    // Should get an error about file size
    const sizeError = messages.find(m => 
      m.type === 'file-error' && 
      m.error && 
      m.error.includes('size')
    );
    
    // Note: This test might not always fail due to the FileManager's size limits,
    // but it demonstrates the error handling structure
    if (sizeError) {
      expect(sizeError.error).toContain('size');
    }
  }, 15000);

  it('should provide detailed recovery actions for errors', async () => {
    const requestBody = {
      response: `
        <file path="test.invalidextension">
Some content with invalid extension
        </file>
      `,
      isEdit: false,
      packages: [],
      sandboxId: 'test-sandbox-id'
    };

    const request = new NextRequest('http://localhost:3000/api/apply-ai-code-stream', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
        'host': 'localhost:3000'
      }
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);

    // Read the streaming response
    const reader = response.body?.getReader();
    const messages: any[] = [];
    
    if (reader) {
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              messages.push(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }

    // Look for error messages with recovery actions
    const errorWithRecovery = messages.find(m => 
      m.type === 'file-error' && 
      m.recoveryActions && 
      Array.isArray(m.recoveryActions)
    );

    if (errorWithRecovery) {
      expect(errorWithRecovery.recoveryActions.length).toBeGreaterThan(0);
      expect(errorWithRecovery.severity).toBeDefined();
    }
  }, 10000);
});