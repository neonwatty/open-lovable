import { promises as fs, constants } from 'node:fs';
import { join, dirname, resolve, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { viteProcessManager, type ViteProcessInfo, type ViteServerStatus } from './viteProcessManager';
import { sandboxStateManager, type SandboxInstance } from './SandboxStateManager';

export interface SandboxFile {
  content: string;
  lastModified: number;
}

export interface SandboxConfig {
  baseDir?: string;
  projectName?: string;
  maxFileSize?: number; // in bytes
  maxTotalSize?: number; // in bytes
}

export interface SandboxStats {
  sandboxId: string;
  path: string;
  createdAt: number;
  filesCount: number;
  totalSize: number;
  lastActivity: number;
}

export interface CreateSandboxResult {
  sandboxId: string;
  path: string;
  url: string | null; // Vite server URL when dev server is running
  stateInstance?: SandboxInstance; // Reference to state management instance
}

class LocalSandboxManager {
  private config: Required<SandboxConfig>;
  private activeSandboxes: Map<string, SandboxStats> = new Map();

  constructor(config: SandboxConfig = {}) {
    this.config = {
      baseDir: config.baseDir || join(tmpdir(), 'open-lovable-sandboxes'),
      projectName: config.projectName || 'sandbox-app',
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxTotalSize: config.maxTotalSize || 100 * 1024 * 1024, // 100MB
    };
  }

  /**
   * Creates a new sandbox directory with initial React/Vite setup
   */
  async createSandbox(): Promise<CreateSandboxResult> {
    const sandboxId = this.generateSandboxId();
    const sandboxPath = join(this.config.baseDir, sandboxId);
    const appPath = join(sandboxPath, 'app');

    try {
      // Create state management instance first
      const stateInstance = sandboxStateManager.createSandboxInstance({
        projectName: this.config.projectName
      });
      
      // Use the state manager's sandbox ID for consistency
      const stateSandboxId = stateInstance.sandboxId;

      // Create sandbox directory structure
      await fs.mkdir(appPath, { recursive: true });
      await fs.mkdir(join(appPath, 'src'), { recursive: true });
      await fs.mkdir(join(appPath, 'public'), { recursive: true });

      // Update state instance with path information
      stateInstance.path = appPath;
      sandboxStateManager.updateSandboxStatus(stateSandboxId, 'created');

      // Initialize sandbox stats (legacy tracking)
      const stats: SandboxStats = {
        sandboxId: stateSandboxId,
        path: sandboxPath,
        createdAt: Date.now(),
        filesCount: 0,
        totalSize: 0,
        lastActivity: Date.now(),
      };
      this.activeSandboxes.set(stateSandboxId, stats);

      // Create initial project files
      await this.setupInitialFiles(appPath);

      // Track initial files in state manager
      const initialFiles = [
        'src/App.tsx', 'src/main.tsx', 'src/index.css', 'src/App.css',
        'src/utils/cn.ts', 'src/components/ErrorBoundary.tsx', 'src/components/Header.tsx',
        'src/components/WelcomeScreen.tsx', 'index.html', 'package.json', 'vite.config.js',
        'tailwind.config.js', 'postcss.config.js', 'tsconfig.json', 'tsconfig.node.json',
        '.env.example', '.gitignore'
      ];
      
      for (const filePath of initialFiles) {
        sandboxStateManager.addTrackedFile(stateSandboxId, filePath);
      }

      console.log(`[sandboxManager] Created sandbox ${stateSandboxId} at ${sandboxPath}`);
      
      return {
        sandboxId: stateSandboxId,
        path: appPath,
        url: null, // Will be handled by dev server elsewhere
        stateInstance
      };
    } catch (error) {
      console.error(`[sandboxManager] Error creating sandbox ${sandboxId}:`, error);
      // Cleanup on error
      try {
        await this.cleanupSandbox(sandboxId);
      } catch (cleanupError) {
        console.error(`[sandboxManager] Error cleaning up failed sandbox:`, cleanupError);
      }
      throw error;
    }
  }

  /**
   * Writes content to a file in the sandbox
   */
  async writeFile(sandboxId: string, filePath: string, content: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    // Validate file size
    const contentSize = Buffer.byteLength(content, 'utf8');
    if (contentSize > this.config.maxFileSize) {
      throw new Error(`File too large: ${contentSize} bytes (max: ${this.config.maxFileSize})`);
    }

    // Normalize and validate file path
    const normalizedPath = this.normalizePath(filePath);
    const fullPath = join(sandbox.path, 'app', normalizedPath);
    
    // Ensure path is within sandbox
    if (!fullPath.startsWith(sandbox.path)) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    try {
      // Create directory if it doesn't exist
      const dir = dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content, 'utf8');

      // Update legacy stats
      sandbox.lastActivity = Date.now();
      sandbox.filesCount = await this.countFiles(join(sandbox.path, 'app'));
      sandbox.totalSize = await this.calculateTotalSize(join(sandbox.path, 'app'));

      // Check total size limit
      if (sandbox.totalSize > this.config.maxTotalSize) {
        throw new Error(`Sandbox size limit exceeded: ${sandbox.totalSize} bytes (max: ${this.config.maxTotalSize})`);
      }

      // Update state manager
      sandboxStateManager.addTrackedFile(sandboxId, normalizedPath);
      sandboxStateManager.updateFileCache(sandboxId, normalizedPath, content);

      console.log(`[sandboxManager] Wrote file ${normalizedPath} to sandbox ${sandboxId}`);
    } catch (error) {
      console.error(`[sandboxManager] Error writing file ${filePath} to sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Reads content from a file in the sandbox
   */
  async readFile(sandboxId: string, filePath: string): Promise<string> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const normalizedPath = this.normalizePath(filePath);
    const fullPath = join(sandbox.path, 'app', normalizedPath);

    // Ensure path is within sandbox
    if (!fullPath.startsWith(sandbox.path)) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      sandbox.lastActivity = Date.now();
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      console.error(`[sandboxManager] Error reading file ${filePath} from sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Deletes a file from the sandbox
   */
  async deleteFile(sandboxId: string, filePath: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const normalizedPath = this.normalizePath(filePath);
    const fullPath = join(sandbox.path, 'app', normalizedPath);

    // Ensure path is within sandbox
    if (!fullPath.startsWith(sandbox.path)) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    try {
      await fs.unlink(fullPath);
      sandbox.lastActivity = Date.now();
      sandbox.filesCount = await this.countFiles(join(sandbox.path, 'app'));
      sandbox.totalSize = await this.calculateTotalSize(join(sandbox.path, 'app'));
      console.log(`[sandboxManager] Deleted file ${normalizedPath} from sandbox ${sandboxId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      console.error(`[sandboxManager] Error deleting file ${filePath} from sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Creates a directory in the sandbox
   */
  async createDirectory(sandboxId: string, dirPath: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const normalizedPath = this.normalizePath(dirPath);
    const fullPath = join(sandbox.path, 'app', normalizedPath);

    // Ensure path is within sandbox
    if (!fullPath.startsWith(sandbox.path)) {
      throw new Error(`Invalid directory path: ${dirPath}`);
    }

    try {
      await fs.mkdir(fullPath, { recursive: true });
      sandbox.lastActivity = Date.now();
      console.log(`[sandboxManager] Created directory ${normalizedPath} in sandbox ${sandboxId}`);
    } catch (error) {
      console.error(`[sandboxManager] Error creating directory ${dirPath} in sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Lists files and directories in a sandbox path
   */
  async listFiles(sandboxId: string, dirPath: string = ''): Promise<Array<{name: string, isDirectory: boolean, size: number, lastModified: number}>> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const normalizedPath = this.normalizePath(dirPath);
    const fullPath = join(sandbox.path, 'app', normalizedPath);

    // Ensure path is within sandbox
    if (!fullPath.startsWith(sandbox.path)) {
      throw new Error(`Invalid directory path: ${dirPath}`);
    }

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const result = [];

      for (const entry of entries) {
        const entryPath = join(fullPath, entry.name);
        const stats = await fs.stat(entryPath);
        
        result.push({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          lastModified: stats.mtime.getTime(),
        });
      }

      sandbox.lastActivity = Date.now();
      return result.sort((a, b) => {
        // Directories first, then by name
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      console.error(`[sandboxManager] Error listing files in ${dirPath} from sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Cleans up a sandbox and removes all associated files
   */
  async cleanupSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      console.warn(`[sandboxManager] Sandbox ${sandboxId} not found for cleanup`);
      return;
    }

    try {
      // Stop Vite server if it's running for this sandbox
      const viteStatus = this.getViteServerStatus();
      if (viteStatus.isRunning) {
        console.log(`[sandboxManager] Stopping Vite server before cleanup`);
        await this.stopViteServer(sandboxId);
      }

      // Remove the entire sandbox directory
      await fs.rm(sandbox.path, { recursive: true, force: true });
      this.activeSandboxes.delete(sandboxId);
      
      // Clean up state manager
      sandboxStateManager.destroySandbox(sandboxId);
      
      console.log(`[sandboxManager] Cleaned up sandbox ${sandboxId}`);
    } catch (error) {
      console.error(`[sandboxManager] Error cleaning up sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Gets sandbox statistics
   */
  getSandboxStats(sandboxId: string): SandboxStats | null {
    return this.activeSandboxes.get(sandboxId) || null;
  }

  /**
   * Lists all active sandboxes
   */
  listSandboxes(): SandboxStats[] {
    return Array.from(this.activeSandboxes.values());
  }

  /**
   * Checks if a file exists in the sandbox
   */
  async fileExists(sandboxId: string, filePath: string): Promise<boolean> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return false;
    }

    const normalizedPath = this.normalizePath(filePath);
    const fullPath = join(sandbox.path, 'app', normalizedPath);

    // Ensure path is within sandbox
    if (!fullPath.startsWith(sandbox.path)) {
      return false;
    }

    try {
      await fs.access(fullPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the absolute path for a sandbox
   */
  getSandboxPath(sandboxId: string): string | null {
    const sandbox = this.activeSandboxes.get(sandboxId);
    return sandbox ? join(sandbox.path, 'app') : null;
  }

  /**
   * Starts the Vite development server for a sandbox
   */
  async startViteServer(sandboxId: string): Promise<ViteProcessInfo> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const appPath = join(sandbox.path, 'app');
    console.log(`[sandboxManager] Starting Vite server for sandbox ${sandboxId}`);

    try {
      const viteInfo = await viteProcessManager.startViteServer({
        sandboxPath: appPath,
        port: 5173, // Use default Vite port
        env: {
          NODE_ENV: 'development'
        }
      });

      // Update legacy sandbox stats
      sandbox.lastActivity = Date.now();

      // Update state manager with Vite info
      sandboxStateManager.updateViteProcessInfo(sandboxId, viteInfo);
      sandboxStateManager.updateSandboxStatus(sandboxId, 'running');

      console.log(`[sandboxManager] Vite server started for sandbox ${sandboxId} at ${viteInfo.url}`);
      return viteInfo;
    } catch (error) {
      console.error(`[sandboxManager] Failed to start Vite server for sandbox ${sandboxId}:`, error);
      
      // Update state manager with error
      sandboxStateManager.updateSandboxStatus(sandboxId, 'error', (error as Error).message);
      throw error;
    }
  }

  /**
   * Stops the Vite development server
   */
  async stopViteServer(sandboxId?: string): Promise<void> {
    console.log(`[sandboxManager] Stopping Vite server${sandboxId ? ` for sandbox ${sandboxId}` : ''}`);
    try {
      await viteProcessManager.stopViteServer();
      
      // Update state manager if sandbox ID provided
      if (sandboxId) {
        sandboxStateManager.updateViteProcessInfo(sandboxId, null);
        sandboxStateManager.updateSandboxStatus(sandboxId, 'stopped');
      }
      
      console.log(`[sandboxManager] Vite server stopped successfully`);
    } catch (error) {
      console.error(`[sandboxManager] Failed to stop Vite server:`, error);
      
      // Update state manager with error if sandbox ID provided
      if (sandboxId) {
        sandboxStateManager.updateSandboxStatus(sandboxId, 'error', (error as Error).message);
      }
      
      throw error;
    }
  }

  /**
   * Restarts the Vite development server (useful after package changes)
   */
  async restartViteServer(sandboxId?: string): Promise<ViteProcessInfo> {
    console.log(`[sandboxManager] Restarting Vite server`);
    
    try {
      // If sandboxId is provided, use that sandbox's path
      if (sandboxId) {
        const sandbox = this.activeSandboxes.get(sandboxId);
        if (!sandbox) {
          throw new Error(`Sandbox ${sandboxId} not found`);
        }

        const appPath = join(sandbox.path, 'app');
        const viteInfo = await viteProcessManager.restartViteServer({
          sandboxPath: appPath,
          port: 5173,
          env: { NODE_ENV: 'development' }
        });

        // Update sandbox stats
        sandbox.lastActivity = Date.now();
        
        console.log(`[sandboxManager] Vite server restarted for sandbox ${sandboxId}`);
        return viteInfo;
      } else {
        // Use current configuration
        const viteInfo = await viteProcessManager.restartViteServer();
        console.log(`[sandboxManager] Vite server restarted`);
        return viteInfo;
      }
    } catch (error) {
      console.error(`[sandboxManager] Failed to restart Vite server:`, error);
      throw error;
    }
  }

  /**
   * Gets the current Vite server status
   */
  getViteServerStatus(): ViteServerStatus {
    return viteProcessManager.getViteStatus();
  }

  /**
   * Gets the Vite server URL if running
   */
  getViteServerUrl(): string | null {
    return viteProcessManager.getViteUrl();
  }

  /**
   * Gets recent Vite server logs
   */
  getViteServerLogs(maxLines?: number): string[] {
    return viteProcessManager.getLogs(maxLines);
  }

  // State management integration methods

  /**
   * Gets sandbox state instance from state manager
   */
  getSandboxState(sandboxId: string): SandboxInstance | null {
    return sandboxStateManager.getSandboxInstance(sandboxId);
  }

  /**
   * Sets a global variable for a sandbox
   */
  setSandboxVariable(sandboxId: string, key: string, value: any): boolean {
    return sandboxStateManager.setSandboxVariable(sandboxId, key, value);
  }

  /**
   * Gets a global variable from a sandbox
   */
  getSandboxVariable(sandboxId: string, key: string): any {
    return sandboxStateManager.getSandboxVariable(sandboxId, key);
  }

  /**
   * Gets tracked files for a sandbox
   */
  getTrackedFiles(sandboxId: string): string[] | null {
    return sandboxStateManager.getTrackedFiles(sandboxId);
  }

  /**
   * Checks if a file is tracked in a sandbox
   */
  isFileTracked(sandboxId: string, filePath: string): boolean {
    return sandboxStateManager.isFileTracked(sandboxId, filePath);
  }

  /**
   * Gets the currently active sandbox
   */
  getActiveSandbox(): SandboxInstance | null {
    return sandboxStateManager.getActiveSandbox();
  }

  /**
   * Sets the active sandbox
   */
  setActiveSandbox(sandboxId: string): boolean {
    return sandboxStateManager.setActiveSandbox(sandboxId);
  }

  /**
   * Gets state manager statistics
   */
  getStateManagerStatistics() {
    return sandboxStateManager.getStatistics();
  }

  // Private helper methods

  private generateSandboxId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(6).toString('hex');
    return `${timestamp}-${random}`;
  }

  private normalizePath(filePath: string): string {
    // Remove leading slash and normalize
    const normalized = normalize(filePath.startsWith('/') ? filePath.substring(1) : filePath);
    
    // Prevent directory traversal
    if (normalized.includes('..') || normalized.startsWith('/')) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    return normalized;
  }

  private async countFiles(dirPath: string): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let count = 0;
      
      for (const entry of entries) {
        if (entry.isFile()) {
          count++;
        } else if (entry.isDirectory()) {
          count += await this.countFiles(join(dirPath, entry.name));
        }
      }
      
      return count;
    } catch {
      return 0;
    }
  }

  private async calculateTotalSize(dirPath: string): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let totalSize = 0;
      
      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);
        if (entry.isFile()) {
          const stats = await fs.stat(entryPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          totalSize += await this.calculateTotalSize(entryPath);
        }
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }

  private async setupInitialFiles(appPath: string): Promise<void> {
    const initialFiles = {
      'package.json': JSON.stringify({
        name: 'sandbox-app',
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite --host',
          build: 'vite build',
          preview: 'vite preview',
          lint: 'eslint . --ext js,jsx,ts,tsx --report-unused-disable-directives --max-warnings 0'
        },
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1',
          'react-router-dom': '^6.26.2',
          clsx: '^2.1.1',
          'tailwind-merge': '^2.5.4'
        },
        devDependencies: {
          '@types/react': '^18.3.12',
          '@types/react-dom': '^18.3.1',
          '@vitejs/plugin-react': '^4.3.3',
          'vite': '^5.4.10',
          'tailwindcss': '^3.4.14',
          'postcss': '^8.4.49',
          'autoprefixer': '^10.4.20',
          'eslint': '^9.15.0',
          'eslint-plugin-react-hooks': '^5.0.0',
          'eslint-plugin-react-refresh': '^0.4.14',
          'typescript': '^5.6.3'
        }
      }, null, 2),

      'vite.config.js': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local development Vite configuration optimized for Open Lovable
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: true,
    cors: true,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
})`,

      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Monaco', 'monospace']
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
}`,

      'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,

      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"]
          }
        },
        include: ["src"],
        references: [{ path: "./tsconfig.node.json" }]
      }, null, 2),

      'tsconfig.node.json': JSON.stringify({
        compilerOptions: {
          composite: true,
          skipLibCheck: true,
          module: "ESNext",
          moduleResolution: "bundler",
          allowSyntheticDefaultImports: true
        },
        include: ["vite.config.js"]
      }, null, 2),

      'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App | React + Vite + Tailwind</title>
    <meta name="description" content="A modern React application built with Vite and styled with Tailwind CSS" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,

      'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Failed to find the root element')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)`,

      'src/App.tsx': `import React, { useState, useEffect } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Header } from './components/Header'
import './App.css'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className={\`min-h-screen transition-colors duration-300 \$\{theme === 'dark' ? 'dark' : ''\}\`}>
      <div className="min-h-screen bg-background text-foreground">
        <Header theme={theme} onThemeToggle={toggleTheme} />
        <main className="container mx-auto px-4 py-8">
          <WelcomeScreen />
        </main>
      </div>
    </div>
  )
}

export default App`,

      'src/App.css': `.App {
  text-align: center;
}`,

      'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 84% 4.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.75rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 84% 4.9%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 94.1%;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    line-height: 1.5;
  }

  code {
    font-family: 'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace;
  }
}

@layer components {
  .btn {
    @apply inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50;
  }

  .btn-primary {
    @apply bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2;
  }

  .btn-secondary {
    @apply bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2;
  }

  .card {
    @apply rounded-lg border bg-card text-card-foreground shadow-sm;
  }
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}`
    };

    // Add React component files
    const componentFiles = {
      'src/components/ErrorBoundary.tsx': `import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
          <div className="card p-6 max-w-md w-full text-center">
            <div className="text-destructive mb-4 text-2xl">⚠️</div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}`,

      'src/components/Header.tsx': `import React from 'react'

interface HeaderProps {
  theme: 'light' | 'dark'
  onThemeToggle: () => void
}

export const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle }) => {
  return (
    <header className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">⚡</span>
          </div>
          <div>
            <h1 className="font-semibold text-foreground">Sandbox App</h1>
            <p className="text-xs text-muted-foreground">React + Vite + Tailwind</p>
          </div>
        </div>
        
        <button
          onClick={onThemeToggle}
          className="btn btn-secondary w-10 h-10 p-0"
          aria-label={\`Switch to \$\{theme === 'light' ? 'dark' : 'light'\} mode\`}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  )
}`,

      'src/components/WelcomeScreen.tsx': `import React, { useState } from 'react'

export const WelcomeScreen: React.FC = () => {
  const [count, setCount] = useState(0)

  return (
    <div className="text-center space-y-8 animate-fade-in">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-balance">
          Welcome to your{' '}
          <span className="text-primary">Sandbox</span>
        </h1>
        <p className="text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
          A modern React application powered by{' '}
          <span className="font-semibold text-foreground">Vite</span> and styled with{' '}
          <span className="font-semibold text-foreground">Tailwind CSS</span>.
          Start building something amazing!
        </p>
      </div>

      <div className="flex justify-center">
        <div className="card p-6 max-w-sm">
          <h3 className="font-semibold mb-4">Interactive Demo</h3>
          <div className="space-y-4">
            <div className="text-2xl font-mono">
              Count: <span className="text-primary">{count}</span>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setCount(count - 1)}
                className="btn btn-secondary"
                disabled={count <= 0}
              >
                -
              </button>
              <button
                onClick={() => setCount(count + 1)}
                className="btn btn-primary"
              >
                +
              </button>
              <button
                onClick={() => setCount(0)}
                className="btn btn-secondary"
                disabled={count === 0}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <FeatureCard
          icon="⚡"
          title="Lightning Fast"
          description="Built with Vite for instant hot module replacement and optimized builds."
        />
        <FeatureCard
          icon="🎨"
          title="Beautiful Design"
          description="Styled with Tailwind CSS and includes a complete design system."
        />
        <FeatureCard
          icon="🔧"
          title="Developer Ready"
          description="TypeScript support, ESLint configuration, and modern tooling included."
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-6 max-w-2xl mx-auto">
        <h3 className="font-semibold mb-2">Ready to start coding?</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Edit <code className="bg-muted px-1.5 py-0.5 rounded text-xs">src/App.tsx</code> to see changes in real-time.
        </p>
        <div className="flex flex-wrap gap-2 justify-center text-xs">
          <span className="bg-primary/10 text-primary px-2 py-1 rounded">React 18</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded">Vite 5</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded">TypeScript</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded">Tailwind CSS</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded">ESLint</span>
        </div>
      </div>
    </div>
  )
}

interface FeatureCardProps {
  icon: string
  title: string
  description: string
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => {
  return (
    <div className="card p-6 text-center hover:shadow-md transition-shadow">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}`,

      'src/utils/cn.ts': `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`,

      '.env.example': `# Example environment variables for the sandbox app
# Copy this to .env.local and fill in your values

# Application
VITE_APP_TITLE="My Sandbox App"
VITE_APP_DESCRIPTION="Built with React, Vite, and Tailwind CSS"

# API URLs (if needed)
# VITE_API_URL=http://localhost:3001

# Development
NODE_ENV=development`,

      '.gitignore': `# Dependencies
node_modules/

# Build outputs
dist/
build/

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Editor directories and files
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# ESLint cache
.eslintcache

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Storybook build outputs
storybook-static`
    };

    // Combine all files
    const allFiles = { ...initialFiles, ...componentFiles };

    // Write all initial files
    for (const [filePath, content] of Object.entries(allFiles)) {
      const fullPath = join(appPath, filePath);
      const dir = dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
    }
  }
}

// Singleton instance
export const sandboxManager = new LocalSandboxManager();

// Export the class for custom configurations if needed
export { LocalSandboxManager };