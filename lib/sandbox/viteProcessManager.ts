import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { appConfig } from '../../config/app.config';
import * as net from 'node:net';

export interface ViteProcessOptions {
  sandboxPath: string;
  port?: number;
  host?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface ViteProcessInfo {
  pid: number;
  port: number;
  host: string;
  url: string;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  startTime: number;
  logs: string[];
}

export interface ViteServerStatus {
  isRunning: boolean;
  pid?: number;
  port?: number;
  url?: string;
  uptime?: number;
  lastError?: string;
}

type ViteProcessEvent = 
  | 'starting'
  | 'ready' 
  | 'error'
  | 'stopped'
  | 'output'
  | 'port-conflict';

/**
 * Manages Vite development server process lifecycle for local sandboxes
 */
export class ViteProcessManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private processInfo: ViteProcessInfo | null = null;
  private pidFilePath: string | null = null;
  private cleanupHandlers: Set<() => Promise<void> | void> = new Set();
  private isShuttingDown = false;

  constructor() {
    super();
    this.setupProcessCleanup();
  }

  /**
   * Starts a Vite development server for the specified sandbox
   */
  async startViteServer(options: ViteProcessOptions): Promise<ViteProcessInfo> {
    if (this.process && this.processInfo?.status !== 'stopped') {
      throw new Error(`Vite server already running with PID ${this.processInfo?.pid}`);
    }

    const port = options.port || appConfig.local.vitePort;
    const host = options.host || '0.0.0.0';
    const timeout = options.timeout || 30000; // 30 second timeout

    console.log(`[ViteProcessManager] Starting Vite server for sandbox at ${options.sandboxPath}`);

    // Check if port is available
    const availablePort = await this.findAvailablePort(port);
    if (availablePort !== port) {
      console.warn(`[ViteProcessManager] Port ${port} is busy, using port ${availablePort}`);
      this.emit('port-conflict', { requestedPort: port, actualPort: availablePort });
    }

    // Verify sandbox path exists and has package.json
    await this.validateSandboxPath(options.sandboxPath);

    this.processInfo = {
      pid: 0, // Will be set when process starts
      port: availablePort,
      host,
      url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${availablePort}`,
      status: 'starting',
      startTime: Date.now(),
      logs: []
    };

    this.pidFilePath = join(options.sandboxPath, '.vite-process.pid');

    try {
      this.emit('starting', this.processInfo);

      // Spawn Vite process
      const viteProcess = spawn('npm', ['run', 'dev'], {
        cwd: options.sandboxPath,
        env: {
          ...process.env,
          ...options.env,
          FORCE_COLOR: '0', // Disable colors for cleaner logs
          PORT: availablePort.toString(),
          HOST: host,
        },
        stdio: ['ignore', 'pipe', 'pipe'], // Don't pipe stdin, capture stdout/stderr
        detached: false // Keep attached for proper cleanup
      });

      this.process = viteProcess;
      this.processInfo.pid = viteProcess.pid || 0;

      // Write PID file for external reference
      await fs.writeFile(this.pidFilePath, this.processInfo.pid.toString(), 'utf8');

      // Set up process event handlers
      this.setupProcessHandlers(viteProcess, timeout);

      // Wait for server to be ready or timeout
      await this.waitForServerReady(timeout);

      console.log(`[ViteProcessManager] Vite server started successfully on ${this.processInfo.url}`);
      return { ...this.processInfo };

    } catch (error) {
      console.error(`[ViteProcessManager] Failed to start Vite server:`, error);
      
      // Cleanup on error
      await this.cleanup();
      
      this.processInfo.status = 'error';
      this.emit('error', error, this.processInfo);
      throw error;
    }
  }

  /**
   * Stops the currently running Vite server gracefully
   */
  async stopViteServer(): Promise<void> {
    if (!this.process || this.isShuttingDown) {
      console.log(`[ViteProcessManager] No Vite server running or already shutting down`);
      return;
    }

    this.isShuttingDown = true;
    console.log(`[ViteProcessManager] Stopping Vite server (PID: ${this.process.pid})`);

    try {
      // Try graceful shutdown first
      if (this.process && !this.process.killed) {
        this.process.kill('SIGTERM');
        
        // Wait up to 5 seconds for graceful shutdown
        const shutdownTimeout = new Promise((resolve) => {
          setTimeout(resolve, 5000);
        });
        
        const processExit = new Promise((resolve) => {
          if (this.process) {
            this.process.once('exit', resolve);
          } else {
            resolve(undefined);
          }
        });

        await Promise.race([processExit, shutdownTimeout]);

        // Force kill if still running
        if (this.process && !this.process.killed) {
          console.log(`[ViteProcessManager] Force killing Vite server`);
          this.process.kill('SIGKILL');
        }
      }

      await this.cleanup();
      
      if (this.processInfo) {
        this.processInfo.status = 'stopped';
        this.emit('stopped', this.processInfo);
      }

      console.log(`[ViteProcessManager] Vite server stopped successfully`);
    } catch (error) {
      console.error(`[ViteProcessManager] Error stopping Vite server:`, error);
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Restarts the Vite server (useful after package changes)
   */
  async restartViteServer(options?: ViteProcessOptions): Promise<ViteProcessInfo> {
    console.log(`[ViteProcessManager] Restarting Vite server`);
    
    const currentOptions = options || this.getCurrentOptions();
    if (!currentOptions) {
      throw new Error('Cannot restart: no previous server configuration found');
    }

    await this.stopViteServer();
    
    // Brief delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return this.startViteServer(currentOptions);
  }

  /**
   * Gets the current status of the Vite server
   */
  getViteStatus(): ViteServerStatus {
    if (!this.processInfo || !this.process) {
      return { isRunning: false };
    }

    const isRunning = this.processInfo.status === 'ready' && !this.process.killed;
    
    return {
      isRunning,
      pid: this.processInfo.pid,
      port: this.processInfo.port,
      url: this.processInfo.url,
      uptime: isRunning ? Date.now() - this.processInfo.startTime : undefined,
      lastError: this.processInfo.status === 'error' ? this.processInfo.logs.slice(-1)[0] : undefined
    };
  }

  /**
   * Gets the localhost URL for the running Vite server
   */
  getViteUrl(): string | null {
    if (!this.processInfo || this.processInfo.status !== 'ready') {
      return null;
    }
    
    // Convert 0.0.0.0 to localhost for browser access
    const host = this.processInfo.host === '0.0.0.0' ? 'localhost' : this.processInfo.host;
    return `http://${host}:${this.processInfo.port}`;
  }

  /**
   * Gets recent process logs
   */
  getLogs(maxLines: number = 100): string[] {
    if (!this.processInfo) {
      return [];
    }
    
    return this.processInfo.logs.slice(-maxLines);
  }

  // Private helper methods

  private async validateSandboxPath(sandboxPath: string): Promise<void> {
    try {
      await fs.access(sandboxPath);
      const packageJsonPath = join(sandboxPath, 'package.json');
      await fs.access(packageJsonPath);
    } catch (error) {
      throw new Error(`Invalid sandbox path: ${sandboxPath}. Must contain package.json`);
    }
  }

  private async findAvailablePort(preferredPort: number): Promise<number> {
    const isPortFree = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, '0.0.0.0', () => {
          server.close(() => resolve(true));
        });
        server.on('error', () => resolve(false));
      });
    };

    // Try preferred port first
    if (await isPortFree(preferredPort)) {
      return preferredPort;
    }

    // Try ports in range
    for (let port = preferredPort + 1; port <= preferredPort + 100; port++) {
      if (await isPortFree(port)) {
        return port;
      }
    }

    throw new Error(`No available ports found in range ${preferredPort}-${preferredPort + 100}`);
  }

  private setupProcessHandlers(viteProcess: ChildProcess, timeout: number): void {
    // Handle process output
    viteProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.addLog(output);
      this.emit('output', { type: 'stdout', data: output });
      
      // Check for ready indicators in output
      if (output.includes('Local:') || output.includes('ready in')) {
        this.processInfo!.status = 'ready';
        this.emit('ready', this.processInfo);
      }
    });

    viteProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.addLog(`[ERROR] ${output}`);
      this.emit('output', { type: 'stderr', data: output });
      
      // Check for port conflict errors
      if (output.includes('EADDRINUSE') || output.includes('address already in use')) {
        this.emit('port-conflict', { error: output });
      }
    });

    // Handle process events
    viteProcess.on('spawn', () => {
      console.log(`[ViteProcessManager] Vite process spawned with PID: ${viteProcess.pid}`);
    });

    viteProcess.on('error', (error: Error) => {
      console.error(`[ViteProcessManager] Vite process error:`, error);
      this.processInfo!.status = 'error';
      this.addLog(`[PROCESS ERROR] ${error.message}`);
      this.emit('error', error, this.processInfo);
    });

    viteProcess.on('exit', (code: number | null, signal: string | null) => {
      console.log(`[ViteProcessManager] Vite process exited with code ${code}, signal ${signal}`);
      this.processInfo!.status = 'stopped';
      this.addLog(`[PROCESS EXIT] Code: ${code}, Signal: ${signal}`);
      this.emit('stopped', this.processInfo);
    });

    viteProcess.on('close', (code: number | null, signal: string | null) => {
      console.log(`[ViteProcessManager] Vite process closed with code ${code}, signal ${signal}`);
      this.cleanup();
    });
  }

  private async waitForServerReady(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Vite server failed to start within ${timeout}ms`));
      }, timeout);

      const onReady = () => {
        clearTimeout(timeoutId);
        this.off('error', onError);
        resolve();
      };

      const onError = (error: Error) => {
        clearTimeout(timeoutId);
        this.off('ready', onReady);
        reject(error);
      };

      this.once('ready', onReady);
      this.once('error', onError);
    });
  }

  private addLog(message: string): void {
    if (this.processInfo) {
      const timestamp = new Date().toISOString();
      this.processInfo.logs.push(`[${timestamp}] ${message.trim()}`);
      
      // Keep only last 1000 log entries
      if (this.processInfo.logs.length > 1000) {
        this.processInfo.logs = this.processInfo.logs.slice(-1000);
      }
    }
  }

  private getCurrentOptions(): ViteProcessOptions | null {
    if (!this.processInfo || !this.pidFilePath) {
      return null;
    }

    const sandboxPath = this.pidFilePath.replace('/.vite-process.pid', '');
    return {
      sandboxPath,
      port: this.processInfo.port,
      host: this.processInfo.host
    };
  }

  private async cleanup(): Promise<void> {
    try {
      // Remove PID file
      if (this.pidFilePath) {
        try {
          await fs.unlink(this.pidFilePath);
        } catch (error) {
          // PID file might not exist, ignore error
        }
        this.pidFilePath = null;
      }

      // Run custom cleanup handlers
      const handlers = Array.from(this.cleanupHandlers);
      for (const handler of handlers) {
        try {
          await handler();
        } catch (error) {
          console.error('[ViteProcessManager] Cleanup handler error:', error);
        }
      }

    } catch (error) {
      console.error('[ViteProcessManager] Cleanup error:', error);
    } finally {
      this.process = null;
    }
  }

  private setupProcessCleanup(): void {
    // Handle process termination signals
    const handleShutdown = async (signal: string) => {
      console.log(`[ViteProcessManager] Received ${signal}, shutting down Vite server`);
      await this.stopViteServer();
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('[ViteProcessManager] Uncaught exception:', error);
      await this.stopViteServer();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('[ViteProcessManager] Unhandled rejection:', reason);
      await this.stopViteServer();
      process.exit(1);
    });
  }

  /**
   * Registers a custom cleanup handler
   */
  onCleanup(handler: () => Promise<void> | void): void {
    this.cleanupHandlers.add(handler);
  }

  /**
   * Removes a custom cleanup handler
   */
  offCleanup(handler: () => Promise<void> | void): void {
    this.cleanupHandlers.delete(handler);
  }

  /**
   * Force kills the Vite process (use with caution)
   */
  async forceKill(): Promise<void> {
    if (this.process && !this.process.killed) {
      console.log(`[ViteProcessManager] Force killing Vite process (PID: ${this.process.pid})`);
      this.process.kill('SIGKILL');
      await this.cleanup();
    }
  }
}

// Singleton instance for global use
export const viteProcessManager = new ViteProcessManager();

// Re-export for convenience
export default ViteProcessManager;