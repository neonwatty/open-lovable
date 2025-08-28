import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { processCleanupManager } from '../../../lib/process-cleanup-manager';
import { defaultPortManager } from '../../../lib/port-manager';

declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var viteProcess: any;
}

export async function POST() {
  try {
    console.log('[kill-sandbox] Terminating local processes and cleaning up...');
    
    let processKilled = false;
    let sandboxKilled = false;
    
    // Kill local Vite process using process cleanup manager
    try {
      // First try to unregister from process cleanup manager
      const viteProcessUnregistered = await processCleanupManager.unregisterProcess('vite-server');
      if (viteProcessUnregistered) {
        processKilled = true;
        console.log('[kill-sandbox] Vite process unregistered from cleanup manager');
      }
      
      // Also check for any other managed processes
      const allProcesses = processCleanupManager.getProcesses({ type: ['vite'] });
      for (const managedProcess of allProcesses) {
        if (managedProcess.status === 'running') {
          const unregistered = await processCleanupManager.unregisterProcess(managedProcess.id);
          if (unregistered) {
            processKilled = true;
            console.log(`[kill-sandbox] Unregistered managed process: ${managedProcess.id}`);
          }
        }
      }
      
      // Fallback: try to read PID from file and kill manually
      const pidFile = '/tmp/vite-process.pid';
      try {
        const pidData = await fs.readFile(pidFile, 'utf8');
        const pid = parseInt(pidData.trim());
        
        if (pid && !isNaN(pid)) {
          console.log(`[kill-sandbox] Terminating Vite process with PID: ${pid}`);
          
          // Try graceful termination first
          try {
            process.kill(pid, 'SIGTERM');
            processKilled = true;
            console.log('[kill-sandbox] Sent SIGTERM to Vite process');
            
            // Wait a moment, then force kill if still running
            setTimeout(() => {
              try {
                process.kill(pid, 'SIGKILL');
                console.log('[kill-sandbox] Force killed Vite process with SIGKILL');
              } catch {
                // Process already terminated
              }
            }, 2000);
            
          } catch {
            console.log('[kill-sandbox] Vite process was already terminated');
          }
        }
        
        // Clean up PID file
        await fs.unlink(pidFile).catch(() => {});
        
      } catch {
        console.log('[kill-sandbox] No Vite PID file found');
      }
      
      // Also kill any global Vite process reference
      if (global.viteProcess) {
        try {
          global.viteProcess.kill('SIGTERM');
          processKilled = true;
          console.log('[kill-sandbox] Terminated global Vite process');
        } catch {
          console.log('[kill-sandbox] Global Vite process was already terminated');
        }
        global.viteProcess = null;
      }
      
      // Kill any remaining Vite processes using pkill as final fallback
      const killAll = spawn('pkill', ['-f', 'vite'], { stdio: 'pipe' });
      killAll.on('close', (code) => {
        if (code === 0) {
          console.log('[kill-sandbox] Killed remaining Vite processes');
          processKilled = true;
        }
      });
      
    } catch (e) {
      console.error('[kill-sandbox] Error killing local processes:', e);
    }
    
    // Release port reservations and cleanup sandbox
    if (global.activeSandbox) {
      try {
        // Release port if sandbox has one
        if (global.activeSandbox.id) {
          const released = await defaultPortManager.releasePort(global.activeSandbox.id);
          if (released) {
            console.log(`[kill-sandbox] Port released for sandbox ${global.activeSandbox.id}`);
          }
        }
        
        // Kill local sandbox if it exists
        if (typeof global.activeSandbox.close === 'function') {
          await global.activeSandbox.close();
          console.log('[kill-sandbox] Local sandbox closed successfully');
        }
        
        sandboxKilled = true;
      } catch (e) {
        console.error('[kill-sandbox] Failed to cleanup sandbox:', e);
      }
      global.activeSandbox = null;
      global.sandboxData = null;
    }
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    }
    
    // Clean up temporary files
    try {
      await fs.unlink('/tmp/vite-errors.json').catch(() => {});
      console.log('[kill-sandbox] Cleaned up temporary files');
    } catch {
      // Ignore cleanup errors
    }
    
    return NextResponse.json({
      success: true,
      processKilled,
      sandboxKilled,
      message: 'Local processes and sandbox cleaned up successfully'
    });
    
  } catch (error) {
    console.error('[kill-sandbox] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
}