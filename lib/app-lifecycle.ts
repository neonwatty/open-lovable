import { processCleanupManager } from './process-cleanup-manager';

/**
 * Global application lifecycle management
 * Handles startup and shutdown procedures for the entire application
 */
class AppLifecycle {
  private static instance: AppLifecycle | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): AppLifecycle {
    if (!AppLifecycle.instance) {
      AppLifecycle.instance = new AppLifecycle();
    }
    return AppLifecycle.instance;
  }

  /**
   * Initialize application services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[AppLifecycle] Already initialized');
      return;
    }

    console.log('[AppLifecycle] Initializing application services...');

    try {
      // Initialize process cleanup manager
      processCleanupManager.start();

      // Set up process cleanup manager event listeners
      this.setupProcessCleanupEvents();

      this.initialized = true;
      console.log('[AppLifecycle] Application services initialized successfully');

    } catch (error) {
      console.error('[AppLifecycle] Failed to initialize application services:', error);
      throw error;
    }
  }

  /**
   * Shutdown application services
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      console.log('[AppLifecycle] Application not initialized, nothing to shutdown');
      return;
    }

    console.log('[AppLifecycle] Shutting down application services...');

    try {
      // Stop process cleanup manager
      processCleanupManager.stop();

      // Perform final cleanup
      await processCleanupManager.performCleanup();

      this.initialized = false;
      console.log('[AppLifecycle] Application services shutdown complete');

    } catch (error) {
      console.error('[AppLifecycle] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for process cleanup manager
   */
  private setupProcessCleanupEvents(): void {
    processCleanupManager.on('processRegistered', (process) => {
      console.log(`[AppLifecycle] Process registered: ${process.id} (PID: ${process.pid})`);
    });

    processCleanupManager.on('processUnregistered', (id) => {
      console.log(`[AppLifecycle] Process unregistered: ${id}`);
    });

    processCleanupManager.on('zombieProcessDetected', (id, process) => {
      console.warn(`[AppLifecycle] Zombie process detected: ${id} (PID: ${process.pid})`);
    });

    processCleanupManager.on('processMemoryExceeded', (id, memoryUsage) => {
      console.warn(`[AppLifecycle] Process ${id} exceeded memory limit: ${Math.round(memoryUsage / 1024 / 1024)}MB`);
    });

    processCleanupManager.on('cleanupCompleted', (stats) => {
      console.log(`[AppLifecycle] Cleanup completed:`, {
        totalProcesses: stats.totalProcesses,
        runningProcesses: stats.runningProcesses,
        zombieProcesses: stats.zombieProcesses,
        memoryUsage: Math.round(stats.totalMemoryUsage / 1024 / 1024) + 'MB'
      });
    });

    processCleanupManager.on('gracefulShutdownStarted', (signal) => {
      console.log(`[AppLifecycle] Graceful shutdown initiated by ${signal}`);
    });

    processCleanupManager.on('gracefulShutdownCompleted', () => {
      console.log('[AppLifecycle] Graceful shutdown completed');
    });

    processCleanupManager.on('error', (error) => {
      console.error('[AppLifecycle] Process cleanup error:', error);
    });
  }

  /**
   * Get initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get process cleanup manager instance
   */
  getProcessCleanupManager() {
    return processCleanupManager;
  }
}

// Export singleton instance
export const appLifecycle = AppLifecycle.getInstance();

// Auto-initialize on import in production
if (process.env.NODE_ENV !== 'test') {
  appLifecycle.initialize().catch(console.error);
}