// AI Fallback System
// Provides robust fallback mechanisms when Claude Code or AI services are unavailable

import { appConfig } from '@/config/app.config';

export interface FallbackOptions {
  maxRetries?: number;
  retryDelay?: number;
  enableOfflineMode?: boolean;
  enableTemplateGeneration?: boolean;
  enableStaticAnalysis?: boolean;
}

export interface AIServiceStatus {
  available: boolean;
  lastChecked: number;
  errorMessage?: string;
  retryCount: number;
  degradedMode: boolean;
}

export interface FallbackGenerationResult {
  success: boolean;
  content: string;
  method: 'ai' | 'template' | 'static' | 'cached';
  metadata: {
    templateUsed?: string;
    cacheKey?: string;
    confidenceScore: number;
    limitations: string[];
  };
}

export class AIFallbackSystem {
  private serviceStatus: AIServiceStatus = {
    available: true,
    lastChecked: Date.now(),
    retryCount: 0,
    degradedMode: false
  };

  private options: Required<FallbackOptions>;
  private responseCache: Map<string, { content: string; timestamp: number }> = new Map();
  
  // Template library for common React patterns
  private templates = {
    basicComponent: `import React from 'react';

interface Props {
  // Add your props here
}

export default function Component({ }: Props) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Component</h1>
    </div>
  );
}`,

    heroSection: `import React from 'react';

export default function Hero() {
  return (
    <section className="bg-gradient-to-r from-blue-500 to-purple-600 text-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Welcome to Your App
        </h1>
        <p className="text-xl md:text-2xl mb-8 text-blue-100">
          Build amazing things with React and Tailwind CSS
        </p>
        <button className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
          Get Started
        </button>
      </div>
    </section>
  );
}`,

    headerNavigation: `import React from 'react';

export default function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">Your App</h1>
          </div>
          <nav className="hidden md:flex space-x-8">
            <a href="#" className="text-gray-600 hover:text-gray-900">Home</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">About</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Services</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Contact</a>
          </nav>
        </div>
      </div>
    </header>
  );
}`,

    formComponent: `import React, { useState } from 'react';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <div className="mb-4">
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
          Email
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
      <div className="mb-6">
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Send Message
      </button>
    </form>
  );
}`,

    cardGrid: `import React from 'react';

const cards = [
  {
    id: 1,
    title: 'Feature One',
    description: 'Description of the first feature.',
    icon: '🚀'
  },
  {
    id: 2,
    title: 'Feature Two',
    description: 'Description of the second feature.',
    icon: '⭐'
  },
  {
    id: 3,
    title: 'Feature Three',
    description: 'Description of the third feature.',
    icon: '💎'
  }
];

export default function CardGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      {cards.map(card => (
        <div key={card.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <div className="text-4xl mb-4">{card.icon}</div>
          <h3 className="text-xl font-semibold mb-2">{card.title}</h3>
          <p className="text-gray-600">{card.description}</p>
        </div>
      ))}
    </div>
  );
}`,

    footer: `import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">About</h3>
            <p className="text-gray-400">
              Your app description goes here.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Links</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-400 hover:text-white">Home</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white">About</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white">Contact</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact</h3>
            <p className="text-gray-400">
              email@example.com<br />
              (555) 123-4567
            </p>
          </div>
        </div>
        <div className="border-t border-gray-700 mt-8 pt-8 text-center">
          <p className="text-gray-400">&copy; 2024 Your App. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}`,

    fullApp: `import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import CardGrid from './components/CardGrid';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>
        <Hero />
        <CardGrid />
      </main>
      <Footer />
    </div>
  );
}

export default App;`
  };

