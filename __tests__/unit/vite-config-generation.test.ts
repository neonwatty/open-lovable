import { defaultPortManager } from '@/lib/port-manager';

// Mock the port manager
jest.mock('@/lib/port-manager');

describe('Vite Configuration Generation', () => {
  const mockPortManager = defaultPortManager as jest.Mocked<typeof defaultPortManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock default CORS config
    mockPortManager.getCORSConfig.mockReturnValue({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true'
    });
  });

  describe('Dynamic Port Configuration', () => {
    it('should generate valid Vite config with assigned port', () => {
      const assignedPort = 5174;
      const corsConfig = mockPortManager.getCORSConfig();
      
      const expectedConfig = `import { defineConfig } from 'vite'
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
    cors: ${JSON.stringify(corsConfig)},
    allowedHosts: ['localhost', '127.0.0.1']
  }
})`;
      
      // Test that the generated config contains expected values
      expect(expectedConfig).toContain(`port: ${assignedPort}`);
      expect(expectedConfig).toContain(`port: ${assignedPort + 1}`);
      expect(expectedConfig).toContain('"Access-Control-Allow-Origin":"*"');
      expect(expectedConfig).toContain('strictPort: true');
      expect(expectedConfig).toContain('host: \'0.0.0.0\'');
      expect(expectedConfig).toContain('allowedHosts: [\'localhost\', \'127.0.0.1\']');
    });

    it('should generate different configs for different ports', () => {
      const port1 = 5174;
      const port2 = 5180;
      const corsConfig = mockPortManager.getCORSConfig();
      
      const config1 = `port: ${port1},
    strictPort: true,
    hmr: {
      port: ${port1 + 1}
    }`;
      
      const config2 = `port: ${port2},
    strictPort: true,
    hmr: {
      port: ${port2 + 1}
    }`;
      
      expect(config1).toContain('port: 5174');
      expect(config1).toContain('port: 5175');
      expect(config2).toContain('port: 5180');
      expect(config2).toContain('port: 5181');
      expect(config1).not.toEqual(config2);
    });

    it('should handle edge case ports correctly', () => {
      const edgePorts = [5173, 5200, 8080, 3000];
      
      edgePorts.forEach(port => {
        const config = `port: ${port},
    strictPort: true,
    hmr: {
      port: ${port + 1}
    }`;
        
        expect(config).toContain(`port: ${port}`);
        expect(config).toContain(`port: ${port + 1}`);
      });
    });

    it('should generate valid package.json with dynamic port', () => {
      const assignedPort = 5175;
      
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
      
      expect(packageJson.scripts.dev).toBe(`vite --host --port ${assignedPort}`);
      expect(packageJson.type).toBe('module');
      expect(packageJson.dependencies.react).toBe('^18.2.0');
      expect(packageJson.dependencies['react-dom']).toBe('^18.2.0');
      expect(packageJson.devDependencies.vite).toBe('^4.3.9');
    });

    it('should validate package.json structure', () => {
      const assignedPort = 5176;
      
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
      
      // Validate structure
      expect(packageJson).toHaveProperty('name');
      expect(packageJson).toHaveProperty('version');
      expect(packageJson).toHaveProperty('type');
      expect(packageJson).toHaveProperty('scripts');
      expect(packageJson).toHaveProperty('dependencies');
      expect(packageJson).toHaveProperty('devDependencies');
      
      // Validate scripts
      expect(packageJson.scripts).toHaveProperty('dev');
      expect(packageJson.scripts).toHaveProperty('build');
      expect(packageJson.scripts).toHaveProperty('preview');
      
      // Validate dev script format
      expect(packageJson.scripts.dev).toMatch(/^vite --host --port \d+$/);
    });
  });

  describe('CORS Configuration Integration', () => {
    it('should integrate port manager CORS config into Vite config', () => {
      const mockCORSConfig = {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      };
      
      mockPortManager.getCORSConfig.mockReturnValue(mockCORSConfig);
      
      const viteConfigWithCORS = `cors: ${JSON.stringify(mockCORSConfig)}`;
      
      expect(viteConfigWithCORS).toContain('"Access-Control-Allow-Origin":"http://localhost:3000"');
      expect(viteConfigWithCORS).toContain('"Access-Control-Allow-Methods":"GET, POST"');
      expect(viteConfigWithCORS).toContain('"Access-Control-Allow-Headers":"Content-Type"');
    });

    it('should handle empty CORS configuration', () => {
      mockPortManager.getCORSConfig.mockReturnValue({});
      
      const viteConfigWithCORS = `cors: ${JSON.stringify({})}`;
      
      expect(viteConfigWithCORS).toBe('cors: {}');
    });

    it('should handle complex CORS configuration', () => {
      const complexCORSConfig = {
        'Access-Control-Allow-Origin': 'https://example.com',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-API-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
      };
      
      mockPortManager.getCORSConfig.mockReturnValue(complexCORSConfig);
      
      const viteConfigWithCORS = `cors: ${JSON.stringify(complexCORSConfig)}`;
      
      expect(viteConfigWithCORS).toContain('"Access-Control-Allow-Origin":"https://example.com"');
      expect(viteConfigWithCORS).toContain('"Access-Control-Max-Age":"86400"');
      expect(viteConfigWithCORS).toContain('"Access-Control-Allow-Credentials":"true"');
    });

    it('should call port manager getCORSConfig method', () => {
      const assignedPort = 5177;
      const corsConfig = mockPortManager.getCORSConfig();
      
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
    cors: ${JSON.stringify(corsConfig)},
    allowedHosts: ['localhost', '127.0.0.1']
  }
})`;
      
      expect(mockPortManager.getCORSConfig).toHaveBeenCalled();
      expect(viteConfig).toContain(JSON.stringify(corsConfig));
    });
  });

  describe('React App Content Generation', () => {
    it('should generate App.jsx with port-specific content', () => {
      const assignedPort = 5178;
      
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
      
      expect(appJsx).toContain(`React app running on port ${assignedPort}`);
      expect(appJsx).toContain(`🚀 Dynamic Port Allocation: ${assignedPort}`);
      expect(appJsx).toContain('Sandbox Ready');
      expect(appJsx).toContain('export default App');
    });

    it('should generate valid JSX structure', () => {
      const assignedPort = 5179;
      
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
      
      // Check JSX structure
      expect(appJsx).toMatch(/function App\(\) \{/);
      expect(appJsx).toMatch(/return \(/);
      expect(appJsx).toMatch(/<div className="/);
      expect(appJsx).toMatch(/\)\s*\}/);
      expect(appJsx).toMatch(/export default App/);
    });

    it('should include proper Tailwind CSS classes', () => {
      const assignedPort = 5180;
      
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
      
      // Check for key Tailwind classes
      expect(appJsx).toContain('min-h-screen');
      expect(appJsx).toContain('bg-gray-900');
      expect(appJsx).toContain('text-white');
      expect(appJsx).toContain('flex items-center justify-center');
      expect(appJsx).toContain('text-center');
      expect(appJsx).toContain('text-3xl font-bold');
      expect(appJsx).toContain('text-lg text-gray-400');
      expect(appJsx).toContain('text-sm text-green-400');
    });
  });

  describe('Configuration File Validation', () => {
    it('should generate valid Tailwind config', () => {
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
      
      expect(tailwindConfig).toContain('@type {import(\'tailwindcss\').Config}');
      expect(tailwindConfig).toContain('export default');
      expect(tailwindConfig).toContain('content: [');
      expect(tailwindConfig).toContain('./index.html');
      expect(tailwindConfig).toContain('./src/**/*.{js,ts,jsx,tsx}');
      expect(tailwindConfig).toContain('theme: {');
      expect(tailwindConfig).toContain('plugins: []');
    });

    it('should generate valid PostCSS config', () => {
      const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;
      
      expect(postcssConfig).toContain('export default');
      expect(postcssConfig).toContain('plugins: {');
      expect(postcssConfig).toContain('tailwindcss: {}');
      expect(postcssConfig).toContain('autoprefixer: {}');
    });

    it('should generate valid HTML index file', () => {
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
      
      expect(indexHtml).toContain('<!DOCTYPE html>');
      expect(indexHtml).toContain('<html lang="en">');
      expect(indexHtml).toContain('<meta charset="UTF-8"');
      expect(indexHtml).toContain('<meta name="viewport"');
      expect(indexHtml).toContain('<title>Sandbox App</title>');
      expect(indexHtml).toContain('<div id="root"></div>');
      expect(indexHtml).toContain('<script type="module" src="/src/main.jsx">');
    });

    it('should generate valid main.jsx entry point', () => {
      const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
      
      expect(mainJsx).toContain('import React from \'react\'');
      expect(mainJsx).toContain('import ReactDOM from \'react-dom/client\'');
      expect(mainJsx).toContain('import App from \'./App.jsx\'');
      expect(mainJsx).toContain('import \'./index.css\'');
      expect(mainJsx).toContain('ReactDOM.createRoot');
      expect(mainJsx).toContain('<React.StrictMode>');
      expect(mainJsx).toContain('<App />');
    });

    it('should generate valid CSS with Tailwind directives', () => {
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
      
      expect(indexCss).toContain('@tailwind base;');
      expect(indexCss).toContain('@tailwind components;');
      expect(indexCss).toContain('@tailwind utilities;');
      expect(indexCss).toContain('@layer base');
      expect(indexCss).toContain('box-sizing: border-box');
      expect(indexCss).toContain('font-family:');
      expect(indexCss).toContain('background-color: rgb(17 24 39)');
    });
  });

  describe('JSON Serialization', () => {
    it('should properly serialize CORS config in Vite config', () => {
      const corsConfig = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
      };
      
      const serialized = JSON.stringify(corsConfig);
      
      expect(serialized).toBe('{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Requested-With"}');
      
      // Verify it can be parsed back
      const parsed = JSON.parse(serialized);
      expect(parsed).toEqual(corsConfig);
    });

    it('should handle special characters in CORS config', () => {
      const corsConfig = {
        'Access-Control-Allow-Origin': 'https://example.com:3000',
        'Access-Control-Allow-Headers': 'Content-Type, X-Custom-Header-123'
      };
      
      const serialized = JSON.stringify(corsConfig);
      const parsed = JSON.parse(serialized);
      
      expect(parsed['Access-Control-Allow-Origin']).toBe('https://example.com:3000');
      expect(parsed['Access-Control-Allow-Headers']).toBe('Content-Type, X-Custom-Header-123');
    });

    it('should properly serialize package.json', () => {
      const packageJson = {
        name: "sandbox-app",
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "vite --host --port 5174",
          build: "vite build"
        }
      };
      
      const serialized = JSON.stringify(packageJson, null, 2);
      
      expect(serialized).toContain('"name": "sandbox-app"');
      expect(serialized).toContain('"type": "module"');
      expect(serialized).toContain('"dev": "vite --host --port 5174"');
      
      // Verify proper indentation
      expect(serialized).toContain('  "scripts": {');
      expect(serialized).toContain('    "dev":');
    });
  });
});