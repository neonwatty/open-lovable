// Application Configuration
// This file contains all configurable settings for the application

export const appConfig = {
  // Local Sandbox Configuration
  sandbox: {
    // Local sandbox directory path
    path: process.env.LOCAL_SANDBOX_PATH || './sandbox',
    
    // Process timeout in minutes
    timeoutMinutes: 15,
    
    // Convert to milliseconds for process management
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },
    
    // Vite development server port
    vitePort: parseInt(process.env.VITE_PORT || '5173'),
    
    // Time to wait for Vite to be ready (in milliseconds)
    viteStartupDelay: 7000,
    
    // Time to wait for CSS rebuild (in milliseconds)
    cssRebuildDelay: 2000,
    
    // Local process timeout for operations (in milliseconds)
    processTimeout: 30000,
  },
  
  // Local Code Generation Configuration
  codeGeneration: {
    // Default code generation mode
    defaultMode: 'local',
    
    // Local code validation enabled
    enableValidation: true,
    
    // Code analysis timeout (in milliseconds)
    analysisTimeout: 10000,
    
    // Max file size for code processing (bytes)
    maxFileSize: 1024 * 1024, // 1MB
    
    // Supported programming languages
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
    // Show/hide certain UI elements
    showModelSelector: true,
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
  
  // Package Installation Configuration
  packages: {
    // Use --legacy-peer-deps flag for npm install
    useLegacyPeerDeps: true,
    
    // Package installation timeout (milliseconds)
    installTimeout: 60000,
    
    // Auto-restart Vite after package installation
    autoRestartVite: true,
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
    baseUrl: 'http://localhost:3000',
    
    // Request timeout (milliseconds)
    requestTimeout: 30000,
    
    // Retry configuration for local requests
    maxRetries: 2,
    retryDelay: 1000, // milliseconds
    
    // Enable request logging in development
    enableLogging: process.env.NODE_ENV === 'development',
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