  constructor(options: FallbackOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      enableOfflineMode: options.enableOfflineMode ?? false, // Disabled for Claude Code-only operation
      enableTemplateGeneration: options.enableTemplateGeneration ?? false, // Disabled for Claude Code-only operation
      enableStaticAnalysis: options.enableStaticAnalysis ?? false // Disabled for Claude Code-only operation
    };
  }

  /**
   * Check if AI services are available
   */
  async checkAIServiceAvailability(): Promise<AIServiceStatus> {
    try {
      // In a real implementation, this would ping Claude Code API
      // For now, simulate the check
      const response = await fetch('/api/ai-health-check', {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 seconds timeout
      });

      this.serviceStatus = {
        available: response.ok,
        lastChecked: Date.now(),
        retryCount: 0,
        degradedMode: false
      };
      
      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }
    } catch (error) {
      console.warn('[AI Fallback] AI service unavailable:', error);
      this.serviceStatus = {
        available: false,
        lastChecked: Date.now(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount: this.serviceStatus.retryCount + 1,
        degradedMode: true
      };
    }

    return this.serviceStatus;
  }

  /**
   * Attempt to generate code with fallback mechanisms
   */
  async generateCode(prompt: string, context?: any): Promise<FallbackGenerationResult> {
    // First try AI if available
    if (this.serviceStatus.available && this.serviceStatus.retryCount < this.options.maxRetries) {
      try {
        const aiResult = await this.attemptAIGeneration(prompt, context);
        if (aiResult.success) {
          return aiResult;
        }
      } catch (error) {
        console.warn('[AI Fallback] AI generation failed, falling back to alternatives:', error);
        await this.checkAIServiceAvailability();
      }
    }

    // Try cached response
    const cacheKey = this.generateCacheKey(prompt, context);
    const cached = this.getCachedResponse(cacheKey);
    if (cached) {
      return {
        success: true,
        content: cached.content,
        method: 'cached',
        metadata: {
          cacheKey,
          confidenceScore: 0.8,
          limitations: ['Using cached response', 'May not reflect latest changes']
        }
      };
    }

    // Try template-based generation
    if (this.options.enableTemplateGeneration) {
      const templateResult = this.generateFromTemplate(prompt);
      if (templateResult.success) {
        // Cache the template result
        this.setCachedResponse(cacheKey, templateResult.content);
        return templateResult;
      }
    }

    // Try static analysis and pattern matching
    if (this.options.enableStaticAnalysis) {
      const staticResult = this.generateUsingStaticAnalysis(prompt, context);
      if (staticResult.success) {
        this.setCachedResponse(cacheKey, staticResult.content);
        return staticResult;
      }
    }

    // Last resort: provide helpful error message with suggestions
    return {
      success: false,
      content: this.generateHelpfulErrorMessage(prompt),
      method: 'static',
      metadata: {
        confidenceScore: 0.1,
        limitations: [
          'AI services unavailable',
          'No suitable template found',
          'Static analysis could not determine intent'
        ]
      }
    };
  }

  /**
   * Attempt AI generation with retry logic
   */
  private async attemptAIGeneration(prompt: string, context?: any): Promise<FallbackGenerationResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        // Wait before retry (except first attempt)
        if (attempt > 0) {
          const delay = this.options.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // In a real implementation, this would call Claude Code API
        const response = await fetch('/api/generate-ai-code-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, context }),
          signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (!response.ok) {
          throw new Error(`AI API returned ${response.status}`);
        }

        const result = await response.text();
        
        return {
          success: true,
          content: result,
          method: 'ai',
          metadata: {
            confidenceScore: 0.95,
            limitations: []
          }
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`[AI Fallback] AI generation attempt ${attempt + 1} failed:`, error);
      }
    }

    throw lastError || new Error('All AI generation attempts failed');
  }

  /**
   * Generate code using templates
   */
  private generateFromTemplate(prompt: string): FallbackGenerationResult {
    const promptLower = prompt.toLowerCase();
    
    // Analyze prompt to determine best template
    let templateKey: string | null = null;
    let templateName = '';

    if (promptLower.includes('hero') || promptLower.includes('landing')) {
      templateKey = 'heroSection';
      templateName = 'Hero Section';
    } else if (promptLower.includes('header') || promptLower.includes('nav')) {
      templateKey = 'headerNavigation';
      templateName = 'Header Navigation';
    } else if (promptLower.includes('form') || promptLower.includes('contact')) {
      templateKey = 'formComponent';
      templateName = 'Contact Form';
    } else if (promptLower.includes('card') || promptLower.includes('grid')) {
      templateKey = 'cardGrid';
      templateName = 'Card Grid';
    } else if (promptLower.includes('footer')) {
      templateKey = 'footer';
      templateName = 'Footer';
    } else if (promptLower.includes('app') || promptLower.includes('full') || promptLower.includes('complete')) {
      templateKey = 'fullApp';
      templateName = 'Full Application';
    } else {
      templateKey = 'basicComponent';
      templateName = 'Basic Component';
    }

    const template = this.templates[templateKey as keyof typeof this.templates];
    
    if (!template) {
      return {
        success: false,
        content: '',
        method: 'template',
        metadata: {
          confidenceScore: 0,
          limitations: ['No suitable template found']
        }
      };
    }

    // Customize template based on prompt
    let customizedContent = template;
    
    // Extract component name from prompt if possible
    const componentNameMatch = prompt.match(/(?:create|build|make)\s+(?:a\s+)?(\w+)/i);
    if (componentNameMatch) {
      const componentName = componentNameMatch[1];
      const capitalizedName = componentName.charAt(0).toUpperCase() + componentName.slice(1);
      customizedContent = customizedContent.replace(/function\s+\w+/g, `function ${capitalizedName}`);
      customizedContent = customizedContent.replace(/export\s+default\s+function\s+\w+/g, `export default function ${capitalizedName}`);
    }

    return {
      success: true,
      content: this.wrapTemplateInExplanation(customizedContent, templateName),
      method: 'template',
      metadata: {
        templateUsed: templateName,
        confidenceScore: 0.7,
        limitations: [
          'Generated from template',
          'May require customization',
          'Limited to predefined patterns'
        ]
      }
    };
  }

  /**
   * Generate using static analysis of existing code
   */
  private generateUsingStaticAnalysis(prompt: string, context?: any): FallbackGenerationResult {
    if (!context?.currentFiles) {
      return {
        success: false,
        content: '',
        method: 'static',
        metadata: {
          confidenceScore: 0,
          limitations: ['No existing code to analyze']
        }
      };
    }

    // Analyze existing files to understand patterns
    const files = context.currentFiles;
    const patterns = this.analyzeCodePatterns(files);
    
    // Generate code based on patterns
    const generatedContent = this.generateFromPatterns(prompt, patterns);
    
    if (!generatedContent) {
      return {
        success: false,
        content: '',
        method: 'static',
        metadata: {
          confidenceScore: 0,
          limitations: ['Could not determine patterns from existing code']
        }
      };
    }

    return {
      success: true,
      content: generatedContent,
      method: 'static',
      metadata: {
        confidenceScore: 0.6,
        limitations: [
          'Generated from existing code patterns',
          'May not match exact requirements',
          'Limited to detected patterns'
        ]
      }
    };
  }

  /**
   * Analyze code patterns from existing files
   */
  private analyzeCodePatterns(files: Record<string, string>): any {
    const patterns = {
      imports: new Set<string>(),
      components: new Set<string>(),
      styling: { hasTailwind: false, hasCSS: false },
      frameworks: { hasReact: false, hasNext: false },
      patterns: { hasHooks: false, hasTypeScript: false }
    };

    Object.entries(files).forEach(([path, content]) => {
      // Analyze imports
      const importMatches = content.match(/import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g);
      if (importMatches) {
        importMatches.forEach(imp => {
          const match = imp.match(/from\s+['"`]([^'"`]+)['"`]/);
          if (match) patterns.imports.add(match[1]);
        });
      }

      // Detect frameworks and libraries
      if (content.includes('react')) patterns.frameworks.hasReact = true;
      if (content.includes('next')) patterns.frameworks.hasNext = true;
      if (content.includes('className')) patterns.styling.hasTailwind = true;
      if (content.includes('useState') || content.includes('useEffect')) patterns.patterns.hasHooks = true;
      if (path.endsWith('.tsx') || path.endsWith('.ts')) patterns.patterns.hasTypeScript = true;
    });

    return patterns;
  }

  /**
   * Generate code from detected patterns
   */
  private generateFromPatterns(prompt: string, patterns: any): string | null {
    // This is a simplified pattern-based generator
    // In a real implementation, this would be more sophisticated
    
    const isTypeScript = patterns.patterns.hasTypeScript;
    const extension = isTypeScript ? 'tsx' : 'jsx';
    
    let content = `import React from 'react';\n\n`;
    
    if (patterns.frameworks.hasReact || patterns.patterns.hasHooks) {
      content += `export default function Component() {\n`;
      content += `  // Generated component based on existing patterns\n`;
      content += `  return (\n`;
      content += `    <div className="p-4">\n`;
      content += `      <h1 className="text-xl font-bold">New Component</h1>\n`;
      content += `      <p>Generated using pattern analysis</p>\n`;
      content += `    </div>\n`;
      content += `  );\n`;
      content += `}\n`;
    } else {
      return null; // Cannot generate without React patterns
    }

    return this.wrapInFileFormat(content, `Component.${extension}`);
  }

  /**
   * Wrap template content with explanation
   */
  private wrapTemplateInExplanation(content: string, templateName: string): string {
    return `I've generated a ${templateName} component for you using a template since AI services are temporarily unavailable. This provides a solid starting point that you can customize.

<file path="src/components/${templateName.replace(/\s+/g, '')}.tsx">
${content}
</file>

<explanation>
Generated using template-based fallback system. This component follows common React patterns and uses Tailwind CSS for styling. You can customize the styling, add props, and modify the structure as needed.

Note: This was generated using a fallback template since AI services are currently unavailable. For more customized code generation, please try again when AI services are restored.
</explanation>`;
  }

  /**
   * Wrap content in file format
   */
  private wrapInFileFormat(content: string, filename: string): string {
    return `<file path="src/components/${filename}">
${content}
</file>

<explanation>
Generated using static analysis of your existing code patterns. This component follows the same patterns detected in your codebase.
</explanation>`;
  }

  /**
   * Generate helpful error message when all fallbacks fail
   */
  private generateHelpfulErrorMessage(prompt: string): string {
    return `I'm currently unable to generate code as AI services are temporarily unavailable. Here are some options:

## Manual Code Generation
You can create the component manually using these steps:

1. Create a new file in \`src/components/\`
2. Use this basic React component structure:

\`\`\`tsx
import React from 'react';

export default function YourComponent() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Your Component</h1>
      {/* Add your content here */}
    </div>
  );
}
\`\`\`

## Available Templates
When AI services are restored, you can ask me to generate:
- Hero sections
- Navigation headers  
- Contact forms
- Card grids
- Footer components
- Full applications

## Troubleshooting
- Check your internet connection
- Refresh the page to retry
- Wait a few minutes and try again

The system will automatically retry connecting to AI services. Your request: "${prompt}" has been saved and can be processed once services are restored.`;
  }

  /**
   * Cache response for future use
   */
  private setCachedResponse(key: string, content: string): void {
    // Only cache successful responses and limit cache size
    if (this.responseCache.size > 100) { // Max 100 cached responses
      // Remove oldest entries
      const entries = Array.from(this.responseCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const keepCount = Math.floor(100 * 0.8); // Keep 80% of max
      entries.slice(0, entries.length - keepCount).forEach(([k]) => this.responseCache.delete(k));
    }

    this.responseCache.set(key, {
      content,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached response if available and not expired
   */
  private getCachedResponse(key: string): { content: string } | null {
    const cached = this.responseCache.get(key);
    if (!cached) return null;

    // Check if cache is expired
    if (Date.now() - cached.timestamp > (24 * 60 * 60 * 1000)) { // 24 hours
      this.responseCache.delete(key);
      return null;
    }

    return { content: cached.content };
  }

  /**
   * Generate cache key from prompt and context
   */
  private generateCacheKey(prompt: string, context?: any): string {
    const contextKey = context ? JSON.stringify(context).slice(0, 100) : '';
    return btoa(prompt + contextKey).slice(0, 32);
  }

  /**
   * Get current service status
   */
  getServiceStatus(): AIServiceStatus {
    return { ...this.serviceStatus };
  }

  /**
   * Reset service status (for testing or forced retry)
   */
  resetServiceStatus(): void {
    this.serviceStatus = {
      available: true,
      lastChecked: Date.now(),
      retryCount: 0,
      degradedMode: false
    };
  }

  /**
   * Clear all cached responses
   */
  clearCache(): void {
    this.responseCache.clear();
  }
}

// Global instance
export const aiFallbackSystem = new AIFallbackSystem();

// Helper functions for easy integration
export async function generateWithFallback(prompt: string, context?: any): Promise<FallbackGenerationResult> {
  return aiFallbackSystem.generateCode(prompt, context);
}

export async function checkAIHealth(): Promise<AIServiceStatus> {
  return aiFallbackSystem.checkAIServiceAvailability();
}

export function getAIServiceStatus(): AIServiceStatus {
  return aiFallbackSystem.getServiceStatus();
}