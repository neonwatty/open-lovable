/**
 * Apply AI Code Stream Tests
 * 
 * Tests for the updated file operations API that replaced E2B Python-based 
 * file operations with Node.js filesystem operations.
 * 
 * Tests verify:
 * - AI response parsing to file operations
 * - Node.js fs operations vs Python runCode()
 * - File content escaping/encoding changes
 * - Streaming progress updates
 * - Local sandbox file writing
 * - Command execution in local directory
 */

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/apply-ai-code-stream/route';

// Mock global variables
declare global {
  var existingFiles: Set<string>;
  var sandboxState: any;
  var sandboxWatcher: any;
}

// Test setup
const testDir = path.join(tmpdir(), 'apply-ai-code-stream-test');
const sandboxDir = path.join(testDir, 'sandbox');

beforeEach(async () => {
  // Clean up any existing test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    // Directory might not exist, ignore
  }
  
  // Create fresh test directory structure
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(sandboxDir, { recursive: true });
  
  // Mock process.cwd() to return our test directory
  const originalCwd = process.cwd;
  process.cwd = () => testDir;
  
  // Initialize global variables
  global.existingFiles = new Set<string>();
  global.sandboxState = {
    fileCache: {
      files: {}
    }
  };
  global.sandboxWatcher = null;
  
  return () => {
    process.cwd = originalCwd;
  };
});

