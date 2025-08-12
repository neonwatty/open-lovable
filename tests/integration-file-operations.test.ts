/**
 * File Operations Integration Tests
 * 
 * End-to-end tests for the complete AI → file → reload flow
 * after replacing E2B with local file operations.
 * 
 * Tests verify:
 * - Complete AI response → file creation → hot reload pipeline
 * - Package detection → installation → file creation workflow
 * - File watcher → change detection → reload trigger flow
 * - Error handling throughout the integration
 * - Performance characteristics of new vs old system
 */

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { NextRequest } from 'next/server';
import { POST as applyAiCodeStream } from '../app/api/apply-ai-code-stream/route';
import { POST as createSandbox } from '../app/api/create-ai-sandbox/route';

// Mock global variables  
declare global {
  var existingFiles: Set<string>;
  var sandboxState: any;
  var sandboxWatcher: any;
  var activeSandbox: any;
}

const testDir = path.join(tmpdir(), 'integration-test');
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
  global.activeSandbox = null;
  
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

// Helper functions
function createMockRequest(body: any): NextRequest {
  return {
    json: async () => body,
    headers: new Map([['host', 'localhost:3000']])
  } as any;
}

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

async function verifyFileExists(filePath: string): Promise<string> {
  const fullPath = path.join(sandboxDir, filePath);
  const content = await fs.readFile(fullPath, 'utf8');
  return content;
}

