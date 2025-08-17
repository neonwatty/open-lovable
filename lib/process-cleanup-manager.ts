import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';

export interface ManagedProcess {
  id: string;
  pid: number;
  command: string;
  args: string[];
  workingDir: string;
  startTime: Date;
  lastActivity: Date;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  type: 'vite' | 'command' | 'system';
  sandboxId?: string;
  port?: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface ProcessCleanupConfig {
  enablePeriodicCleanup?: boolean;
  cleanupInterval?: number; // milliseconds
  healthCheckInterval?: number; // milliseconds
  zombieDetectionInterval?: number; // milliseconds
  maxProcessAge?: number; // milliseconds
  maxMemoryUsage?: number; // bytes
  maxIdleTime?: number; // milliseconds
  gracefulShutdownTimeout?: number; // milliseconds
  pidFileLocation?: string;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface CleanupStats {
  totalProcesses: number;
  runningProcesses: number;
  zombieProcesses: number;
  stoppedProcesses: number;
  errorProcesses: number;
  totalMemoryUsage: number;
  lastCleanupTime?: Date;
  cleanupCount: number;
  errors: string[];
}

export class ProcessCleanupManager extends EventEmitter {
  private static instance: ProcessCleanupManager | null = null;
  
  private processes: Map<string, ManagedProcess> = new Map();
  private childProcesses: Map<string, ChildProcess> = new Map();
  private config: Required<ProcessCleanupConfig>;
  private cleanupTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private zombieCheckTimer?: NodeJS.Timeout;
  private isShuttingDown = false;
  private shutdownHandlersSetup = false;
  private stats: CleanupStats = {
    totalProcesses: 0,
    runningProcesses: 0,
    zombieProcesses: 0,
    stoppedProcesses: 0,
    errorProcesses: 0,
    totalMemoryUsage: 0,
    cleanupCount: 0,
    errors: []
  };

  constructor(config: ProcessCleanupConfig = {}) {
    super();
    
    this.config = {
      enablePeriodicCleanup: config.enablePeriodicCleanup ?? true,
      cleanupInterval: config.cleanupInterval ?? 300000, // 5 minutes
      healthCheckInterval: config.healthCheckInterval ?? 60000, // 1 minute
      zombieDetectionInterval: config.zombieDetectionInterval ?? 30000, // 30 seconds
      maxProcessAge: config.maxProcessAge ?? 1800000, // 30 minutes
      maxMemoryUsage: config.maxMemoryUsage ?? 512 * 1024 * 1024, // 512MB per process
      maxIdleTime: config.maxIdleTime ?? 900000, // 15 minutes
      gracefulShutdownTimeout: config.gracefulShutdownTimeout ?? 10000, // 10 seconds
      pidFileLocation: config.pidFileLocation ?? '/tmp',
      logLevel: config.logLevel ?? 'info'
    };

    this.setupGracefulShutdown();
    this.log('info', 'ProcessCleanupManager initialized');
  }

  /**
   * Singleton pattern - get or create instance
   */
  static getInstance(config?: ProcessCleanupConfig): ProcessCleanupManager {
    if (!ProcessCleanupManager.instance) {
      ProcessCleanupManager.instance = new ProcessCleanupManager(config);
    }
    return ProcessCleanupManager.instance;
  }

  /**
   * Start the cleanup manager with periodic tasks
   */
  start(): void {
    if (this.cleanupTimer) {
      this.log('warn', 'ProcessCleanupManager already started');
      return;
    }

    this.log('info', 'Starting ProcessCleanupManager');

    if (this.config.enablePeriodicCleanup) {
      // Periodic comprehensive cleanup
      this.cleanupTimer = setInterval(() => {
        this.performCleanup().catch(error => {
          this.log('error', 'Periodic cleanup failed', { error: error.message });
        });
      }, this.config.cleanupInterval);

      // Health check timer
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck().catch(error => {
          this.log('error', 'Health check failed', { error: error.message });
        });
      }, this.config.healthCheckInterval);

      // Zombie detection timer
      this.zombieCheckTimer = setInterval(() => {
        this.detectZombieProcesses().catch(error => {
          this.log('error', 'Zombie detection failed', { error: error.message });
        });
      }, this.config.zombieDetectionInterval);
    }

    this.log('info', 'ProcessCleanupManager started successfully');
  }

