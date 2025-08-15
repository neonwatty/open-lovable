import { promises as fs } from 'fs';
import path from 'path';

export interface TemplateConfig {
  projectName: string;
  port: number;
  targetDirectory: string;
  templateName?: string;
}

export interface TemplateInfo {
  name: string;
  description: string;
  files: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export class TemplateGenerator {
  private templatesDir: string;
  private supportedTemplates: Set<string> = new Set(['react-vite']);

  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir || path.join(process.cwd(), 'templates');
  }

  async generateProject(config: TemplateConfig): Promise<void> {
    const templateName = config.templateName || 'react-vite';
    
    if (!this.supportedTemplates.has(templateName)) {
      throw new Error(`Unsupported template: ${templateName}. Supported templates: ${Array.from(this.supportedTemplates).join(', ')}`);
    }

    const templatePath = path.join(this.templatesDir, templateName);
    
    // Validate template exists
    await this.validateTemplate(templatePath);
    
    // Create target directory
    await fs.mkdir(config.targetDirectory, { recursive: true });
    
    // Copy and process template files
    await this.copyTemplateFiles(templatePath, config.targetDirectory, config);
    
    // Generate package.json with dynamic versions
    await this.generatePackageJson(templatePath, config);
    
    // Validate generated project
    await this.validateGeneratedProject(config.targetDirectory);
  }

