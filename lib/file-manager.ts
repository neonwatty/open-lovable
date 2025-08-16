import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface FileManagerConfig {
  sandboxDir?: string;
  allowedExtensions?: string[];
  maxFileSize?: number; // in bytes
}

export interface FileOperation {
  path: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
}

export interface WriteResult {
  success: boolean;
  path: string;
  operation: 'created' | 'updated';
  error?: string;
}

export class FileManager {
  private sandboxDir: string;
  private allowedExtensions: string[];
  private maxFileSize: number;

  // Common safe file extensions for web development
  private static readonly DEFAULT_EXTENSIONS = [
    '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.html', '.md', 
    '.txt', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'
  ];

  constructor(config: FileManagerConfig = {}) {
    this.sandboxDir = config.sandboxDir || path.join(process.cwd(), 'sandbox');
    this.allowedExtensions = config.allowedExtensions || FileManager.DEFAULT_EXTENSIONS;
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB default
  }

  /**
   * Validate and normalize a file path to prevent directory traversal attacks
   */
  private validateAndNormalizePath(filePath: string): string {
    // Handle null, undefined, or empty paths
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: path must be a non-empty string');
    }

    // Decode URL-encoded characters to detect hidden dangerous patterns
    let decodedPath = filePath;
    try {
      decodedPath = decodeURIComponent(filePath);
    } catch {
      // If decoding fails, use original path
    }

    // Check for null bytes and other dangerous characters in decoded path
    if (decodedPath.includes('\0') || /[<>:"|?*]/.test(decodedPath)) {
      throw new Error(`Invalid file path: contains illegal characters in "${filePath}"`);
    }

    // Check for absolute paths (including Windows paths)
    if (path.isAbsolute(decodedPath)) {
      throw new Error(`Invalid file path: directory traversal detected in "${filePath}"`);
    }
    
    // Remove leading slashes and normalize
    const cleanPath = decodedPath.replace(/^\/+/, '');
    
    // Use path.normalize to resolve . and .. segments
    const normalizedPath = path.normalize(cleanPath);
    
    // Check for directory traversal attempts after normalization
    if (normalizedPath.includes('..') || normalizedPath.startsWith('/') || normalizedPath === '.' || normalizedPath === '') {
      throw new Error(`Invalid file path: directory traversal detected in "${filePath}"`);
    }
    
    // Create the full path within sandbox
    const fullPath = path.join(this.sandboxDir, normalizedPath);
    
    // Verify the resolved path is still within sandbox directory
    const resolvedSandboxDir = path.resolve(this.sandboxDir);
    const resolvedFilePath = path.resolve(fullPath);
    
    if (!resolvedFilePath.startsWith(resolvedSandboxDir + path.sep) && 
        resolvedFilePath !== resolvedSandboxDir) {
      throw new Error(`Invalid file path: outside sandbox boundaries "${filePath}"`);
    }
    
    return fullPath;
  }

  /**
   * Validate file extension is allowed
   */
  private validateFileExtension(filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext && !this.allowedExtensions.includes(ext)) {
      throw new Error(`File extension "${ext}" is not allowed`);
    }
  }

  /**
   * Validate file content size
   */
  private validateFileSize(content: string): void {
    const size = Buffer.byteLength(content, 'utf8');
    
    if (size > this.maxFileSize) {
      throw new Error(`File size ${size} bytes exceeds maximum allowed size of ${this.maxFileSize} bytes`);
    }
  }

  /**
   * Ensure directory exists for the given file path
   */
  async ensureDir(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.validateAndNormalizePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write a file to the sandbox directory
   */
  async writeFile(filePath: string, content: string): Promise<WriteResult> {
    try {
      // Get validated full path (this will throw for invalid paths)
      const fullPath = this.validateAndNormalizePath(filePath);
      
      // Validate inputs
      this.validateFileExtension(filePath);
      this.validateFileSize(content);
      
      // Check if file already exists
      const exists = await this.fileExists(filePath);
      
      // Ensure directory exists
      await this.ensureDir(fullPath);
      
      // Write file atomically using a temporary file
      const tempPath = fullPath + '.tmp.' + crypto.randomBytes(8).toString('hex');
      
      try {
        await fs.writeFile(tempPath, content, 'utf8');
        await fs.rename(tempPath, fullPath);
      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
      
      return {
        success: true,
        path: filePath,
        operation: exists ? 'updated' : 'created'
      };
    } catch (error) {
      return {
        success: false,
        path: filePath,
        operation: 'created', // default
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update an existing file (alias for writeFile for semantic clarity)
   */
  async updateFile(filePath: string, content: string): Promise<WriteResult> {
    return this.writeFile(filePath, content);
  }

  /**
   * Read a file from the sandbox directory
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = this.validateAndNormalizePath(filePath);
    return await fs.readFile(fullPath, 'utf8');
  }

  /**
   * Delete a file from the sandbox directory
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.validateAndNormalizePath(filePath);
      await fs.unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files in a directory within the sandbox
   */
  async listFiles(dirPath: string = ''): Promise<string[]> {
    try {
      // Handle empty directory path (root of sandbox)
      let fullPath: string;
      if (dirPath === '') {
        fullPath = this.sandboxDir;
      } else {
        fullPath = this.validateAndNormalizePath(dirPath);
      }
      
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      return entries
        .filter(entry => entry.isFile())
        .map(entry => dirPath === '' ? entry.name : path.join(dirPath, entry.name))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Initialize the sandbox directory
   */
  async initialize(): Promise<void> {
    await this.ensureDir(path.join(this.sandboxDir, 'placeholder'));
    
    // Create a .gitkeep file to ensure directory exists in git
    const gitkeepPath = path.join(this.sandboxDir, '.gitkeep');
    try {
      await fs.access(gitkeepPath);
    } catch {
      await fs.writeFile(gitkeepPath, '', 'utf8');
    }
  }

  /**
   * Clean up old files (optional maintenance operation)
   */
  async cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    let cleanedCount = 0;
    const cutoffTime = Date.now() - olderThanMs;
    
    try {
      const files = await this.listFiles();
      
      for (const file of files) {
        try {
          const fullPath = this.validateAndNormalizePath(file);
          const stats = await fs.stat(fullPath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(fullPath);
            cleanedCount++;
          }
        } catch {
          // Ignore individual file errors during cleanup
        }
      }
    } catch {
      // Ignore directory access errors
    }
    
    return cleanedCount;
  }

  /**
   * Get sandbox directory path
   */
  getSandboxDir(): string {
    return this.sandboxDir;
  }

  /**
   * Write multiple files in batch
   */
  async writeFiles(files: Array<{ path: string; content: string }>): Promise<WriteResult[]> {
    const results: WriteResult[] = [];
    
    // Process files sequentially to avoid conflicts
    for (const file of files) {
      const result = await this.writeFile(file.path, file.content);
      results.push(result);
    }
    
    return results;
  }
}

// Export a default instance for convenience
export const defaultFileManager = new FileManager();