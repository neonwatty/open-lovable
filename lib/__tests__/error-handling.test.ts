import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  ErrorHandler, 
  SystemError, 
  ErrorSeverity, 
  ErrorCategory,
  withErrorHandling,
  FileOperationRecovery
} from '../error-handling';

describe('ErrorHandler', () => {
  beforeEach(() => {
    ErrorHandler.clearLog();
  });

  afterEach(() => {
    ErrorHandler.clearLog();
  });

  describe('Error Analysis', () => {
    it('should correctly analyze file not found errors', () => {
      const error = new Error('ENOENT: no such file or directory');
      const context = ErrorHandler.analyzeError(error, 'read-file', '/test/file.txt');

      expect(context.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(context.severity).toBe(ErrorSeverity.LOW);
      expect(context.retryable).toBe(false);
      expect(context.operation).toBe('read-file');
      expect(context.filePath).toBe('/test/file.txt');
    });

    it('should correctly analyze permission errors', () => {
      const error = new Error('EACCES: permission denied');
      const context = ErrorHandler.analyzeError(error, 'write-file');

      expect(context.category).toBe(ErrorCategory.PERMISSION);
      expect(context.severity).toBe(ErrorSeverity.HIGH);
      expect(context.retryable).toBe(false);
    });

    it('should correctly analyze resource errors', () => {
      const error = new Error('ENOSPC: no space left on device');
      const context = ErrorHandler.analyzeError(error, 'write-file');

      expect(context.category).toBe(ErrorCategory.RESOURCE);
      expect(context.severity).toBe(ErrorSeverity.CRITICAL);
      expect(context.retryable).toBe(false);
    });

    it('should correctly analyze retryable resource errors', () => {
      const error = new Error('EMFILE: too many open files');
      const context = ErrorHandler.analyzeError(error, 'open-file');

      expect(context.category).toBe(ErrorCategory.RESOURCE);
      expect(context.severity).toBe(ErrorSeverity.HIGH);
      expect(context.retryable).toBe(true);
    });

    it('should analyze network timeout errors', () => {
      const error = new Error('ETIMEDOUT: connection timed out');
      const context = ErrorHandler.analyzeError(error, 'network-request');

      expect(context.category).toBe(ErrorCategory.NETWORK);
      expect(context.severity).toBe(ErrorSeverity.MEDIUM);
      expect(context.retryable).toBe(true);
    });

    it('should handle unknown errors gracefully', () => {
      const error = new Error('Some unknown error');
      const context = ErrorHandler.analyzeError(error, 'unknown-operation');

      expect(context.category).toBe(ErrorCategory.UNKNOWN);
      expect(context.severity).toBe(ErrorSeverity.MEDIUM);
      expect(context.operation).toBe('unknown-operation');
    });
  });

  describe('Recovery Actions', () => {
    it('should generate appropriate recovery actions for file system errors', () => {
      const context = {
        operation: 'write-file',
        filePath: '/test/missing/file.txt',
        timestamp: Date.now(),
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.FILE_SYSTEM,
        retryable: false
      };

      const actions = ErrorHandler.generateRecoveryActions(context);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('manual');
      expect(actions[0].description).toContain('Create missing directory');
      expect(actions[0].execute).toBeDefined();
    });

    it('should generate retry actions for retryable errors', () => {
      const context = {
        operation: 'network-request',
        timestamp: Date.now(),
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.NETWORK,
        retryable: true
      };

      const actions = ErrorHandler.generateRecoveryActions(context);

      expect(actions.some(action => action.type === 'retry')).toBe(true);
    });

    it('should generate rollback actions for high severity errors', () => {
      const context = {
        operation: 'critical-operation',
        timestamp: Date.now(),
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.RESOURCE,
        retryable: false
      };

      const actions = ErrorHandler.generateRecoveryActions(context);

      expect(actions.some(action => action.type === 'rollback')).toBe(true);
    });
  });

  describe('Error Logging and Tracking', () => {
    it('should log and track errors correctly', async () => {
      const error = new Error('Test error');
      const systemError = await ErrorHandler.handleError(error, 'test-operation', '/test/file.txt');

      expect(systemError).toBeInstanceOf(SystemError);
      expect(systemError.context.operation).toBe('test-operation');
      expect(systemError.context.filePath).toBe('/test/file.txt');

      const recentErrors = ErrorHandler.getRecentErrors();
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0]).toBe(systemError);
    });

    it('should track error statistics correctly', async () => {
      // Create errors of different types
      await ErrorHandler.handleError(new Error('ENOENT: file not found'), 'read-file');
      await ErrorHandler.handleError(new Error('EACCES: permission denied'), 'write-file');
      await ErrorHandler.handleError(new Error('ENOSPC: no space left'), 'write-file');

      const stats = ErrorHandler.getErrorStats();
      
      expect(stats.total).toBe(3);
      expect(stats.bySeverity[ErrorSeverity.LOW]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.byCategory[ErrorCategory.FILE_SYSTEM]).toBe(1);
      expect(stats.byCategory[ErrorCategory.PERMISSION]).toBe(1);
      expect(stats.byCategory[ErrorCategory.RESOURCE]).toBe(1);
    });

    it('should filter errors by category and severity', async () => {
      await ErrorHandler.handleError(new Error('ENOENT: file not found'), 'read-file');
      await ErrorHandler.handleError(new Error('EACCES: permission denied'), 'write-file');

      const fileSystemErrors = ErrorHandler.getErrorsByCategory(ErrorCategory.FILE_SYSTEM);
      const permissionErrors = ErrorHandler.getErrorsByCategory(ErrorCategory.PERMISSION);
      const lowSeverityErrors = ErrorHandler.getErrorsBySeverity(ErrorSeverity.LOW);
      const highSeverityErrors = ErrorHandler.getErrorsBySeverity(ErrorSeverity.HIGH);

      expect(fileSystemErrors).toHaveLength(1);
      expect(permissionErrors).toHaveLength(1);
      expect(lowSeverityErrors).toHaveLength(1);
      expect(highSeverityErrors).toHaveLength(1);
    });

    it('should manage log size correctly', async () => {
      // Set a small max log size for testing
      const originalMaxSize = ErrorHandler['maxLogSize'];
      ErrorHandler['maxLogSize'] = 3;

      // Add more errors than the max size
      for (let i = 0; i < 5; i++) {
        await ErrorHandler.handleError(new Error(`Error ${i}`), `operation-${i}`);
      }

      const recentErrors = ErrorHandler.getRecentErrors();
      expect(recentErrors.length).toBeLessThanOrEqual(3);

      // Restore original max size
      ErrorHandler['maxLogSize'] = originalMaxSize;
    });
  });

  describe('Error Listeners', () => {
    it('should notify listeners when errors occur', async () => {
      const mockListener = jest.fn();
      ErrorHandler.addListener(mockListener);

      const error = new Error('Test error');
      await ErrorHandler.handleError(error, 'test-operation');

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(expect.any(SystemError));

      ErrorHandler.removeListener(mockListener);
    });

    it('should handle listener errors gracefully', async () => {
      const faultyListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      ErrorHandler.addListener(faultyListener);

      const error = new Error('Test error');
      await ErrorHandler.handleError(error, 'test-operation');

      expect(faultyListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('[ErrorHandler] Listener error:', expect.any(Error));

      ErrorHandler.removeListener(faultyListener);
      consoleSpy.mockRestore();
    });
  });
});

