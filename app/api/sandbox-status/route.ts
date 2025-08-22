import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createServer } from 'net';
import { spawn } from 'child_process';
import { defaultPortManager } from '@/lib/port-manager';
import { processCleanupManager } from '@/lib/process-cleanup-manager';

declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var viteProcess: any;
}

interface ProcessInfo {
  pid: number;
  isRunning: boolean;
  memoryUsage?: number;
  uptime?: number;
  cpuUsage?: number;
}

interface PortStatus {
  port: number;
  accessible: boolean;
  responseTime?: number;
}

interface SandboxStatus {
  process: ProcessInfo | null;
  port: PortStatus;
  workingDirectory: string;
  lastHealthCheck: string;
  filesTracked: string[];
  sandboxId?: string;
  url?: string;
  portManagerStats?: {
    totalPorts: number;
    availablePorts: number;
    activePorts: number;
    reservedPorts: number;
    portRange: string;
  };
  uptime?: number; // milliseconds since created
  connectionHealth?: 'healthy' | 'unreachable' | 'checking';
}

async function checkProcessByPid(pid: number): Promise<ProcessInfo | null> {
  try {
    // Check if process is running using process.kill(pid, 0)
    process.kill(pid, 0);
    
    // Process is running, get additional info
    const processInfo: ProcessInfo = {
      pid,
      isRunning: true
    };
    
    try {
      // Get process info using ps command on Unix-like systems
      const psResult = await new Promise<string>((resolve, reject) => {
        const ps = spawn('ps', ['-p', pid.toString(), '-o', 'pid,etime,rss,pcpu', '--no-headers'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let output = '';
        ps.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        ps.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(`ps command failed with code ${code}`));
          }
        });
        
        ps.on('error', reject);
      });
      
      if (psResult) {
        const parts = psResult.trim().split(/\s+/);
        if (parts.length >= 4) {
          // Parse elapsed time (format: [[DD-]HH:]MM:SS)
          const etime = parts[1];
          const etimeParts = etime.split(':');
          let uptimeSeconds = 0;
          if (etimeParts.length === 2) {
            // MM:SS
            uptimeSeconds = parseInt(etimeParts[0]) * 60 + parseInt(etimeParts[1]);
          } else if (etimeParts.length === 3) {
            // HH:MM:SS
            uptimeSeconds = parseInt(etimeParts[0]) * 3600 + parseInt(etimeParts[1]) * 60 + parseInt(etimeParts[2]);
          }
          
          processInfo.uptime = uptimeSeconds;
          processInfo.memoryUsage = parseInt(parts[2]) * 1024; // RSS in KB, convert to bytes
          processInfo.cpuUsage = parseFloat(parts[3]);
        }
      }
    } catch {
      // Process info gathering failed, but process is still running
    }
    
    return processInfo;
  } catch {
    // Process is not running
    return {
      pid,
      isRunning: false
    };
  }
}

async function checkPortStatus(port: number): Promise<PortStatus> {
  const startTime = Date.now();
  
  // Try to connect to the port to check if it's accessible
  return new Promise((resolve) => {
    const server = createServer();
    
    server.listen(port, () => {
      // If we can listen on the port, it means the port is NOT in use
      server.close();
      resolve({
        port,
        accessible: false
      });
    });
    
    server.on('error', () => {
      // If we can't listen on the port, it means something is using it (likely our Vite server)
      resolve({
        port,
        accessible: true,
        responseTime: Date.now() - startTime
      });
    });
  });
}

