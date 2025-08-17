import { NextRequest, NextResponse } from 'next/server';
import { processCleanupManager } from '../../../lib/process-cleanup-manager';

export async function GET() {
  try {
    const stats = processCleanupManager.getStats();
    const processes = processCleanupManager.getProcesses();
    
    return NextResponse.json({
      success: true,
      stats,
      processes: processes.map(p => ({
        id: p.id,
        pid: p.pid,
        command: p.command,
        status: p.status,
        type: p.type,
        startTime: p.startTime,
        lastActivity: p.lastActivity,
        memoryUsage: p.memoryUsage,
        cpuUsage: p.cpuUsage,
        port: p.port,
        sandboxId: p.sandboxId
      })),
      message: 'Process cleanup status retrieved successfully'
    });
  } catch (error) {
    console.error('[process-cleanup] Error getting status:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (!action) {
      return NextResponse.json({
        success: false,
        error: 'Action is required'
      }, { status: 400 });
    }
    
    switch (action) {
      case 'cleanup':
        console.log('[process-cleanup] Manual cleanup requested');
        const cleanupStats = await processCleanupManager.performCleanup();
        return NextResponse.json({
          success: true,
          action: 'cleanup',
          stats: cleanupStats,
          message: 'Manual cleanup completed successfully'
        });
        
      case 'health-check':
        console.log('[process-cleanup] Manual health check requested');
        await processCleanupManager.performHealthCheck();
        const healthStats = processCleanupManager.getStats();
        return NextResponse.json({
          success: true,
          action: 'health-check',
          stats: healthStats,
          message: 'Health check completed successfully'
        });
        
      case 'stop-all':
        console.log('[process-cleanup] Stop all processes requested');
        await processCleanupManager.stopAllProcesses();
        const stopStats = processCleanupManager.getStats();
        return NextResponse.json({
          success: true,
          action: 'stop-all',
          stats: stopStats,
          message: 'All processes stopped successfully'
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}. Supported actions: cleanup, health-check, stop-all`
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('[process-cleanup] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const processId = searchParams.get('id');
    const forceKill = searchParams.get('force') === 'true';
    
    if (!processId) {
      return NextResponse.json({
        success: false,
        error: 'Process ID is required'
      }, { status: 400 });
    }
    
    console.log(`[process-cleanup] Terminating process: ${processId} (force: ${forceKill})`);
    
    const success = await processCleanupManager.unregisterProcess(processId, forceKill);
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: `Process ${processId} terminated successfully`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Process ${processId} not found or already terminated`
      }, { status: 404 });
    }
    
  } catch (error) {
    console.error('[process-cleanup] Error terminating process:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}