describe('withErrorHandling', () => {
  beforeEach(() => {
    ErrorHandler.clearLog();
  });

  it('should execute successful operations without interference', async () => {
    const operation = (jest.fn() as any).mockResolvedValue('success');
    
    const result = await withErrorHandling(operation as () => Promise<string>, 'test-operation');
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should wrap errors in SystemError', async () => {
    const operation = (jest.fn() as any).mockRejectedValue(new Error('Operation failed'));
    
    await expect(withErrorHandling(operation as () => Promise<unknown>, 'test-operation', '/test/file.txt')).rejects.toThrow(SystemError);
    
    const recentErrors = ErrorHandler.getRecentErrors();
    expect(recentErrors).toHaveLength(1);
    expect(recentErrors[0].context.operation).toBe('test-operation');
    expect(recentErrors[0].context.filePath).toBe('/test/file.txt');
  });
});

describe('SystemError', () => {
  it('should create system errors with proper context', () => {
    const context = {
      operation: 'test-operation',
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.VALIDATION,
      retryable: true,
      filePath: '/test/file.txt'
    };

    const recoveryActions = [
      { type: 'retry' as const, description: 'Retry operation' }
    ];

    const systemError = new SystemError('Test error', context, recoveryActions);

    expect(systemError.message).toBe('Test error');
    expect(systemError.context.operation).toBe('test-operation');
    expect(systemError.context.severity).toBe(ErrorSeverity.HIGH);
    expect(systemError.context.category).toBe(ErrorCategory.VALIDATION);
    expect(systemError.context.retryable).toBe(true);
    expect(systemError.context.filePath).toBe('/test/file.txt');
    expect(systemError.recoveryActions).toHaveLength(1);
    expect(systemError.recoveryActions[0].type).toBe('retry');
  });

  it('should provide default values for missing context', () => {
    const systemError = new SystemError('Test error', {});

    expect(systemError.context.operation).toBe('unknown');
    expect(systemError.context.severity).toBe(ErrorSeverity.MEDIUM);
    expect(systemError.context.category).toBe(ErrorCategory.UNKNOWN);
    expect(systemError.context.retryable).toBe(false);
    expect(systemError.context.timestamp).toBeDefined();
    expect(systemError.recoveryActions).toHaveLength(0);
  });
});

describe('FileOperationRecovery', () => {
  it('should check permissions correctly', async () => {
    // Test with a file that should exist and be readable (package.json)
    const permissions = await FileOperationRecovery.checkPermissions('package.json');
    
    expect(typeof permissions.readable).toBe('boolean');
    expect(typeof permissions.writable).toBe('boolean');
    expect(typeof permissions.executable).toBe('boolean');
  });

  it('should handle non-existent files gracefully', async () => {
    const permissions = await FileOperationRecovery.checkPermissions('/non/existent/file.txt');
    
    expect(permissions.readable).toBe(false);
    expect(permissions.writable).toBe(false);
    expect(permissions.executable).toBe(false);
  });

  it('should check disk space', async () => {
    const hasSpace = await FileOperationRecovery.checkDiskSpace('/tmp', 1024);
    expect(typeof hasSpace).toBe('boolean');
  });
});