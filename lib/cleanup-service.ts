import { EventEmitter } from 'events';
import { ProcessManager } from './process-manager';
import { SandboxManager, SandboxInfo } from './sandbox-manager';
import { PortManager } from './port-manager';

export interface CleanupServiceConfig {
  scheduledCleanupInterval?: number; // in milliseconds
  zombieDetectionInterval?: number; // in milliseconds
  maxInactivityTime?: number; // in milliseconds before sandbox timeout
  maxMemoryUsage?: number; // in bytes
  enableAutoCleanup?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface CleanupError extends Error {
  type: 'ZOMBIE_PROCESS' | 'CORRUPTED_SANDBOX' | 'PORT_LEAK' | 'MEMORY_LEAK' | 'TIMEOUT' | 'PERMISSION_ERROR';
  sandboxId?: string;
  pid?: number;
  port?: number;
  details?: Record<string, unknown>;
}

export interface CleanupResult {
  zombieProcesses: number;
  corruptedSandboxes: number;
  releasedPorts: number;
  freedMemory: number;
  errors: CleanupError[];
  duration: number;
}

export interface CleanupServiceEvents {
  cleanupStarted: () => void;
  cleanupCompleted: (result: CleanupResult) => void;
  zombieProcessDetected: (pid: number, sandboxId: string) => void;
  corruptedSandboxDetected: (sandboxId: string, error: Error) => void;
  portLeakDetected: (port: number, sandboxId: string) => void;
  memoryLeakDetected: (usage: number, threshold: number) => void;
  gracefulShutdownStarted: (signal: string) => void;
  gracefulShutdownCompleted: () => void;
  error: (error: CleanupError) => void;
}

export class CleanupService extends EventEmitter {
  private config: Required<CleanupServiceConfig>;
  private processManager: ProcessManager;
  private sandboxManager: SandboxManager;
  private portManager: PortManager;
  private scheduledCleanupTimer?: NodeJS.Timeout;
  private zombieDetectionTimer?: NodeJS.Timeout;
  private isShuttingDown = false;
  private memoryBaseline?: number;

  constructor(
    processManager: ProcessManager,
    sandboxManager: SandboxManager,
    portManager: PortManager,
    config: CleanupServiceConfig = {}
  ) {
    super();
    
    this.processManager = processManager;
    this.sandboxManager = sandboxManager;
    this.portManager = portManager;
    
    this.config = {
      scheduledCleanupInterval: config.scheduledCleanupInterval ?? 60000, // 1 minute
      zombieDetectionInterval: config.zombieDetectionInterval ?? 30000, // 30 seconds
      maxInactivityTime: config.maxInactivityTime ?? 900000, // 15 minutes
      maxMemoryUsage: config.maxMemoryUsage ?? 1024 * 1024 * 1024, // 1GB
      enableAutoCleanup: config.enableAutoCleanup ?? true,
      logLevel: config.logLevel ?? 'info'
    };

    this.setupGracefulShutdown();
    this.recordMemoryBaseline();
  }

  /**
   * Start the cleanup service with scheduled and automatic cleanup
   */
  start(): void {
    if (!this.config.enableAutoCleanup) {
      this.log('info', 'Cleanup service started but auto-cleanup is disabled');
      return;
    }

    this.log('info', 'Starting cleanup service with scheduled cleanup');

    // Start scheduled cleanup
    this.scheduledCleanupTimer = setInterval(() => {
      this.performScheduledCleanup().catch(error => {
        this.emitError('TIMEOUT', 'Scheduled cleanup failed', { error: error.message });
      });
    }, this.config.scheduledCleanupInterval);

    // Start zombie process detection
    this.zombieDetectionTimer = setInterval(() => {
      this.detectZombieProcesses().catch(error => {
        this.emitError('ZOMBIE_PROCESS', 'Zombie detection failed', { error: error.message });
      });
    }, this.config.zombieDetectionInterval);

    this.log('info', 'Cleanup service started successfully');
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    this.log('info', 'Stopping cleanup service');

    if (this.scheduledCleanupTimer) {
      clearInterval(this.scheduledCleanupTimer);
      this.scheduledCleanupTimer = undefined;
    }

    if (this.zombieDetectionTimer) {
      clearInterval(this.zombieDetectionTimer);
      this.zombieDetectionTimer = undefined;
    }

    this.log('info', 'Cleanup service stopped');
  }

