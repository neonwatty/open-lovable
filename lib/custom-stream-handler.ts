/**
 * Custom Response Streaming Handler
 * 
 * Implements Server-Sent Events (SSE) streaming without AI provider APIs.
 * Provides incremental parsing and response buffering for Claude Code responses.
 */

import { ReadableStream } from 'stream/web';

export interface StreamChunk {
  type: 'status' | 'conversation' | 'stream' | 'component' | 'app' | 'package' | 'complete' | 'error' | 'warning' | 'info';
  text?: string;
  message?: string;
  name?: string;
  path?: string;
  index?: number;
  error?: string;
  generatedCode?: string;
  explanation?: string;
  files?: number;
  components?: number;
  model?: string;
  packagesToInstall?: string[];
  warnings?: string[];
  raw?: boolean;
  [key: string]: any;
}

export interface StreamOptions {
  timeout?: number;
  bufferSize?: number;
  enableParsing?: boolean;
  enablePartialResponse?: boolean;
  flushInterval?: number; // Interval for flushing partial content (ms)
  maxBufferSize?: number; // Maximum buffer size before forced flush
}

/**
 * Custom stream handler that replaces Vercel AI SDK streaming
 */
export class CustomStreamHandler {
  private encoder: TextEncoder;
  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private buffer: string = '';
  private options: Required<StreamOptions>;
  private isEnded: boolean = false;
  private flushTimer?: NodeJS.Timeout;
  private lastFlush: number = 0;

  constructor(options: StreamOptions = {}) {
    this.encoder = new TextEncoder();
    this.options = {
      timeout: options.timeout || 120000, // 2 minutes default
      bufferSize: options.bufferSize || 1024,
      enableParsing: options.enableParsing ?? true,
      enablePartialResponse: options.enablePartialResponse ?? true,
      flushInterval: options.flushInterval || 500, // 500ms default
      maxBufferSize: options.maxBufferSize || 8192, // 8KB default
      ...options
    };
    
    // Set up automatic buffer flushing if enabled
    if (this.options.enablePartialResponse && this.options.flushInterval > 0) {
      this.setupAutoFlush();
    }
  }

