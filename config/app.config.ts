// Application Configuration
// This file contains all configurable settings for the application

import * as path from 'path';

// Check if running in local mode for optimized settings
const isLocalMode = process.env.LOCAL_MODE === 'true';
const isDevelopment = process.env.NODE_ENV === 'development';

export const appConfig = {
  // Local Sandbox Configuration
  sandbox: {
    // Local sandbox root directory path - all sandboxes will be created here
    rootPath: process.env.LOCAL_SANDBOX_ROOT || path.resolve(process.cwd(), 'sandboxes'),
    
    // Legacy support for single sandbox path (deprecated, use rootPath instead)
    path: process.env.LOCAL_SANDBOX_PATH || './sandbox',
    
    // Process timeout in minutes (optimized for local operations)
    timeoutMinutes: isLocalMode ? 10 : 15,
    
    // Convert to milliseconds for process management
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },
    
    // Port management configuration
    ports: {
      // Default Vite development server port
      default: parseInt(process.env.VITE_PORT || '5173'),
      // Port range for dynamic allocation
      range: {
        start: parseInt(process.env.SANDBOX_PORT_START || '5173'),
        end: parseInt(process.env.SANDBOX_PORT_END || '5200')
      },
      // Maximum retry attempts for port allocation
      maxRetries: parseInt(process.env.SANDBOX_PORT_MAX_RETRIES || '10'),
      // Port availability check timeout (milliseconds)
      checkTimeout: parseInt(process.env.SANDBOX_PORT_CHECK_TIMEOUT || '2000'),
      // Bind address for development server
      bindAddress: process.env.SANDBOX_BIND_ADDRESS || 'localhost',
      // Force specific port (if set, will not use dynamic allocation)
      forcePort: process.env.FORCE_SANDBOX_PORT ? parseInt(process.env.FORCE_SANDBOX_PORT) : null,
      // Port conflict resolution strategy: 'increment' | 'random' | 'fail'
      conflictResolution: (process.env.SANDBOX_PORT_CONFLICT_STRATEGY as 'increment' | 'random' | 'fail') || 'increment'
    },
    
    // Time to wait for Vite to be ready (optimized for local)
    viteStartupDelay: isLocalMode ? 3000 : 5000,
    
    // Time to wait for CSS rebuild (optimized for local)
    cssRebuildDelay: isLocalMode ? 1000 : 1500,
    
    // Local process timeout for operations (optimized for local filesystem)
    processTimeout: isLocalMode ? 8000 : 10000,
    
    // Server-level timeout configurations for Node.js best practices
    serverTimeouts: {
      // Server timeout for inactive connections (10 seconds for development)
      serverTimeout: 10000,
      // Request timeout for receiving entire request from client
      requestTimeout: 20000,
      // Headers timeout for receiving complete HTTP headers
      headersTimeout: 15000,
      // Keep-alive timeout for persistent connections
      keepAliveTimeout: 5000
    },
    
    // File system operation timeouts (optimized for local development 2024)
    fileOperations: {
      // Timeout for file read/write operations (reduced for responsiveness)
      ioTimeout: isLocalMode ? 2000 : 3000,
      // Timeout for directory creation (quick local operations)
      mkdirTimeout: isLocalMode ? 1500 : 2000,
      // Timeout for file deletion (quick local operations)
      unlinkTimeout: isLocalMode ? 1500 : 2000,
      // Timeout for file system watch operations
      watchTimeout: isLocalMode ? 800 : 1000,
      // Timeout for file stat operations
      statTimeout: isLocalMode ? 800 : 1000,
      // Timeout for recursive operations (copying, moving)
      recursiveTimeout: isLocalMode ? 8000 : 10000,
      // Retry delay for EBUSY, EMFILE, ENFILE, ENOTEMPTY, or EPERM errors
      retryDelay: isLocalMode ? 50 : 100,
      // Maximum retry attempts for filesystem operations
      maxRetries: isLocalMode ? 2 : 3
    },
    
    // Sandbox directory management
    directoryManagement: {
      // Automatically clean up old sandboxes (hours)
      autoCleanupAfterHours: parseInt(process.env.SANDBOX_CLEANUP_HOURS || '24'),
      // Maximum number of concurrent sandboxes
      maxConcurrentSandboxes: parseInt(process.env.SANDBOX_MAX_CONCURRENT || '10'),
      // Sandbox directory naming strategy: 'uuid' | 'timestamp' | 'sequential'
      namingStrategy: (process.env.SANDBOX_NAMING_STRATEGY as 'uuid' | 'timestamp' | 'sequential') || 'uuid',
      // Enable sandbox isolation (create separate node_modules for each)
      enableIsolation: process.env.SANDBOX_ISOLATION === 'true',
      // Sandbox template directory (for initializing new sandboxes)
      templatePath: process.env.SANDBOX_TEMPLATE_PATH || null,
      // Enable sandbox metadata tracking
      enableMetadata: process.env.SANDBOX_METADATA !== 'false',
      // Sandbox disk space monitoring
      enableDiskSpaceMonitoring: process.env.SANDBOX_DISK_MONITORING !== 'false',
      // Maximum disk space per sandbox (MB)
      maxSandboxSizeMB: parseInt(process.env.SANDBOX_MAX_SIZE_MB || '500')
    },
  },
  
  // Local Code Generation Configuration
  codeGeneration: {
    // Default code generation mode (local-only)
    defaultMode: 'local',
    
    // Local code validation enabled
    enableValidation: true,
    
    // Code analysis timeout (optimized for local operations)
    analysisTimeout: 5000,
    
    // Max file size for code processing (bytes)
    maxFileSize: 1024 * 1024, // 1MB
    
    // Supported programming languages for local processing
    supportedLanguages: [
      'javascript',
      'typescript',
      'jsx',
      'tsx',
      'css',
      'scss',
      'html',
      'json'
    ],
    
    // Local-only generation settings
    enableStreaming: true,
    maxConcurrentGenerations: 1, // Limit to prevent resource issues
  },
  
  // Code Application Configuration
  codeApplication: {
    // Delay after applying code before refreshing iframe (milliseconds)
    defaultRefreshDelay: 2000,
    
    // Delay when packages are installed (milliseconds)
    packageInstallRefreshDelay: 5000,
    
    // Enable/disable automatic truncation recovery
    enableTruncationRecovery: false, // Disabled - too many false positives
    
    // Maximum number of truncation recovery attempts per file
    maxTruncationRecoveryAttempts: 1,
  },
  
  // UI Configuration
  ui: {
    // Show/hide certain UI elements - model selector removed for Claude Code-only operation
    showModelSelector: false,
    showStatusIndicator: true,
    
    // Animation durations (milliseconds)
    animationDuration: 200,
    
    // Toast notification duration (milliseconds)
    toastDuration: 3000,
    
    // Maximum chat messages to keep in memory
    maxChatMessages: 100,
    
    // Maximum recent messages to send as context
    maxRecentMessagesContext: 20,
  },
  
  // Development Configuration
  dev: {
    // Enable debug logging (enhanced in local mode)
    enableDebugLogging: isLocalMode ? true : isDevelopment,
    
    // Enable performance monitoring (more detailed in local mode)
    enablePerformanceMonitoring: isLocalMode ? true : false,
    
    // Log API responses (verbose in local mode)
    logApiResponses: isLocalMode ? true : isDevelopment,
    
    // Local mode specific settings
    enableLocalModeOptimizations: isLocalMode,
    enableFastRefresh: isLocalMode,
    enableInlineSourceMaps: isLocalMode,
  },
  
  // Local Package Installation Configuration
  packages: {
    // Use --legacy-peer-deps flag for npm install (local operations)
    useLegacyPeerDeps: true,
    
    // Package installation timeout (optimized for local operations)
    installTimeout: 45000,
    
    // Auto-restart Vite after package installation (local-only)
    autoRestartVite: true,
    
    // Retry configuration for package installation
    maxInstallRetries: 2,
    retryDelay: 2000,
    
    // Local registry configuration
    useLocalRegistry: false, // Set to true if using local npm registry
    
    // Package installation strategies for local development
    installStrategy: 'npm', // Could be 'npm', 'yarn', or 'pnpm'
  },
  
  // File Management Configuration
  files: {
    // Excluded file patterns (files to ignore)
    excludePatterns: [
      'node_modules/**',
      '.git/**',
      '.next/**',
      'dist/**',
      'build/**',
      '*.log',
      '.DS_Store'
    ],
    
    // Maximum file size to read (bytes)
    maxFileSize: 1024 * 1024, // 1MB
    
    // File extensions to treat as text
    textFileExtensions: [
      '.js', '.jsx', '.ts', '.tsx',
      '.css', '.scss', '.sass',
      '.html', '.xml', '.svg',
      '.json', '.yml', '.yaml',
      '.md', '.txt', '.env',
      '.gitignore', '.dockerignore'
    ],
  },
  
  // Web Scraping Configuration (using local tools)
  webScraping: {
    // Default user agent for requests
    userAgent: 'Open-Lovable-Bot/1.0',
    
    // Request timeout for web scraping (milliseconds)
    timeout: 15000,
    
    // Maximum pages to scrape per request
    maxPages: 5,
    
    // Puppeteer configuration
    puppeteer: {
      headless: true,
      defaultViewport: {
        width: 1280,
        height: 720,
      },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    
    // Cheerio configuration
    cheerio: {
      // Parse HTML with XML mode disabled
      xmlMode: false,
      decodeEntities: true,
    },
  },
  
  // Local API Configuration
  api: {
    // Local development server settings
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    
    // Request timeout (optimized for local operations)
    requestTimeout: 10000,
    
    // Retry configuration for local requests
    maxRetries: 3,
    retryDelay: 1000, // milliseconds
    
    // Enable request logging in development
    enableLogging: process.env.NODE_ENV === 'development',
    
    // Local-only API settings
    enableCors: true,
    maxRequestSize: '10mb', // For file uploads
    
    // Health check configuration for local services
    healthCheck: {
      interval: 30000, // Check every 30 seconds
      timeout: 5000,
      retries: 3
    }
  },

  // AI Model Configuration
  ai: {
    // Available AI models (hardcoded to Claude Code only)
    availableModels: ['claude-code'],
    
    // Default AI model
    defaultModel: 'claude-code',
    
    // Display names for models
    modelDisplayNames: {
      'claude-code': 'Claude Code'
    }
  }
};

