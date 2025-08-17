import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import net from 'net';
import { processCleanupManager } from '../../../lib/process-cleanup-manager';

declare global {
  var activeSandbox: any;
  var viteProcess: any;
}

async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

async function killSandboxProcesses(): Promise<boolean> {
  try {
    console.log('[restart-vite] Terminating existing processes...');
    
    let processKilled = false;
    
    // Read PID from file and kill process
    try {
      const pidFile = '/tmp/vite-process.pid';
      const pidData = await fs.readFile(pidFile, 'utf8');
      const pid = parseInt(pidData.trim());
      
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
          processKilled = true;
          console.log('[restart-vite] Sent SIGTERM to existing Vite process');
          
          // Force kill after delay if needed
          setTimeout(() => {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {
              // Process already terminated
            }
          }, 2000);
        } catch {
          console.log('[restart-vite] Process was already terminated');
        }
      }
      
      // Clean up PID file
      await fs.unlink(pidFile).catch(() => {});
    } catch {
      console.log('[restart-vite] No existing PID file found');
    }
    
    // Kill global process reference
    if (global.viteProcess) {
      try {
        global.viteProcess.kill('SIGTERM');
        processKilled = true;
        console.log('[restart-vite] Terminated global Vite process');
      } catch {
        console.log('[restart-vite] Global process already terminated');
      }
      global.viteProcess = null;
    }
    
    return processKilled;
  } catch (error) {
    console.error('[restart-vite] Error killing processes:', error);
    return false;
  }
}

async function waitForPort(port: number, timeout: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const available = await checkPortAvailable(port);
    if (available) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return false;
}

async function healthCheck(port: number = 5173): Promise<boolean> {
  try {
    // Simple TCP connection test
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      
      socket.connect(port, 'localhost', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

export async function POST() {
  try {
    console.log('[restart-vite] Starting Vite restart sequence...');
    
    // Step 1: Kill existing processes using kill-sandbox functionality
    const processKilled = await killSandboxProcesses();
    console.log(`[restart-vite] Process termination: ${processKilled ? 'successful' : 'no processes found'}`);
    
    // Step 2: Wait for port to be released
    const vitePort = 5173;
    console.log('[restart-vite] Waiting for port to be released...');
    const portReleased = await waitForPort(vitePort, 5000);
    
    if (!portReleased) {
      console.warn('[restart-vite] Port may still be in use, proceeding anyway');
    }
    
    // Step 3: Clear error tracking file
    try {
      await fs.writeFile('/tmp/vite-errors.json', JSON.stringify({
        errors: [],
        lastChecked: Date.now()
      }));
      console.log('[restart-vite] Cleared error tracking file');
    } catch {
      // Error file cleanup is not critical
    }
    
    // Step 4: Start new Vite process
    console.log('[restart-vite] Starting new Vite server...');
    
    const workingDir = process.env.SANDBOX_DIR || '/tmp/sandbox-workspace';
    
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: workingDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        FORCE_COLOR: '0',
        PORT: vitePort.toString()
      },
      detached: false
    });
    
    if (!viteProcess.pid) {
      throw new Error('Failed to start Vite process');
    }
    
    console.log(`[restart-vite] Started Vite process with PID: ${viteProcess.pid}`);
    
    // Step 5: Store process PID and register with cleanup manager
    try {
      await fs.writeFile('/tmp/vite-process.pid', viteProcess.pid.toString());
      global.viteProcess = viteProcess;
      
      // Register with process cleanup manager
      const managedProcess = processCleanupManager.registerProcess(
        'vite-server',
        viteProcess,
        'npm',
        ['run', 'dev'],
        workingDir,
        'vite',
        { port: vitePort }
      );
      
      console.log(`[restart-vite] Process registered with cleanup manager: ${managedProcess.id}`);
    } catch (error) {
      console.error('[restart-vite] Failed to store PID or register process:', error);
    }
    
    // Step 6: Set up process monitoring
    viteProcess.stdout?.on('data', (data) => {
      console.log(`[vite-stdout] ${data.toString().trim()}`);
    });
    
    viteProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[vite-stderr] ${output}`);
      
      // Monitor for import errors and other issues
      if (output.includes('Failed to resolve import')) {
        console.warn('[restart-vite] Detected import resolution error');
      }
    });
    
    viteProcess.on('exit', (code, signal) => {
      console.log(`[restart-vite] Vite process exited with code ${code}, signal ${signal}`);
      global.viteProcess = null;
    });
    
    viteProcess.on('error', (error) => {
      console.error('[restart-vite] Vite process error:', error);
      global.viteProcess = null;
    });
    
    // Step 7: Wait for server to start and perform health check
    console.log('[restart-vite] Waiting for server to be ready...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const isHealthy = await healthCheck(vitePort);
    console.log(`[restart-vite] Health check: ${isHealthy ? 'passed' : 'failed'}`);
    
    return NextResponse.json({
      success: true,
      message: 'Vite server restarted successfully',
      data: {
        pid: viteProcess.pid,
        port: vitePort,
        processKilled,
        portReleased,
        healthCheck: isHealthy,
        workingDirectory: workingDir
      }
    });
    
  } catch (error) {
    console.error('[restart-vite] Error:', error);
    
    // Clean up on error
    if (global.viteProcess) {
      try {
        global.viteProcess.kill('SIGTERM');
        global.viteProcess = null;
      } catch {
        // Ignore cleanup errors
      }
    }
    
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}