  /**
   * Set up automatic buffer flushing
   */
  private setupAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushPartialContent();
    }, this.options.flushInterval);
    
    // Unref the timer to prevent it from keeping the process alive
    this.flushTimer.unref();
  }

  /**
   * Flush partial content if enough time has passed
   */
  private flushPartialContent(): void {
    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlush;
    
    if (timeSinceLastFlush >= this.options.flushInterval && this.buffer.length > 0) {
      // Send partial buffer content as a status update
      const partialContent = this.buffer.slice(0, Math.min(this.buffer.length, this.options.bufferSize));
      
      this.sendProgress({
        type: 'stream',
        text: partialContent,
        partial: true
      }).catch(console.error);
      
      this.lastFlush = now;
    }
  }

  /**
   * Create a readable stream for Server-Sent Events
   */
  createStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.end();
      }
    });
  }

  /**
   * Send a progress update to the stream
   */
  async sendProgress(data: StreamChunk): Promise<void> {
    if (this.isEnded || !this.controller) {
      return;
    }

    try {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      const chunk = this.encoder.encode(message);
      this.controller.enqueue(chunk);
    } catch (error) {
      console.error('[CustomStreamHandler] Error sending progress:', error);
      // Don't call sendError here to avoid recursion
      try {
        if (this.controller && !this.isEnded) {
          this.controller.error(error);
        }
      } catch (e) {
        // Silently handle controller error
      }
    }
  }

  /**
   * Send raw text data with optional parsing
   */
  async sendText(text: string, enableParsing: boolean = true): Promise<void> {
    if (this.isEnded) return;

    this.buffer += text;

    if (enableParsing && this.options.enableParsing) {
      await this.parseAndSendIncrementalData(text);
    }

    // Send raw text for live preview
    await this.sendProgress({
      type: 'stream',
      text: text,
      raw: true
    });

    // Force flush if buffer exceeds maximum size
    if (this.buffer.length > this.options.maxBufferSize) {
      this.forceFlushBuffer();
    }
    // Regular flush for smaller buffers
    else if (this.buffer.length > this.options.bufferSize * 10) {
      this.flushBuffer();
    }
  }

  /**
   * Parse incoming text for file boundaries and components
   */
  private async parseAndSendIncrementalData(text: string): Promise<void> {
    // Check for file boundaries
    const fileOpenMatch = text.match(/<file path="([^"]+)"/);
    if (fileOpenMatch) {
      const filePath = fileOpenMatch[1];
      
      if (filePath.includes('components/')) {
        const componentName = filePath.split('/').pop()?.replace('.jsx', '') || 'Component';
        await this.sendProgress({
          type: 'component',
          name: componentName,
          path: filePath,
          message: `Generating ${componentName}...`
        });
      } else if (filePath.includes('App.jsx')) {
        await this.sendProgress({
          type: 'app',
          message: 'Generating main App.jsx',
          path: filePath
        });
      }
    }

    // Check for package declarations
    const packageMatch = text.match(/<package>([^<]+)<\/package>/);
    if (packageMatch) {
      const packageName = packageMatch[1].trim();
      await this.sendProgress({
        type: 'package',
        name: packageName,
        message: `Package detected: ${packageName}`
      });
    }

    // Check for multiple packages
    const packagesMatch = text.match(/<packages>([\s\S]*?)<\/packages>/);
    if (packagesMatch) {
      const packagesContent = packagesMatch[1].trim();
      const packagesList = packagesContent.split(/[\n,]+/)
        .map(pkg => pkg.trim())
        .filter(pkg => pkg.length > 0);
      
      for (const packageName of packagesList) {
        await this.sendProgress({
          type: 'package',
          name: packageName,
          message: `Package detected: ${packageName}`
        });
      }
    }
  }

  /**
   * Send an error message
   */
  async sendError(error: string): Promise<void> {
    if (this.isEnded || !this.controller) {
      return;
    }

    try {
      const data = { type: 'error', error: error };
      const message = `data: ${JSON.stringify(data)}\n\n`;
      const chunk = this.encoder.encode(message);
      this.controller.enqueue(chunk);
    } catch (e) {
      console.error('[CustomStreamHandler] Error sending error message:', e);
      // Don't recurse - just try to close the stream
      try {
        if (this.controller && !this.isEnded) {
          this.controller.error(e);
        }
      } catch (closeError) {
        // Silent fail
      }
    }
  }

  /**
   * Send a warning message
   */
  async sendWarning(message: string, warnings?: string[]): Promise<void> {
    await this.sendProgress({
      type: 'warning',
      message: message,
      warnings: warnings
    });
  }

  /**
   * Send completion message
   */
  async sendComplete(data: {
    generatedCode: string;
    explanation?: string;
    files?: number;
    components?: number;
    model?: string;
    packagesToInstall?: string[];
    warnings?: string[];
  }): Promise<void> {
    await this.sendProgress({
      type: 'complete',
      ...data
    });
  }

  /**
   * Flush the internal buffer
   */
  private flushBuffer(): void {
    // Keep only the last portion of the buffer
    const keepSize = this.options.bufferSize;
    if (this.buffer.length > keepSize) {
      this.buffer = this.buffer.slice(-keepSize);
    }
    this.lastFlush = Date.now();
  }

  /**
   * Force flush the buffer (for when it gets too large)
   */
  private forceFlushBuffer(): void {
    console.warn('[CustomStreamHandler] Buffer exceeded maximum size, force flushing');
    
    // Send a warning about buffer overflow
    this.sendProgress({
      type: 'warning',
      message: 'Large response detected, streaming in chunks...'
    }).catch(console.error);
    
    // Keep only essential portion
    const keepSize = Math.floor(this.options.bufferSize / 2);
    if (this.buffer.length > keepSize) {
      this.buffer = this.buffer.slice(-keepSize);
    }
    this.lastFlush = Date.now();
  }

  /**
   * Get the current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Clear the buffer
   */
  clearBuffer(): void {
    this.buffer = '';
  }

  /**
   * End the stream
   */
  end(): void {
    if (this.isEnded) return;
    
    this.isEnded = true;
    
    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Send any remaining buffer content directly to avoid recursion
    if (this.buffer.length > 0 && this.options.enablePartialResponse && this.controller) {
      try {
        const data = { type: 'stream', text: this.buffer, final: true };
        const message = `data: ${JSON.stringify(data)}\n\n`;
        const chunk = this.encoder.encode(message);
        this.controller.enqueue(chunk);
      } catch (error) {
        console.error('[CustomStreamHandler] Error sending final buffer:', error);
      }
    }
    
    if (this.controller) {
      try {
        this.controller.close();
      } catch (error) {
        console.error('[CustomStreamHandler] Error closing stream:', error);
      }
    }
  }

  /**
   * Check if the stream has ended
   */
  isStreamEnded(): boolean {
    return this.isEnded;
  }
}

