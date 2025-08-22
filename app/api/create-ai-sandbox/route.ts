import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { appConfig } from '@/config/app.config';
import { defaultPortManager } from '@/lib/port-manager';
import { defaultSandboxManager } from '@/lib/sandbox-manager';
import { processCleanupManager } from '@/lib/process-cleanup-manager';

// Store active sandbox globally

export async function POST() {
  let sandboxInfo: any = null;
  let portReservation: any = null;
  let viteProcess: any = null;

  try {
    console.log('[create-ai-sandbox] Creating local sandbox...');
    
    // Clean up existing sandbox if any
    if (global.activeSandbox) {
      console.log('[create-ai-sandbox] Cleaning up existing sandbox...');
      try {
        if (global.viteProcess) {
          global.viteProcess.kill('SIGTERM');
          global.viteProcess = null;
        }
        
        // Release port if allocated
        const existingSandboxId = global.activeSandbox.id;
        if (existingSandboxId) {
          await defaultPortManager.releasePort(existingSandboxId);
        }
        
        global.activeSandbox = null;
      } catch (e) {
        console.error('Failed to cleanup existing sandbox:', e);
      }
    }
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    } else {
      global.existingFiles = new Set<string>();
    }

    // Create local sandbox directory
    console.log('[create-ai-sandbox] Creating local sandbox directory...');
    sandboxInfo = await defaultSandboxManager.createSandbox();
    const sandboxId = sandboxInfo.id;
    const sandboxPath = sandboxInfo.path;
    
    console.log(`[create-ai-sandbox] Sandbox created: ${sandboxId} at ${sandboxPath}`);

    // Reserve a port dynamically using PortManager
    console.log('[create-ai-sandbox] Reserving port for Vite server...');
    portReservation = await defaultPortManager.reservePort(sandboxId);
    const assignedPort = portReservation.port;
    const sandboxUrl = portReservation.url;
    
    console.log(`[create-ai-sandbox] Port reserved: ${assignedPort} (${sandboxUrl})`);

    // Set up a basic Vite React app using Node.js file operations
    console.log('[create-ai-sandbox] Setting up Vite React app...');
    
    // Create directory structure
    const srcDir = path.join(sandboxPath, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    
    // Package.json with dynamic port configuration
    const packageJson = {
      name: "sandbox-app",
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: `vite --host --port ${assignedPort}`,
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.0.0",
        "vite": "^4.3.9",
        "tailwindcss": "^3.3.0",
        "postcss": "^8.4.31",
        "autoprefixer": "^10.4.16"
      }
    };
    
    await fs.writeFile(
      path.join(sandboxPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf8'
    );
    console.log('✓ package.json');

    // Vite config with dynamic port and CORS configuration  
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local development Vite configuration with dynamic port
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${assignedPort},
    strictPort: true,
    hmr: {
      port: ${assignedPort + 1}
    },
    cors: ${JSON.stringify(defaultPortManager.getCORSConfig())},
    allowedHosts: ['localhost', '127.0.0.1']
  }
})`;

    await fs.writeFile(
      path.join(sandboxPath, 'vite.config.js'),
      viteConfig,
      'utf8'
    );
    console.log('✓ vite.config.js');

    // Tailwind config
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

    await fs.writeFile(
      path.join(sandboxPath, 'tailwind.config.js'),
      tailwindConfig,
      'utf8'
    );
    console.log('✓ tailwind.config.js');

    // PostCSS config
    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

    await fs.writeFile(
      path.join(sandboxPath, 'postcss.config.js'),
      postcssConfig,
      'utf8'
    );
    console.log('✓ postcss.config.js');

    // Index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;

    await fs.writeFile(
      path.join(sandboxPath, 'index.html'),
      indexHtml,
      'utf8'
    );
    console.log('✓ index.html');

    // Main.jsx
    const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;

    await fs.writeFile(
      path.join(srcDir, 'main.jsx'),
      mainJsx,
      'utf8'
    );
    console.log('✓ src/main.jsx');

    // App.jsx
    const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-3xl font-bold mb-4">Sandbox Ready</h1>
        <p className="text-lg text-gray-400">
          React app running on port ${assignedPort}<br/>
          Start building with Vite and Tailwind CSS!
        </p>
        <div className="mt-6 text-sm text-green-400">
          🚀 Dynamic Port Allocation: ${assignedPort}
        </div>
      </div>
    </div>
  )
}

export default App`;

    await fs.writeFile(
      path.join(srcDir, 'App.jsx'),
      appJsx,
      'utf8'
    );
    console.log('✓ src/App.jsx');

    // Index.css
    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`;

    await fs.writeFile(
      path.join(srcDir, 'index.css'),
      indexCss,
      'utf8'
    );
    console.log('✓ src/index.css');

    console.log('\\nAll files created successfully!');

    // Install dependencies using local npm
    console.log('[create-ai-sandbox] Installing dependencies...');
    const npmInstallPromise = new Promise<void>((resolve) => {
      const npmInstall = spawn('npm', ['install'], {
        cwd: sandboxPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'development'
        }
      });

      npmInstall.stdout?.on('data', (data) => {
        console.log(`[npm-install] ${data.toString().trim()}`);
      });

      npmInstall.stderr?.on('data', (data) => {
        console.log(`[npm-install] ${data.toString().trim()}`);
      });

      npmInstall.on('close', (code) => {
        if (code === 0) {
          console.log('✓ Dependencies installed successfully');
          resolve();
        } else {
          console.warn(`⚠ npm install exited with code ${code}, continuing anyway`);
          resolve(); // Continue even if npm install has issues
        }
      });

      npmInstall.on('error', (error) => {
        console.warn(`⚠ npm install error: ${error.message}, continuing anyway`);
        resolve(); // Continue even if npm install fails
      });
      
      // Timeout after 60 seconds
      setTimeout(() => {
        npmInstall.kill('SIGTERM');
        console.warn('⚠ npm install timeout, continuing anyway');
        resolve();
      }, 60000);
    });

    await npmInstallPromise;
    
    // Start Vite dev server with dynamic port
    console.log(`[create-ai-sandbox] Starting Vite dev server on port ${assignedPort}...`);
    
    viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: sandboxPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        FORCE_COLOR: '0',
        PORT: assignedPort.toString()
      },
      detached: false
    });

    if (!viteProcess.pid) {
      throw new Error('Failed to start Vite process');
    }

    console.log(`[create-ai-sandbox] Vite dev server started with PID: ${viteProcess.pid}`);

    // Store process PID and register with cleanup manager
    try {
      await fs.writeFile('/tmp/vite-process.pid', viteProcess.pid.toString());
      global.viteProcess = viteProcess;
      
      // Register with process cleanup manager
      const managedProcess = processCleanupManager.registerProcess(
        `vite-server-${sandboxId}`,
        viteProcess,
        'npm',
        ['run', 'dev'],
        sandboxPath,
        'vite',
        { 
          port: assignedPort,
          sandboxId,
          url: sandboxUrl
        }
      );
      
      console.log(`[create-ai-sandbox] Process registered with cleanup manager: ${managedProcess.id}`);
    } catch (error) {
      console.error('[create-ai-sandbox] Failed to store PID or register process:', error);
    }

    // Set up process monitoring
    viteProcess.stdout?.on('data', (data) => {
      console.log(`[vite-stdout] ${data.toString().trim()}`);
    });

    viteProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[vite-stderr] ${output}`);
    });

    viteProcess.on('exit', (code, signal) => {
      console.log(`[create-ai-sandbox] Vite process exited with code ${code}, signal ${signal}`);
      global.viteProcess = null;
    });

    viteProcess.on('error', (error) => {
      console.error('[create-ai-sandbox] Vite process error:', error);
      global.viteProcess = null;
    });
    
    // Activate the port in PortManager
    await defaultPortManager.activatePort(sandboxId);
    
    // Wait for Vite to be fully ready
    await new Promise(resolve => setTimeout(resolve, appConfig.sandbox.viteStartupDelay));

    // Store sandbox globally for compatibility
    global.activeSandbox = {
      id: sandboxId,
      path: sandboxPath,
      port: assignedPort,
      url: sandboxUrl,
      process: viteProcess,
      created: new Date()
    };
    
    global.sandboxData = {
      sandboxId,
      url: sandboxUrl,
      port: assignedPort
    };
    
    // Initialize sandbox state for compatibility
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId
      },
      sandbox: {
        id: sandboxId,
        path: sandboxPath,
        port: assignedPort,
        url: sandboxUrl
      },
      sandboxData: {
        sandboxId,
        url: sandboxUrl,
        port: assignedPort
      }
    };
    
    // Track initial files
    global.existingFiles.add('src/App.jsx');
    global.existingFiles.add('src/main.jsx');
    global.existingFiles.add('src/index.css');
    global.existingFiles.add('index.html');
    global.existingFiles.add('package.json');
    global.existingFiles.add('vite.config.js');
    global.existingFiles.add('tailwind.config.js');
    global.existingFiles.add('postcss.config.js');
    
    console.log(`[create-ai-sandbox] Sandbox ready at: ${sandboxUrl}`);
    console.log(`[create-ai-sandbox] Port Manager Stats:`, defaultPortManager.getStats());
    
    return NextResponse.json({
      success: true,
      sandboxId,
      url: sandboxUrl,
      port: assignedPort,
      path: sandboxPath,
      message: `Local sandbox created with dynamic port allocation (${assignedPort})`,
      stats: {
        portManager: defaultPortManager.getStats(),
        sandbox: await defaultSandboxManager.getStats()
      }
    });

  } catch (error) {
    console.error('[create-ai-sandbox] Error:', error);
    
    // Clean up on error
    try {
      // Kill Vite process if started
      if (viteProcess) {
        viteProcess.kill('SIGTERM');
        global.viteProcess = null;
      }
      
      // Release port if reserved
      if (portReservation && sandboxInfo) {
        await defaultPortManager.releasePort(sandboxInfo.id);
      }
      
      // Clean up sandbox directory if created
      if (sandboxInfo) {
        await defaultSandboxManager.deleteSandbox(sandboxInfo.id);
      }
      
      global.activeSandbox = null;
    } catch (cleanupError) {
      console.error('Failed to cleanup on error:', cleanupError);
    }
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create local sandbox',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}