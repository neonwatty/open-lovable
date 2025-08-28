import { EventEmitter } from 'events';
import { createServer } from 'net';
import { appConfig } from '../config/app.config';

export interface PortManagerConfig {
  startPort?: number;
  endPort?: number;
  maxRetries?: number;
  timeout?: number;
  enableCORS?: boolean;
}

export interface PortReservation {
  port: number;
  sandboxId: string;
  url: string;
  reservedAt: Date;
  status: 'reserved' | 'active' | 'released';
}

export interface PortManagerEvents {
  portReserved: (reservation: PortReservation) => void;
  portReleased: (port: number, sandboxId: string) => void;
  portConflict: (port: number, sandboxId: string) => void;
  portExhausted: (range: string) => void;
}

export interface PortManagerEventsInterface {
  on<K extends keyof PortManagerEvents>(
    event: K,
    listener: PortManagerEvents[K]
  ): this;
  
  emit<K extends keyof PortManagerEvents>(
    event: K,
    ...args: Parameters<PortManagerEvents[K]>
  ): boolean;
}

export class PortManager extends EventEmitter implements PortManagerEventsInterface {
  private config: Required<PortManagerConfig>;
  private reservations: Map<number, PortReservation> = new Map();
  private sandboxPortMap: Map<string, number> = new Map();
  private nextPort: number;

  // Type-safe event emitter methods
  on<K extends keyof PortManagerEvents>(
    event: K,
    listener: PortManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }
  
