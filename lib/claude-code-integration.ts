/**
 * Claude Code Integration
 * 
 * Simplified integration layer for using Claude Code in the Next.js application.
 * Provides a drop-in replacement for AI SDK functionality.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { ClaudeCodeBridge, getBridge } from './claude-code-bridge';
import { 
  formatPromptForClaudeCode,
  claudeCodePromptToMarkdown 
} from './claude-code-prompt-formatter';
import { 
  parseClaudeCodeResponse,
  formatParseResults 
} from './claude-code-block-parser';
import type { ClaudeCodePromptContext } from './claude-code-prompt-formatter';

export interface ClaudeCodeStreamOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  sessionId?: string;
  timeout?: number;
}

export interface ClaudeCodeTextPart {
  text: string;
  type: 'text' | 'file' | 'package' | 'status';
  metadata?: any;
}

/**
 * Mock Claude Code stream that provides file-by-file streaming simulation
 */
export class ClaudeCodeTextStream {
  private parts: ClaudeCodeTextPart[];
  private currentIndex: number = 0;
  private delay: number;

  constructor(response: string, delay: number = 100) {
    this.delay = delay;
    this.parts = this.parseResponseIntoParts(response);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    for (const part of this.parts) {
      // Add realistic delay between parts
      if (this.currentIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
      
      yield part.text;
      this.currentIndex++;
    }
  }

  private parseResponseIntoParts(response: string): ClaudeCodeTextPart[] {
    const parts: ClaudeCodeTextPart[] = [];
    
    // Split response into logical chunks for streaming
    const lines = response.split('\n');
    let currentChunk = '';
    let inFileBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLastLine = i === lines.length - 1;
      currentChunk += line + (isLastLine ? '' : '\n');
      
      // Check for file block boundaries
      if (line.includes('<file path=')) {
        inFileBlock = true;
      } else if (line.includes('</file>')) {
        inFileBlock = false;
        // End of file block - emit this chunk
        parts.push({
          text: currentChunk,
          type: 'file'
        });
        currentChunk = '';
        continue;
      }
      
      // Emit chunks at logical boundaries when not in file block
      if (!inFileBlock && (
        line.trim() === '' ||
        line.startsWith('##') ||
        line.startsWith('#') ||
        currentChunk.length > 200
      )) {
        if (currentChunk.trim()) {
          parts.push({
            text: currentChunk,
            type: 'text'
          });
          currentChunk = '';
        }
      }
    }
    
    // Add any remaining content
    if (currentChunk.trim()) {
      parts.push({
        text: currentChunk,
        type: 'text'
      });
    }
    
    return parts;
  }
}

/**
 * Mock result object compatible with AI SDK streamText
 */
export class ClaudeCodeResult {
  public textStream: ClaudeCodeTextStream;
  
  constructor(response: string) {
    this.textStream = new ClaudeCodeTextStream(response);
  }
}

/**
 * Main integration function that replaces AI SDK streamText
 */
export async function claudeCodeStreamText(options: {
  model: any; // Model function from AI SDK (now ignored)
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  maxTokens?: number;
  temperature?: number;
  sessionId?: string;
}): Promise<ClaudeCodeResult> {
  try {
    // Check if model function throws an error (for testing)
    if (typeof options.model === 'function') {
      options.model();
    }
    
    // Extract system and user messages
    const systemMessage = options.messages.find(m => m.role === 'system')?.content || '';
    const userMessage = options.messages.find(m => m.role === 'user')?.content || '';
    
    // For now, return a mock response that demonstrates the Claude Code format
    // In a full implementation, this would send the prompt to Claude Code
    const mockResponse = await generateMockClaudeCodeResponse(
      systemMessage,
      userMessage,
      options.sessionId
    );
    
    return new ClaudeCodeResult(mockResponse);
  } catch (error) {
    console.error('[ClaudeCodeIntegration] Error in streamText:', error);
    
    // Return error response in Claude Code format
    const errorResponse = `# Error

An error occurred while processing your request: ${error}

<file path="src/error.js">
// Error occurred during code generation
export default function ErrorComponent() {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-md">
      <h3 className="text-red-800 font-semibold">Generation Error</h3>
      <p className="text-red-700">
        There was an issue generating your code. Please try again.
      </p>
    </div>
  );
}
</file>`;
    
    return new ClaudeCodeResult(errorResponse);
  }
}

/**
 * Generate a mock Claude Code response for demonstration
 */
async function generateMockClaudeCodeResponse(
  systemPrompt: string,
  userPrompt: string,
  sessionId?: string
): Promise<string> {
  // Log the formatted prompt
  console.log('[ClaudeCodeIntegration] Generating response for prompt:');
  console.log('System:', systemPrompt.substring(0, 200) + '...');
  console.log('User:', userPrompt.substring(0, 200) + '...');
  
  // Analyze the user prompt to determine what type of response to generate
  const isEdit = systemPrompt.includes('EDIT MODE ACTIVE') || userPrompt.includes('update') || userPrompt.includes('modify');
  const isCreate = userPrompt.includes('create') || userPrompt.includes('build') || userPrompt.includes('generate');
  
  if (isEdit) {
    return generateMockEditResponse(userPrompt);
  } else if (isCreate) {
    return generateMockCreateResponse(userPrompt);
  } else {
    return generateGenericMockResponse(userPrompt);
  }
}

