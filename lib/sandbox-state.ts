import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { ProcessInfo } from './process-manager';

export interface SandboxMetadata {
  id: string;
  directoryPath: string;
  processId?: number;
  port?: number;
  status: 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  createdAt: Date;
  lastActivity: Date;
  processStartedAt?: Date;
  url?: string;
}

export interface SandboxStateConfig {
  stateFilePath?: string;
  maxSandboxes?: number;
  persistState?: boolean;
  syncInterval?: number;
}

export interface SandboxLifecycleEvents {
  sandboxRegistered: (metadata: SandboxMetadata) => void;
  sandboxUpdated: (metadata: SandboxMetadata) => void;
  sandboxRemoved: (sandboxId: string) => void;
  processStarted: (metadata: SandboxMetadata) => void;
  processStopped: (metadata: SandboxMetadata) => void;
  stateLoaded: (count: number) => void;
  statePersisted: (count: number) => void;
  limitReached: (limit: number) => void;
}

export interface SandboxStateStoreEvents {
  on<K extends keyof SandboxLifecycleEvents>(
    event: K,
    listener: SandboxLifecycleEvents[K]
  ): this;
  
  emit<K extends keyof SandboxLifecycleEvents>(
    event: K,
    ...args: Parameters<SandboxLifecycleEvents[K]>
  ): boolean;
}

export class SandboxStateStore extends EventEmitter implements SandboxStateStoreEvents {
  private sandboxes: Map<string, SandboxMetadata> = new Map();
  private config: Required<SandboxStateConfig>;
  private syncTimer?: NodeJS.Timeout;
  private initialized = false;

  // Type-safe event emitter methods
  on<K extends keyof SandboxLifecycleEvents>(
    event: K,
    listener: SandboxLifecycleEvents[K]
  ): this {
    return super.on(event, listener);
  }
  
