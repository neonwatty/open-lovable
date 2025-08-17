import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PathSecurity, SecurityConfig } from './path-security';

export interface SecureFileOpsConfig extends SecurityConfig {
  atomicWrites?: boolean;
  backupOnUpdate?: boolean;
  backupDir?: string;
  maxConcurrentOps?: number;
  pathSecurity?: PathSecurity; // Optional shared PathSecurity instance
}

export interface FileWriteResult {
  success: boolean;
  path: string;
  operation: 'created' | 'updated';
  error?: string;
  backupPath?: string;
}

export interface FileReadResult {
  success: boolean;
  content?: string;
  path: string;
  error?: string;
  size?: number;
}

export interface FileDeleteResult {
  success: boolean;
  path: string;
  error?: string;
  backupPath?: string;
}

export interface FileListResult {
  success: boolean;
  files?: string[];
  directories?: string[];
  error?: string;
}

/**
 * Secure file operations wrapper with comprehensive safety checks
 */
export class SecureFileOperations {
  private pathSecurity: PathSecurity;
  private config: Required<Omit<SecureFileOpsConfig, 'pathSecurity'>>;
  private activeOperations = new Set<string>();

  constructor(config: SecureFileOpsConfig) {
    this.config = {
      sandboxDir: config.sandboxDir,
      allowedExtensions: config.allowedExtensions || [
        '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.html', '.md', 
        '.txt', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'
      ],
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024,
      enableLogging: config.enableLogging ?? true,
      logFile: config.logFile || path.join(process.cwd(), 'logs', 'security.log'),
      atomicWrites: config.atomicWrites ?? true,
      backupOnUpdate: config.backupOnUpdate ?? true,
      backupDir: config.backupDir || path.join(process.cwd(), '.backups'),
      maxConcurrentOps: config.maxConcurrentOps || 10
    };

    this.pathSecurity = config.pathSecurity || new PathSecurity(this.config);
  }