  /**
   * Stop the cleanup manager
   */
  stop(): void {
    this.log('info', 'Stopping ProcessCleanupManager');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.zombieCheckTimer) {
      clearInterval(this.zombieCheckTimer);
      this.zombieCheckTimer = undefined;
    }

    this.log('info', 'ProcessCleanupManager stopped');
  }

  /**
   * Register a new process for management
   */
  registerProcess(
    id: string,
    childProcess: ChildProcess,
    command: string,
    args: string[],
    workingDir: string,
    type: ManagedProcess['type'] = 'command',
    options: Partial<Pick<ManagedProcess, 'sandboxId' | 'port'>> = {}
  ): ManagedProcess {
    if (!childProcess.pid) {
      throw new Error('Cannot register process without PID');
    }

    const now = new Date();
    const managedProcess: ManagedProcess = {
      id,
      pid: childProcess.pid,
      command,
      args,
      workingDir,
      startTime: now,
      lastActivity: now,
      status: 'starting',
      type,
      ...options
    };

    this.processes.set(id, managedProcess);
    this.childProcesses.set(id, childProcess);

    // Set up process event handlers
    this.setupProcessHandlers(id, childProcess);

    // Update PID file if it's a Vite process
    if (type === 'vite') {
      this.updatePidFile(childProcess.pid).catch(error => {
        this.log('warn', 'Failed to update PID file', { pid: childProcess.pid, error: error.message });
      });
    }

    this.updateStats();
    this.log('info', `Registered process: ${id} (PID: ${childProcess.pid}, Type: ${type})`);
    this.emit('processRegistered', managedProcess);

    return managedProcess;
  }

  /**
   * Unregister and stop a process
   */
  async unregisterProcess(id: string, forceKill = false): Promise<boolean> {
    const managedProcess = this.processes.get(id);
    const childProcess = this.childProcesses.get(id);

    if (!managedProcess) {
      this.log('debug', `Process ${id} not found for unregistration`);
      return false;
    }

    this.log('info', `Unregistering process: ${id} (PID: ${managedProcess.pid})`);

    if (childProcess && this.isProcessRunning(managedProcess.pid)) {
      managedProcess.status = 'stopping';
      this.processes.set(id, managedProcess);

      try {
        if (forceKill) {
          childProcess.kill('SIGKILL');
        } else {
          // Graceful shutdown
          childProcess.kill('SIGTERM');

          // Wait for graceful shutdown or timeout
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              if (this.isProcessRunning(managedProcess.pid)) {
                this.log('warn', `Force killing process ${id} after timeout`);
                childProcess.kill('SIGKILL');
              }
              resolve();
            }, this.config.gracefulShutdownTimeout);

            childProcess.on('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        }
      } catch (error) {
        this.log('error', `Failed to kill process ${id}`, { error: (error as Error).message });
      }
    }

    // Clean up PID file if it's a Vite process
    if (managedProcess.type === 'vite') {
      await this.cleanupPidFile().catch(error => {
        this.log('warn', 'Failed to cleanup PID file', { error: error.message });
      });
    }

    managedProcess.status = 'stopped';
    this.processes.set(id, managedProcess);
    this.childProcesses.delete(id);

    this.updateStats();
    this.emit('processUnregistered', id);
    
    return true;
  }

  /**
   * Get process information
   */
  getProcess(id: string): ManagedProcess | undefined {
    return this.processes.get(id);
  }

  /**
   * Get all processes with optional filtering
   */
  getProcesses(filter?: {
    status?: ManagedProcess['status'][];
    type?: ManagedProcess['type'][];
    sandboxId?: string;
  }): ManagedProcess[] {
    const processes = Array.from(this.processes.values());
    
    if (!filter) return processes;

    return processes.filter(process => {
      if (filter.status && !filter.status.includes(process.status)) return false;
      if (filter.type && !filter.type.includes(process.type)) return false;
      if (filter.sandboxId && process.sandboxId !== filter.sandboxId) return false;
      return true;
    });
  }

  /**
   * Update process activity timestamp
   */
  updateProcessActivity(id: string): void {
    const process = this.processes.get(id);
    if (process) {
      process.lastActivity = new Date();
      this.processes.set(id, process);
    }
  }

  /**
   * Perform comprehensive cleanup
   */
  async performCleanup(): Promise<CleanupStats> {
    if (this.isShuttingDown) return this.stats;

    this.log('info', 'Starting comprehensive cleanup');
    const startTime = Date.now();

    try {
      // Detect and clean zombie processes
      await this.detectZombieProcesses();
      await this.cleanupZombieProcesses();

      // Clean up idle processes
      await this.cleanupIdleProcesses();

      // Clean up old processes
      await this.cleanupOldProcesses();

      // Update process statistics
      await this.updateProcessMetrics();

      // Clean up orphaned PID files
      await this.cleanupOrphanedPidFiles();

      this.stats.lastCleanupTime = new Date();
      this.stats.cleanupCount++;

      const duration = Date.now() - startTime;
      this.log('info', `Cleanup completed in ${duration}ms`, this.stats as unknown as Record<string, unknown>);
      this.emit('cleanupCompleted', this.stats);

    } catch (error) {
      this.log('error', 'Cleanup failed', { error: (error as Error).message });
      this.stats.errors.push((error as Error).message);
    }

    return this.stats;
  }

  /**
   * Perform health check on all processes
   */
  async performHealthCheck(): Promise<void> {
    this.log('debug', 'Performing health check');

    for (const [id, process] of this.processes.entries()) {
      if (process.status === 'running' || process.status === 'starting') {
        try {
          // Check if process is still running
          if (!this.isProcessRunning(process.pid)) {
            this.log('warn', `Process ${id} (PID: ${process.pid}) is no longer running`);
            process.status = 'stopped';
            this.processes.set(id, process);
            this.childProcesses.delete(id);
            this.emit('processExited', id);
          } else {
            // Update process metrics
            await this.updateProcessMetrics(id);
            
            // Update status to running if it was starting
            if (process.status === 'starting') {
              process.status = 'running';
              this.processes.set(id, process);
              this.emit('processStarted', process);
            }
          }
        } catch (error) {
          this.log('error', `Health check failed for process ${id}`, { error: (error as Error).message });
          process.status = 'error';
          this.processes.set(id, process);
        }
      }
    }

    this.updateStats();
  }

  /**
   * Detect zombie processes
   */
  async detectZombieProcesses(): Promise<string[]> {
    const zombies: string[] = [];

    for (const [id, process] of this.processes.entries()) {
      if ((process.status === 'running' || process.status === 'starting') && 
          !this.isProcessRunning(process.pid)) {
        zombies.push(id);
        this.log('warn', `Zombie process detected: ${id} (PID: ${process.pid})`);
        this.emit('zombieProcessDetected', id, process);
      }
    }

    return zombies;
  }

  /**
   * Clean up zombie processes
   */
  async cleanupZombieProcesses(): Promise<number> {
    const zombies = await this.detectZombieProcesses();
    let cleanedCount = 0;

    for (const id of zombies) {
      try {
        await this.unregisterProcess(id, true);
        cleanedCount++;
      } catch (error) {
        this.log('error', `Failed to cleanup zombie process ${id}`, { error: (error as Error).message });
      }
    }

    if (cleanedCount > 0) {
      this.log('info', `Cleaned up ${cleanedCount} zombie processes`);
    }

    return cleanedCount;
  }

  /**
   * Clean up idle processes
   */
  async cleanupIdleProcesses(): Promise<number> {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [id, process] of this.processes.entries()) {
      if (process.status === 'running') {
        const idleTime = now - process.lastActivity.getTime();
        
        if (idleTime > this.config.maxIdleTime) {
          this.log('info', `Cleaning up idle process: ${id} (idle for ${Math.round(idleTime / 60000)}m)`);
          try {
            await this.unregisterProcess(id);
            cleanedCount++;
          } catch (error) {
            this.log('error', `Failed to cleanup idle process ${id}`, { error: (error as Error).message });
          }
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Clean up old processes
   */
  async cleanupOldProcesses(): Promise<number> {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [id, process] of this.processes.entries()) {
      const age = now - process.startTime.getTime();
      
      if (age > this.config.maxProcessAge) {
        this.log('info', `Cleaning up old process: ${id} (age: ${Math.round(age / 60000)}m)`);
        try {
          await this.unregisterProcess(id);
          cleanedCount++;
        } catch (error) {
          this.log('error', `Failed to cleanup old process ${id}`, { error: (error as Error).message });
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Update process metrics (memory, CPU usage)
   */
  async updateProcessMetrics(id?: string): Promise<void> {
    const processesToUpdate = id ? [id] : Array.from(this.processes.keys());

    for (const processId of processesToUpdate) {
      const process = this.processes.get(processId);
      if (!process || process.status !== 'running') continue;

      try {
        const metrics = await this.getProcessMetrics(process.pid);
        process.memoryUsage = metrics.memory;
        process.cpuUsage = metrics.cpu;
        this.processes.set(processId, process);

        // Check if process exceeds memory limits
        if (metrics.memory > this.config.maxMemoryUsage) {
          this.log('warn', `Process ${processId} exceeds memory limit`, {
            pid: process.pid,
            memory: Math.round(metrics.memory / 1024 / 1024),
            limit: Math.round(this.config.maxMemoryUsage / 1024 / 1024)
          });
          this.emit('processMemoryExceeded', processId, metrics.memory);
        }

      } catch (error) {
        this.log('debug', `Failed to get metrics for process ${processId}`, { error: (error as Error).message });
      }
    }
  }

  /**
   * Get process metrics (memory and CPU usage)
   */
  async getProcessMetrics(_pid: number): Promise<{ memory: number; cpu: number }> {
    // This is a simplified implementation
    // In production, you might want to use more sophisticated process monitoring
    // The _pid parameter is reserved for future implementation
    try {
      return { memory: 0, cpu: 0 }; // Placeholder implementation
    } catch (error) {
      throw new Error(`Failed to get process metrics: ${(error as Error).message}`);
    }
  }

  /**
   * Update global PID file
   */
  private async updatePidFile(pid: number): Promise<void> {
    try {
      const pidFile = `${this.config.pidFileLocation}/vite-process.pid`;
      await fs.writeFile(pidFile, pid.toString());
    } catch (error) {
      throw new Error(`Failed to update PID file: ${(error as Error).message}`);
    }
  }

  /**
   * Clean up PID file
   */
  private async cleanupPidFile(): Promise<void> {
    try {
      const pidFile = `${this.config.pidFileLocation}/vite-process.pid`;
      await fs.unlink(pidFile).catch(() => {}); // Ignore if file doesn't exist
    } catch (error) {
      throw new Error(`Failed to cleanup PID file: ${(error as Error).message}`);
    }
  }

  /**
   * Clean up orphaned PID files
   */
  private async cleanupOrphanedPidFiles(): Promise<void> {
    try {
      const pidFile = `${this.config.pidFileLocation}/vite-process.pid`;
      
      try {
        const pidData = await fs.readFile(pidFile, 'utf8');
        const pid = parseInt(pidData.trim());
        
        if (!isNaN(pid) && !this.isProcessRunning(pid)) {
          await fs.unlink(pidFile);
          this.log('info', `Cleaned up orphaned PID file for PID ${pid}`);
        }
      } catch {
        // PID file doesn't exist or is invalid, which is fine
      }
    } catch {
      this.log('error', 'Failed to cleanup orphaned PID files');
    }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(id: string, childProcess: ChildProcess): void {
    childProcess.on('exit', (code, signal) => {
      const process = this.processes.get(id);
      if (process) {
        process.status = 'stopped';
        this.processes.set(id, process);
        this.log('info', `Process ${id} exited`, { code, signal });
        this.emit('processExited', id, code, signal);
      }
      this.childProcesses.delete(id);
      this.updateStats();
    });

    childProcess.on('error', (error) => {
      const process = this.processes.get(id);
      if (process) {
        process.status = 'error';
        this.processes.set(id, process);
        this.log('error', `Process ${id} error`, { error: error.message });
        this.emit('processError', id, error);
      }
      this.updateStats();
    });

    // Update activity on stdout/stderr
    childProcess.stdout?.on('data', () => this.updateProcessActivity(id));
    childProcess.stderr?.on('data', () => this.updateProcessActivity(id));
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    if (this.shutdownHandlersSetup) return;

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (this.isShuttingDown) return;
        
        this.isShuttingDown = true;
        this.log('info', `Received ${signal}, starting graceful shutdown`);
        this.emit('gracefulShutdownStarted', signal);
        
        try {
          // Stop periodic tasks
          this.stop();
          
          // Stop all managed processes
          await this.stopAllProcesses();
          
          this.emit('gracefulShutdownCompleted');
          this.log('info', 'Graceful shutdown completed');
          
          process.exit(0);
        } catch (error) {
          this.log('error', 'Error during graceful shutdown', { error: (error as Error).message });
          process.exit(1);
        }
      });
    });

    this.shutdownHandlersSetup = true;
  }

  /**
   * Stop all managed processes
   */
  async stopAllProcesses(): Promise<void> {
    this.log('info', 'Stopping all managed processes');
    
    const stopPromises = Array.from(this.processes.keys()).map(id => 
      this.unregisterProcess(id).catch(error => {
        this.log('error', `Failed to stop process ${id}`, { error: error.message });
      })
    );
    
    await Promise.allSettled(stopPromises);
    this.log('info', 'All processes stopped');
  }

  /**
   * Check if a process is running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update internal statistics
   */
  private updateStats(): void {
    const processes = Array.from(this.processes.values());
    
    this.stats.totalProcesses = processes.length;
    this.stats.runningProcesses = processes.filter(p => p.status === 'running').length;
    this.stats.stoppedProcesses = processes.filter(p => p.status === 'stopped').length;
    this.stats.errorProcesses = processes.filter(p => p.status === 'error').length;
    this.stats.totalMemoryUsage = processes.reduce((total, p) => total + (p.memoryUsage || 0), 0);
  }

  /**
   * Get cleanup statistics
   */
  getStats(): CleanupStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Log messages with different levels
   */
  private log(level: ProcessCleanupConfig['logLevel'], message: string, details?: Record<string, unknown>): void {
    if (!this.shouldLog(level!)) return;

    const timestamp = new Date().toISOString();
    const logData = details ? { message, ...details } : { message };
    
    switch (level) {
      case 'error':
        console.error(`[${timestamp}] PROCESS_CLEANUP ERROR:`, logData);
        break;
      case 'warn':
        console.warn(`[${timestamp}] PROCESS_CLEANUP WARN:`, logData);
        break;
      case 'info':
        console.info(`[${timestamp}] PROCESS_CLEANUP INFO:`, logData);
        break;
      case 'debug':
        console.debug(`[${timestamp}] PROCESS_CLEANUP DEBUG:`, logData);
        break;
    }
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: ProcessCleanupConfig['logLevel']): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevel = levels.indexOf(this.config.logLevel);
    const messageLevel = levels.indexOf(level!);
    
    return messageLevel <= currentLevel;
  }
}

// Export singleton instance
export const processCleanupManager = ProcessCleanupManager.getInstance();