afterEach(async () => {
  // Close any file watchers
  if (global.sandboxWatcher) {
    global.sandboxWatcher.close();
    global.sandboxWatcher = null;
  }
  
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Helper function to create mock request
function createMockRequest(body: any): NextRequest {
  return {
    json: async () => body,
    headers: new Map([['host', 'localhost:3000']])
  } as any;
}

// Helper function to read stream response
async function readStreamResponse(response: Response): Promise<any[]> {
  const events: any[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            events.push(JSON.parse(line.slice(6)));
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error) {
    // Stream ended
  }
  
  return events;
}

describe('Apply AI Code Stream API', () => {
  test('should handle basic file creation with Node.js fs operations', async () => {
    const mockResponse = `
    <file path="src/TestComponent.tsx">
import React from 'react';

export const TestComponent: React.FC = () => {
  return <div>Hello Test</div>;
};
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: [],
      isEdit: false
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const events = await readStreamResponse(response);
    
    // Verify we got the expected progress events
    const startEvent = events.find(e => e.type === 'start');
    expect(startEvent).toBeDefined();
    expect(startEvent.totalSteps).toBe(4);
    
    const fileCompleteEvent = events.find(e => e.type === 'file-complete');
    expect(fileCompleteEvent).toBeDefined();
    expect(fileCompleteEvent.fileName).toBe('src/TestComponent.tsx');
    expect(fileCompleteEvent.action).toBe('created');
    
    // Verify file was actually created in local filesystem
    const filePath = path.join(sandboxDir, 'src', 'TestComponent.tsx');
    const fileExists = await fs.access(filePath).then(() => true, () => false);
    expect(fileExists).toBe(true);
    
    const fileContent = await fs.readFile(filePath, 'utf8');
    expect(fileContent).toContain('export const TestComponent');
    expect(fileContent).toContain('Hello Test');
  });

  test('should handle file updates vs creation correctly', async () => {
    // Pre-create a file and track it
    const filePath = 'src/ExistingComponent.tsx';
    const fullPath = path.join(sandboxDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, 'original content', 'utf8');
    global.existingFiles.add(filePath);
    
    const mockResponse = `
    <file path="${filePath}">
import React from 'react';

export const ExistingComponent: React.FC = () => {
  return <div>Updated Content</div>;
};
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: [],
      isEdit: true
    });
    
    const response = await POST(request);
    const events = await readStreamResponse(response);
    
    // Should be marked as update, not creation
    const fileCompleteEvent = events.find(e => e.type === 'file-complete');
    expect(fileCompleteEvent).toBeDefined();
    expect(fileCompleteEvent.action).toBe('updated');
    
    // Verify content was updated
    const updatedContent = await fs.readFile(fullPath, 'utf8');
    expect(updatedContent).toContain('Updated Content');
  });

  test('should handle special characters and encoding properly', async () => {
    const specialContent = `
import React from 'react';

// Test special characters: "quotes", 'single', \`backticks\`, $variables
const SPECIAL_STRING = "Hello \\"World\\" with $pecial char$ and \`backticks\`";
const UNICODE = "こんにちは 🚀 émojis and ñ characters";

export const SpecialComponent: React.FC = () => {
  return (
    <div>
      <p>{SPECIAL_STRING}</p>
      <p>{UNICODE}</p>
    </div>
  );
};
    `;
    
    const mockResponse = `<file path="src/SpecialComponent.tsx">${specialContent}</file>`;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    const response = await POST(request);
    const events = await readStreamResponse(response);
    
    const completeEvent = events.find(e => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    
    // Verify special characters preserved in filesystem
    const filePath = path.join(sandboxDir, 'src', 'SpecialComponent.tsx');
    const savedContent = await fs.readFile(filePath, 'utf8');
    
    expect(savedContent).toContain('Hello \\"World\\"');
    expect(savedContent).toContain('$pecial char$');
    expect(savedContent).toContain('\`backticks\`');
    expect(savedContent).toContain('こんにちは 🚀 émojis');
    expect(savedContent).toContain('ñ characters');
  });

  test('should extract packages from imports correctly', async () => {
    const mockResponse = `
    <file path="src/PackageTest.tsx">
import React from 'react';
import { Button } from '@heroicons/react/24/solid';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import lodash from 'lodash';

export const PackageTest = () => {
  return <Button>Test</Button>;
};
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    const response = await POST(request);
    const events = await readStreamResponse(response);
    
    // Should detect packages from imports
    const packageEvents = events.filter(e => e.type === 'package-progress');
    expect(packageEvents.length).toBeGreaterThan(0);
    
    const completeEvent = events.find(e => e.type === 'complete');
    expect(completeEvent).toBeDefined();
  });

  test('should handle multiple files with proper directory creation', async () => {
    const mockResponse = `
    <file path="src/components/Header.tsx">
import React from 'react';

export const Header: React.FC = () => {
  return <header>Header</header>;
};
    </file>
    
    <file path="src/components/Footer.tsx">
import React from 'react';

export const Footer: React.FC = () => {
  return <footer>Footer</footer>;
};
    </file>
    
    <file path="src/styles/main.css">
.header { color: blue; }
.footer { color: red; }
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    const response = await POST(request);
    const events = await readStreamResponse(response);
    
    const fileCompleteEvents = events.filter(e => e.type === 'file-complete');
    expect(fileCompleteEvents).toHaveLength(3);
    
    // Verify all files created with proper directory structure
    const headerPath = path.join(sandboxDir, 'src', 'components', 'Header.tsx');
    const footerPath = path.join(sandboxDir, 'src', 'components', 'Footer.tsx');
    const cssPath = path.join(sandboxDir, 'src', 'styles', 'main.css');
    
    expect(await fs.access(headerPath).then(() => true, () => false)).toBe(true);
    expect(await fs.access(footerPath).then(() => true, () => false)).toBe(true);
    expect(await fs.access(cssPath).then(() => true, () => false)).toBe(true);
  });

  test('should update global file tracking correctly', async () => {
    const mockResponse = `
    <file path="src/TrackedComponent.tsx">
export const TrackedComponent = () => <div>Tracked</div>;
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    await POST(request);
    
    // Verify global tracking updated
    expect(global.existingFiles.has('src/TrackedComponent.tsx')).toBe(true);
    
    // Verify file cache updated
    expect(global.sandboxState.fileCache.files['src/TrackedComponent.tsx']).toBeDefined();
    expect(global.sandboxState.fileCache.files['src/TrackedComponent.tsx'].content).toContain('TrackedComponent');
    expect(global.sandboxState.fileCache.files['src/TrackedComponent.tsx'].lastModified).toBeGreaterThan(0);
  });

  test('should handle command execution in local sandbox directory', async () => {
    // Skip command execution test if no shell available
    if (process.platform === 'win32') {
      console.log('Skipping command execution test on Windows');
      return;
    }
    
    const mockResponse = `
    <file path="test.txt">Hello World</file>
    <command>ls -la</command>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    const response = await POST(request);
    const events = await readStreamResponse(response);
    
    const commandEvents = events.filter(e => e.type === 'command-progress' || e.type === 'command-complete');
    expect(commandEvents.length).toBeGreaterThan(0);
    
    const commandCompleteEvent = events.find(e => e.type === 'command-complete');
    expect(commandCompleteEvent).toBeDefined();
    expect(commandCompleteEvent.command).toBe('ls -la');
  });

  test('should handle empty response gracefully', async () => {
    const request = createMockRequest({
      response: '',
      packages: []
    });
    
    const response = await POST(request);
    const events = await readStreamResponse(response);
    
    const completeEvent = events.find(e => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent.results.filesCreated).toHaveLength(0);
  });

  test('should handle malformed AI response', async () => {
    const mockResponse = `
    <file path="incomplete.tsx">
    This file has no closing tag and incomplete content...
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const events = await readStreamResponse(response);
    const completeEvent = events.find(e => e.type === 'complete');
    expect(completeEvent).toBeDefined();
  });

  test('should require response parameter', async () => {
    const request = createMockRequest({
      packages: []
    });
    
    const response = await POST(request);
    expect(response.status).toBe(400);
    
    const data = await response.json();
    expect(data.error).toBe('response is required');
  });

  test('should remove CSS imports from JS/TS files', async () => {
    const mockResponse = `
    <file path="src/ComponentWithCSS.tsx">
import React from 'react';
import './ComponentWithCSS.css';
import '../styles/global.css';

export const ComponentWithCSS = () => {
  return <div>No CSS imports</div>;
};
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    await POST(request);
    
    const filePath = path.join(sandboxDir, 'src', 'ComponentWithCSS.tsx');
    const content = await fs.readFile(filePath, 'utf8');
    
    // CSS imports should be removed
    expect(content).not.toContain("import './ComponentWithCSS.css'");
    expect(content).not.toContain("import '../styles/global.css'");
    
    // Other imports should remain
    expect(content).toContain("import React from 'react'");
  });
});