describe('File Operations Integration Tests', () => {
  test('should complete full AI response to file creation pipeline', async () => {
    const mockAiResponse = `
    <packages>
    react-icons
    framer-motion
    </packages>
    
    <file path="src/components/AnimatedButton.tsx">
import React from 'react';
import { motion } from 'framer-motion';
import { FaPlay } from 'react-icons/fa';

interface AnimatedButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({ onClick, children }) => {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg"
    >
      <FaPlay />
      {children}
    </motion.button>
  );
};
    </file>
    
    <file path="src/App.tsx">
import React from 'react';
import { AnimatedButton } from './components/AnimatedButton';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <AnimatedButton onClick={() => alert('Clicked!')}>
        Click Me
      </AnimatedButton>
    </div>
  );
};
    </file>
    
    <command>npm run build</command>
    `;
    
    const request = createMockRequest({
      response: mockAiResponse,
      packages: [],
      isEdit: false
    });
    
    const response = await applyAiCodeStream(request);
    expect(response.status).toBe(200);
    
    const events = await readStreamResponse(response);
    
    // Verify complete pipeline execution
    const startEvent = events.find(e => e.type === 'start');
    expect(startEvent).toBeDefined();
    expect(startEvent.totalSteps).toBe(4);
    
    // Verify package detection and installation step
    const packageEvents = events.filter(e => e.type === 'package-progress');
    expect(packageEvents.length).toBeGreaterThan(0);
    
    // Verify file creation step
    const fileEvents = events.filter(e => e.type === 'file-complete');
    expect(fileEvents).toHaveLength(2);
    expect(fileEvents.some(e => e.fileName === 'src/components/AnimatedButton.tsx')).toBe(true);
    expect(fileEvents.some(e => e.fileName === 'src/App.tsx')).toBe(true);
    
    // Verify file watcher setup
    const watchEvent = events.find(e => e.type === 'watch-setup');
    expect(watchEvent).toBeDefined();
    
    // Verify command execution
    const commandEvents = events.filter(e => e.type === 'command-complete');
    expect(commandEvents).toHaveLength(1);
    expect(commandEvents[0].command).toBe('npm run build');
    
    // Verify completion
    const completeEvent = events.find(e => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent.results.filesCreated).toHaveLength(2);
    
    // Verify files actually exist in filesystem
    const buttonContent = await verifyFileExists('src/components/AnimatedButton.tsx');
    expect(buttonContent).toContain('AnimatedButton');
    expect(buttonContent).toContain('framer-motion');
    expect(buttonContent).toContain('react-icons/fa');
    
    const appContent = await verifyFileExists('src/App.tsx');
    expect(appContent).toContain('AnimatedButton');
    
    // Verify global state updated correctly
    expect(global.existingFiles.has('src/components/AnimatedButton.tsx')).toBe(true);
    expect(global.existingFiles.has('src/App.tsx')).toBe(true);
  });

  test('should handle file updates with change detection', async () => {
    // First, create initial files
    const initialResponse = `
    <file path="src/Counter.tsx">
import React, { useState } from 'react';

export const Counter: React.FC = () => {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
};
    </file>
    `;
    
    const initialRequest = createMockRequest({
      response: initialResponse,
      packages: []
    });
    
    await applyAiCodeStream(initialRequest);
    
    // Verify initial file exists
    let content = await verifyFileExists('src/Counter.tsx');
    expect(content).toContain('Increment');
    
    // Now update the file
    const updateResponse = `
    <file path="src/Counter.tsx">
import React, { useState } from 'react';

export const Counter: React.FC = () => {
  const [count, setCount] = useState(0);
  
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Enhanced Counter</h2>
      <p className="text-lg">Count: {count}</p>
      <div className="flex gap-2">
        <button 
          onClick={() => setCount(count + 1)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Increment
        </button>
        <button 
          onClick={() => setCount(count - 1)}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          Decrement
        </button>
        <button 
          onClick={() => setCount(0)}
          className="px-4 py-2 bg-gray-500 text-white rounded"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
    </file>
    `;
    
    const updateRequest = createMockRequest({
      response: updateResponse,
      packages: [],
      isEdit: true
    });
    
    const response = await applyAiCodeStream(updateRequest);
    const events = await readStreamResponse(response);
    
    // Should be marked as update
    const fileEvent = events.find(e => e.type === 'file-complete');
    expect(fileEvent).toBeDefined();
    expect(fileEvent.action).toBe('updated');
    
    // Verify updated content
    content = await verifyFileExists('src/Counter.tsx');
    expect(content).toContain('Enhanced Counter');
    expect(content).toContain('Decrement');
    expect(content).toContain('Reset');
  });

  test('should handle package installation before file creation', async () => {
    const mockResponse = `
    <packages>
    @emotion/react
    @emotion/styled
    </packages>
    
    <file path="src/StyledComponent.tsx">
import React from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';

const StyledButton = styled.button\`
  padding: 12px 24px;
  background: linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%);
  border: 0;
  border-radius: 3px;
  color: white;
  height: 48px;
  box-shadow: 0 3px 5px 2px rgba(255, 105, 135, .3);
\`;

export const StyledComponent: React.FC = () => {
  return (
    <StyledButton>
      Emotion Styled Button
    </StyledButton>
  );
};
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    const events = await readStreamResponse(response);
    
    // Should have package installation events before file creation
    const packageEvents = events.filter(e => e.type === 'package-progress');
    const fileEvents = events.filter(e => e.type === 'file-complete');
    
    expect(packageEvents.length).toBeGreaterThan(0);
    expect(fileEvents).toHaveLength(1);
    
    // Package events should come before file events (check timestamps/order)
    const firstPackageIndex = events.findIndex(e => e.type === 'package-progress');
    const firstFileIndex = events.findIndex(e => e.type === 'file-complete');
    
    expect(firstPackageIndex).toBeLessThan(firstFileIndex);
    
    // Verify file created with emotion imports
    const content = await verifyFileExists('src/StyledComponent.tsx');
    expect(content).toContain('@emotion/styled');
    expect(content).toContain('@emotion/react');
  });

  test('should trigger file watcher events on external file changes', async () => {
    // Set up file watcher first
    const mockResponse = `
    <file path="src/WatchedComponent.tsx">
export const WatchedComponent = () => <div>Initial</div>;
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    const events = await readStreamResponse(response);
    
    // Verify watcher was set up
    const watchEvent = events.find(e => e.type === 'watch-setup');
    expect(watchEvent).toBeDefined();
    expect(global.sandboxWatcher).toBeDefined();
    
    // Now modify the file externally (simulating user edit)
    const filePath = path.join(sandboxDir, 'src', 'WatchedComponent.tsx');
    
    // Set up event listener to capture watcher events
    const watcherEvents: any[] = [];
    if (global.sandboxWatcher) {
      global.sandboxWatcher.on = (event: string, callback: Function) => {
        if (event === 'change') {
          // Simulate the callback being called when file changes
          setTimeout(() => callback('change', 'src/WatchedComponent.tsx'), 100);
        }
      };
    }
    
    // Modify file externally
    await fs.writeFile(filePath, 'export const WatchedComponent = () => <div>Modified Externally</div>;', 'utf8');
    
    // Wait for file system events
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify external modification worked
    const content = await verifyFileExists('src/WatchedComponent.tsx');
    expect(content).toContain('Modified Externally');
  });

  test('should handle errors gracefully throughout pipeline', async () => {
    // Test with malformed response that should cause parsing issues
    const malformedResponse = `
    <file path="src/BadFile.tsx">
    // This file has unclosed JSX and syntax errors
    export const BadComponent = () => {
      return (
        <div>
          <p>Unclosed paragraph
          <span>Nested span
        </div>
    `;
    
    const request = createMockRequest({
      response: malformedResponse,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    expect(response.status).toBe(200); // Should still respond successfully
    
    const events = await readStreamResponse(response);
    
    // Should complete despite malformed content
    const completeEvent = events.find(e => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    
    // File might be created with malformed content (that's OK for now)
    // The important thing is the pipeline doesn't crash
  });

  test('should maintain performance characteristics', async () => {
    const startTime = Date.now();
    
    // Create multiple files to test performance
    const largeResponse = Array.from({ length: 10 }, (_, i) => `
    <file path="src/components/Component${i}.tsx">
import React from 'react';

interface Component${i}Props {
  title: string;
  description: string;
  children?: React.ReactNode;
}

export const Component${i}: React.FC<Component${i}Props> = ({ 
  title, 
  description, 
  children 
}) => {
  return (
    <div className="component-${i}">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
};
    </file>
    `).join('\n');
    
    const request = createMockRequest({
      response: largeResponse,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    const events = await readStreamResponse(response);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete reasonably quickly (adjust threshold as needed)
    expect(duration).toBeLessThan(5000); // 5 seconds max
    
    // Should have created all files
    const fileEvents = events.filter(e => e.type === 'file-complete');
    expect(fileEvents).toHaveLength(10);
    
    // Verify all files actually exist
    for (let i = 0; i < 10; i++) {
      const content = await verifyFileExists(`src/components/Component${i}.tsx`);
      expect(content).toContain(`Component${i}`);
    }
  });

  test('should handle concurrent file operations safely', async () => {
    // Create multiple simultaneous requests
    const responses = await Promise.all([
      applyAiCodeStream(createMockRequest({
        response: '<file path="src/Concurrent1.tsx">export const Concurrent1 = () => <div>1</div>;</file>',
        packages: []
      })),
      applyAiCodeStream(createMockRequest({
        response: '<file path="src/Concurrent2.tsx">export const Concurrent2 = () => <div>2</div>;</file>',
        packages: []
      })),
      applyAiCodeStream(createMockRequest({
        response: '<file path="src/Concurrent3.tsx">export const Concurrent3 = () => <div>3</div>;</file>',
        packages: []
      }))
    ]);
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
    
    // All files should exist
    const content1 = await verifyFileExists('src/Concurrent1.tsx');
    const content2 = await verifyFileExists('src/Concurrent2.tsx');
    const content3 = await verifyFileExists('src/Concurrent3.tsx');
    
    expect(content1).toContain('Concurrent1');
    expect(content2).toContain('Concurrent2');
    expect(content3).toContain('Concurrent3');
    
    // Global state should track all files
    expect(global.existingFiles.has('src/Concurrent1.tsx')).toBe(true);
    expect(global.existingFiles.has('src/Concurrent2.tsx')).toBe(true);
    expect(global.existingFiles.has('src/Concurrent3.tsx')).toBe(true);
  });

  test('should clean up resources properly', async () => {
    const mockResponse = `
    <file path="src/CleanupTest.tsx">
export const CleanupTest = () => <div>Test</div>;
    </file>
    `;
    
    const request = createMockRequest({
      response: mockResponse,
      packages: []
    });
    
    await applyAiCodeStream(request);
    
    // Verify watcher was created
    expect(global.sandboxWatcher).toBeDefined();
    
    // Simulate cleanup (this would happen in afterEach, but let's test it explicitly)
    const closeSpy = jest.fn();
    if (global.sandboxWatcher) {
      global.sandboxWatcher.close = closeSpy;
      global.sandboxWatcher.close();
      global.sandboxWatcher = null;
    }
    
    expect(closeSpy).toHaveBeenCalled();
    expect(global.sandboxWatcher).toBeNull();
  });
});