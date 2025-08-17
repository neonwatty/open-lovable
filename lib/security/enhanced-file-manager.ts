import { FileManager, FileManagerConfig, WriteResult } from '../file-manager';
import { SecureFileOperations, createSecureFileOps } from './secure-file-ops';
import { PathSecurity, createPathSecurity } from './path-security';

/**
 * Enhanced FileManager that uses the new security system
 * This is a drop-in replacement for the existing FileManager with improved security
 */
export class EnhancedFileManager extends FileManager {
  private secureFileOps: SecureFileOperations;
  private pathSecurity: PathSecurity;

  constructor(config: FileManagerConfig = {}) {
    super(config);
    
    const sandboxDir = config.sandboxDir || super.getSandboxDir();
    
    // Initialize shared security components
    this.pathSecurity = createPathSecurity(sandboxDir, {
      allowedExtensions: config.allowedExtensions,
      maxFileSize: config.maxFileSize,
      enableLogging: true
    });
    
    this.secureFileOps = createSecureFileOps(sandboxDir, {
      allowedExtensions: config.allowedExtensions,
      maxFileSize: config.maxFileSize,
      enableLogging: true,
      atomicWrites: true,
      backupOnUpdate: true,
      pathSecurity: this.pathSecurity // Share the same instance
    });
  }

  /**
   * Enhanced writeFile with improved security and logging
   */
  async writeFile(filePath: string, content: string, remoteAddress?: string): Promise<WriteResult> {
    try {
      const result = await this.secureFileOps.writeFile(filePath, content, remoteAddress);
      
      return {
        success: result.success,
        path: result.path,
        operation: result.operation,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        path: filePath,
        operation: 'created',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Enhanced readFile with security validation
   */
  async readFile(filePath: string, remoteAddress?: string): Promise<string> {
    const result = await this.secureFileOps.readFile(filePath, remoteAddress);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to read file');
    }
    
    return result.content!;
  }

  /**
   * Enhanced deleteFile with backup option
   */
  async deleteFile(filePath: string, remoteAddress?: string): Promise<boolean> {
    const result = await this.secureFileOps.deleteFile(filePath, remoteAddress);
    return result.success;
  }

  /**
   * Enhanced fileExists with security validation
   */
  async fileExists(filePath: string, remoteAddress?: string): Promise<boolean> {
    return await this.secureFileOps.fileExists(filePath, remoteAddress);
  }

  /**
   * Enhanced listFiles with security validation
   */
  async listFiles(dirPath: string = '', remoteAddress?: string): Promise<string[]> {
    const result = await this.secureFileOps.listFiles(dirPath, remoteAddress);
    
    if (!result.success) {
      return [];
    }
    
    return result.files || [];
  }

  /**
   * Get security statistics and audit information
   */
  getSecurityStats() {
    return {
      operations: this.secureFileOps.getOperationStats(),
      violations: this.pathSecurity.generateAuditReport()
    };
  }

  /**
   * Validate a path without performing file operations
   */
  async validatePath(filePath: string, remoteAddress?: string) {
    return await this.pathSecurity.validatePath(filePath, remoteAddress);
  }

  /**
   * Cleanup old backup files
   */
  async cleanupBackups(olderThanMs?: number): Promise<number> {
    return await this.secureFileOps.cleanupBackups(olderThanMs);
  }
}

/**
 * Factory function to create an enhanced file manager
 */
export function createEnhancedFileManager(config: FileManagerConfig = {}): EnhancedFileManager {
  return new EnhancedFileManager(config);
}

/**
 * Migration helper to upgrade existing FileManager instances
 */
export function upgradeFileManager(existingManager: FileManager): EnhancedFileManager {
  const sandboxDir = existingManager.getSandboxDir();
  
  return new EnhancedFileManager({
    sandboxDir,
    // Note: We can't access private properties, so we use defaults
    // In a real migration, these would need to be passed explicitly
  });
}

// Export enhanced version as default for new code
export const defaultEnhancedFileManager = createEnhancedFileManager();