async function findViteProcessByPort(port: number): Promise<number | null> {
  try {
    // Use netstat or lsof to find process using the port
    const result = await new Promise<string>((resolve, reject) => {
      // Try lsof first (more reliable)
      const lsof = spawn('lsof', ['-ti', `tcp:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';
      lsof.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      lsof.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          // Fallback to netstat
          const netstat = spawn('netstat', ['-tlnp'], {
            stdio: ['ignore', 'pipe', 'pipe']
          });
          
          let netstatOutput = '';
          netstat.stdout?.on('data', (data) => {
            netstatOutput += data.toString();
          });
          
          netstat.on('close', () => {
            resolve(netstatOutput);
          });
          
          netstat.on('error', reject);
        }
      });
      
      lsof.on('error', () => {
        // Fallback to netstat if lsof is not available
        const netstat = spawn('netstat', ['-tlnp'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let netstatOutput = '';
        netstat.stdout?.on('data', (data) => {
          netstatOutput += data.toString();
        });
        
        netstat.on('close', () => {
          resolve(netstatOutput);
        });
        
        netstat.on('error', reject);
      });
    });
    
    if (result) {
      // Parse lsof output (just PID)
      const lines = result.split('\n');
      for (const line of lines) {
        const pid = parseInt(line.trim());
        if (!isNaN(pid)) {
          return pid;
        }
      }
      
      // Parse netstat output if lsof didn't work
      const netstatLines = result.split('\n');
      for (const line of netstatLines) {
        if (line.includes(`:${port} `) && line.includes('LISTEN')) {
          const match = line.match(/(\d+)\//);
          if (match) {
            return parseInt(match[1]);
          }
        }
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const activeSandbox = global.activeSandbox;
    const vitePort = activeSandbox?.port || 5173; // Use dynamic port from sandbox
    const workingDir = activeSandbox?.path || process.env.SANDBOX_DIR || '/tmp/sandbox-workspace';
    
    // Step 1: Check stored PID from file
    let storedPid: number | null = null;
    try {
      const pidFile = '/tmp/vite-process.pid';
      const pidData = await fs.readFile(pidFile, 'utf8');
      storedPid = parseInt(pidData.trim());
    } catch {
      // PID file doesn't exist or is invalid
    }
    
    // Step 2: Check global process reference
    let globalPid: number | null = null;
    if (global.viteProcess?.pid) {
      globalPid = global.viteProcess.pid;
    }
    
    // Step 3: Check process cleanup manager for managed processes
    const managedProcesses = processCleanupManager.getProcesses();
    const viteProcess = managedProcesses.find((p: any) => p.type === 'vite');
    let managedPid: number | null = null;
    if (viteProcess) {
      managedPid = viteProcess.pid || null;
    }
    
    // Step 4: Check process status using available PIDs (priority: managed > global > stored)
    let processInfo: ProcessInfo | null = null;
    
    if (managedPid && !isNaN(managedPid)) {
      processInfo = await checkProcessByPid(managedPid);
    } else if (globalPid && !isNaN(globalPid)) {
      processInfo = await checkProcessByPid(globalPid);
    } else if (storedPid && !isNaN(storedPid)) {
      processInfo = await checkProcessByPid(storedPid);
    }
    
    // Step 5: Check port status
    const portStatus = await checkPortStatus(vitePort);
    
    // Step 6: Fallback - if no PID but port is accessible, try to find process
    if (!processInfo?.isRunning && portStatus.accessible) {
      const foundPid = await findViteProcessByPort(vitePort);
      if (foundPid) {
        processInfo = await checkProcessByPid(foundPid);
        
        // Update stored PID if we found a running process
        if (processInfo?.isRunning) {
          try {
            await fs.writeFile('/tmp/vite-process.pid', foundPid.toString());
          } catch {
            // Failed to update PID file, but not critical
          }
        }
      }
    }
    
    // Step 7: Get port manager stats
    const portStats = defaultPortManager.getStats();
    
    // Step 8: Calculate uptime if sandbox exists
    let uptime: number | undefined = undefined;
    if (activeSandbox?.created) {
      uptime = Date.now() - activeSandbox.created.getTime();
    }
    
    // Step 9: Determine connection health
    let connectionHealth: 'healthy' | 'unreachable' | 'checking' = 'unreachable';
    if (processInfo?.isRunning && portStatus.accessible) {
      connectionHealth = 'healthy';
    } else if (!processInfo?.isRunning) {
      connectionHealth = 'unreachable';
    } else {
      connectionHealth = 'checking';
    }
    
    // Step 10: Build status response
    const status: SandboxStatus = {
      process: processInfo,
      port: portStatus,
      workingDirectory: workingDir,
      lastHealthCheck: new Date().toISOString(),
      filesTracked: global.existingFiles ? Array.from(global.existingFiles) : [],
      sandboxId: activeSandbox?.id || global.sandboxData?.sandboxId,
      url: activeSandbox?.url || global.sandboxData?.url,
      portManagerStats: {
        totalPorts: portStats.totalPorts,
        availablePorts: portStats.availablePorts,
        activePorts: portStats.activePorts,
        reservedPorts: portStats.reservedPorts,
        portRange: portStats.portRange,
      },
      uptime,
      connectionHealth,
    };
    
    const isHealthy = (processInfo?.isRunning || false) && portStatus.accessible;
    const isActive = processInfo?.isRunning || portStatus.accessible;
    
    let message = '';
    if (isHealthy) {
      message = 'Local Vite server is running and accessible';
    } else if (processInfo?.isRunning && !portStatus.accessible) {
      message = 'Vite process is running but port is not accessible';
    } else if (!processInfo?.isRunning && portStatus.accessible) {
      message = 'Port is accessible but no tracked process found';
    } else {
      message = 'No active Vite server found';
    }
    
    return NextResponse.json({
      success: true,
      active: isActive,
      healthy: isHealthy,
      status,
      message,
      // Legacy compatibility
      sandboxData: {
        sandboxId: status.sandboxId,
        url: status.url || (portStatus.accessible ? `http://localhost:${vitePort}` : null),
        filesTracked: status.filesTracked,
        lastHealthCheck: status.lastHealthCheck
      }
    });
    
  } catch (error) {
    console.error('[sandbox-status] Error:', error);
    return NextResponse.json({ 
      success: false,
      active: false,
      healthy: false,
      error: (error as Error).message 
    }, { status: 500 });
  }
}