  async getTemplateInfo(templateName: string): Promise<TemplateInfo> {
    if (!this.supportedTemplates.has(templateName)) {
      throw new Error(`Unsupported template: ${templateName}`);
    }

    const templatePath = path.join(this.templatesDir, templateName);
    await this.validateTemplate(templatePath);

    const files = await this.getTemplateFiles(templatePath);
    const packageJsonPath = path.join(templatePath, 'package.json');
    
    let dependencies = {};
    let devDependencies = {};
    let description = `${templateName} project template`;

    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageContent);
      dependencies = packageJson.dependencies || {};
      devDependencies = packageJson.devDependencies || {};
      description = packageJson.description || description;
    } catch (error) {
      console.warn(`Could not read package.json from template ${templateName}:`, error);
    }

    return {
      name: templateName,
      description,
      files,
      dependencies,
      devDependencies
    };
  }

  async listTemplates(): Promise<string[]> {
    return Array.from(this.supportedTemplates);
  }

  private async validateTemplate(templatePath: string): Promise<void> {
    try {
      await fs.access(templatePath);
    } catch (error) {
      throw new Error(`Template directory not found: ${templatePath}`);
    }

    // Check required files
    const requiredFiles = [
      'package.json',
      'index.html',
      'src/main.jsx',
      'src/App.jsx',
      'src/index.css'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(templatePath, file);
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`Required template file missing: ${file}`);
      }
    }
  }

  private async copyTemplateFiles(
    templatePath: string, 
    targetPath: string, 
    config: TemplateConfig
  ): Promise<void> {
    const files = await this.getTemplateFiles(templatePath);
    
    for (const file of files) {
      if (file === 'package.json') {
        // Package.json is handled separately
        continue;
      }

      const sourcePath = path.join(templatePath, file);
      const targetFilePath = path.join(targetPath, file);
      
      // Create directory if it doesn't exist
      const targetDir = path.dirname(targetFilePath);
      await fs.mkdir(targetDir, { recursive: true });
      
      // Read and process template
      const content = await fs.readFile(sourcePath, 'utf8');
      const processedContent = this.processTemplate(content, config);
      
      // Write processed content
      await fs.writeFile(targetFilePath, processedContent, 'utf8');
    }
  }

  private async generatePackageJson(templatePath: string, config: TemplateConfig): Promise<void> {
    const templatePackageJsonPath = path.join(templatePath, 'package.json');
    const templateContent = await fs.readFile(templatePackageJsonPath, 'utf8');
    
    let packageJson;
    try {
      packageJson = JSON.parse(templateContent);
    } catch (error) {
      throw new Error(`Invalid package.json in template: ${(error as Error).message}`);
    }

    // Process package.json with template variables
    const processedContent = this.processTemplate(templateContent, config);
    const processedPackageJson = JSON.parse(processedContent);

    // Update with latest compatible versions (simplified - in production you'd fetch from npm registry)
    const latestVersions = await this.getLatestVersions(processedPackageJson);
    
    // Merge with latest versions
    if (latestVersions.dependencies) {
      processedPackageJson.dependencies = { ...processedPackageJson.dependencies, ...latestVersions.dependencies };
    }
    if (latestVersions.devDependencies) {
      processedPackageJson.devDependencies = { ...processedPackageJson.devDependencies, ...latestVersions.devDependencies };
    }

    // Write the processed package.json
    const targetPackageJsonPath = path.join(config.targetDirectory, 'package.json');
    await fs.writeFile(
      targetPackageJsonPath, 
      JSON.stringify(processedPackageJson, null, 2), 
      'utf8'
    );
  }

  private async getLatestVersions(packageJson: any): Promise<{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }> {
    // Simplified version mapping - in production, you'd query npm registry
    const versionMap: Record<string, string> = {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      '@types/react': '^18.2.56',
      '@types/react-dom': '^18.2.19',
      '@vitejs/plugin-react': '^4.2.1',
      'eslint': '^8.56.0',
      'eslint-plugin-react': '^7.33.2',
      'eslint-plugin-react-hooks': '^4.6.0',
      'eslint-plugin-react-refresh': '^0.4.5',
      'vite': '^5.1.4',
      'autoprefixer': '^10.4.18',
      'postcss': '^8.4.35',
      'tailwindcss': '^3.4.1'
    };

    const result: { dependencies?: Record<string, string>, devDependencies?: Record<string, string> } = {};

    if (packageJson.dependencies) {
      result.dependencies = {};
      for (const dep of Object.keys(packageJson.dependencies)) {
        result.dependencies[dep] = versionMap[dep] || packageJson.dependencies[dep];
      }
    }

    if (packageJson.devDependencies) {
      result.devDependencies = {};
      for (const dep of Object.keys(packageJson.devDependencies)) {
        result.devDependencies[dep] = versionMap[dep] || packageJson.devDependencies[dep];
      }
    }

    return result;
  }

  private processTemplate(content: string, config: TemplateConfig): string {
    let processed = content;
    
    // Replace template variables
    processed = processed.replace(/\{\{projectName\}\}/g, config.projectName);
    processed = processed.replace(/\{\{port\}\}/g, config.port.toString());
    
    return processed;
  }

  private async getTemplateFiles(templatePath: string): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dir: string, relativePath: string = ''): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativeFilePath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relativeFilePath);
        } else {
          files.push(relativeFilePath);
        }
      }
    };
    
    await scanDirectory(templatePath);
    return files;
  }

  private async validateGeneratedProject(projectPath: string): Promise<void> {
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
      const filePath = path.join(projectPath, file);
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`Generated project is missing required file: ${file}`);
      }
    }

    // Validate package.json structure
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(content);
      
      if (!packageJson.name || !packageJson.scripts || !packageJson.dependencies) {
        throw new Error('Generated package.json is missing required fields');
      }
      
      if (!packageJson.scripts.dev || !packageJson.scripts.build) {
        throw new Error('Generated package.json is missing required scripts');
      }
      
    } catch (error) {
      if ((error as Error).message.includes('required')) {
        throw error;
      }
      throw new Error(`Generated package.json is invalid: ${(error as Error).message}`);
    }
  }

  // Method to add new templates (for extensibility)
  addTemplate(templateName: string): void {
    this.supportedTemplates.add(templateName);
  }

  // Method to get supported templates
  getSupportedTemplates(): string[] {
    return Array.from(this.supportedTemplates);
  }
}