  emit<K extends keyof PortManagerEvents>(
    event: K,
    ...args: Parameters<PortManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  constructor(config: PortManagerConfig = {}) {
    super();
    // Defer config loading to avoid circular dependencies
    this.config = this.initializeConfig(config);
    this.nextPort = this.config.startPort;
  }

  private initializeConfig(config: PortManagerConfig): Required<PortManagerConfig> {
    try {
      return {
        startPort: config.startPort || appConfig.sandbox?.ports?.range?.start || 5173,
        endPort: config.endPort || appConfig.sandbox?.ports?.range?.end || 5200,
        maxRetries: config.maxRetries || appConfig.sandbox?.ports?.maxRetries || 10,
        timeout: config.timeout || appConfig.sandbox?.ports?.checkTimeout || 2000,
        enableCORS: config.enableCORS ?? true,
      };
    } catch (error) {
      // Fallback to hardcoded defaults if config loading fails
      console.warn('Failed to load port configuration, using defaults:', error);
      return {
        startPort: config.startPort || 5173,
        endPort: config.endPort || 5200,
        maxRetries: config.maxRetries || 10,
        timeout: config.timeout || 2000,
        enableCORS: config.enableCORS ?? true,
      };
    }
  }

  /**
   * Reserve a port for a sandbox
   */
  async reservePort(sandboxId: string): Promise<PortReservation> {
    // Check if sandbox already has a port reserved
    const existingPort = this.sandboxPortMap.get(sandboxId);
    if (existingPort) {
      const reservation = this.reservations.get(existingPort);
      if (reservation && reservation.status !== 'released') {
        return reservation;
      }
    }

    let retries = 0;
    let port = this.nextPort;

    while (retries < this.config.maxRetries) {
      try {
        // Find next available port
        port = await this.findNextAvailablePort();
        
        // Create reservation
        const reservation: PortReservation = {
          port,
          sandboxId,
          url: this.generateURL(port),
          reservedAt: new Date(),
          status: 'reserved',
        };

        // Store reservation
        this.reservations.set(port, reservation);
        this.sandboxPortMap.set(sandboxId, port);

        // Update next port for efficiency
        this.nextPort = port + 1;
        if (this.nextPort > this.config.endPort) {
          this.nextPort = this.config.startPort;
        }

        this.emit('portReserved', reservation);
        return reservation;

      } catch (error) {
        retries++;
        
        if (error instanceof Error && error.message.includes('No available ports')) {
          this.emit('portExhausted', `${this.config.startPort}-${this.config.endPort}`);
          throw new Error(`Port exhausted: No available ports in range ${this.config.startPort}-${this.config.endPort}`);
        }

        if (retries >= this.config.maxRetries) {
          throw new Error(`Failed to reserve port after ${this.config.maxRetries} retries: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Wait before retry
        await this.delay(100 * retries);
      }
    }

    throw new Error(`Failed to reserve port for sandbox ${sandboxId}`);
  }

  /**
   * Release a port reservation
   */
  async releasePort(sandboxId: string): Promise<boolean> {
    const port = this.sandboxPortMap.get(sandboxId);
    if (!port) {
      return false;
    }

    const reservation = this.reservations.get(port);
    if (!reservation) {
      return false;
    }

    // Update reservation status
    reservation.status = 'released';
    this.reservations.set(port, reservation);

    // Clean up mappings
    this.sandboxPortMap.delete(sandboxId);

    this.emit('portReleased', port, sandboxId);
    
    // Clean up old reservations periodically
    this.cleanupOldReservations();
    
    return true;
  }

  /**
   * Mark a port as active (when server actually starts)
   */
  async activatePort(sandboxId: string): Promise<boolean> {
    const port = this.sandboxPortMap.get(sandboxId);
    if (!port) {
      return false;
    }

    const reservation = this.reservations.get(port);
    if (!reservation || reservation.status === 'released') {
      return false;
    }

    reservation.status = 'active';
    this.reservations.set(port, reservation);
    
    return true;
  }

  /**
   * Get port reservation for a sandbox
   */
  getReservation(sandboxId: string): PortReservation | undefined {
    const port = this.sandboxPortMap.get(sandboxId);
    if (!port) {
      return undefined;
    }
    return this.reservations.get(port);
  }

  /**
   * Get all active reservations
   */
  getActiveReservations(): PortReservation[] {
    return Array.from(this.reservations.values()).filter(
      r => r.status === 'reserved' || r.status === 'active'
    );
  }

  /**
   * Generate URL for a port
   */
  generateURL(port: number, protocol: string = 'http'): string {
    return `${protocol}://localhost:${port}`;
  }

  /**
   * Get CORS configuration
   */
  getCORSConfig(): Record<string, string> {
    if (!this.config.enableCORS) {
      return {};
    }

    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  /**
   * Handle port conflicts by reassigning
   */
  async handlePortConflict(sandboxId: string): Promise<PortReservation> {
    const currentPort = this.sandboxPortMap.get(sandboxId);
    if (currentPort) {
      this.emit('portConflict', currentPort, sandboxId);
      await this.releasePort(sandboxId);
    }

    // Reserve a new port
    return this.reservePort(sandboxId);
  }

  /**
   * Check if a specific port is available
   */
  async isPortAvailable(port: number): Promise<boolean> {
    // Check if port is already reserved
    if (this.reservations.has(port) && 
        this.reservations.get(port)?.status !== 'released') {
      return false;
    }

    return new Promise((resolve) => {
      const server = createServer();
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          server.close();
          resolve(false);
        }
      }, this.config.timeout);

      server.listen(port, () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          server.close(() => resolve(true));
        }
      });

      server.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });
  }

  /**
   * Find the next available port in range
   */
  private async findNextAvailablePort(): Promise<number> {
    const startSearch = this.nextPort;
    let currentPort = startSearch;

    do {
      if (await this.isPortAvailable(currentPort)) {
        return currentPort;
      }

      currentPort++;
      if (currentPort > this.config.endPort) {
        currentPort = this.config.startPort;
      }

      // Prevent infinite loop
      if (currentPort === startSearch) {
        throw new Error(`No available ports in range ${this.config.startPort}-${this.config.endPort}`);
      }
    } while (true);
  }

  /**
   * Clean up old released reservations
   */
  private cleanupOldReservations(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [port, reservation] of this.reservations.entries()) {
      if (reservation.status === 'released' && 
          now - reservation.reservedAt.getTime() > maxAge) {
        this.reservations.delete(port);
      }
    }
  }

  /**
   * Get statistics about port usage
   */
  getStats(): {
    totalPorts: number;
    availablePorts: number;
    reservedPorts: number;
    activePorts: number;
    releasedPorts: number;
    portRange: string;
  } {
    const reservations = Array.from(this.reservations.values());
    const totalPorts = this.config.endPort - this.config.startPort + 1;
    
    return {
      totalPorts,
      availablePorts: totalPorts - reservations.filter(r => r.status !== 'released').length,
      reservedPorts: reservations.filter(r => r.status === 'reserved').length,
      activePorts: reservations.filter(r => r.status === 'active').length,
      releasedPorts: reservations.filter(r => r.status === 'released').length,
      portRange: `${this.config.startPort}-${this.config.endPort}`,
    };
  }

  /**
   * Cleanup all reservations for shutdown
   */
  async cleanup(): Promise<void> {
    // Release all active reservations
    const activeReservations = this.getActiveReservations();
    for (const reservation of activeReservations) {
      await this.releasePort(reservation.sandboxId);
    }

    // Clear all data structures
    this.reservations.clear();
    this.sandboxPortMap.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export a default instance for convenience
export const defaultPortManager = new PortManager();