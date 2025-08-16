/**
 * Comprehensive error handling utilities for file operations and system stability
 */

import { promises as fs } from 'fs';
import path from 'path';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  FILE_SYSTEM = 'filesystem',
  PERMISSION = 'permission',
  NETWORK = 'network',
  VALIDATION = 'validation',
  RESOURCE = 'resource',
  UNKNOWN = 'unknown'
}

export interface ErrorContext {
  operation: string;
  filePath?: string;
  timestamp: number;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryable: boolean;
  metadata?: Record<string, any>;
}

export interface RecoveryAction {
  type: 'retry' | 'rollback' | 'skip' | 'manual';
  description: string;
  execute?: () => Promise<boolean>;
}

export class SystemError extends Error {
  public readonly context: ErrorContext;
  public readonly recoveryActions: RecoveryAction[];

  constructor(
    message: string,
    context: Partial<ErrorContext>,
    recoveryActions: RecoveryAction[] = []
  ) {
    super(message);
    this.name = 'SystemError';
    
    this.context = {
      operation: context.operation || 'unknown',
      timestamp: context.timestamp || Date.now(),
      severity: context.severity || ErrorSeverity.MEDIUM,
      category: context.category || ErrorCategory.UNKNOWN,
      retryable: context.retryable ?? false,
      ...context
    };
    
    this.recoveryActions = recoveryActions;
  }
}

export class ErrorHandler {
  private static errorLog: SystemError[] = [];
  private static maxLogSize = 1000;
  private static listeners: Array<(error: SystemError) => void> = [];

