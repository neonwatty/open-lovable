/**
 * File Watcher Tests
 * 
 * Tests for the file watching functionality added to replace E2B's file monitoring.
 * 
 * Tests verify:
 * - setupFileWatcher() function behavior
 * - fs.watch() recursive monitoring
 * - File change event handling
 * - Hot reload event triggering
 * - Watcher cleanup and error handling
 */

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { setupFileWatcher, closeFileWatcher } from '../lib/file-watcher';

// Mock global variables
declare global {
  var sandboxWatcher: any;
}

const testDir = path.join(tmpdir(), 'file-watcher-test');
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
  
  // Clean up any existing watchers
  if (global.sandboxWatcher) {
    global.sandboxWatcher.close();
    global.sandboxWatcher = null;
  }
});

afterEach(async () => {
  // Close any file watchers
  closeFileWatcher();
  
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Helper to wait for file system events
function waitForEvent(timeout = 1000): Promise<{eventType: string, filename: string}> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for file event'));
    }, timeout);
    
    if (global.sandboxWatcher) {
      global.sandboxWatcher.once('change', (eventType: string, filename: string) => {
        clearTimeout(timer);
        resolve({ eventType, filename });
      });
    } else {
      clearTimeout(timer);
      reject(new Error('No watcher active'));
    }
  });
}