/**
 * Utility function to create a standard SSE response
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream as BodyInit, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Parse Claude Code response incrementally
 */
export class IncrementalResponseParser {
  private buffer: string = '';
  private files: Map<string, string> = new Map();
  private packages: Set<string> = new Set();
  private currentFile: string | null = null;
  private currentFileContent: string = '';

  /**
   * Add text to the parser buffer
   */
  addText(text: string): ParsedChunk[] {
    this.buffer += text;
    return this.parseBuffer();
  }

  /**
   * Parse the current buffer for complete elements
   */
  private parseBuffer(): ParsedChunk[] {
    const chunks: ParsedChunk[] = [];
    let lastProcessedIndex = 0;

    // Look for complete file blocks
    const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
    let fileMatch;

    while ((fileMatch = fileRegex.exec(this.buffer)) !== null) {
      const filePath = fileMatch[1];
      const content = fileMatch[2];
      
      this.files.set(filePath, content);
      chunks.push({
        type: 'file',
        path: filePath,
        content: content
      });

      lastProcessedIndex = fileMatch.index + fileMatch[0].length;
    }

    // Look for package declarations
    const packageRegex = /<package>([^<]+)<\/package>/g;
    let packageMatch;

    while ((packageMatch = packageRegex.exec(this.buffer)) !== null) {
      const packageName = packageMatch[1].trim();
      if (!this.packages.has(packageName)) {
        this.packages.add(packageName);
        chunks.push({
          type: 'package',
          name: packageName
        });
      }
    }

    // Keep unprocessed portion in buffer
    if (lastProcessedIndex > 0) {
      this.buffer = this.buffer.slice(lastProcessedIndex);
    }

    return chunks;
  }

  /**
   * Get all parsed files
   */
  getFiles(): Map<string, string> {
    return new Map(this.files);
  }

  /**
   * Get all detected packages
   */
  getPackages(): Set<string> {
    return new Set(this.packages);
  }

  /**
   * Get the current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Clear all parsed data
   */
  clear(): void {
    this.buffer = '';
    this.files.clear();
    this.packages.clear();
    this.currentFile = null;
    this.currentFileContent = '';
  }
}

export interface ParsedChunk {
  type: 'file' | 'package' | 'text';
  path?: string;
  content?: string;
  name?: string;
  text?: string;
}

/**
 * Advanced streaming handler with real-time parsing
 */
export class AdvancedStreamHandler extends CustomStreamHandler {
  private parser: IncrementalResponseParser;
  private componentCount: number = 0;

  constructor(options: StreamOptions = {}) {
    super(options);
    this.parser = new IncrementalResponseParser();
  }

  /**
   * Process text with advanced parsing and component tracking
   */
  async processText(text: string): Promise<void> {
    if (this.isStreamEnded()) return;

    // Add to parser
    const chunks = this.parser.addText(text);

    // Process parsed chunks
    for (const chunk of chunks) {
      if (chunk.type === 'file' && chunk.path) {
        if (chunk.path.includes('components/')) {
          this.componentCount++;
          const componentName = chunk.path.split('/').pop()?.replace('.jsx', '') || 'Component';
          await this.sendProgress({
            type: 'component',
            name: componentName,
            path: chunk.path,
            index: this.componentCount
          });
        } else if (chunk.path.includes('App.jsx')) {
          await this.sendProgress({
            type: 'app',
            message: 'Generated main App.jsx',
            path: chunk.path
          });
        }
      } else if (chunk.type === 'package' && chunk.name) {
        await this.sendProgress({
          type: 'package',
          name: chunk.name,
          message: `Package detected: ${chunk.name}`
        });
      }
    }

    // Send raw text
    await this.sendText(text, false); // Disable double parsing
  }

  /**
   * Get final results
   */
  getFinalResults(): {
    files: Map<string, string>;
    packages: Set<string>;
    componentCount: number;
  } {
    return {
      files: this.parser.getFiles(),
      packages: this.parser.getPackages(),
      componentCount: this.componentCount
    };
  }
}

/**
 * Utility function to simulate streaming from a complete response
 */
export async function simulateStreaming(
  response: string,
  handler: CustomStreamHandler,
  delay: number = 50
): Promise<void> {
  const chunks = response.split('\n');
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] + (i < chunks.length - 1 ? '\n' : '');
    
    await handler.sendText(chunk);
    
    // Add realistic delay
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}