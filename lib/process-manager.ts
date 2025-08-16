import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createServer } from 'net';

export interface ProcessInfo {
  pid: number;
  port: number;
  sandboxId: string;
  command: string;
  args: string[];
  startTime: Date;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
}

export interface ProcessManagerConfig {
  defaultPort?: number;
  startPortRange?: number;
  endPortRange?: number;
  maxProcesses?: number;
  processTimeout?: number;
  shutdownTimeout?: number;
}

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private childProcesses: Map<string, ChildProcess> = new Map();
  private config: Required<ProcessManagerConfig>;

  constructor(config: ProcessManagerConfig = {}) {
    super();
    this.config = {
      defaultPort: config.defaultPort ?? 5173,
      startPortRange: config.startPortRange ?? 5173,
      endPortRange: config.endPortRange ?? 5200,
      maxProcesses: config.maxProcesses ?? 10,
      processTimeout: config.processTimeout ?? 30000, // 30 seconds
      shutdownTimeout: config.shutdownTimeout ?? 10000, // 10 seconds
    };
  }

  async startViteServer(sandboxId: string, sandboxPath: string, port?: number): Promise<ProcessInfo> {
    if (this.processes.has(sandboxId)) {
      const existingProcess = this.processes.get(sandboxId)!;
      if (existingProcess.status === 'running' || existingProcess.status === 'starting') {
        return existingProcess;
      }
    }

    // Check if we've reached max processes
    const runningProcesses = Array.from(this.processes.values()).filter(
      p => p.status === 'running' || p.status === 'starting'
    );
    if (runningProcesses.length >= this.config.maxProcesses) {
      throw new Error(`Maximum number of processes (${this.config.maxProcesses}) reached`);
    }

    const assignedPort = port ?? await this.findAvailablePort();
    const command = 'npm';
    const args = ['run', 'dev', '--', '--port', assignedPort.toString(), '--host'];

    const processInfo: ProcessInfo = {
      pid: 0, // Will be set when process starts
      port: assignedPort,
      sandboxId,
      command,
      args,
      startTime: new Date(),
      status: 'starting'
    };

    this.processes.set(sandboxId, processInfo);

    try {
      const childProcess = spawn(command, args, {
        cwd: sandboxPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'development',
          VITE_HOST: '0.0.0.0',
          VITE_PORT: assignedPort.toString()
        },
        shell: process.platform === 'win32'
      });

      if (!childProcess.pid) {
        throw new Error('Failed to start process - no PID assigned');
      }

      processInfo.pid = childProcess.pid;
      this.childProcesses.set(sandboxId, childProcess);

      // Set up event handlers
      this.setupProcessHandlers(sandboxId, childProcess);

      // Wait for server to be ready or timeout
      await this.waitForServerReady(sandboxId, assignedPort);

      processInfo.status = 'running';
      this.processes.set(sandboxId, processInfo);

      this.emit('processStarted', processInfo);
      return processInfo;

    } catch (error) {
      processInfo.status = 'error';
      this.processes.set(sandboxId, processInfo);
      this.emit('processError', sandboxId, error);
      throw new Error(`Failed to start Vite server: ${(error as Error).message}`);
    }
  }

  async stopViteServer(sandboxId: string): Promise<void> {
    const processInfo = this.processes.get(sandboxId);
    const childProcess = this.childProcesses.get(sandboxId);

    if (!processInfo || !childProcess) {
      return; // Process doesn't exist or already stopped
    }

    processInfo.status = 'stopping';
    this.processes.set(sandboxId, processInfo);

    try {
      // Try graceful shutdown first
      childProcess.kill('SIGTERM');

      // Wait for graceful shutdown with timeout
      const shutdownPromise = new Promise<void>((resolve) => {
        childProcess.on('exit', () => resolve());
      });

      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(resolve, this.config.shutdownTimeout);
      });

      await Promise.race([shutdownPromise, timeoutPromise]);

      // If process is still running, force kill
      if (this.isProcessRunning(childProcess.pid!)) {
        childProcess.kill('SIGKILL');
      }

      // Clean up
      this.childProcesses.delete(sandboxId);
      processInfo.status = 'stopped';
      this.processes.set(sandboxId, processInfo);

      this.emit('processStopped', sandboxId);

    } catch (error) {
      processInfo.status = 'error';
      this.processes.set(sandboxId, processInfo);
      this.emit('processError', sandboxId, error);
      throw new Error(`Failed to stop Vite server: ${(error as Error).message}`);
    }
  }

  isServerRunning(sandboxId: string): boolean {
    const processInfo = this.processes.get(sandboxId);
    const childProcess = this.childProcesses.get(sandboxId);

    if (!processInfo || !childProcess) {
      return false;
    }

    return processInfo.status === 'running' && this.isProcessRunning(childProcess.pid!);
  }

  getProcessInfo(sandboxId: string): ProcessInfo | null {
    return this.processes.get(sandboxId) || null;
  }

  listActiveProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values()).filter(
      p => p.status === 'running' || p.status === 'starting'
    );
  }

  async cleanupZombieProcesses(): Promise<number> {
    let cleanedCount = 0;
    const processesToCleanup: string[] = [];

    for (const [sandboxId, processInfo] of this.processes.entries()) {
      if (processInfo.status === 'running' || processInfo.status === 'starting') {
        if (!this.isProcessRunning(processInfo.pid)) {
          processesToCleanup.push(sandboxId);
        }
      }
    }

    for (const sandboxId of processesToCleanup) {
      this.childProcesses.delete(sandboxId);
      const processInfo = this.processes.get(sandboxId)!;
      processInfo.status = 'stopped';
      this.processes.set(sandboxId, processInfo);
      cleanedCount++;
      this.emit('zombieProcessCleaned', sandboxId);
    }

    return cleanedCount;
  }

  async stopAllProcesses(): Promise<void> {
    const activeProcesses = this.listActiveProcesses();
    const stopPromises = activeProcesses.map(p => this.stopViteServer(p.sandboxId));
    
    try {
      await Promise.allSettled(stopPromises);
    } catch (error) {
      console.warn('Some processes failed to stop gracefully:', error);
    }
  }

  private setupProcessHandlers(sandboxId: string, childProcess: ChildProcess): void {
    // Handle stdout
    childProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      this.emit('processOutput', sandboxId, 'stdout', output);
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      this.emit('processOutput', sandboxId, 'stderr', output);
    });

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      const processInfo = this.processes.get(sandboxId);
      if (processInfo) {
        processInfo.status = 'stopped';
        this.processes.set(sandboxId, processInfo);
      }
      this.childProcesses.delete(sandboxId);
      this.emit('processExit', sandboxId, code, signal);
    });

    // Handle process error
    childProcess.on('error', (error) => {
      const processInfo = this.processes.get(sandboxId);
      if (processInfo) {
        processInfo.status = 'error';
        this.processes.set(sandboxId, processInfo);
      }
      this.emit('processError', sandboxId, error);
    });
  }

  private async waitForServerReady(sandboxId: string, port: number): Promise<void> {
    const startTime = Date.now();
    const timeout = this.config.processTimeout;

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;

      const checkServer = async () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Vite server failed to start within ${timeout}ms`));
          return;
        }

        try {
          const controller = new AbortController();
          const timeoutSignal = setTimeout(() => controller.abort(), 1000);
          
          const response = await fetch(`http://localhost:${port}`, {
            signal: controller.signal
          });
          
          clearTimeout(timeoutSignal);
          
          if (response.ok || response.status === 404) {
            // Server is responding (404 is fine for Vite dev server)
            resolve();
            return;
          }
        } catch (error) {
          // Server not ready yet, continue checking
        }

        timeoutId = setTimeout(checkServer, 500);
      };

      checkServer();
    });
  }

  private async findAvailablePort(): Promise<number> {
    for (let port = this.config.startPortRange; port <= this.config.endPortRange; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available ports in range ${this.config.startPortRange}-${this.config.endPortRange}`);
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without actually sending a signal
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
}