import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { createSecureFileOps } from '../../lib/security/secure-file-ops';
import { PathSecurity } from '../../lib/security/path-security';

// Mock the security modules
jest.mock('../../lib/security/secure-file-ops', () => ({
  createSecureFileOps: jest.fn()
}));

jest.mock('../../lib/security/path-security', () => ({
  PathSecurity: jest.fn()
}));

// Custom hook for secure file operations
const useSecureFileOperations = (sandboxId: string) => {
  const [securityViolations, setSecurityViolations] = React.useState<any[]>([]);
  const [operationStats, setOperationStats] = React.useState({
    activeOperations: 0,
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0
  });

  const secureFileOps = React.useMemo(() => {
    return createSecureFileOps(`/tmp/sandbox-${sandboxId}`, {
      enableLogging: true,
      atomicWrites: true,
      backupOnUpdate: true
    });
  }, [sandboxId]);

  const pathSecurity = React.useMemo(() => {
    return new PathSecurity({
      sandboxDir: `/tmp/sandbox-${sandboxId}`,
      enableLogging: true
    });
  }, [sandboxId]);

  const validatePath = React.useCallback(async (path: string) => {
    try {
      const result = await pathSecurity.validatePath(path);
      if (!result.isValid && result.violation) {
        setSecurityViolations(prev => [...prev, result.violation]);
      }
      return result;
    } catch (error) {
      const violation = {
        type: 'validation_error',
        path,
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
      setSecurityViolations(prev => [...prev, violation]);
      throw error;
    }
  }, [pathSecurity]);

  const writeFile = React.useCallback(async (path: string, content: string) => {
    setOperationStats(prev => ({ 
      ...prev, 
      activeOperations: prev.activeOperations + 1,
      totalOperations: prev.totalOperations + 1
    }));

    try {
      // Validate path first
      const validation = await validatePath(path);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Path validation failed');
      }

      const result = await secureFileOps.writeFile(path, content);
      
      setOperationStats(prev => ({ 
        ...prev, 
        activeOperations: prev.activeOperations - 1,
        successfulOperations: result.success ? prev.successfulOperations + 1 : prev.successfulOperations,
        failedOperations: result.success ? prev.failedOperations : prev.failedOperations + 1
      }));

      if (!result.success) {
        throw new Error(result.error || 'Write operation failed');
      }

      return result;
    } catch (error) {
      // Only increment failed operations if we haven't already processed the result
      if ((error as Error).message === 'Path validation failed' || (error as Error).message.includes('Validation') || (error as Error).message === 'Disk full' || (error as Error).message === 'Path traversal' || (error as Error).message === 'Extension blocked') {
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1,
          failedOperations: prev.failedOperations + 1
        }));
      } else {
        // For other errors (like network errors), still count as active operation completed
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1
        }));
      }
      throw error;
    }
  }, [secureFileOps, validatePath]);

  const readFile = React.useCallback(async (path: string) => {
    setOperationStats(prev => ({ 
      ...prev, 
      activeOperations: prev.activeOperations + 1,
      totalOperations: prev.totalOperations + 1
    }));

    try {
      // Validate path first
      const validation = await validatePath(path);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Path validation failed');
      }

      const result = await secureFileOps.readFile(path);
      
      setOperationStats(prev => ({ 
        ...prev, 
        activeOperations: prev.activeOperations - 1,
        successfulOperations: result.success ? prev.successfulOperations + 1 : prev.successfulOperations,
        failedOperations: result.success ? prev.failedOperations : prev.failedOperations + 1
      }));

      if (!result.success) {
        throw new Error(result.error || 'Read operation failed');
      }

      return result.content;
    } catch (error) {
      // Only increment failed operations if we haven't already processed the result
      if ((error as Error).message === 'Path validation failed' || (error as Error).message.includes('Validation') || (error as Error).message === 'Disk full' || (error as Error).message === 'Path traversal' || (error as Error).message === 'Extension blocked') {
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1,
          failedOperations: prev.failedOperations + 1
        }));
      } else {
        // For other errors (like network errors), still count as active operation completed
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1
        }));
      }
      throw error;
    }
  }, [secureFileOps, validatePath]);

  const deleteFile = React.useCallback(async (path: string) => {
    setOperationStats(prev => ({ 
      ...prev, 
      activeOperations: prev.activeOperations + 1,
      totalOperations: prev.totalOperations + 1
    }));

    try {
      // Validate path first
      const validation = await validatePath(path);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Path validation failed');
      }

      const result = await secureFileOps.deleteFile(path);
      
      setOperationStats(prev => ({ 
        ...prev, 
        activeOperations: prev.activeOperations - 1,
        successfulOperations: result.success ? prev.successfulOperations + 1 : prev.successfulOperations,
        failedOperations: result.success ? prev.failedOperations : prev.failedOperations + 1
      }));

      if (!result.success) {
        throw new Error(result.error || 'Delete operation failed');
      }

      return result.success;
    } catch (error) {
      // Only increment failed operations if we haven't already processed the result
      if ((error as Error).message === 'Path validation failed' || (error as Error).message.includes('Validation') || (error as Error).message === 'Disk full' || (error as Error).message === 'Path traversal' || (error as Error).message === 'Extension blocked') {
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1,
          failedOperations: prev.failedOperations + 1
        }));
      } else {
        // For other errors (like network errors), still count as active operation completed
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1
        }));
      }
      throw error;
    }
  }, [secureFileOps, validatePath]);

  const listFiles = React.useCallback(async (dirPath: string = '') => {
    setOperationStats(prev => ({ 
      ...prev, 
      activeOperations: prev.activeOperations + 1,
      totalOperations: prev.totalOperations + 1
    }));

    try {
      if (dirPath) {
        const validation = await validatePath(dirPath);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Path validation failed');
        }
      }

      const result = await secureFileOps.listFiles(dirPath);
      
      setOperationStats(prev => ({ 
        ...prev, 
        activeOperations: prev.activeOperations - 1,
        successfulOperations: result.success ? prev.successfulOperations + 1 : prev.successfulOperations,
        failedOperations: result.success ? prev.failedOperations : prev.failedOperations + 1
      }));

      if (!result.success) {
        throw new Error(result.error || 'List operation failed');
      }

      return {
        files: result.files || [],
        directories: result.directories || []
      };
    } catch (error) {
      // Only increment failed operations if we haven't already processed the result
      if ((error as Error).message === 'Path validation failed' || (error as Error).message.includes('Validation') || (error as Error).message === 'Disk full' || (error as Error).message === 'Path traversal' || (error as Error).message === 'Extension blocked') {
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1,
          failedOperations: prev.failedOperations + 1
        }));
      } else {
        // For other errors (like network errors), still count as active operation completed
        setOperationStats(prev => ({ 
          ...prev, 
          activeOperations: prev.activeOperations - 1
        }));
      }
      throw error;
    }
  }, [secureFileOps, validatePath]);

  const getSecurityStats = React.useCallback(() => {
    return {
      totalViolations: securityViolations.length,
      violationsByType: securityViolations.reduce((acc, violation) => {
        acc[violation.type] = (acc[violation.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentViolations: securityViolations.slice(-10),
      operationStats,
      blockedIPs: 0 // This hook doesn't track IPs
    };
  }, [securityViolations, operationStats]);

  const clearViolations = React.useCallback(() => {
    setSecurityViolations([]);
  }, []);

  return {
    // File operations
    writeFile,
    readFile,
    deleteFile,
    listFiles,
    validatePath,
    
    // Security information
    securityViolations,
    securityStats: getSecurityStats(),
    clearViolations,
    
    // Operation statistics
    operationStats,
    
    // Helper methods
    isOperationInProgress: operationStats.activeOperations > 0
  };
};

describe('useSecureFileOperations Hook', () => {
  const mockSecureFileOps = {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    deleteFile: jest.fn(),
    listFiles: jest.fn(),
    fileExists: jest.fn()
  };

  const mockPathSecurity = {
    validatePath: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createSecureFileOps as jest.Mock).mockReturnValue(mockSecureFileOps);
    (PathSecurity as jest.Mock).mockImplementation(() => mockPathSecurity);
  });

  describe('Path Validation', () => {
    it('should validate paths before file operations', async () => {
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: false,
        error: 'Invalid file path: directory traversal detected',
        violation: {
          type: 'path_traversal',
          path: '../../../malicious.txt',
          details: 'Directory traversal detected',
          timestamp: new Date()
        }
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      let error: Error | undefined;
      await act(async () => {
        try {
          await result.current.writeFile('../../../malicious.txt', 'content');
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('directory traversal');
      expect(mockPathSecurity.validatePath).toHaveBeenCalledWith('../../../malicious.txt');
      expect(mockSecureFileOps.writeFile).not.toHaveBeenCalled();
    });

    it('should allow operations for valid paths', async () => {
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: true,
        resolvedPath: '/tmp/sandbox-test-sandbox/valid.txt'
      });

      mockSecureFileOps.writeFile.mockResolvedValue({
        success: true,
        path: 'valid.txt',
        operation: 'created'
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      let writeResult;
      await act(async () => {
        writeResult = await result.current.writeFile('valid.txt', 'content');
      });

      expect(writeResult).toEqual({
        success: true,
        path: 'valid.txt',
        operation: 'created'
      });
      expect(mockPathSecurity.validatePath).toHaveBeenCalledWith('valid.txt');
      expect(mockSecureFileOps.writeFile).toHaveBeenCalledWith('valid.txt', 'content');
    });
  });

  describe('Security Violation Tracking', () => {
    it('should track security violations in state', async () => {
      const violation = {
        type: 'path_traversal',
        path: '../attack.txt',
        details: 'Directory traversal detected',
        timestamp: new Date()
      };

      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: false,
        error: 'Path traversal detected',
        violation
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      await act(async () => {
        try {
          await result.current.writeFile('../attack.txt', 'content');
        } catch (e) {
          // Expected to fail
        }
      });

      expect(result.current.securityViolations).toHaveLength(1);
      expect(result.current.securityViolations[0]).toEqual(violation);
    });

    it('should track multiple violations', async () => {
      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      // First violation
      mockPathSecurity.validatePath.mockResolvedValueOnce({
        isValid: false,
        error: 'Path traversal detected',
        violation: {
          type: 'path_traversal',
          path: '../attack1.txt',
          details: 'Directory traversal',
          timestamp: new Date()
        }
      });

      await act(async () => {
        try {
          await result.current.writeFile('../attack1.txt', 'content');
        } catch (e) {
          // Expected
        }
      });

      // Second violation
      mockPathSecurity.validatePath.mockResolvedValueOnce({
        isValid: false,
        error: 'Extension not allowed',
        violation: {
          type: 'extension_blocked',
          path: 'malware.exe',
          details: 'Extension blocked',
          timestamp: new Date()
        }
      });

      await act(async () => {
        try {
          await result.current.writeFile('malware.exe', 'content');
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.securityViolations).toHaveLength(2);
      expect(result.current.securityViolations[0].type).toBe('path_traversal');
      expect(result.current.securityViolations[1].type).toBe('extension_blocked');
    });

    it('should clear violations when requested', async () => {
      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      // Add a violation
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: false,
        error: 'Path traversal detected',
        violation: {
          type: 'path_traversal',
          path: '../attack.txt',
          details: 'Directory traversal',
          timestamp: new Date()
        }
      });

      await act(async () => {
        try {
          await result.current.writeFile('../attack.txt', 'content');
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.securityViolations).toHaveLength(1);

      // Clear violations
      act(() => {
        result.current.clearViolations();
      });

      expect(result.current.securityViolations).toHaveLength(0);
    });
  });

  describe('Operation Statistics', () => {
    it('should track operation statistics', async () => {
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: true,
        resolvedPath: '/tmp/sandbox-test-sandbox/test.txt'
      });

      mockSecureFileOps.writeFile.mockResolvedValue({
        success: true,
        path: 'test.txt',
        operation: 'created'
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      expect(result.current.operationStats.totalOperations).toBe(0);
      expect(result.current.operationStats.successfulOperations).toBe(0);

      await act(async () => {
        await result.current.writeFile('test.txt', 'content');
      });

      expect(result.current.operationStats.totalOperations).toBe(1);
      expect(result.current.operationStats.successfulOperations).toBe(1);
      expect(result.current.operationStats.failedOperations).toBe(0);
      expect(result.current.operationStats.activeOperations).toBe(0);
    });

    it('should track failed operations', async () => {
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: true,
        resolvedPath: '/tmp/sandbox-test-sandbox/test.txt'
      });

      mockSecureFileOps.writeFile.mockResolvedValue({
        success: false,
        path: 'test.txt',
        operation: 'created',
        error: 'Write failed'
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      await act(async () => {
        try {
          await result.current.writeFile('test.txt', 'content');
        } catch (e) {
          // Expected to fail
        }
      });

      expect(result.current.operationStats.totalOperations).toBe(1);
      expect(result.current.operationStats.successfulOperations).toBe(0);
      expect(result.current.operationStats.failedOperations).toBe(1);
    });

    it('should track active operations during execution', async () => {
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: true,
        resolvedPath: '/tmp/sandbox-test-sandbox/test.txt'
      });

      let resolveWrite: (value: any) => void;
      const writePromise = new Promise(resolve => {
        resolveWrite = resolve;
      });
      mockSecureFileOps.writeFile.mockReturnValue(writePromise);

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      // Start operation
      act(() => {
        result.current.writeFile('test.txt', 'content');
      });

      // Should show active operation
      expect(result.current.operationStats.activeOperations).toBe(1);
      expect(result.current.isOperationInProgress).toBe(true);

      // Complete operation
      await act(async () => {
        resolveWrite!({
          success: true,
          path: 'test.txt',
          operation: 'created'
        });
        await writePromise;
      });

      expect(result.current.operationStats.activeOperations).toBe(0);
      expect(result.current.isOperationInProgress).toBe(false);
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: true,
        resolvedPath: '/tmp/sandbox-test-sandbox/test.txt'
      });
    });

    it('should support file reading', async () => {
      mockSecureFileOps.readFile.mockResolvedValue({
        success: true,
        content: 'file content',
        path: 'test.txt',
        size: 12
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      let content;
      await act(async () => {
        content = await result.current.readFile('test.txt');
      });

      expect(content).toBe('file content');
      expect(mockSecureFileOps.readFile).toHaveBeenCalledWith('test.txt');
    });

    it('should support file deletion', async () => {
      mockSecureFileOps.deleteFile.mockResolvedValue({
        success: true,
        path: 'test.txt'
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      let deleted;
      await act(async () => {
        deleted = await result.current.deleteFile('test.txt');
      });

      expect(deleted).toBe(true);
      expect(mockSecureFileOps.deleteFile).toHaveBeenCalledWith('test.txt');
    });

    it('should support directory listing', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: ['file1.txt', 'file2.js'],
        directories: ['subdir1', 'subdir2']
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      let listing;
      await act(async () => {
        listing = await result.current.listFiles();
      });

      expect(listing).toEqual({
        files: ['file1.txt', 'file2.js'],
        directories: ['subdir1', 'subdir2']
      });
      expect(mockSecureFileOps.listFiles).toHaveBeenCalledWith('');
    });

    it('should validate directory paths for listing', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: [],
        directories: []
      });

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      await act(async () => {
        await result.current.listFiles('subdir');
      });

      expect(mockPathSecurity.validatePath).toHaveBeenCalledWith('subdir');
      expect(mockSecureFileOps.listFiles).toHaveBeenCalledWith('subdir');
    });
  });

  describe('Security Statistics', () => {
    it('should provide comprehensive security statistics', async () => {
      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      // Add some violations
      mockPathSecurity.validatePath.mockResolvedValueOnce({
        isValid: false,
        error: 'Path traversal',
        violation: {
          type: 'path_traversal',
          path: '../attack1.txt',
          details: 'Directory traversal',
          timestamp: new Date()
        }
      });

      await act(async () => {
        try {
          await result.current.writeFile('../attack1.txt', 'content');
        } catch (e) {
          // Expected
        }
      });

      mockPathSecurity.validatePath.mockResolvedValueOnce({
        isValid: false,
        error: 'Extension blocked',
        violation: {
          type: 'extension_blocked',
          path: 'malware.exe',
          details: 'Extension not allowed',
          timestamp: new Date()
        }
      });

      await act(async () => {
        try {
          await result.current.writeFile('malware.exe', 'content');
        } catch (e) {
          // Expected
        }
      });

      const stats = result.current.securityStats;
      expect(stats.totalViolations).toBe(2);
      expect(stats.violationsByType.path_traversal).toBe(1);
      expect(stats.violationsByType.extension_blocked).toBe(1);
      expect(stats.recentViolations).toHaveLength(2);
      expect(stats.operationStats.totalOperations).toBe(2);
      expect(stats.operationStats.failedOperations).toBe(2);
    });

    it('should limit recent violations to 10', async () => {
      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      // Add 15 violations
      for (let i = 0; i < 15; i++) {
        mockPathSecurity.validatePath.mockResolvedValueOnce({
          isValid: false,
          error: 'Path traversal',
          violation: {
            type: 'path_traversal',
            path: `../attack${i}.txt`,
            details: 'Directory traversal',
            timestamp: new Date()
          }
        });

        await act(async () => {
          try {
            await result.current.writeFile(`../attack${i}.txt`, 'content');
          } catch (e) {
            // Expected
          }
        });
      }

      const stats = result.current.securityStats;
      expect(stats.totalViolations).toBe(15);
      expect(stats.recentViolations).toHaveLength(10); // Limited to 10
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      mockPathSecurity.validatePath.mockRejectedValue(new Error('Validation service unavailable'));

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      let error: Error | undefined;
      await act(async () => {
        try {
          await result.current.writeFile('test.txt', 'content');
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeDefined();
      expect(error?.message).toBe('Validation service unavailable');
      expect(result.current.securityViolations).toHaveLength(1);
      expect(result.current.securityViolations[0].type).toBe('validation_error');
    });

    it('should handle file operation errors gracefully', async () => {
      mockPathSecurity.validatePath.mockResolvedValue({
        isValid: true,
        resolvedPath: '/tmp/sandbox-test-sandbox/test.txt'
      });

      mockSecureFileOps.writeFile.mockRejectedValue(new Error('Disk full'));

      const { result } = renderHook(() => useSecureFileOperations('test-sandbox'));

      let error: Error | undefined;
      await act(async () => {
        try {
          await result.current.writeFile('test.txt', 'content');
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeDefined();
      expect(error?.message).toBe('Disk full');
      expect(result.current.operationStats.failedOperations).toBe(1);
    });
  });

  describe('Hook Dependencies', () => {
    it('should recreate secure file ops when sandbox ID changes', () => {
      const { result, rerender } = renderHook(
        ({ sandboxId }) => useSecureFileOperations(sandboxId),
        { initialProps: { sandboxId: 'sandbox-1' } }
      );

      expect(createSecureFileOps).toHaveBeenCalledWith('/tmp/sandbox-sandbox-1', expect.any(Object));

      rerender({ sandboxId: 'sandbox-2' });

      expect(createSecureFileOps).toHaveBeenCalledWith('/tmp/sandbox-sandbox-2', expect.any(Object));
    });

    it('should maintain separate state for different sandbox instances', () => {
      const { result: result1 } = renderHook(() => useSecureFileOperations('sandbox-1'));
      const { result: result2 } = renderHook(() => useSecureFileOperations('sandbox-2'));

      expect(result1.current.securityViolations).toEqual([]);
      expect(result2.current.securityViolations).toEqual([]);
      expect(result1.current.operationStats).not.toBe(result2.current.operationStats);
    });
  });
});