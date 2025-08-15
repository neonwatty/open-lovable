import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { TemplateGenerator } from '../template-generator';

describe('TemplateGenerator Integration Tests', () => {
  let templateGenerator: TemplateGenerator;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-integration-'));
    // Use the real templates directory
    templateGenerator = new TemplateGenerator();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  });

  describe('Real Template Generation', () => {
    it('should generate a project using real template files', async () => {
      const config = {
        projectName: 'real-template-test',
        port: 5173,
        targetDirectory: tempDir
      };

      await templateGenerator.generateProject(config);

      // Verify all expected files exist
      const expectedFiles = [
        'package.json',
        'index.html',
        'vite.config.js',
        'tailwind.config.js',
        'postcss.config.js',
        'src/main.jsx',
        'src/App.jsx',
        'src/index.css'
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(tempDir, file);
        await expect(fs.access(filePath)).resolves.not.toThrow();
      }

      // Verify content was processed correctly
      const packageJson = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf8'));
      expect(packageJson.name).toBe('real-template-test');

      const indexHtml = await fs.readFile(path.join(tempDir, 'index.html'), 'utf8');
      expect(indexHtml).toContain('<title>real-template-test</title>');

      const viteConfig = await fs.readFile(path.join(tempDir, 'vite.config.js'), 'utf8');
      expect(viteConfig).toContain('port: 5173');

      const appContent = await fs.readFile(path.join(tempDir, 'src/App.jsx'), 'utf8');
      expect(appContent).toContain('Welcome to real-template-test');
    });

    it('should generate valid package.json with correct dependencies', async () => {
      const config = {
        projectName: 'deps-test',
        port: 3000,
        targetDirectory: tempDir
      };

      await templateGenerator.generateProject(config);

      const packageJson = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf8'));

      // Check required dependencies
      expect(packageJson.dependencies.react).toBeDefined();
      expect(packageJson.dependencies['react-dom']).toBeDefined();

      // Check dev dependencies
      expect(packageJson.devDependencies.vite).toBeDefined();
      expect(packageJson.devDependencies['@vitejs/plugin-react']).toBeDefined();
      expect(packageJson.devDependencies.tailwindcss).toBeDefined();
      expect(packageJson.devDependencies.autoprefixer).toBeDefined();
      expect(packageJson.devDependencies.postcss).toBeDefined();

      // Check scripts
      expect(packageJson.scripts.dev).toBe('vite');
      expect(packageJson.scripts.build).toBe('vite build');
    });

    it('should generate valid configuration files', async () => {
      const config = {
        projectName: 'config-test',
        port: 4000,
        targetDirectory: tempDir
      };

      await templateGenerator.generateProject(config);

      // Check vite.config.js
      const viteConfig = await fs.readFile(path.join(tempDir, 'vite.config.js'), 'utf8');
      expect(viteConfig).toContain('import react from \'@vitejs/plugin-react\'');
      expect(viteConfig).toContain('port: 4000');

      // Check tailwind.config.js
      const tailwindConfig = await fs.readFile(path.join(tempDir, 'tailwind.config.js'), 'utf8');
      expect(tailwindConfig).toContain('content: [');
      expect(tailwindConfig).toContain('./src/**/*.{js,ts,jsx,tsx}');

      // Check postcss.config.js
      const postcssConfig = await fs.readFile(path.join(tempDir, 'postcss.config.js'), 'utf8');
      expect(postcssConfig).toContain('tailwindcss: {}');
      expect(postcssConfig).toContain('autoprefixer: {}');
    });

    it('should generate valid React component structure', async () => {
      const config = {
        projectName: 'component-test',
        port: 5173,
        targetDirectory: tempDir
      };

      await templateGenerator.generateProject(config);

      // Check main.jsx
      const mainContent = await fs.readFile(path.join(tempDir, 'src/main.jsx'), 'utf8');
      expect(mainContent).toContain('import React from \'react\'');
      expect(mainContent).toContain('import ReactDOM from \'react-dom/client\'');
      expect(mainContent).toContain('import App from \'./App.jsx\'');
      expect(mainContent).toContain('ReactDOM.createRoot');

      // Check App.jsx
      const appContent = await fs.readFile(path.join(tempDir, 'src/App.jsx'), 'utf8');
      expect(appContent).toContain('function App()');
      expect(appContent).toContain('export default App');
      expect(appContent).toContain('Welcome to component-test');

      // Check index.css
      const cssContent = await fs.readFile(path.join(tempDir, 'src/index.css'), 'utf8');
      expect(cssContent).toContain('@tailwind base');
      expect(cssContent).toContain('@tailwind components');
      expect(cssContent).toContain('@tailwind utilities');
    });

    it('should handle different project names and ports correctly', async () => {
      const configs = [
        { projectName: 'my-app', port: 3000 },
        { projectName: 'another-project', port: 8080 },
        { projectName: 'test-123', port: 9000 }
      ];

      for (const [index, config] of configs.entries()) {
        const projectDir = path.join(tempDir, `project-${index}`);
        
        await templateGenerator.generateProject({
          ...config,
          targetDirectory: projectDir
        });

        const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
        expect(packageJson.name).toBe(config.projectName);

        const viteConfig = await fs.readFile(path.join(projectDir, 'vite.config.js'), 'utf8');
        expect(viteConfig).toContain(`port: ${config.port}`);

        const appContent = await fs.readFile(path.join(projectDir, 'src/App.jsx'), 'utf8');
        expect(appContent).toContain(`Welcome to ${config.projectName}`);
      }
    });
  });

  describe('Template Information', () => {
    it('should provide accurate template information', async () => {
      const templateInfo = await templateGenerator.getTemplateInfo('react-vite');

      expect(templateInfo.name).toBe('react-vite');
      expect(templateInfo.description).toContain('react-vite');
      expect(templateInfo.files.length).toBeGreaterThan(5);
      
      // Check that important files are included
      expect(templateInfo.files).toContain('package.json');
      expect(templateInfo.files).toContain('src/App.jsx');
      expect(templateInfo.files).toContain('src/main.jsx');
      
      // Check dependencies
      expect(templateInfo.dependencies.react).toBeDefined();
      expect(templateInfo.dependencies['react-dom']).toBeDefined();
      
      // Check dev dependencies
      expect(templateInfo.devDependencies.vite).toBeDefined();
      expect(templateInfo.devDependencies.tailwindcss).toBeDefined();
    });

    it('should list available templates', async () => {
      const templates = await templateGenerator.listTemplates();
      expect(templates).toContain('react-vite');
      expect(Array.isArray(templates)).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing template directory gracefully', async () => {
      const invalidGenerator = new TemplateGenerator('/nonexistent/templates/path');
      
      const config = {
        projectName: 'error-test',
        port: 3000,
        targetDirectory: tempDir
      };

      await expect(invalidGenerator.generateProject(config)).rejects.toThrow(
        'Template directory not found'
      );
    });

    it('should validate generated projects correctly', async () => {
      const config = {
        projectName: 'validation-test',
        port: 3000,
        targetDirectory: tempDir
      };

      // This should not throw since our real templates are valid
      await expect(templateGenerator.generateProject(config)).resolves.not.toThrow();
      
      // Double-check that validation actually ran by verifying all files exist
      const requiredFiles = [
        'package.json',
        'index.html',
        'src/main.jsx',
        'src/App.jsx',
        'src/index.css',
        'vite.config.js',
        'tailwind.config.js',
        'postcss.config.js'
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(tempDir, file);
        await expect(fs.access(filePath)).resolves.not.toThrow();
      }
    });
  });
});