/**
 * File Watcher Utilities
 * 
 * Extracted file watching functionality for better testability
 * and separation of concerns.
 */

import { watch } from 'fs';

// Global watcher storage
declare global {
  var sandboxWatcher: any;
}

/**
 * Set up file watching for hot reload
 * @param sandboxPath - Path to the sandbox directory to watch
 * @param sendProgress - Optional progress callback function
 * @returns boolean indicating if watcher was set up successfully
 */
export function setupFileWatcher(sandboxPath: string, sendProgress?: (data: any) => Promise<void>): boolean {
  // Clean up existing watcher
  if (global.sandboxWatcher) {
    global.sandboxWatcher.close();
  }

  try {
    // Watch the sandbox directory recursively
    global.sandboxWatcher = watch(sandboxPath, { recursive: true }, async (eventType, filename) => {
      if (filename && sendProgress) {
        console.log(`[File Watcher] ${eventType}: ${filename}`);
        await sendProgress({
          type: 'file-watch',
          eventType,
          filename,
          message: `File ${eventType}: ${filename}`
        });
      }
    });

    console.log(`[File Watcher] Started watching ${sandboxPath}`);
    return true;
  } catch (error) {
    console.error(`[File Watcher] Failed to start watching ${sandboxPath}:`, error);
    return false;
  }
}

/**
 * Close the current file watcher
 */
export function closeFileWatcher(): void {
  if (global.sandboxWatcher) {
    global.sandboxWatcher.close();
    global.sandboxWatcher = null;
  }
}