import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';

export interface FileWatcherConfig {
  watchDir?: string;
  ignorePatterns?: string[];
  debounceMs?: number;
  persistent?: boolean;
  usePolling?: boolean;
  pollingInterval?: number;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  relativePath: string;
  timestamp: number;
}

export interface WatcherStats {
  isWatching: boolean;
  watchedPaths: string[];
  totalEvents: number;
  lastEventTime: number | null;
  eventCounts: Record<string, number>;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private config: Required<FileWatcherConfig>;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private stats: WatcherStats;
  private watchDir: string;

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<FileWatcherConfig> = {
    watchDir: './sandbox',
    ignorePatterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.tmp',
      '**/*.temp',
      '**/.cache/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/*.log'
    ],
    debounceMs: 300,
    persistent: true,
    usePolling: false,
    pollingInterval: 1000
  };

  constructor(config: FileWatcherConfig = {}) {
    super();
    
    this.config = { ...FileWatcher.DEFAULT_CONFIG, ...config };
    this.watchDir = path.resolve(this.config.watchDir);
    
    this.stats = {
      isWatching: false,
      watchedPaths: [],
      totalEvents: 0,
      lastEventTime: null,
      eventCounts: {
        add: 0,
        change: 0,
        unlink: 0,
        addDir: 0,
        unlinkDir: 0
      }
    };

    // Bind methods to preserve 'this' context
    this.handleFileEvent = this.handleFileEvent.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Start watching the configured directory
   */
  async start(): Promise<void> {
    if (this.watcher) {
      throw new Error('File watcher is already running');
    }

    try {
      this.watcher = chokidar.watch(this.watchDir, {
        ignored: this.config.ignorePatterns,
        persistent: this.config.persistent,
        ignoreInitial: false,
        followSymlinks: false,
        cwd: this.watchDir,
        usePolling: this.config.usePolling,
        interval: this.config.pollingInterval,
        binaryInterval: this.config.pollingInterval * 2,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        },
        atomic: true
      });

      // Set up event listeners
      this.watcher
        .on('add', (filePath) => this.handleFileEvent('add', filePath))
        .on('change', (filePath) => this.handleFileEvent('change', filePath))
        .on('unlink', (filePath) => this.handleFileEvent('unlink', filePath))
        .on('addDir', (dirPath) => this.handleFileEvent('addDir', dirPath))
        .on('unlinkDir', (dirPath) => this.handleFileEvent('unlinkDir', dirPath))
        .on('error', this.handleError)
        .on('ready', () => {
          this.stats.isWatching = true;
          this.emit('ready');
        });

      // Wait for initial scan to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('File watcher initialization timeout'));
        }, 30000);

        this.watcher!.on('ready', () => {
          clearTimeout(timeout);
          this.stats.watchedPaths = this.watcher!.getWatched() 
            ? Object.keys(this.watcher!.getWatched()) 
            : [];
          resolve();
        });

        this.watcher!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      await this.stop();
      throw new Error(`Failed to start file watcher: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop the file watcher
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Clear any pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.stats.isWatching = false;
    this.stats.watchedPaths = [];
    
    this.emit('stopped');
  }

  /**
   * Handle file system events with debouncing
   */
  private handleFileEvent(type: FileChangeEvent['type'], filePath: string): void {
    const absolutePath = path.resolve(this.watchDir, filePath);
    const relativePath = path.relative(this.watchDir, absolutePath);
    
    // Create debounce key (combination of path and event type for precise debouncing)
    const debounceKey = `${type}:${relativePath}`;
    
    // Clear existing timer for this specific file and event type
    const existingTimer = this.debounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      
      // Update statistics
      this.stats.totalEvents++;
      this.stats.eventCounts[type]++;
      this.stats.lastEventTime = Date.now();

      // Create and emit the event
      const event: FileChangeEvent = {
        type,
        path: absolutePath,
        relativePath,
        timestamp: Date.now()
      };

      this.emit('fileChange', event);
      this.emit(type, event);

    }, this.config.debounceMs);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * Handle watcher errors
   */
  private handleError(error: unknown): void {
    this.emit('error', error instanceof Error ? error : new Error(String(error)));
  }

  /**
   * Add additional paths to watch
   */
  async addPath(pathToWatch: string): Promise<void> {
    if (!this.watcher) {
      throw new Error('File watcher is not running');
    }

    const resolvedPath = path.resolve(pathToWatch);
    this.watcher.add(resolvedPath);
    
    // Update watched paths
    this.stats.watchedPaths = Object.keys(this.watcher.getWatched() || {});
  }

  /**
   * Remove paths from watching
   */
  async removePath(pathToUnwatch: string): Promise<void> {
    if (!this.watcher) {
      throw new Error('File watcher is not running');
    }

    const resolvedPath = path.resolve(pathToUnwatch);
    this.watcher.unwatch(resolvedPath);
    
    // Update watched paths
    this.stats.watchedPaths = Object.keys(this.watcher.getWatched() || {});
  }

  /**
   * Get current watcher statistics
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  /**
   * Get the directory being watched
   */
  getWatchDir(): string {
    return this.watchDir;
  }

  /**
   * Check if the watcher is currently active
   */
  isWatching(): boolean {
    return this.stats.isWatching && this.watcher !== null;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.totalEvents = 0;
    this.stats.lastEventTime = null;
    this.stats.eventCounts = {
      add: 0,
      change: 0,
      unlink: 0,
      addDir: 0,
      unlinkDir: 0
    };
  }

  /**
   * Get list of currently watched files and directories
   */
  getWatchedPaths(): string[] {
    if (!this.watcher) {
      return [];
    }
    
    const watched = this.watcher.getWatched();
    if (!watched) {
      return [];
    }

    const paths: string[] = [];
    for (const [dir, files] of Object.entries(watched)) {
      if (Array.isArray(files)) {
        for (const file of files) {
          paths.push(path.join(dir, file));
        }
      }
    }
    
    return paths.sort();
  }

  /**
   * Create a file watcher with hot reload functionality
   */
  static createHotReloadWatcher(config: FileWatcherConfig = {}): FileWatcher {
    const hotReloadConfig: FileWatcherConfig = {
      ...config,
      debounceMs: config.debounceMs || 150, // Faster for hot reload
      ignorePatterns: [
        ...(config.ignorePatterns || []),
        '**/node_modules/**',
        '**/.git/**',
        '**/*.log',
        '**/.DS_Store',
        '**/Thumbs.db'
      ]
    };

    const watcher = new FileWatcher(hotReloadConfig);

    // Add hot reload specific event handling
    watcher.on('fileChange', (event: FileChangeEvent) => {
      if (FileWatcher.isHotReloadCandidate(event.relativePath)) {
        watcher.emit('hotReload', event);
      }
    });

    return watcher;
  }

  /**
   * Check if a file should trigger hot reload
   */
  private static isHotReloadCandidate(filePath: string): boolean {
    const hotReloadExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
      '.css', '.scss', '.sass', '.less',
      '.html', '.htm', '.json'
    ];

    const ext = path.extname(filePath).toLowerCase();
    return hotReloadExtensions.includes(ext);
  }

  /**
   * Utility method to validate directory exists and is accessible
   */
  static async validateWatchDirectory(dir: string): Promise<boolean> {
    try {
      const { promises: fs } = await import('fs');
      const stats = await fs.stat(dir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

// Export convenience instance for quick usage
export const createFileWatcher = (config?: FileWatcherConfig) => new FileWatcher(config);
export const createHotReloadWatcher = (config?: FileWatcherConfig) => FileWatcher.createHotReloadWatcher(config);