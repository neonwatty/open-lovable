import { SandboxStateStore } from './sandbox-state';
import { PortManager } from './port-manager';
import { EventEmitter } from 'events';

/**
 * Integration layer between SandboxStateStore and PortManager
 * Provides unified sandbox lifecycle management with automatic port handling
 */
export class SandboxPortIntegration extends EventEmitter {
  private sandboxState: SandboxStateStore;
  private portManager: PortManager;

  constructor(sandboxState: SandboxStateStore, portManager: PortManager) {
    super();
    this.sandboxState = sandboxState;
    this.portManager = portManager;
    
    this.setupEventHandlers();
  }

  /**
   * Create a new sandbox with automatic port allocation
   */
  async createSandbox(sandboxId: string, directoryPath: string): Promise<{
    sandboxMetadata: any;
    portReservation: any;
  }> {
    try {
      // Register sandbox first
      const sandboxMetadata = await this.sandboxState.registerSandbox(sandboxId, directoryPath);
      
      // Reserve port for the sandbox
      const portReservation = await this.portManager.reservePort(sandboxId);
      
      // Update sandbox state with port information
      await this.sandboxState.updateSandboxState(sandboxId, {
        port: portReservation.port,
        url: portReservation.url,
        status: 'created',
      });

      this.emit('sandboxCreated', { sandboxMetadata, portReservation });
      
      return { sandboxMetadata, portReservation };
    } catch (error) {
      // Cleanup on failure
      await this.cleanupFailedSandbox(sandboxId);
      throw error;
    }
  }

  /**
   * Start a sandbox process and activate its port
   */
  async startSandbox(sandboxId: string): Promise<boolean> {
    try {
      // Update sandbox to starting status
      await this.sandboxState.updateSandboxState(sandboxId, {
        status: 'starting',
      });

      // Activate the port
      const activated = await this.portManager.activatePort(sandboxId);
      if (!activated) {
        throw new Error(`Failed to activate port for sandbox ${sandboxId}`);
      }

      // Update sandbox to running status
      await this.sandboxState.updateSandboxState(sandboxId, {
        status: 'running',
      });

      this.emit('sandboxStarted', sandboxId);
      return true;
    } catch (error) {
      await this.sandboxState.updateSandboxState(sandboxId, {
        status: 'error',
      });
      throw error;
    }
  }

  /**
   * Stop a sandbox and release its port
   */
  async stopSandbox(sandboxId: string): Promise<boolean> {
    try {
      // Update sandbox to stopping status
      await this.sandboxState.updateSandboxState(sandboxId, {
        status: 'stopping',
      });

      // Release the port
      const released = await this.portManager.releasePort(sandboxId);

      // Update sandbox to stopped status
      await this.sandboxState.updateSandboxState(sandboxId, {
        status: 'stopped',
      });

      this.emit('sandboxStopped', sandboxId);
      return released;
    } catch (error) {
      await this.sandboxState.updateSandboxState(sandboxId, {
        status: 'error',
      });
      throw error;
    }
  }

  /**
   * Remove a sandbox completely
   */
  async removeSandbox(sandboxId: string): Promise<boolean> {
    try {
      // Release port first
      await this.portManager.releasePort(sandboxId);
      
      // Remove from sandbox state
      const removed = await this.sandboxState.removeSandbox(sandboxId);
      
      if (removed) {
        this.emit('sandboxRemoved', sandboxId);
      }
      
      return removed;
    } catch (error) {
      console.error(`Failed to remove sandbox ${sandboxId}:`, error);
      return false;
    }
  }

  /**
   * Get comprehensive sandbox information including port details
   */
  getSandboxInfo(sandboxId: string): {
    sandbox?: any;
    port?: any;
    url?: string;
  } {
    const sandbox = this.sandboxState.getSandboxState(sandboxId);
    const portReservation = this.portManager.getReservation(sandboxId);
    
    return {
      sandbox,
      port: portReservation,
      url: portReservation?.url,
    };
  }

  /**
   * Get all active sandboxes with their port information
   */
  getActiveSandboxes(): Array<{
    sandbox: any;
    port?: any;
  }> {
    const activeSandboxes = this.sandboxState.getActiveSandboxes();
    
    return activeSandboxes.map(sandbox => ({
      sandbox,
      port: this.portManager.getReservation(sandbox.id),
    }));
  }

  /**
   * Handle port conflicts by reassigning ports
   */
  async handlePortConflict(sandboxId: string): Promise<void> {
    try {
      // Reassign port
      const newReservation = await this.portManager.handlePortConflict(sandboxId);
      
      // Update sandbox state with new port
      await this.sandboxState.updateSandboxState(sandboxId, {
        port: newReservation.port,
        url: newReservation.url,
      });

      this.emit('portConflictResolved', sandboxId, newReservation.port);
    } catch (error) {
      this.emit('portConflictFailed', sandboxId, error);
      throw error;
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): {
    sandbox: any;
    port: any;
  } {
    return {
      sandbox: this.sandboxState.getStats(),
      port: this.portManager.getStats(),
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Cleanup all active sandboxes
    const activeSandboxes = this.sandboxState.getActiveSandboxes();
    
    for (const sandbox of activeSandboxes) {
      try {
        await this.stopSandbox(sandbox.id);
      } catch (error) {
        console.warn(`Failed to stop sandbox ${sandbox.id} during cleanup:`, error);
      }
    }

    // Cleanup port manager
    await this.portManager.cleanup();
    
    // Cleanup sandbox state
    await this.sandboxState.destroy();
    
    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Forward sandbox state events
    this.sandboxState.on('sandboxRegistered', (metadata) => {
      this.emit('sandboxRegistered', metadata);
    });

    this.sandboxState.on('sandboxUpdated', (metadata) => {
      this.emit('sandboxUpdated', metadata);
    });

    // Forward port manager events
    this.portManager.on('portReserved', (reservation) => {
      this.emit('portReserved', reservation);
    });

    this.portManager.on('portReleased', (port, sandboxId) => {
      this.emit('portReleased', port, sandboxId);
    });

    this.portManager.on('portConflict', (port, sandboxId) => {
      this.emit('portConflict', port, sandboxId);
    });

    this.portManager.on('portExhausted', (range) => {
      this.emit('portExhausted', range);
    });
  }

  /**
   * Cleanup a failed sandbox creation
   */
  private async cleanupFailedSandbox(sandboxId: string): Promise<void> {
    try {
      await this.portManager.releasePort(sandboxId);
      await this.sandboxState.removeSandbox(sandboxId);
    } catch (error) {
      console.warn(`Failed to cleanup sandbox ${sandboxId}:`, error);
    }
  }
}

// Export a factory function for creating integrated instances
export function createSandboxPortIntegration(
  sandboxConfig?: any,
  portConfig?: any
): SandboxPortIntegration {
  const sandboxState = new SandboxStateStore(sandboxConfig);
  const portManager = new PortManager(portConfig);
  
  return new SandboxPortIntegration(sandboxState, portManager);
}