  /**
   * Perform comprehensive cleanup on-demand
   */
  async performCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    this.emit('cleanupStarted');
    this.log('info', 'Starting comprehensive cleanup');

    const result: CleanupResult = {
      zombieProcesses: 0,
      corruptedSandboxes: 0,
      releasedPorts: 0,
      freedMemory: 0,
      errors: [],
      duration: 0
    };

    // Detect and clean zombie processes
    try {
      result.zombieProcesses = await this.cleanupZombieProcesses();
    } catch (error) {
      const cleanupError = this.createCleanupError(
        'ZOMBIE_PROCESS', 
        'Failed to cleanup zombie processes', 
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      result.errors.push(cleanupError);
    }

    // Detect and clean corrupted sandboxes
    try {
      result.corruptedSandboxes = await this.cleanupCorruptedSandboxes();
    } catch (error) {
      const cleanupError = this.createCleanupError(
        'CORRUPTED_SANDBOX', 
        'Failed to cleanup corrupted sandboxes', 
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      result.errors.push(cleanupError);
    }

    // Release leaked ports
    try {
      result.releasedPorts = await this.cleanupLeakedPorts();
    } catch (error) {
      const cleanupError = this.createCleanupError(
        'PORT_LEAK', 
        'Failed to cleanup leaked ports', 
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      result.errors.push(cleanupError);
    }

    // Check for memory leaks
    try {
      result.freedMemory = await this.checkMemoryUsage();
    } catch (error) {
      const cleanupError = this.createCleanupError(
        'MEMORY_LEAK', 
        'Failed to check memory usage', 
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      result.errors.push(cleanupError);
    }

    // Clean up old sandboxes based on inactivity
    try {
      const inactiveCount = await this.cleanupInactiveSandboxes();
      result.corruptedSandboxes += inactiveCount;
    } catch (error) {
      const cleanupError = this.createCleanupError(
        'TIMEOUT', 
        'Failed to cleanup inactive sandboxes', 
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      result.errors.push(cleanupError);
    }

    result.duration = Date.now() - startTime;
    this.emit('cleanupCompleted', result);
    this.log('info', `Cleanup completed in ${result.duration}ms`, {
      zombieProcesses: result.zombieProcesses,
      corruptedSandboxes: result.corruptedSandboxes,
      releasedPorts: result.releasedPorts,
      freedMemory: result.freedMemory,
      errorCount: result.errors.length,
      duration: result.duration
    });

    return result;
  }

  /**
   * Detect and clean zombie processes
   */
  private async detectZombieProcesses(): Promise<void> {
    const activeProcesses = this.processManager.listActiveProcesses();
    
    for (const processInfo of activeProcesses) {
      if (!this.isProcessRunning(processInfo.pid)) {
        this.emit('zombieProcessDetected', processInfo.pid, processInfo.sandboxId);
        this.log('warn', `Zombie process detected: PID ${processInfo.pid}, Sandbox ${processInfo.sandboxId}`);
      }
    }
  }

  /**
   * Clean up zombie processes
   */
  private async cleanupZombieProcesses(): Promise<number> {
    try {
      const cleanedCount = await this.processManager.cleanupZombieProcesses();
      this.log('info', `Cleaned up ${cleanedCount} zombie processes`);
      return cleanedCount;
    } catch (error) {
      this.emitError('ZOMBIE_PROCESS', 'Failed to cleanup zombie processes', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return 0;
    }
  }

  /**
   * Detect and clean corrupted sandboxes
   */
  private async cleanupCorruptedSandboxes(): Promise<number> {
    let cleanedCount = 0;
    
    try {
      const sandboxes = await this.sandboxManager.listSandboxes();
      
      for (const sandbox of sandboxes) {
        try {
          // Validate sandbox structure
          await this.validateSandboxStructure(sandbox);
        } catch (error) {
          this.emit('corruptedSandboxDetected', sandbox.id, error as Error);
          this.log('warn', `Corrupted sandbox detected: ${sandbox.id}`, { error: (error as Error).message });
          
          try {
            // Stop any processes associated with this sandbox
            if (this.processManager.isServerRunning(sandbox.id)) {
              await this.processManager.stopViteServer(sandbox.id);
            }
            
            // Release any ports
            await this.portManager.releasePort(sandbox.id);
            
            // Delete the corrupted sandbox
            await this.sandboxManager.deleteSandbox(sandbox.id);
            cleanedCount++;
            
            this.log('info', `Cleaned up corrupted sandbox: ${sandbox.id}`);
          } catch (cleanupError) {
            this.emitError('CORRUPTED_SANDBOX', 'Failed to cleanup corrupted sandbox', {
              sandboxId: sandbox.id,
              error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
            });
          }
        }
      }
    } catch (error) {
      this.emitError('CORRUPTED_SANDBOX', 'Failed to list sandboxes for corruption check', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return cleanedCount;
  }

  /**
   * Clean up leaked ports
   */
  private async cleanupLeakedPorts(): Promise<number> {
    let releasedCount = 0;
    
    try {
      const activeReservations = this.portManager.getActiveReservations();
      
      for (const reservation of activeReservations) {
        // Check if the associated process is still running
        if (!this.processManager.isServerRunning(reservation.sandboxId)) {
          this.emit('portLeakDetected', reservation.port, reservation.sandboxId);
          this.log('warn', `Port leak detected: Port ${reservation.port}, Sandbox ${reservation.sandboxId}`);
          
          const released = await this.portManager.releasePort(reservation.sandboxId);
          if (released) {
            releasedCount++;
            this.log('info', `Released leaked port: ${reservation.port}`);
          }
        }
      }
    } catch (error) {
      this.emitError('PORT_LEAK', 'Failed to cleanup leaked ports', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return releasedCount;
  }

  /**
   * Clean up inactive sandboxes
   */
  private async cleanupInactiveSandboxes(): Promise<number> {
    let cleanedCount = 0;
    
    try {
      const sandboxes = await this.sandboxManager.listSandboxes();
      const now = Date.now();
      
      for (const sandbox of sandboxes) {
        const inactiveTime = now - sandbox.createdAt.getTime();
        
        // Check if sandbox has been inactive for too long
        if (inactiveTime > this.config.maxInactivityTime) {
          // Check if there's an active process for this sandbox
          const isActive = this.processManager.isServerRunning(sandbox.id);
          
          if (!isActive) {
            this.log('info', `Cleaning up inactive sandbox: ${sandbox.id} (inactive for ${Math.round(inactiveTime / 60000)}m)`);
            
            try {
              // Release port if reserved
              await this.portManager.releasePort(sandbox.id);
              
              // Delete the sandbox
              await this.sandboxManager.deleteSandbox(sandbox.id);
              cleanedCount++;
            } catch (error) {
              this.emitError('TIMEOUT', 'Failed to cleanup inactive sandbox', {
                sandboxId: sandbox.id,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        }
      }
    } catch (error) {
      this.emitError('TIMEOUT', 'Failed to cleanup inactive sandboxes', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return cleanedCount;
  }

  /**
   * Check memory usage and detect potential leaks
   */
  private async checkMemoryUsage(): Promise<number> {
    try {
      const memoryUsage = process.memoryUsage();
      const currentUsage = memoryUsage.heapUsed;
      
      if (currentUsage > this.config.maxMemoryUsage) {
        this.emit('memoryLeakDetected', currentUsage, this.config.maxMemoryUsage);
        this.log('warn', `High memory usage detected: ${Math.round(currentUsage / 1024 / 1024)}MB`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          const afterGC = process.memoryUsage().heapUsed;
          const freed = currentUsage - afterGC;
          this.log('info', `Garbage collection freed ${Math.round(freed / 1024 / 1024)}MB`);
          return freed;
        }
      }
      
      this.log('debug', `Memory usage: ${Math.round(currentUsage / 1024 / 1024)}MB`);
      return 0;
    } catch (error) {
      this.emitError('MEMORY_LEAK', 'Failed to check memory usage', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Validate sandbox structure to detect corruption
   */
  private async validateSandboxStructure(sandbox: SandboxInfo): Promise<void> {
    try {
      // Check if sandbox info can be retrieved (validates metadata)
      const sandboxInfo = await this.sandboxManager.getSandboxInfo(sandbox.id);
      if (!sandboxInfo) {
        throw new Error('Cannot retrieve sandbox metadata');
      }

      // Check if sandbox directory exists
      const exists = await this.sandboxManager.sandboxExists(sandbox.id);
      if (!exists) {
        throw new Error('Sandbox directory does not exist');
      }

      // Additional validation could include checking for required files, etc.
    } catch (error) {
      throw new Error(`Sandbox structure validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform scheduled cleanup (lighter than full cleanup)
   */
  private async performScheduledCleanup(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.log('debug', 'Performing scheduled cleanup');
    
    try {
      // Only do zombie detection and basic cleanup
      await this.detectZombieProcesses();
      await this.cleanupZombieProcesses();
      await this.cleanupLeakedPorts();
      
      // Check memory usage
      await this.checkMemoryUsage();
    } catch (error) {
      this.log('error', 'Scheduled cleanup failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (this.isShuttingDown) {
          return;
        }
        
        this.isShuttingDown = true;
        this.emit('gracefulShutdownStarted', signal);
        this.log('info', `Received ${signal}, starting graceful shutdown`);
        
        try {
          // Stop the cleanup service
          this.stop();
          
          // Perform final cleanup
          await this.performCleanup();
          
          // Stop all processes
          await this.processManager.stopAllProcesses();
          
          // Cleanup port manager
          await this.portManager.cleanup();
          
          this.emit('gracefulShutdownCompleted');
          this.log('info', 'Graceful shutdown completed');
          
          // Exit the process
          process.exit(0);
        } catch (error) {
          this.log('error', 'Error during graceful shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
          process.exit(1);
        }
      });
    });
  }

  /**
   * Check if a process is running using the kill(0) technique
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without actually sending a signal
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ESRCH') {
        // Process does not exist
        return false;
      } else if (err.code === 'EPERM') {
        // Process exists but we don't have permission to signal it
        // For our purposes, this means the process is running
        return true;
      }
      // Other errors also indicate the process is not accessible/running
      return false;
    }
  }

  /**
   * Record memory baseline for comparison
   */
  private recordMemoryBaseline(): void {
    this.memoryBaseline = process.memoryUsage().heapUsed;
    this.log('debug', `Memory baseline recorded: ${Math.round(this.memoryBaseline / 1024 / 1024)}MB`);
  }

  /**
   * Create a typed cleanup error
   */
  private createCleanupError(
    type: CleanupError['type'],
    message: string,
    details?: Record<string, unknown>
  ): CleanupError {
    const error = new Error(message) as CleanupError;
    error.type = type;
    error.details = details;
    return error;
  }

  /**
   * Emit a typed error event
   */
  private emitError(
    type: CleanupError['type'],
    message: string,
    details?: Record<string, unknown>
  ): void {
    const error = this.createCleanupError(type, message, details);
    this.emit('error', error);
  }

  /**
   * Log messages with different levels
   */
  private log(level: CleanupServiceConfig['logLevel'], message: string, details?: Record<string, unknown>): void {
    if (!this.shouldLog(level!)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logData = details ? { message, ...details } : { message };
    
    switch (level) {
      case 'error':
        console.error(`[${timestamp}] CLEANUP ERROR:`, logData);
        break;
      case 'warn':
        console.warn(`[${timestamp}] CLEANUP WARN:`, logData);
        break;
      case 'info':
        console.info(`[${timestamp}] CLEANUP INFO:`, logData);
        break;
      case 'debug':
        console.debug(`[${timestamp}] CLEANUP DEBUG:`, logData);
        break;
    }
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: CleanupServiceConfig['logLevel']): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevel = levels.indexOf(this.config.logLevel);
    const messageLevel = levels.indexOf(level!);
    
    return messageLevel <= currentLevel;
  }

  /**
   * Get cleanup service statistics
   */
  getStats(): {
    isRunning: boolean;
    scheduledCleanupInterval: number;
    zombieDetectionInterval: number;
    maxInactivityTime: number;
    maxMemoryUsage: number;
    currentMemoryUsage: number;
    memoryBaseline?: number;
  } {
    return {
      isRunning: !!this.scheduledCleanupTimer,
      scheduledCleanupInterval: this.config.scheduledCleanupInterval,
      zombieDetectionInterval: this.config.zombieDetectionInterval,
      maxInactivityTime: this.config.maxInactivityTime,
      maxMemoryUsage: this.config.maxMemoryUsage,
      currentMemoryUsage: process.memoryUsage().heapUsed,
      memoryBaseline: this.memoryBaseline
    };
  }
}

// Export a factory function for creating cleanup service instances
export function createCleanupService(
  processManager: ProcessManager,
  sandboxManager: SandboxManager,
  portManager: PortManager,
  config?: CleanupServiceConfig
): CleanupService {
  return new CleanupService(processManager, sandboxManager, portManager, config);
}