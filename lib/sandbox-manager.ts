import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { appConfig } from '../config/app.config';

export interface SandboxConfig {
  sandboxesDir?: string;
  maxSandboxes?: number;
  cleanupInterval?: number;
}

export interface SandboxInfo {
  id: string;
  path: string;
  createdAt: Date;
}

export class SandboxManager {
  private sandboxesDir: string;
  private maxSandboxes: number;
  private cleanupInterval: number;

  constructor(config: SandboxConfig = {}) {
    // Use the new centralized configuration with backwards compatibility and fallbacks
    try {
      this.sandboxesDir = config.sandboxesDir || path.resolve(appConfig.sandbox?.rootPath || path.join(process.cwd(), 'sandboxes'));
      this.maxSandboxes = config.maxSandboxes || appConfig.sandbox?.directoryManagement?.maxConcurrentSandboxes || 10;
      this.cleanupInterval = config.cleanupInterval || ((appConfig.sandbox?.directoryManagement?.autoCleanupAfterHours || 24) * 60 * 60 * 1000);
    } catch (error) {
      console.warn('Failed to load sandbox configuration, using defaults:', error);
      this.sandboxesDir = config.sandboxesDir || path.join(process.cwd(), 'sandboxes');
      this.maxSandboxes = config.maxSandboxes || 10;
      this.cleanupInterval = config.cleanupInterval || 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Initialize the sandbox manager by creating the sandboxes directory
   * and cleaning up old sandboxes
   */
  async initialize(): Promise<void> {
    await this.ensureSandboxesDirectory();
    await this.cleanupOldSandboxes();
  }

  /**
   * Generate a unique sandbox ID using UUID v4
   */
  private generateSandboxId(): string {
    return crypto.randomUUID();
  }

  /**
   * Ensure the sandboxes directory exists
   */
  private async ensureSandboxesDirectory(): Promise<void> {
    try {
      await fs.access(this.sandboxesDir);
    } catch {
      await fs.mkdir(this.sandboxesDir, { recursive: true });
    }
  }

  /**
   * Validate that a path is within the sandbox boundaries
   */
  private validateSandboxPath(sandboxPath: string): boolean {
    const resolvedSandboxPath = path.resolve(sandboxPath);
    const resolvedSandboxesDir = path.resolve(this.sandboxesDir);
    
    return resolvedSandboxPath.startsWith(resolvedSandboxesDir);
  }

  /**
   * Create a new sandbox directory with unique ID
   */
  async createSandbox(): Promise<SandboxInfo> {
    await this.ensureSandboxesDirectory();
    
    const sandboxId = this.generateSandboxId();
    const sandboxPath = path.join(this.sandboxesDir, sandboxId);
    
    // Validate the path is within our sandbox boundaries
    if (!this.validateSandboxPath(sandboxPath)) {
      throw new Error('Invalid sandbox path generated');
    }
    
    try {
      await fs.mkdir(sandboxPath, { recursive: true });
      
      // Create a metadata file with creation timestamp
      const metadata = {
        id: sandboxId,
        createdAt: new Date().toISOString(),
        version: '1.0.0'
      };
      
      await fs.writeFile(
        path.join(sandboxPath, '.sandbox-metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf8'
      );
      
      return {
        id: sandboxId,
        path: sandboxPath,
        createdAt: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to create sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a sandbox directory by ID
   */
  async deleteSandbox(sandboxId: string): Promise<void> {
    if (!sandboxId || typeof sandboxId !== 'string') {
      throw new Error('Invalid sandbox ID provided');
    }
    
    const sandboxPath = path.join(this.sandboxesDir, sandboxId);
    
    // Validate the path is within our sandbox boundaries
    if (!this.validateSandboxPath(sandboxPath)) {
      throw new Error('Invalid sandbox path - outside sandbox boundaries');
    }
    
    try {
      // Remove the sandbox directory recursively
      // fs.rm with force: true will not throw if the directory doesn't exist
      await fs.rm(sandboxPath, { recursive: true, force: true });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Sandbox doesn't exist, which is fine
        return;
      }
      throw new Error(`Failed to delete sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the full path to a sandbox by ID
   */
  getSandboxPath(sandboxId: string): string {
    if (!sandboxId || typeof sandboxId !== 'string') {
      throw new Error('Invalid sandbox ID provided');
    }
    
    const sandboxPath = path.join(this.sandboxesDir, sandboxId);
    
    // Validate the path is within our sandbox boundaries
    if (!this.validateSandboxPath(sandboxPath)) {
      throw new Error('Invalid sandbox path - outside sandbox boundaries');
    }
    
    return sandboxPath;
  }

  /**
   * Check if a sandbox exists
   */
  async sandboxExists(sandboxId: string): Promise<boolean> {
    try {
      const sandboxPath = this.getSandboxPath(sandboxId);
      await fs.access(sandboxPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get information about a sandbox
   */
  async getSandboxInfo(sandboxId: string): Promise<SandboxInfo | null> {
    try {
      const sandboxPath = this.getSandboxPath(sandboxId);
      const metadataPath = path.join(sandboxPath, '.sandbox-metadata.json');
      
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      return {
        id: sandboxId,
        path: sandboxPath,
        createdAt: new Date(metadata.createdAt)
      };
    } catch {
      return null;
    }
  }

  /**
   * List all sandboxes
   */
  async listSandboxes(): Promise<SandboxInfo[]> {
    try {
      await this.ensureSandboxesDirectory();
      const entries = await fs.readdir(this.sandboxesDir, { withFileTypes: true });
      const sandboxes: SandboxInfo[] = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sandboxInfo = await this.getSandboxInfo(entry.name);
          if (sandboxInfo) {
            sandboxes.push(sandboxInfo);
          }
        }
      }
      
      // Sort by creation date, newest first
      return sandboxes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch {
      return [];
    }
  }

  /**
   * Clean up old or abandoned sandboxes
   */
  async cleanupOldSandboxes(): Promise<number> {
    const sandboxes = await this.listSandboxes();
    const now = Date.now();
    let cleanedCount = 0;
    
    // Remove sandboxes older than cleanup interval
    for (const sandbox of sandboxes) {
      const age = now - sandbox.createdAt.getTime();
      if (age > this.cleanupInterval) {
        try {
          await this.deleteSandbox(sandbox.id);
          cleanedCount++;
        } catch (error) {
          console.warn(`Failed to cleanup sandbox ${sandbox.id}:`, error);
        }
      }
    }
    
    // If we still have too many sandboxes, remove the oldest ones
    const remainingSandboxes = await this.listSandboxes();
    if (remainingSandboxes.length > this.maxSandboxes) {
      const excessCount = remainingSandboxes.length - this.maxSandboxes;
      const oldestSandboxes = remainingSandboxes.slice(-excessCount);
      
      for (const sandbox of oldestSandboxes) {
        try {
          await this.deleteSandbox(sandbox.id);
          cleanedCount++;
        } catch (error) {
          console.warn(`Failed to cleanup excess sandbox ${sandbox.id}:`, error);
        }
      }
    }
    
    return cleanedCount;
  }

  /**
   * Get sandbox manager statistics
   */
  async getStats(): Promise<{
    totalSandboxes: number;
    sandboxesDir: string;
    maxSandboxes: number;
    cleanupInterval: number;
  }> {
    const sandboxes = await this.listSandboxes();
    
    return {
      totalSandboxes: sandboxes.length,
      sandboxesDir: this.sandboxesDir,
      maxSandboxes: this.maxSandboxes,
      cleanupInterval: this.cleanupInterval
    };
  }
}

// Export a default instance for convenience
export const defaultSandboxManager = new SandboxManager();