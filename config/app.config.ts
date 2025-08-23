// Application Configuration
// This file contains all configurable settings for the application

export const appConfig = {
  // Local Sandbox Configuration
  sandbox: {
    // Local sandbox directory path
    path: process.env.LOCAL_SANDBOX_PATH || './sandbox',
    
    // Process timeout in minutes (optimized for local operations)
    timeoutMinutes: 15,
    
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
        start: 5173,
        end: 5200
      },
      // Maximum retry attempts for port allocation
      maxRetries: 10
    },
    
    // Time to wait for Vite to be ready (optimized for local)
    viteStartupDelay: 5000,
    
    // Time to wait for CSS rebuild (optimized for local)
    cssRebuildDelay: 1500,
    
    // Local process timeout for operations (optimized for local filesystem)
    processTimeout: 10000,
    
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
      ioTimeout: 3000,
      // Timeout for directory creation (quick local operations)
      mkdirTimeout: 2000,
      // Timeout for file deletion (quick local operations)
      unlinkTimeout: 2000,
      // Timeout for file system watch operations
      watchTimeout: 1000,
      // Timeout for file stat operations
      statTimeout: 1000,
      // Timeout for recursive operations (copying, moving)
      recursiveTimeout: 10000,
      // Retry delay for EBUSY, EMFILE, ENFILE, ENOTEMPTY, or EPERM errors
      retryDelay: 100,
      // Maximum retry attempts for filesystem operations
      maxRetries: 3
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
    // Enable debug logging
    enableDebugLogging: true,
    
    // Enable performance monitoring
    enablePerformanceMonitoring: false,
    
    // Log API responses
    logApiResponses: true,
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

export default appConfig;