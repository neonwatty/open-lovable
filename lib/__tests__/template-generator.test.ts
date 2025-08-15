import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { TemplateGenerator, TemplateConfig } from '../template-generator';

describe('TemplateGenerator', () => {
  let templateGenerator: TemplateGenerator;
  let tempDir: string;
  let templateDir: string;
  let targetDir: string;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-test-'));
    templateDir = path.join(tempDir, 'templates');
    targetDir = path.join(tempDir, 'target');
    
    templateGenerator = new TemplateGenerator(templateDir);
    
    // Create a mock template structure
    await createMockTemplate();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  });

  async function createMockTemplate() {
    const reactViteTemplateDir = path.join(templateDir, 'react-vite');
    await fs.mkdir(path.join(reactViteTemplateDir, 'src'), { recursive: true });

    // Create mock template files
    const templateFiles = {
      'package.json': JSON.stringify({
        name: '{{projectName}}',
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build'
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        },
        devDependencies: {
          vite: '^5.1.4',
          '@vitejs/plugin-react': '^4.2.1',
          tailwindcss: '^3.4.1'
        }
      }, null, 2),
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <title>{{projectName}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
      'vite.config.js': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: {{port}},
  },
})`,
      'tailwind.config.js': `export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
}`,
      'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      'src/main.jsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
      'src/App.jsx': `function App() {
  return (
    <div>
      <h1>Welcome to {{projectName}}</h1>
    </div>
  )
}