  /**
   * Analyze an error and determine its characteristics
   */
  static analyzeError(error: Error, operation: string, filePath?: string): ErrorContext {
    const message = error.message.toLowerCase();
    let severity = ErrorSeverity.MEDIUM;
    let category = ErrorCategory.UNKNOWN;
    let retryable = false;

    // Categorize based on error message patterns
    if (message.includes('enoent') || message.includes('no such file')) {
      category = ErrorCategory.FILE_SYSTEM;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.includes('eacces') || message.includes('permission denied')) {
      category = ErrorCategory.PERMISSION;
      severity = ErrorSeverity.HIGH;
      retryable = false;
    } else if (message.includes('enospc') || message.includes('no space left')) {
      category = ErrorCategory.RESOURCE;
      severity = ErrorSeverity.CRITICAL;
      retryable = false;
    } else if (message.includes('emfile') || message.includes('too many open files')) {
      category = ErrorCategory.RESOURCE;
      severity = ErrorSeverity.HIGH;
      retryable = true;
    } else if (message.includes('ebusy') || message.includes('resource busy')) {
      category = ErrorCategory.RESOURCE;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    } else if (message.includes('etimedout') || message.includes('timeout')) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    } else if (message.includes('invalid') || message.includes('malformed')) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.MEDIUM;
      retryable = false;
    }

    return {
      operation,
      filePath,
      timestamp: Date.now(),
      severity,
      category,
      retryable,
      metadata: {
        originalError: error.name,
        stack: error.stack
      }
    };
  }

  /**
   * Generate recovery actions based on error context
   */
  static generateRecoveryActions(context: ErrorContext): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (context.category) {
      case ErrorCategory.FILE_SYSTEM:
        if (context.filePath) {
          actions.push({
            type: 'manual',
            description: `Create missing directory for ${context.filePath}`,
            execute: async () => {
              try {
                const dir = path.dirname(context.filePath!);
                await fs.mkdir(dir, { recursive: true });
                return true;
              } catch {
                return false;
              }
            }
          });
        }
        break;

      case ErrorCategory.PERMISSION:
        actions.push({
          type: 'manual',
          description: 'Check file and directory permissions'
        });
        break;

      case ErrorCategory.RESOURCE:
        if (context.retryable) {
          actions.push({
            type: 'retry',
            description: 'Wait and retry operation after resource becomes available'
          });
        }
        actions.push({
          type: 'manual',
          description: 'Free up system resources and retry'
        });
        break;

      case ErrorCategory.NETWORK:
        if (context.retryable) {
          actions.push({
            type: 'retry',
            description: 'Retry operation with exponential backoff'
          });
        }
        break;

      case ErrorCategory.VALIDATION:
        actions.push({
          type: 'skip',
          description: 'Skip invalid operation and continue'
        });
        break;
    }

    // Always offer rollback for high severity errors
    if (context.severity === ErrorSeverity.HIGH || context.severity === ErrorSeverity.CRITICAL) {
      actions.push({
        type: 'rollback',
        description: 'Rollback changes to maintain system stability'
      });
    }

    return actions;
  }

  /**
   * Handle an error with automatic recovery suggestions
   */
  static async handleError(
    error: Error,
    operation: string,
    filePath?: string
  ): Promise<SystemError> {
    const context = this.analyzeError(error, operation, filePath);
    const recoveryActions = this.generateRecoveryActions(context);
    
    const systemError = new SystemError(error.message, context, recoveryActions);
    
    // Log the error
    this.logError(systemError);
    
    // Notify listeners
    this.notifyListeners(systemError);
    
    return systemError;
  }

  /**
   * Log an error to the internal log
   */
  static logError(error: SystemError): void {
    this.errorLog.push(error);
    
    // Trim log if it gets too large
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Console logging based on severity
    const logLevel = this.getLogLevel(error.context.severity);
    console[logLevel](`[ErrorHandler] ${error.context.operation}: ${error.message}`, {
      category: error.context.category,
      severity: error.context.severity,
      filePath: error.context.filePath,
      retryable: error.context.retryable,
      recoveryActions: error.recoveryActions.length
    });
  }

  /**
   * Get appropriate console log level for error severity
   */
  private static getLogLevel(severity: ErrorSeverity): 'log' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'log';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return 'error';
      default:
        return 'warn';
    }
  }

  /**
   * Add an error listener
   */
  static addListener(listener: (error: SystemError) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove an error listener
   */
  static removeListener(listener: (error: SystemError) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of an error
   */
  private static notifyListeners(error: SystemError): void {
    for (const listener of this.listeners) {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[ErrorHandler] Listener error:', listenerError);
      }
    }
  }

  /**
   * Get recent errors
   */
  static getRecentErrors(count = 50): SystemError[] {
    return this.errorLog.slice(-count);
  }

  /**
   * Get errors by category
   */
  static getErrorsByCategory(category: ErrorCategory): SystemError[] {
    return this.errorLog.filter(error => error.context.category === category);
  }

  /**
   * Get errors by severity
   */
  static getErrorsBySeverity(severity: ErrorSeverity): SystemError[] {
    return this.errorLog.filter(error => error.context.severity === severity);
  }

  /**
   * Clear error log
   */
  static clearLog(): void {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   */
  static getErrorStats(): Record<string, any> {
    const stats = {
      total: this.errorLog.length,
      bySeverity: {} as Record<ErrorSeverity, number>,
      byCategory: {} as Record<ErrorCategory, number>,
      recentCount: 0 // Last hour
    };

    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    for (const error of this.errorLog) {
      // Count by severity
      stats.bySeverity[error.context.severity] = 
        (stats.bySeverity[error.context.severity] || 0) + 1;
      
      // Count by category
      stats.byCategory[error.context.category] = 
        (stats.byCategory[error.context.category] || 0) + 1;
      
      // Count recent errors
      if (error.context.timestamp > oneHourAgo) {
        stats.recentCount++;
      }
    }

    return stats;
  }
}

/**
 * Utility function to wrap operations with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string,
  filePath?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const systemError = await ErrorHandler.handleError(
      error instanceof Error ? error : new Error(String(error)),
      operationName,
      filePath
    );
    throw systemError;
  }
}

/**
 * Utility function for common file operation error scenarios
 */
export class FileOperationRecovery {
  /**
   * Ensure directory exists with error handling
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    await withErrorHandling(async () => {
      try {
        await fs.access(dirPath);
      } catch {
        await fs.mkdir(dirPath, { recursive: true });
      }
    }, 'ensure-directory', dirPath);
  }

  /**
   * Check disk space before operations
   */
  static async checkDiskSpace(filePath: string, requiredBytes: number): Promise<boolean> {
    try {
      const stats = await fs.statfs(path.dirname(filePath));
      const freeBytes = stats.bavail * stats.bsize;
      return freeBytes > requiredBytes * 1.1; // 10% buffer
    } catch {
      return true; // Assume space is available if we can't check
    }
  }

  /**
   * Verify file system permissions
   */
  static async checkPermissions(filePath: string): Promise<{
    readable: boolean;
    writable: boolean;
    executable: boolean;
  }> {
    const result = { readable: false, writable: false, executable: false };
    
    try {
      await fs.access(filePath, fs.constants.R_OK);
      result.readable = true;
    } catch {}

    try {
      await fs.access(filePath, fs.constants.W_OK);
      result.writable = true;
    } catch {}

    try {
      await fs.access(filePath, fs.constants.X_OK);
      result.executable = true;
    } catch {}

    return result;
  }
}

// Types are already exported above via individual export statements