describe('File Watcher Functionality', () => {
  test('should initialize file watcher successfully', () => {
    const result = setupFileWatcher(sandboxDir);
    
    expect(result).toBe(true);
    expect(global.sandboxWatcher).toBeDefined();
    expect(global.sandboxWatcher).toBeTruthy();
  });

  test('should return false when watching invalid directory', () => {
    const invalidPath = path.join(testDir, 'nonexistent');
    const result = setupFileWatcher(invalidPath);
    
    expect(result).toBe(false);
  });

  test('should clean up existing watcher before creating new one', () => {
    // Create first watcher
    const result1 = setupFileWatcher(sandboxDir);
    expect(result1).toBe(true);
    
    const firstWatcher = global.sandboxWatcher;
    const closeSpy = jest.fn();
    firstWatcher.close = closeSpy;
    
    // Create second watcher - should close first one
    const result2 = setupFileWatcher(sandboxDir);
    expect(result2).toBe(true);
    expect(closeSpy).toHaveBeenCalled();
    expect(global.sandboxWatcher).not.toBe(firstWatcher);
  });

  test('should detect file creation', async () => {
    const events: any[] = [];
    const mockSendProgress = async (data: any) => {
      events.push(data);
    };
    
    setupFileWatcher(sandboxDir, mockSendProgress);
    
    // Create a new file
    const testFile = path.join(sandboxDir, 'test.txt');
    await fs.writeFile(testFile, 'test content', 'utf8');
    
    // Wait a bit for the file system event
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should have received a file watch event
    expect(events.length).toBeGreaterThan(0);
    const fileEvent = events.find(e => e.type === 'file-watch' && e.filename === 'test.txt');
    expect(fileEvent).toBeDefined();
    expect(fileEvent.eventType).toBe('rename'); // File creation is typically 'rename' event
  });

  test('should detect file modification', async () => {
    // Create a file first
    const testFile = path.join(sandboxDir, 'modify-test.txt');
    await fs.writeFile(testFile, 'initial content', 'utf8');
    
    const events: any[] = [];
    const mockSendProgress = async (data: any) => {
      events.push(data);
    };
    
    setupFileWatcher(sandboxDir, mockSendProgress);
    
    // Wait a bit, then modify the file
    await new Promise(resolve => setTimeout(resolve, 100));
    await fs.writeFile(testFile, 'modified content', 'utf8');
    
    // Wait for the event
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const fileEvent = events.find(e => e.type === 'file-watch' && e.filename === 'modify-test.txt');
    expect(fileEvent).toBeDefined();
    expect(fileEvent.eventType).toBe('change');
  });

  test('should detect nested directory file changes', async () => {
    // Create nested directory structure
    const nestedDir = path.join(sandboxDir, 'src', 'components');
    await fs.mkdir(nestedDir, { recursive: true });
    
    const events: any[] = [];
    const mockSendProgress = async (data: any) => {
      events.push(data);
    };
    
    setupFileWatcher(sandboxDir, mockSendProgress);
    
    // Create a file in the nested directory
    const nestedFile = path.join(nestedDir, 'NestedComponent.tsx');
    await fs.writeFile(nestedFile, 'export const NestedComponent = () => <div>Nested</div>;', 'utf8');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should detect the nested file change
    const fileEvent = events.find(e => 
      e.type === 'file-watch' && 
      e.filename && 
      e.filename.includes('NestedComponent.tsx')
    );
    expect(fileEvent).toBeDefined();
  });

  test('should handle multiple rapid file changes', async () => {
    const events: any[] = [];
    const mockSendProgress = async (data: any) => {
      events.push(data);
    };
    
    setupFileWatcher(sandboxDir, mockSendProgress);
    
    // Create multiple files rapidly
    const files = ['file1.txt', 'file2.txt', 'file3.txt'];
    
    for (const fileName of files) {
      const filePath = path.join(sandboxDir, fileName);
      await fs.writeFile(filePath, `Content for ${fileName}`, 'utf8');
    }
    
    // Wait for events to settle
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Should have detected multiple file events
    expect(events.length).toBeGreaterThan(0);
    
    // Should have events for all files (though exact count may vary due to OS differences)
    const fileNames = events
      .filter(e => e.type === 'file-watch')
      .map(e => e.filename)
      .filter(Boolean);
    
    expect(fileNames.length).toBeGreaterThan(0);
  });

  test('should provide meaningful progress messages', async () => {
    const events: any[] = [];
    const mockSendProgress = async (data: any) => {
      events.push(data);
    };
    
    setupFileWatcher(sandboxDir, mockSendProgress);
    
    const testFile = path.join(sandboxDir, 'message-test.js');
    await fs.writeFile(testFile, 'console.log("test");', 'utf8');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const fileEvent = events.find(e => e.type === 'file-watch');
    expect(fileEvent).toBeDefined();
    expect(fileEvent.message).toContain('File');
    expect(fileEvent.message).toContain('message-test.js');
    expect(typeof fileEvent.eventType).toBe('string');
    expect(typeof fileEvent.filename).toBe('string');
  });

  test('should handle watcher errors gracefully', () => {
    // Mock fs.watch to throw an error
    const originalWatch = watch;
    const mockWatch = jest.fn(() => {
      throw new Error('Mock watcher error');
    });
    
    // Replace the watch function temporarily
    require('fs').watch = mockWatch;
    
    const result = setupFileWatcher(sandboxDir);
    
    expect(result).toBe(false);
    expect(mockWatch).toHaveBeenCalled();
    
    // Restore original watch function
    require('fs').watch = originalWatch;
  });

  test('should work without sendProgress callback', async () => {
    // Setup watcher without progress callback
    const result = setupFileWatcher(sandboxDir);
    expect(result).toBe(true);
    
    // Should still work, just won't send progress events
    const testFile = path.join(sandboxDir, 'no-progress.txt');
    await fs.writeFile(testFile, 'content', 'utf8');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // No errors should occur, file should exist
    const fileExists = await fs.access(testFile).then(() => true, () => false);
    expect(fileExists).toBe(true);
  });

  test('should close watcher on cleanup', () => {
    setupFileWatcher(sandboxDir);
    
    const watcher = global.sandboxWatcher;
    expect(watcher).toBeDefined();
    
    const closeSpy = jest.spyOn(watcher, 'close');
    
    // Simulate cleanup by calling setupFileWatcher again (which should close existing)
    setupFileWatcher(sandboxDir);
    
    expect(closeSpy).toHaveBeenCalled();
  });

  test('should handle directory deletion gracefully', async () => {
    const subDir = path.join(sandboxDir, 'will-be-deleted');
    await fs.mkdir(subDir, { recursive: true });
    
    const events: any[] = [];
    const mockSendProgress = async (data: any) => {
      events.push(data);
    };
    
    setupFileWatcher(sandboxDir, mockSendProgress);
    
    // Delete the subdirectory
    await fs.rm(subDir, { recursive: true });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should handle the deletion event without crashing
    // The watcher should still be active
    expect(global.sandboxWatcher).toBeDefined();
  });
});