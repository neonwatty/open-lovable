/**
 * Example integration of CleanupService with existing managers
 * This demonstrates how to set up and use the cleanup service in your application
 */

import { ProcessManager } from './process-manager';
import { SandboxManager } from './sandbox-manager';
import { PortManager } from './port-manager';
import { CleanupService, createCleanupService } from './cleanup-service';

// Example: Creating managers and cleanup service
export function createManagedInfrastructure() {
  // Initialize core managers
  const processManager = new ProcessManager({
    maxProcesses: 10,
    processTimeout: 30000,
    shutdownTimeout: 10000
  });

  const sandboxManager = new SandboxManager({
    maxSandboxes: 50,
    cleanupInterval: 24 * 60 * 60 * 1000 // 24 hours
  });

  const portManager = new PortManager({
    startPort: 5173,
    endPort: 5200,
    maxRetries: 3
  });

  // Create cleanup service with configuration
  const cleanupService = createCleanupService(
    processManager,
    sandboxManager,
    portManager,
    {
      scheduledCleanupInterval: 60000, // 1 minute
      zombieDetectionInterval: 30000, // 30 seconds
      maxInactivityTime: 900000, // 15 minutes
      maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
      enableAutoCleanup: true,
      logLevel: 'info'
    }
  );

  // Set up event listeners for monitoring
  setupCleanupEventListeners(cleanupService);

  return {
    processManager,
    sandboxManager,
    portManager,
    cleanupService
  };
}

// Example: Setting up event listeners for monitoring and logging
function setupCleanupEventListeners(cleanupService: CleanupService) {
  cleanupService.on('cleanupStarted', () => {
    console.log('[CLEANUP] Cleanup cycle started');
  });

  cleanupService.on('cleanupCompleted', (result) => {
    console.log('[CLEANUP] Cleanup completed:', {
      zombieProcesses: result.zombieProcesses,
      corruptedSandboxes: result.corruptedSandboxes,
      releasedPorts: result.releasedPorts,
      freedMemory: Math.round(result.freedMemory / 1024 / 1024) + 'MB',
      duration: result.duration + 'ms',
      errorCount: result.errors.length
    });
  });

  cleanupService.on('zombieProcessDetected', (pid, sandboxId) => {
    console.warn('[CLEANUP] Zombie process detected:', { pid, sandboxId });
  });

  cleanupService.on('corruptedSandboxDetected', (sandboxId, error) => {
    console.warn('[CLEANUP] Corrupted sandbox detected:', { sandboxId, error: error.message });
  });

  cleanupService.on('portLeakDetected', (port, sandboxId) => {
    console.warn('[CLEANUP] Port leak detected:', { port, sandboxId });
  });

  cleanupService.on('memoryLeakDetected', (usage, threshold) => {
    console.warn('[CLEANUP] High memory usage detected:', {
      current: Math.round(usage / 1024 / 1024) + 'MB',
      threshold: Math.round(threshold / 1024 / 1024) + 'MB'
    });
  });

  cleanupService.on('gracefulShutdownStarted', (signal) => {
    console.log('[CLEANUP] Graceful shutdown initiated:', signal);
  });

  cleanupService.on('gracefulShutdownCompleted', () => {
    console.log('[CLEANUP] Graceful shutdown completed');
  });

  cleanupService.on('error', (error) => {
    console.error('[CLEANUP] Cleanup error:', {
      type: error.type,
      message: error.message,
      details: error.details
    });
  });
}

// Example: Application startup with cleanup service
export async function startApplicationWithCleanup() {
  console.log('Starting application with managed infrastructure...');

  const infrastructure = createManagedInfrastructure();
  const { sandboxManager, cleanupService } = infrastructure;

  try {
    // Initialize sandbox manager
    await sandboxManager.initialize();
    console.log('Sandbox manager initialized');

    // Start cleanup service
    cleanupService.start();
    console.log('Cleanup service started');

    // Your application logic here...
    console.log('Application ready');

    return infrastructure;
  } catch (error) {
    console.error('Failed to start application:', error);
    throw error;
  }
}

// Example: Manual cleanup trigger (useful for health checks)
export async function performHealthCheck(cleanupService: CleanupService) {
  console.log('Performing infrastructure health check...');
  
  try {
    const result = await cleanupService.performCleanup();
    
    const healthStatus = {
      healthy: result.errors.length === 0,
      stats: {
        zombieProcessesCleaned: result.zombieProcesses,
        corruptedSandboxesCleaned: result.corruptedSandboxes,
        leakedPortsReleased: result.releasedPorts,
        memoryFreed: Math.round(result.freedMemory / 1024 / 1024),
        cleanupDuration: result.duration
      },
      errors: result.errors.map(err => ({
        type: err.type,
        message: err.message
      }))
    };

    console.log('Health check completed:', healthStatus);
    return healthStatus;
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Example: Graceful application shutdown
export async function shutdownApplication(infrastructure: ReturnType<typeof createManagedInfrastructure>) {
  console.log('Shutting down application...');
  
  const { processManager, portManager, cleanupService } = infrastructure;

  try {
    // Stop cleanup service timers
    cleanupService.stop();
    console.log('Cleanup service stopped');

    // Perform final cleanup
    const finalCleanup = await cleanupService.performCleanup();
    console.log('Final cleanup completed:', finalCleanup);

    // Stop all processes
    await processManager.stopAllProcesses();
    console.log('All processes stopped');

    // Cleanup port manager
    await portManager.cleanup();
    console.log('Port manager cleaned up');

    console.log('Application shutdown completed successfully');
  } catch (error) {
    console.error('Error during application shutdown:', error);
    throw error;
  }
}

// Example: Monitoring and alerting integration
export function setupMonitoring(cleanupService: CleanupService) {
  // Example metrics collection
  const metrics = {
    cleanupCycles: 0,
    totalZombiesDetected: 0,
    totalCorruptedSandboxes: 0,
    totalPortLeaks: 0,
    totalMemoryLeaks: 0,
    totalErrors: 0
  };

  cleanupService.on('cleanupCompleted', (result) => {
    metrics.cleanupCycles++;
    metrics.totalZombiesDetected += result.zombieProcesses;
    metrics.totalCorruptedSandboxes += result.corruptedSandboxes;
    metrics.totalPortLeaks += result.releasedPorts;
    metrics.totalErrors += result.errors.length;

    // Example: Alert if too many errors
    if (result.errors.length > 5) {
      console.error('[ALERT] High error count in cleanup cycle:', result.errors.length);
      // Send to monitoring system (e.g., DataDog, New Relic, etc.)
    }
  });

  cleanupService.on('memoryLeakDetected', () => {
    metrics.totalMemoryLeaks++;
    
    // Example: Alert on memory leak
    console.warn('[ALERT] Memory leak detected');
    // Send to monitoring system
  });

  // Periodic metrics reporting
  setInterval(() => {
    console.log('[METRICS] Cleanup service metrics:', metrics);
    // Send to monitoring dashboard
  }, 300000); // Every 5 minutes

  return metrics;
}

// Example usage in a Next.js API route or server setup:
/*
export default async function setupServer() {
  const infrastructure = await startApplicationWithCleanup();
  const { cleanupService } = infrastructure;
  
  // Set up monitoring
  const metrics = setupMonitoring(cleanupService);
  
  // Health check endpoint
  app.get('/health', async (req, res) => {
    const health = await performHealthCheck(cleanupService);
    res.json(health);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdownApplication(infrastructure);
    process.exit(0);
  });
}
*/