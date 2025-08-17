import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface SecurityConfig {
  sandboxDir: string;
  allowedExtensions?: string[];
  maxFileSize?: number;
  enableLogging?: boolean;
  logFile?: string;
}

export interface SecurityViolation {
  type: 'path_traversal' | 'extension_blocked' | 'size_exceeded' | 'symlink_escape' | 'invalid_path';
  path: string;
  details: string;
  timestamp: Date;
  remoteAddress?: string;
}

export interface PathValidationResult {
  isValid: boolean;
  resolvedPath?: string;
  error?: string;
  violation?: SecurityViolation;
}

/**
 * Centralized security module for path traversal protection and sandbox isolation
 */
export class PathSecurity {
  private config: Required<SecurityConfig>;
  private violations: SecurityViolation[] = [];

  constructor(config: SecurityConfig) {
    this.config = {
      sandboxDir: config.sandboxDir,
      allowedExtensions: config.allowedExtensions || [
        '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.html', '.md', 
        '.txt', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'
      ],
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      enableLogging: config.enableLogging ?? true,
      logFile: config.logFile || path.join(process.cwd(), 'logs', 'security.log')
    };

    // Ensure sandbox directory is absolute and normalized
    this.config.sandboxDir = path.resolve(this.config.sandboxDir);
  }

  /**
   * Comprehensive path validation with security checks
   */
  async validatePath(inputPath: string, remoteAddress?: string): Promise<PathValidationResult> {
    try {
      // Basic input validation
      if (!inputPath || typeof inputPath !== 'string') {
        const violation = this.createViolation('invalid_path', inputPath || '', 'Path must be a non-empty string', remoteAddress);
        await this.logViolation(violation);
        return { isValid: false, error: 'Invalid path: must be a non-empty string', violation };
      }

      // Decode URL-encoded characters to detect hidden patterns
      let decodedPath = inputPath;
      try {
        decodedPath = decodeURIComponent(inputPath);
      } catch {
        // If decoding fails, use original path but log the attempt
        const violation = this.createViolation('invalid_path', inputPath, 'URL decoding failed - potential encoding attack', remoteAddress);
        await this.logViolation(violation);
      }

      // Check for absolute paths first (including cross-platform detection)
      if (this.isAbsolutePath(decodedPath)) {
        const violation = this.createViolation('path_traversal', inputPath, 'Absolute path not allowed', remoteAddress);
        await this.logViolation(violation);
        return { isValid: false, error: 'Invalid file path: absolute paths not allowed', violation };
      }

      // Check for null bytes and dangerous characters
      if (this.containsDangerousCharacters(decodedPath)) {
        const violation = this.createViolation('invalid_path', inputPath, 'Contains dangerous characters', remoteAddress);
        await this.logViolation(violation);
        return { isValid: false, error: 'Invalid file path: contains illegal characters', violation };
      }

      // Normalize and clean the path
      const cleanPath = decodedPath.replace(/^\/+/, '');
      const normalizedPath = path.normalize(cleanPath);

      // Check for directory traversal after normalization
      if (this.containsTraversalAttempt(normalizedPath)) {
        const violation = this.createViolation('path_traversal', inputPath, 'Directory traversal detected after normalization', remoteAddress);
        await this.logViolation(violation);
        return { isValid: false, error: 'Invalid file path: directory traversal detected', violation };
      }

      // Create full path within sandbox
      const fullPath = path.join(this.config.sandboxDir, normalizedPath);

      // Resolve paths to handle symlinks and check boundaries
      const resolvedSandboxDir = path.resolve(this.config.sandboxDir);
      const resolvedFilePath = path.resolve(fullPath);

      // Verify the resolved path is within sandbox boundaries
      if (!this.isWithinSandbox(resolvedFilePath, resolvedSandboxDir)) {
        const violation = this.createViolation('path_traversal', inputPath, 'Path resolves outside sandbox boundaries', remoteAddress);
        await this.logViolation(violation);
        return { isValid: false, error: 'Invalid file path: outside sandbox boundaries', violation };
      }

      // Check for symlink escape attempts
      const symlinkCheck = await this.checkSymlinkSafety(fullPath, resolvedSandboxDir);
      if (!symlinkCheck.isSafe) {
        const violation = this.createViolation('symlink_escape', inputPath, symlinkCheck.reason, remoteAddress);
        await this.logViolation(violation);
        return { isValid: false, error: 'Invalid file path: symlink security violation', violation };
      }

      // Validate file extension
      const extensionCheck = this.validateFileExtension(normalizedPath);
      if (!extensionCheck.isValid) {
        const violation = this.createViolation('extension_blocked', inputPath, extensionCheck.error!, remoteAddress);
        await this.logViolation(violation);
        return { isValid: false, error: extensionCheck.error, violation };
      }

      return { isValid: true, resolvedPath: resolvedFilePath };

    } catch (error) {
      const violation = this.createViolation('invalid_path', inputPath, `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`, remoteAddress);
      await this.logViolation(violation);
      return { isValid: false, error: 'Path validation failed', violation };
    }
  }