// Type-safe config getter
export function getConfig<K extends keyof typeof appConfig>(key: K): typeof appConfig[K] {
  return appConfig[key];
}

// Helper to get nested config values
export function getConfigValue(path: string): any {
  return path.split('.').reduce((obj, key) => obj?.[key], appConfig as any);
}

// Helper to validate sandbox configuration
export function validateSandboxConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate port range
  if (appConfig.sandbox.ports.range.start >= appConfig.sandbox.ports.range.end) {
    errors.push('Port range start must be less than end');
  }
  
  if (appConfig.sandbox.ports.range.start < 1024) {
    errors.push('Port range start should be >= 1024 for non-privileged ports');
  }
  
  if (appConfig.sandbox.ports.range.end > 65535) {
    errors.push('Port range end must be <= 65535');
  }
  
  // Validate sandbox limits
  if (appConfig.sandbox.directoryManagement.maxConcurrentSandboxes < 1) {
    errors.push('Maximum concurrent sandboxes must be >= 1');
  }
  
  if (appConfig.sandbox.directoryManagement.maxSandboxSizeMB < 10) {
    errors.push('Maximum sandbox size must be >= 10MB');
  }
  
  // Validate cleanup interval
  if (appConfig.sandbox.directoryManagement.autoCleanupAfterHours < 1) {
    errors.push('Auto cleanup interval must be >= 1 hour');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Helper to get absolute sandbox root path
export function getSandboxRootPath(): string {
  return path.resolve(appConfig.sandbox.rootPath);
}

// Helper to get next available port in range
export function getPortRange(): { start: number; end: number } {
  return {
    start: appConfig.sandbox.ports.range.start,
    end: appConfig.sandbox.ports.range.end
  };
}

export default appConfig;