  /**
   * Securely write a file with atomic operations and validation
   */
  async writeFile(filePath: string, content: string | Buffer, remoteAddress?: string): Promise<FileWriteResult> {
    // Check concurrent operation limit
    if (this.activeOperations.size >= this.config.maxConcurrentOps) {
      return {
        success: false,
        path: filePath,
        operation: 'created',
        error: 'Too many concurrent file operations'
      };
    }

    const operationId = `write-${filePath}-${Date.now()}`;
    this.activeOperations.add(operationId);

    try {
      // Validate path
      const pathValidation = await this.pathSecurity.validatePath(filePath, remoteAddress);
      if (!pathValidation.isValid) {
        return {
          success: false,
          path: filePath,
          operation: 'created',
          error: pathValidation.error
        };
      }

      const resolvedPath = pathValidation.resolvedPath!;

      // Validate content size
      const sizeValidation = this.pathSecurity.validateFileSize(content);
      if (!sizeValidation.isValid) {
        return {
          success: false,
          path: filePath,
          operation: 'created',
          error: sizeValidation.error
        };
      }

      // Check if file exists
      const fileExists = await this.fileExists(resolvedPath);
      const operation: 'created' | 'updated' = fileExists ? 'updated' : 'created';

      let backupPath: string | undefined;

      // Create backup if file exists and backup is enabled
      if (fileExists && this.config.backupOnUpdate) {
        try {
          backupPath = await this.createBackup(resolvedPath);
        } catch (error) {
          console.warn(`[SecureFileOps] Failed to create backup for ${filePath}:`, error);
          // Continue without backup - don't fail the operation
        }
      }

      // Ensure directory exists
      await this.ensureDir(path.dirname(resolvedPath));

      // Write file (atomically if enabled)
      if (this.config.atomicWrites) {
        await this.writeFileAtomic(resolvedPath, content);
      } else {
        await fs.writeFile(resolvedPath, content);
      }

      return {
        success: true,
        path: filePath,
        operation,
        backupPath
      };

    } catch (error) {
      return {
        success: false,
        path: filePath,
        operation: 'created',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Securely read a file with validation
   */
  async readFile(filePath: string, remoteAddress?: string): Promise<FileReadResult> {
    try {
      // Validate path
      const pathValidation = await this.pathSecurity.validatePath(filePath, remoteAddress);
      if (!pathValidation.isValid) {
        return {
          success: false,
          path: filePath,
          error: pathValidation.error
        };
      }

      const resolvedPath = pathValidation.resolvedPath!;

      // Check if file exists
      if (!await this.fileExists(resolvedPath)) {
        return {
          success: false,
          path: filePath,
          error: 'File not found'
        };
      }

      // Get file stats for size validation
      const stats = await fs.stat(resolvedPath);
      
      if (stats.size > this.config.maxFileSize) {
        return {
          success: false,
          path: filePath,
          error: `File size ${stats.size} exceeds maximum allowed size`
        };
      }

      // Read file content
      const content = await fs.readFile(resolvedPath, 'utf8');

      return {
        success: true,
        content,
        path: filePath,
        size: stats.size
      };

    } catch (error) {
      return {
        success: false,
        path: filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Securely delete a file with backup option
   */
  async deleteFile(filePath: string, remoteAddress?: string, createBackup: boolean = true): Promise<FileDeleteResult> {
    try {
      // Validate path
      const pathValidation = await this.pathSecurity.validatePath(filePath, remoteAddress);
      if (!pathValidation.isValid) {
        return {
          success: false,
          path: filePath,
          error: pathValidation.error
        };
      }

      const resolvedPath = pathValidation.resolvedPath!;

      // Check if file exists
      if (!await this.fileExists(resolvedPath)) {
        return {
          success: false,
          path: filePath,
          error: 'File not found'
        };
      }

      let backupPath: string | undefined;

      // Create backup before deletion if requested
      if (createBackup && this.config.backupOnUpdate) {
        try {
          backupPath = await this.createBackup(resolvedPath);
        } catch (error) {
          console.warn(`[SecureFileOps] Failed to create backup before deletion for ${filePath}:`, error);
          // Continue without backup - don't fail the operation
        }
      }

      // Delete file
      await fs.unlink(resolvedPath);

      return {
        success: true,
        path: filePath,
        backupPath
      };

    } catch (error) {
      return {
        success: false,
        path: filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Securely list files in a directory
   */
  async listFiles(dirPath: string = '', remoteAddress?: string): Promise<FileListResult> {
    try {
      // Handle empty directory path (root of sandbox)
      let resolvedPath: string;
      if (dirPath === '') {
        resolvedPath = this.config.sandboxDir;
      } else {
        // Validate path
        const pathValidation = await this.pathSecurity.validatePath(dirPath, remoteAddress);
        if (!pathValidation.isValid) {
          return {
            success: false,
            error: pathValidation.error
          };
        }
        resolvedPath = pathValidation.resolvedPath!;
      }

      // Check if directory exists
      try {
        const stats = await fs.stat(resolvedPath);
        if (!stats.isDirectory()) {
          return {
            success: false,
            error: 'Path is not a directory'
          };
        }
      } catch {
        return {
          success: false,
          error: 'Directory not found'
        };
      }

      // Read directory contents
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      const files: string[] = [];
      const directories: string[] = [];

      for (const entry of entries) {
        // Skip hidden files and backup files
        if (entry.name.startsWith('.') || entry.name.endsWith('.backup')) {
          continue;
        }

        const relativePath = dirPath === '' ? entry.name : path.join(dirPath, entry.name);

        if (entry.isFile()) {
          files.push(relativePath);
        } else if (entry.isDirectory()) {
          directories.push(relativePath);
        }
      }

      return {
        success: true,
        files: files.sort(),
        directories: directories.sort()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if a file exists safely
   */
  async fileExists(filePath: string, remoteAddress?: string): Promise<boolean> {
    try {
      let resolvedPath: string;

      // If already resolved (internal call), use as-is
      if (path.isAbsolute(filePath) && filePath.startsWith(this.config.sandboxDir)) {
        resolvedPath = filePath;
      } else {
        // Validate path for external calls
        const pathValidation = await this.pathSecurity.validatePath(filePath, remoteAddress);
        if (!pathValidation.isValid) {
          return false;
        }
        resolvedPath = pathValidation.resolvedPath!;
      }

      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atomic file write operation
   */
  private async writeFileAtomic(filePath: string, content: string | Buffer): Promise<void> {
    const tempPath = filePath + '.tmp.' + crypto.randomBytes(8).toString('hex');
    
    try {
      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Create backup of a file
   */
  private async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = path.basename(filePath);
    const backupFileName = `${fileName}.${timestamp}.backup`;
    const backupPath = path.join(this.config.backupDir, backupFileName);

    // Ensure backup directory exists
    await this.ensureDir(this.config.backupDir);

    // Copy file to backup location
    await fs.copyFile(filePath, backupPath);

    return backupPath;
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Get operation statistics
   */
  getOperationStats(): {
    activeOperations: number;
    maxConcurrentOps: number;
    securityStats: any;
  } {
    return {
      activeOperations: this.activeOperations.size,
      maxConcurrentOps: this.config.maxConcurrentOps,
      securityStats: this.pathSecurity.generateAuditReport()
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SecureFileOpsConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.pathSecurity.updateConfig(newConfig);
  }

  /**
   * Get current configuration
   */
  getConfig(): SecureFileOpsConfig {
    return { ...this.config };
  }

  /**
   * Cleanup old backup files
   */
  async cleanupBackups(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    let cleanedCount = 0;
    const cutoffTime = Date.now() - olderThanMs;

    try {
      await this.ensureDir(this.config.backupDir);
      const backupFiles = await fs.readdir(this.config.backupDir);
      
      for (const fileName of backupFiles) {
        if (fileName.endsWith('.backup')) {
          const filePath = path.join(this.config.backupDir, fileName);
          try {
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(filePath);
              cleanedCount++;
            }
          } catch {
            // Ignore individual file errors
          }
        }
      }
    } catch {
      // Ignore directory access errors
    }

    return cleanedCount;
  }
}

/**
 * Factory function to create secure file operations instance
 */
export function createSecureFileOps(sandboxDir: string, options: Partial<SecureFileOpsConfig> = {}): SecureFileOperations {
  return new SecureFileOperations({
    sandboxDir: path.resolve(sandboxDir),
    ...options
  });
}

/**
 * Default instance for common usage
 */
export const defaultSecureFileOps = createSecureFileOps(
  path.join(process.cwd(), 'sandbox'),
  {
    enableLogging: true,
    atomicWrites: true,
    backupOnUpdate: true
  }
);