  emit<K extends keyof SandboxLifecycleEvents>(
    event: K,
    ...args: Parameters<SandboxLifecycleEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  constructor(config: SandboxStateConfig = {}) {
    super();
    this.config = {
      stateFilePath: config.stateFilePath || path.join(process.cwd(), '.sandbox-state.json'),
      maxSandboxes: config.maxSandboxes || 50,
      persistState: config.persistState ?? true,
      syncInterval: config.syncInterval || 30000, // 30 seconds
    };
  }

  /**
   * Initialize the state store by loading persisted state and setting up sync
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.persistState) {
      await this.loadState();
      this.setupPeriodicSync();
    }

    this.initialized = true;
  }

  /**
   * Register a new sandbox in the state store
   */
  async registerSandbox(sandboxId: string, directoryPath: string): Promise<SandboxMetadata> {
    if (this.sandboxes.has(sandboxId)) {
      throw new Error(`Sandbox ${sandboxId} is already registered`);
    }

    // Check concurrent sandbox limit
    const activeSandboxes = Array.from(this.sandboxes.values()).filter(
      s => s.status !== 'stopped' && s.status !== 'error'
    );
    
    if (activeSandboxes.length >= this.config.maxSandboxes) {
      this.emit('limitReached', this.config.maxSandboxes);
      throw new Error(`Maximum number of sandboxes (${this.config.maxSandboxes}) reached`);
    }

    const metadata: SandboxMetadata = {
      id: sandboxId,
      directoryPath,
      status: 'created',
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sandboxes.set(sandboxId, metadata);
    this.emit('sandboxRegistered', metadata);

    if (this.config.persistState) {
      await this.persistState();
    }

    return metadata;
  }

  /**
   * Update sandbox state with process information
   */
  async updateSandboxState(sandboxId: string, updates: Partial<SandboxMetadata>): Promise<SandboxMetadata> {
    const existing = this.sandboxes.get(sandboxId);
    if (!existing) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const updated: SandboxMetadata = {
      ...existing,
      ...updates,
      lastActivity: new Date(),
    };

    // If process is starting/running, set processStartedAt
    if (updates.status === 'starting' || updates.status === 'running') {
      if (!existing.processStartedAt) {
        updated.processStartedAt = new Date();
      }
    }

    // Generate URL if port is provided and status is running
    if (updated.port && updated.status === 'running') {
      updated.url = `http://localhost:${updated.port}`;
    }

    this.sandboxes.set(sandboxId, updated);
    this.emit('sandboxUpdated', updated);

    // Emit specific process events
    if (updates.status === 'running' && existing.status !== 'running') {
      this.emit('processStarted', updated);
    } else if (updates.status === 'stopped' && existing.status === 'running') {
      this.emit('processStopped', updated);
    }

    if (this.config.persistState) {
      await this.persistState();
    }

    return updated;
  }

  /**
   * Update sandbox state from ProcessInfo
   */
  async updateFromProcessInfo(processInfo: ProcessInfo): Promise<SandboxMetadata> {
    return this.updateSandboxState(processInfo.sandboxId, {
      processId: processInfo.pid,
      port: processInfo.port,
      status: this.mapProcessStatus(processInfo.status),
    });
  }

  /**
   * Get sandbox state by ID
   */
  getSandboxState(sandboxId: string): SandboxMetadata | undefined {
    return this.sandboxes.get(sandboxId);
  }

  /**
   * Get all sandbox states
   */
  getAllSandboxes(): SandboxMetadata[] {
    return Array.from(this.sandboxes.values());
  }

  /**
   * Get active sandboxes (not stopped or error)
   */
  getActiveSandboxes(): SandboxMetadata[] {
    return this.getAllSandboxes().filter(
      s => s.status !== 'stopped' && s.status !== 'error'
    );
  }

  /**
   * Get running sandboxes
   */
  getRunningSandboxes(): SandboxMetadata[] {
    return this.getAllSandboxes().filter(s => s.status === 'running');
  }

  /**
   * Remove a sandbox from the state store
   */
  async removeSandbox(sandboxId: string): Promise<boolean> {
    const metadata = this.sandboxes.get(sandboxId);
    if (!metadata) {
      return false;
    }

    this.sandboxes.delete(sandboxId);
    this.emit('sandboxRemoved', sandboxId);

    if (this.config.persistState) {
      await this.persistState();
    }

    return true;
  }

  /**
   * Clean up terminated processes by checking process status
   */
  async cleanupTerminatedProcesses(): Promise<number> {
    let cleanedCount = 0;
    const processesToCleanup: string[] = [];

    for (const [sandboxId, metadata] of this.sandboxes.entries()) {
      if (metadata.processId && (metadata.status === 'running' || metadata.status === 'starting')) {
        if (!this.isProcessRunning(metadata.processId)) {
          processesToCleanup.push(sandboxId);
        }
      }
    }

    for (const sandboxId of processesToCleanup) {
      await this.updateSandboxState(sandboxId, { status: 'stopped' });
      cleanedCount++;
    }

    return cleanedCount;
  }

  /**
   * Clean up old sandbox entries
   */
  async cleanupOldSandboxes(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;
    const sandboxesToRemove: string[] = [];

    for (const [sandboxId, metadata] of this.sandboxes.entries()) {
      const age = now - metadata.lastActivity.getTime();
      
      // Only cleanup stopped or error status sandboxes that are old
      if ((metadata.status === 'stopped' || metadata.status === 'error') && age > maxAge) {
        sandboxesToRemove.push(sandboxId);
      }
    }

    for (const sandboxId of sandboxesToRemove) {
      await this.removeSandbox(sandboxId);
      cleanedCount++;
    }

    return cleanedCount;
  }

  /**
   * Get statistics about sandbox state
   */
  getStats(): {
    total: number;
    active: number;
    running: number;
    stopped: number;
    error: number;
    maxSandboxes: number;
  } {
    const sandboxes = this.getAllSandboxes();
    
    return {
      total: sandboxes.length,
      active: this.getActiveSandboxes().length,
      running: sandboxes.filter(s => s.status === 'running').length,
      stopped: sandboxes.filter(s => s.status === 'stopped').length,
      error: sandboxes.filter(s => s.status === 'error').length,
      maxSandboxes: this.config.maxSandboxes,
    };
  }

  /**
   * Load state from persistent storage
   */
  private async loadState(): Promise<void> {
    try {
      const stateContent = await fs.readFile(this.config.stateFilePath, 'utf8');
      const stateData = JSON.parse(stateContent);
      
      if (Array.isArray(stateData.sandboxes)) {
        for (const item of stateData.sandboxes) {
          const metadata: SandboxMetadata = {
            ...item,
            createdAt: new Date(item.createdAt),
            lastActivity: new Date(item.lastActivity),
            processStartedAt: item.processStartedAt ? new Date(item.processStartedAt) : undefined,
          };
          this.sandboxes.set(metadata.id, metadata);
        }
      }

      this.emit('stateLoaded', this.sandboxes.size);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to load sandbox state:', error);
      }
      // File doesn't exist or is corrupted, start with empty state
    }
  }

  /**
   * Persist state to storage
   */
  private async persistState(): Promise<void> {
    try {
      const stateData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        sandboxes: Array.from(this.sandboxes.values()),
      };

      await fs.writeFile(
        this.config.stateFilePath,
        JSON.stringify(stateData, null, 2),
        'utf8'
      );

      this.emit('statePersisted', this.sandboxes.size);
    } catch (error) {
      console.error('Failed to persist sandbox state:', error);
    }
  }

  /**
   * Set up periodic state synchronization
   */
  private setupPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.cleanupTerminatedProcesses();
        await this.persistState();
      } catch (error) {
        console.warn('Periodic sync failed:', error);
      }
    }, this.config.syncInterval);
  }

  /**
   * Map process status to sandbox status
   */
  private mapProcessStatus(processStatus: string): SandboxMetadata['status'] {
    switch (processStatus) {
      case 'starting':
        return 'starting';
      case 'running':
        return 'running';
      case 'stopping':
        return 'stopping';
      case 'stopped':
        return 'stopped';
      case 'error':
        return 'error';
      default:
        return 'created';
    }
  }

  /**
   * Check if a process is running by PID
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without actually sending a signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup resources and stop periodic sync
   */
  async destroy(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    if (this.config.persistState) {
      await this.persistState();
    }

    this.removeAllListeners();
    this.initialized = false;
  }
}

// Export a default instance for convenience
export const defaultSandboxStateStore = new SandboxStateStore();