  /**
   * Validate file content size before writing
   */
  validateFileSize(content: string | Buffer): { isValid: boolean; error?: string } {
    const size = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.length;
    
    if (size > this.config.maxFileSize) {
      return {
        isValid: false,
        error: `File size ${size} bytes exceeds maximum allowed size of ${this.config.maxFileSize} bytes`
      };
    }

    return { isValid: true };
  }

  /**
   * Check if path is absolute (cross-platform)
   */
  private isAbsolutePath(filePath: string): boolean {
    // Native check first
    if (path.isAbsolute(filePath)) {
      return true;
    }
    
    // Windows drive letter patterns (C:, D:\, etc.)
    if (/^[A-Za-z]:[/\\]/.test(filePath)) {
      return true;
    }
    
    // UNC paths (\\server\share)
    if (/^\\\\/.test(filePath)) {
      return true;
    }
    
    return false;
  }

  /**
   * Check for dangerous characters in path
   */
  private containsDangerousCharacters(path: string): boolean {
    // Null bytes, control characters, and filesystem-dangerous characters
    // Note: Don't check for ':' here as it's handled by absolute path detection
    return /[\0\x01-\x1f\x7f-\x9f<>"|?*]/.test(path);
  }

  /**
   * Check for directory traversal patterns
   */
  private containsTraversalAttempt(normalizedPath: string): boolean {
    return normalizedPath.includes('..') || 
           normalizedPath.startsWith('/') || 
           normalizedPath === '.' || 
           normalizedPath === '' ||
           normalizedPath.includes('\\.\\') || // Windows style
           normalizedPath.includes('\\..\\');
  }

  /**
   * Check if resolved path is within sandbox boundaries
   */
  private isWithinSandbox(resolvedPath: string, resolvedSandbox: string): boolean {
    return resolvedPath.startsWith(resolvedSandbox + path.sep) || 
           resolvedPath === resolvedSandbox;
  }

  /**
   * Check symlink safety to prevent escape attacks
   */
  private async checkSymlinkSafety(filePath: string, sandboxDir: string): Promise<{ isSafe: boolean; reason: string }> {
    try {
      // Check if any parent directories are symlinks that could escape
      let currentPath = path.dirname(filePath);
      
      while (currentPath !== sandboxDir && currentPath !== path.dirname(currentPath)) {
        try {
          const stats = await fs.lstat(currentPath);
          if (stats.isSymbolicLink()) {
            const linkTarget = await fs.readlink(currentPath);
            const resolvedTarget = path.resolve(path.dirname(currentPath), linkTarget);
            
            if (!this.isWithinSandbox(resolvedTarget, sandboxDir)) {
              return { isSafe: false, reason: `Symlink ${currentPath} targets outside sandbox: ${linkTarget}` };
            }
          }
        } catch {
          // Path doesn't exist yet, which is fine
          break;
        }
        
        currentPath = path.dirname(currentPath);
      }

      // Check if the file itself is a symlink
      try {
        const stats = await fs.lstat(filePath);
        if (stats.isSymbolicLink()) {
          const linkTarget = await fs.readlink(filePath);
          const resolvedTarget = path.resolve(path.dirname(filePath), linkTarget);
          
          if (!this.isWithinSandbox(resolvedTarget, sandboxDir)) {
            return { isSafe: false, reason: `File symlink targets outside sandbox: ${linkTarget}` };
          }
        }
      } catch {
        // File doesn't exist, which is fine for new files
      }

      return { isSafe: true, reason: 'No symlink security violations detected' };
      
    } catch (error) {
      return { isSafe: false, reason: `Symlink check failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  /**
   * Validate file extension
   */
  private validateFileExtension(filePath: string): { isValid: boolean; error?: string } {
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext && !this.config.allowedExtensions.includes(ext)) {
      return { 
        isValid: false, 
        error: `File extension "${ext}" is not allowed. Allowed extensions: ${this.config.allowedExtensions.join(', ')}` 
      };
    }

    return { isValid: true };
  }

  /**
   * Create a security violation record
   */
  private createViolation(type: SecurityViolation['type'], path: string, details: string, remoteAddress?: string): SecurityViolation {
    return {
      type,
      path,
      details,
      timestamp: new Date(),
      remoteAddress
    };
  }

  /**
   * Log security violation
   */
  private async logViolation(violation: SecurityViolation): Promise<void> {
    this.violations.push(violation);

    if (this.config.enableLogging) {
      try {
        const logEntry = JSON.stringify({
          ...violation,
          timestamp: violation.timestamp.toISOString()
        }) + '\n';

        // Ensure log directory exists
        const logDir = path.dirname(this.config.logFile);
        await fs.mkdir(logDir, { recursive: true });

        // Append to log file
        await fs.appendFile(this.config.logFile, logEntry);
      } catch (error) {
        console.error('Failed to log security violation:', error);
      }
    }

    // Also log to console for immediate visibility
    console.warn(`[SECURITY VIOLATION] ${violation.type}: ${violation.details} (path: ${violation.path})`);
  }

  /**
   * Get recent security violations
   */
  getViolations(limit: number = 100): SecurityViolation[] {
    return this.violations.slice(-limit);
  }

  /**
   * Clear violation history
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * Generate security audit report
   */
  generateAuditReport(): {
    totalViolations: number;
    violationsByType: Record<string, number>;
    recentViolations: SecurityViolation[];
    config: SecurityConfig;
  } {
    const violationsByType: Record<string, number> = {};
    
    this.violations.forEach(violation => {
      violationsByType[violation.type] = (violationsByType[violation.type] || 0) + 1;
    });

    return {
      totalViolations: this.violations.length,
      violationsByType,
      recentViolations: this.violations.slice(-10),
      config: this.config
    };
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.sandboxDir) {
      this.config.sandboxDir = path.resolve(newConfig.sandboxDir);
    }
  }

  /**
   * Get current security configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}

/**
 * Utility function to create a path security instance with common defaults
 */
export function createPathSecurity(sandboxDir: string, options: Partial<SecurityConfig> = {}): PathSecurity {
  return new PathSecurity({
    sandboxDir,
    ...options
  });
}

/**
 * Quick validation function for simple use cases
 */
export async function validateSafePath(inputPath: string, sandboxDir: string): Promise<string> {
  const security = createPathSecurity(sandboxDir);
  const result = await security.validatePath(inputPath);
  
  if (!result.isValid) {
    throw new Error(result.error || 'Path validation failed');
  }
  
  return result.resolvedPath!;
}