export default App`,
      'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`
    };

    for (const [filePath, content] of Object.entries(templateFiles)) {
      const fullPath = path.join(reactViteTemplateDir, filePath);
      await fs.writeFile(fullPath, content, 'utf8');
    }
  }

  describe('constructor', () => {
    it('should use default templates directory when none provided', () => {
      const defaultGenerator = new TemplateGenerator();
      expect(defaultGenerator).toBeInstanceOf(TemplateGenerator);
    });

    it('should use provided templates directory', () => {
      const customGenerator = new TemplateGenerator('/custom/templates');
      expect(customGenerator).toBeInstanceOf(TemplateGenerator);
    });
  });

  describe('generateProject', () => {
    it('should generate a complete React + Vite project', async () => {
      const config: TemplateConfig = {
        projectName: 'test-project',
        port: 3000,
        targetDirectory: targetDir,
        templateName: 'react-vite'
      };

      await templateGenerator.generateProject(config);

      // Verify all required files exist
      const requiredFiles = [
        'package.json',
        'index.html',
        'vite.config.js',
        'tailwind.config.js',
        'postcss.config.js',
        'src/main.jsx',
        'src/App.jsx',
        'src/index.css'
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(targetDir, file);
        await expect(fs.access(filePath)).resolves.not.toThrow();
      }
    });

    it('should process template variables correctly', async () => {
      const config: TemplateConfig = {
        projectName: 'my-awesome-app',
        port: 4000,
        targetDirectory: targetDir
      };

      await templateGenerator.generateProject(config);

      // Check package.json
      const packageJsonContent = await fs.readFile(path.join(targetDir, 'package.json'), 'utf8');
      const packageJson = JSON.parse(packageJsonContent);
      expect(packageJson.name).toBe('my-awesome-app');

      // Check index.html
      const indexHtmlContent = await fs.readFile(path.join(targetDir, 'index.html'), 'utf8');
      expect(indexHtmlContent).toContain('<title>my-awesome-app</title>');

      // Check vite.config.js
      const viteConfigContent = await fs.readFile(path.join(targetDir, 'vite.config.js'), 'utf8');
      expect(viteConfigContent).toContain('port: 4000');

      // Check App.jsx
      const appContent = await fs.readFile(path.join(targetDir, 'src/App.jsx'), 'utf8');
      expect(appContent).toContain('Welcome to my-awesome-app');
    });

    it('should use react-vite template by default', async () => {
      const config: TemplateConfig = {
        projectName: 'default-template-test',
        port: 3000,
        targetDirectory: targetDir
        // No templateName specified
      };

      await templateGenerator.generateProject(config);

      // Should generate react-vite project structure
      const packageJsonContent = await fs.readFile(path.join(targetDir, 'package.json'), 'utf8');
      const packageJson = JSON.parse(packageJsonContent);
      expect(packageJson.dependencies.react).toBeDefined();
      expect(packageJson.devDependencies.vite).toBeDefined();
    });

    it('should throw error for unsupported template', async () => {
      const config: TemplateConfig = {
        projectName: 'test-project',
        port: 3000,
        targetDirectory: targetDir,
        templateName: 'unsupported-template'
      };

      await expect(templateGenerator.generateProject(config)).rejects.toThrow(
        'Unsupported template: unsupported-template'
      );
    });

    it('should create target directory if it does not exist', async () => {
      const nonExistentDir = path.join(tempDir, 'nested', 'target', 'dir');
      const config: TemplateConfig = {
        projectName: 'test-project',
        port: 3000,
        targetDirectory: nonExistentDir
      };

      await templateGenerator.generateProject(config);

      // Verify directory was created and project files exist
      const packageJsonPath = path.join(nonExistentDir, 'package.json');
      await expect(fs.access(packageJsonPath)).resolves.not.toThrow();
    });
  });

  describe('getTemplateInfo', () => {
    it('should return template information', async () => {
      const templateInfo = await templateGenerator.getTemplateInfo('react-vite');

      expect(templateInfo.name).toBe('react-vite');
      expect(templateInfo.description).toContain('react-vite');
      expect(templateInfo.files).toBeInstanceOf(Array);
      expect(templateInfo.files.length).toBeGreaterThan(0);
      expect(templateInfo.dependencies).toHaveProperty('react');
      expect(templateInfo.devDependencies).toHaveProperty('vite');
    });

    it('should throw error for unsupported template', async () => {
      await expect(templateGenerator.getTemplateInfo('invalid-template')).rejects.toThrow(
        'Unsupported template: invalid-template'
      );
    });

    it('should handle missing package.json gracefully', async () => {
      // Create a template without package.json
      const invalidTemplateDir = path.join(templateDir, 'invalid-template');
      await fs.mkdir(path.join(invalidTemplateDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(invalidTemplateDir, 'index.html'), '<html></html>', 'utf8');
      await fs.writeFile(path.join(invalidTemplateDir, 'src/main.jsx'), 'console.log("test")', 'utf8');
      await fs.writeFile(path.join(invalidTemplateDir, 'src/App.jsx'), 'export default function App() {}', 'utf8');
      await fs.writeFile(path.join(invalidTemplateDir, 'src/index.css'), 'body {}', 'utf8');

      templateGenerator.addTemplate('invalid-template');

      // Should throw error for missing package.json since it's required
      await expect(templateGenerator.getTemplateInfo('invalid-template')).rejects.toThrow(
        'Required template file missing: package.json'
      );
    });
  });

  describe('listTemplates', () => {
    it('should return list of supported templates', async () => {
      const templates = await templateGenerator.listTemplates();
      expect(templates).toContain('react-vite');
      expect(Array.isArray(templates)).toBe(true);
    });
  });

  describe('template validation', () => {
    it('should validate template directory exists', async () => {
      const invalidGenerator = new TemplateGenerator('/nonexistent/path');
      const config: TemplateConfig = {
        projectName: 'test-project',
        port: 3000,
        targetDirectory: targetDir
      };

      await expect(invalidGenerator.generateProject(config)).rejects.toThrow(
        'Template directory not found'
      );
    });

    it('should validate required template files exist', async () => {
      // Create incomplete template
      const incompleteTemplateDir = path.join(templateDir, 'incomplete-template');
      await fs.mkdir(incompleteTemplateDir, { recursive: true });
      await fs.writeFile(path.join(incompleteTemplateDir, 'package.json'), '{}', 'utf8');
      // Missing other required files

      templateGenerator.addTemplate('incomplete-template');

      const config: TemplateConfig = {
        projectName: 'test-project',
        port: 3000,
        targetDirectory: targetDir,
        templateName: 'incomplete-template'
      };

      await expect(templateGenerator.generateProject(config)).rejects.toThrow(
        'Required template file missing'
      );
    });
  });

  describe('generated project validation', () => {
    it('should validate generated project has all required files', async () => {
      const config: TemplateConfig = {
        projectName: 'validation-test',
        port: 3000,
        targetDirectory: targetDir
      };

      await templateGenerator.generateProject(config);

      // This should not throw since validation is part of generateProject
      expect(true).toBe(true);
    });

    it('should validate package.json structure', async () => {
      const config: TemplateConfig = {
        projectName: 'package-validation-test',
        port: 3000,
        targetDirectory: targetDir
      };

      await templateGenerator.generateProject(config);

      const packageJsonContent = await fs.readFile(path.join(targetDir, 'package.json'), 'utf8');
      const packageJson = JSON.parse(packageJsonContent);

      expect(packageJson.name).toBeDefined();
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.dev).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.dependencies).toBeDefined();
    });
  });

  describe('extensibility', () => {
    it('should allow adding new templates', () => {
      templateGenerator.addTemplate('custom-template');
      const supportedTemplates = templateGenerator.getSupportedTemplates();
      expect(supportedTemplates).toContain('custom-template');
    });

    it('should return current supported templates', () => {
      const templates = templateGenerator.getSupportedTemplates();
      expect(templates).toContain('react-vite');
      expect(Array.isArray(templates)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle file write errors gracefully', async () => {
      // Try to write to a read-only directory (this may not work on all systems)
      const readOnlyDir = path.join(tempDir, 'readonly');
      await fs.mkdir(readOnlyDir);
      
      try {
        await fs.chmod(readOnlyDir, 0o444); // Read-only
      } catch {
        // Skip this test if chmod is not supported
        return;
      }

      const config: TemplateConfig = {
        projectName: 'readonly-test',
        port: 3000,
        targetDirectory: readOnlyDir
      };

      await expect(templateGenerator.generateProject(config)).rejects.toThrow();
    });

    it('should handle invalid JSON in template files', async () => {
      // Create template with invalid package.json
      const invalidJsonTemplateDir = path.join(templateDir, 'invalid-json-template');
      await fs.mkdir(path.join(invalidJsonTemplateDir, 'src'), { recursive: true });
      
      const templateFiles = {
        'package.json': '{ invalid json }', // Invalid JSON
        'index.html': '<html></html>',
        'src/main.jsx': 'console.log("test")',
        'src/App.jsx': 'export default function App() {}',
        'src/index.css': 'body {}'
      };

      for (const [filePath, content] of Object.entries(templateFiles)) {
        const fullPath = path.join(invalidJsonTemplateDir, filePath);
        await fs.writeFile(fullPath, content, 'utf8');
      }

      templateGenerator.addTemplate('invalid-json-template');

      const config: TemplateConfig = {
        projectName: 'invalid-json-test',
        port: 3000,
        targetDirectory: targetDir,
        templateName: 'invalid-json-template'
      };

      await expect(templateGenerator.generateProject(config)).rejects.toThrow(
        'Invalid package.json in template'
      );
    });
  });

  describe('template processing', () => {
    it('should handle multiple template variables in the same file', async () => {
      // Create a template file with multiple variables
      const multiVarTemplateDir = path.join(templateDir, 'multi-var-template');
      await fs.mkdir(path.join(multiVarTemplateDir, 'src'), { recursive: true });
      
      const configFileContent = `
export const config = {
  name: "{{projectName}}",
  port: {{port}},
  title: "Welcome to {{projectName}}",
  devServer: "http://localhost:{{port}}"
};`;

      const templateFiles = {
        'package.json': JSON.stringify({ name: '{{projectName}}', version: '1.0.0', scripts: { dev: 'echo', build: 'echo' }, dependencies: {}, devDependencies: {} }),
        'index.html': '<html><title>{{projectName}}</title></html>',
        'vite.config.js': 'export default { server: { port: {{port}} } }',
        'tailwind.config.js': 'export default { content: [] }',
        'postcss.config.js': 'export default { plugins: {} }',
        'src/main.jsx': 'console.log("{{projectName}}")',
        'src/App.jsx': 'export default function App() { return <div>{{projectName}}</div>; }',
        'src/index.css': 'body {}',
        'src/config.js': configFileContent
      };

      for (const [filePath, content] of Object.entries(templateFiles)) {
        const fullPath = path.join(multiVarTemplateDir, filePath);
        await fs.writeFile(fullPath, content, 'utf8');
      }

      templateGenerator.addTemplate('multi-var-template');

      const config: TemplateConfig = {
        projectName: 'multi-var-test',
        port: 8080,
        targetDirectory: targetDir,
        templateName: 'multi-var-template'
      };

      await templateGenerator.generateProject(config);

      const configContent = await fs.readFile(path.join(targetDir, 'src/config.js'), 'utf8');
      expect(configContent).toContain('name: "multi-var-test"');
      expect(configContent).toContain('port: 8080');
      expect(configContent).toContain('title: "Welcome to multi-var-test"');
      expect(configContent).toContain('devServer: "http://localhost:8080"');
    });

    it('should handle files without template variables', async () => {
      const config: TemplateConfig = {
        projectName: 'no-vars-test',
        port: 3000,
        targetDirectory: targetDir
      };

      await templateGenerator.generateProject(config);

      // CSS file should remain unchanged (no template variables)
      const cssContent = await fs.readFile(path.join(targetDir, 'src/index.css'), 'utf8');
      expect(cssContent).toContain('@tailwind base');
      expect(cssContent).not.toContain('{{');
    });
  });
});