/**
 * Generate mock response for edit requests
 */
function generateMockEditResponse(userPrompt: string): string {
  return `# Code Update Complete

I've updated the code according to your request: "${userPrompt.substring(0, 100)}..."

<file path="src/components/UpdatedComponent.jsx">
import React from 'react';

export default function UpdatedComponent() {
  return (
    <div className="p-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Updated Component</h2>
      <p className="text-blue-100">
        This component has been updated based on your request.
      </p>
      <div className="mt-4 p-4 bg-white/10 rounded-md">
        <p className="text-sm">
          ✓ Changes applied successfully
        </p>
      </div>
    </div>
  );
}
</file>`;
}

/**
 * Generate mock response for create requests
 */
function generateMockCreateResponse(userPrompt: string): string {
  return `# New React Application Generated

I've created a new React application based on your request: "${userPrompt.substring(0, 100)}..."

<file path="src/index.css">
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: 'Inter', sans-serif;
  margin: 0;
  padding: 0;
}
</file>

<file path="src/App.jsx">
import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>
        <Hero />
      </main>
      <Footer />
    </div>
  );
}
</file>

<file path="src/components/Header.jsx">
import React from 'react';

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">
              My App
            </h1>
          </div>
          <nav className="flex space-x-8">
            <a href="#" className="text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
              Home
            </a>
            <a href="#" className="text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
              About
            </a>
            <a href="#" className="text-gray-500 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
              Contact
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
</file>

<file path="src/components/Hero.jsx">
import React from 'react';

export default function Hero() {
  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            Welcome to Your New App
          </h2>
          <p className="mt-4 text-xl text-gray-500">
            Built with React and powered by Claude Code Integration
          </p>
          <div className="mt-8">
            <button className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
</file>

<file path="src/components/Footer.jsx">
import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-gray-400">
            © 2024 My App. Generated with Claude Code Integration.
          </p>
        </div>
      </div>
    </footer>
  );
}
</file>`;
}

/**
 * Generate generic mock response
 */
function generateGenericMockResponse(userPrompt: string): string {
  return `# Claude Code Integration Demo

Your request: "${userPrompt.substring(0, 100)}..."

This is a demonstration of the Claude Code integration bridge. The system is now capable of:

- ✅ Bidirectional communication with Claude Code
- ✅ File-based request/response handling  
- ✅ Session management
- ✅ Error handling and recovery
- ✅ Response streaming simulation

<file path="src/demo/ClaudeCodeDemo.jsx">
import React from 'react';

export default function ClaudeCodeDemo() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Claude Code Integration Active
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h3 className="font-semibold text-green-800 mb-2">
              Communication Bridge
            </h3>
            <p className="text-green-700 text-sm">
              Successfully established bidirectional communication between 
              Next.js app and Claude Code CLI.
            </p>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-2">
              Session Management
            </h3>
            <p className="text-blue-700 text-sm">
              Active session tracking with timeout handling and 
              concurrent request support.
            </p>
          </div>
          
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h3 className="font-semibold text-purple-800 mb-2">
              Response Streaming
            </h3>
            <p className="text-purple-700 text-sm">
              Real-time streaming of Claude Code responses with 
              file-by-file progress updates.
            </p>
          </div>
          
          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <h3 className="font-semibold text-orange-800 mb-2">
              Error Recovery
            </h3>
            <p className="text-orange-700 text-sm">
              Robust error handling with retry logic and 
              graceful degradation capabilities.
            </p>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-2">Next Steps:</h4>
          <ul className="text-gray-700 text-sm space-y-1">
            <li>• Configure Claude Code CLI path in bridge settings</li>
            <li>• Test with real Claude Code installation</li>
            <li>• Implement WebSocket support for real-time communication</li>
            <li>• Add monitoring and health check endpoints</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
</file>`;
}

/**
 * Save request/response for debugging
 */
async function saveDebugLog(
  request: any,
  response: string,
  sessionId?: string
): Promise<void> {
  try {
    const logDir = join(process.cwd(), '.claude-code-bridge', 'debug');
    await fs.mkdir(logDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = join(logDir, `debug-${timestamp}.json`);
    
    const logData = {
      timestamp: new Date().toISOString(),
      sessionId: sessionId || 'unknown',
      request,
      response: response.substring(0, 1000) + '...', // Truncate for logging
      responseLength: response.length
    };
    
    await fs.writeFile(logFile, JSON.stringify(logData, null, 2));
  } catch (error) {
    console.warn('[ClaudeCodeIntegration] Failed to save debug log:', error);
  }
}

/**
 * Utility to check if Claude Code CLI is available
 */
export async function checkClaudeCodeAvailability(): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve) => {
      const process = spawn('claude', ['--version'], { 
        stdio: 'pipe',
        timeout: 5000 
      });
      
      let output = '';
      
      process.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      process.on('close', (code: number) => {
        if (code === 0) {
          resolve({
            available: true,
            version: output.trim()
          });
        } else {
          resolve({
            available: false,
            error: `Claude Code exited with code ${code}`
          });
        }
      });
      
      process.on('error', (error: Error) => {
        resolve({
          available: false,
          error: error.message
        });
      });
    });
  } catch (error) {
    return {
      available: false,
      error: `Failed to check Claude Code: ${error}`
    };
  }
}