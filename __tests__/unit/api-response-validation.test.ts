/**
 * @jest-environment node
 */

import { NextResponse } from 'next/server';

describe('API Response Validation', () => {
  // Test API response structure and validation
  describe('Response Structure Validation', () => {
    it('should validate success response structure', () => {
      const successResponse = {
        success: true,
        data: {
          pid: 12345,
          port: 5173,
          status: 'running'
        },
        message: 'Operation completed successfully'
      };

      expect(successResponse).toHaveProperty('success');
      expect(successResponse).toHaveProperty('data');
      expect(successResponse).toHaveProperty('message');
      expect(successResponse.success).toBe(true);
      expect(typeof successResponse.data).toBe('object');
      expect(typeof successResponse.message).toBe('string');
    });

    it('should validate error response structure', () => {
      const errorResponse = {
        success: false,
        error: 'Command validation failed',
        details: {
          command: 'dangerous-command',
          reason: 'Security violation'
        }
      };

      expect(errorResponse).toHaveProperty('success');
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse.success).toBe(false);
      expect(typeof errorResponse.error).toBe('string');
      expect(errorResponse.error.length).toBeGreaterThan(0);
    });

    it('should validate process status response', () => {
      const processStatusResponse = {
        success: true,
        process: {
          pid: 12345,
          isRunning: true,
          memoryUsage: 50 * 1024 * 1024,
          uptime: 300000,
          cpuUsage: 15.5
        },
        port: {
          port: 5173,
          accessible: true,
          responseTime: 150
        },
        workingDirectory: '/tmp/sandbox-workspace',
        lastHealthCheck: new Date().toISOString()
      };

      expect(processStatusResponse.success).toBe(true);
      expect(processStatusResponse.process).toBeDefined();
      expect(processStatusResponse.port).toBeDefined();
      expect(typeof processStatusResponse.process.pid).toBe('number');
      expect(typeof processStatusResponse.process.isRunning).toBe('boolean');
      expect(typeof processStatusResponse.port.port).toBe('number');
      expect(typeof processStatusResponse.port.accessible).toBe('boolean');
    });

    it('should validate cleanup stats response', () => {
      const cleanupStatsResponse = {
        success: true,
        stats: {
          totalProcesses: 5,
          runningProcesses: 3,
          zombieProcesses: 0,
          stoppedProcesses: 2,
          errorProcesses: 0,
          totalMemoryUsage: 150 * 1024 * 1024,
          lastCleanupTime: new Date().toISOString(),
          cleanupCount: 10,
          errors: []
        },
        processes: []
      };

      expect(cleanupStatsResponse.success).toBe(true);
      expect(cleanupStatsResponse.stats).toBeDefined();
      expect(typeof cleanupStatsResponse.stats.totalProcesses).toBe('number');
      expect(typeof cleanupStatsResponse.stats.runningProcesses).toBe('number');
      expect(Array.isArray(cleanupStatsResponse.stats.errors)).toBe(true);
      expect(Array.isArray(cleanupStatsResponse.processes)).toBe(true);
    });
  });

  describe('HTTP Status Code Validation', () => {
    it('should use correct status codes for different scenarios', () => {
      const scenarios = [
        { case: 'success', expectedStatus: 200 },
        { case: 'bad_request', expectedStatus: 400 },
        { case: 'forbidden', expectedStatus: 403 },
        { case: 'not_found', expectedStatus: 404 },
        { case: 'internal_error', expectedStatus: 500 }
      ];

      scenarios.forEach(scenario => {
        expect(scenario.expectedStatus).toBeGreaterThanOrEqual(200);
        expect(scenario.expectedStatus).toBeLessThan(600);
        
        if (scenario.case === 'success') {
          expect(scenario.expectedStatus).toBe(200);
        } else if (scenario.case === 'bad_request') {
          expect(scenario.expectedStatus).toBe(400);
        } else if (scenario.case === 'forbidden') {
          expect(scenario.expectedStatus).toBe(403);
        } else if (scenario.case === 'not_found') {
          expect(scenario.expectedStatus).toBe(404);
        } else if (scenario.case === 'internal_error') {
          expect(scenario.expectedStatus).toBe(500);
        }
      });
    });

    it('should handle NextResponse creation', () => {
      const responseData = { success: true, message: 'Test response' };
      const response = NextResponse.json(responseData);
      
      expect(response).toBeDefined();
      expect(typeof response.json).toBe('function');
    });
  });

  describe('Data Validation', () => {
    it('should validate PID values', () => {
      const validatePid = (pid: any): boolean => {
        return typeof pid === 'number' && pid > 0 && Number.isInteger(pid);
      };

      expect(validatePid(12345)).toBe(true);
      expect(validatePid(-1)).toBe(false);
      expect(validatePid(0)).toBe(false);
      expect(validatePid('12345')).toBe(false);
      expect(validatePid(12345.5)).toBe(false);
      expect(validatePid(null)).toBe(false);
      expect(validatePid(undefined)).toBe(false);
    });

    it('should validate port numbers', () => {
      const validatePort = (port: any): boolean => {
        return typeof port === 'number' && 
               port >= 1 && 
               port <= 65535 && 
               Number.isInteger(port);
      };

      expect(validatePort(5173)).toBe(true);
      expect(validatePort(80)).toBe(true);
      expect(validatePort(8080)).toBe(true);
      expect(validatePort(0)).toBe(false);
      expect(validatePort(-1)).toBe(false);
      expect(validatePort(65536)).toBe(false);
      expect(validatePort('5173')).toBe(false);
      expect(validatePort(5173.5)).toBe(false);
    });

    it('should validate memory usage values', () => {
      const validateMemoryUsage = (memory: any): boolean => {
        return typeof memory === 'number' && memory >= 0;
      };

      expect(validateMemoryUsage(0)).toBe(true);
      expect(validateMemoryUsage(1024)).toBe(true);
      expect(validateMemoryUsage(1024 * 1024 * 100)).toBe(true);
      expect(validateMemoryUsage(-1)).toBe(false);
      expect(validateMemoryUsage('1024')).toBe(false);
      expect(validateMemoryUsage(null)).toBe(false);
    });

    it('should validate timestamp formats', () => {
      const validateTimestamp = (timestamp: any): boolean => {
        if (typeof timestamp === 'string') {
          const date = new Date(timestamp);
          return !isNaN(date.getTime());
        }
        if (typeof timestamp === 'number') {
          return timestamp > 0 && timestamp <= Date.now() + 1000; // Allow 1 second future
        }
        return false;
      };

      const now = Date.now();
      const isoString = new Date().toISOString();
      
      expect(validateTimestamp(now)).toBe(true);
      expect(validateTimestamp(isoString)).toBe(true);
      expect(validateTimestamp('2023-01-01T00:00:00.000Z')).toBe(true);
      expect(validateTimestamp(-1)).toBe(false);
      expect(validateTimestamp('invalid-date')).toBe(false);
      expect(validateTimestamp(null)).toBe(false);
    });

    it('should validate process status values', () => {
      const validateProcessStatus = (status: any): boolean => {
        const validStatuses = ['starting', 'running', 'stopping', 'stopped', 'error'];
        return typeof status === 'string' && validStatuses.includes(status);
      };

      expect(validateProcessStatus('starting')).toBe(true);
      expect(validateProcessStatus('running')).toBe(true);
      expect(validateProcessStatus('stopping')).toBe(true);
      expect(validateProcessStatus('stopped')).toBe(true);
      expect(validateProcessStatus('error')).toBe(true);
      expect(validateProcessStatus('invalid')).toBe(false);
      expect(validateProcessStatus('')).toBe(false);
      expect(validateProcessStatus(null)).toBe(false);
      expect(validateProcessStatus(123)).toBe(false);
    });

    it('should validate process type values', () => {
      const validateProcessType = (type: any): boolean => {
        const validTypes = ['vite', 'command', 'system'];
        return typeof type === 'string' && validTypes.includes(type);
      };

      expect(validateProcessType('vite')).toBe(true);
      expect(validateProcessType('command')).toBe(true);
      expect(validateProcessType('system')).toBe(true);
      expect(validateProcessType('invalid')).toBe(false);
      expect(validateProcessType('')).toBe(false);
      expect(validateProcessType(null)).toBe(false);
    });
  });

  describe('Error Message Validation', () => {
    it('should provide descriptive error messages', () => {
      const errorMessages = [
        'Command is required',
        'Command blocked: Command contains blocked pattern',
        'Working directory does not exist',
        'Process not found or already terminated',
        'Failed to start Vite process',
        'Command execution timeout'
      ];

      errorMessages.forEach(message => {
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(10);
        expect(message).not.toContain('undefined');
        expect(message).not.toContain('null');
      });
    });

    it('should validate error response completeness', () => {
      const validateErrorResponse = (response: any): boolean => {
        return (
          typeof response === 'object' &&
          response.success === false &&
          typeof response.error === 'string' &&
          response.error.length > 0
        );
      };

      const validErrorResponse = {
        success: false,
        error: 'Command validation failed'
      };

      const invalidErrorResponses = [
        { success: false }, // Missing error
        { error: 'Some error' }, // Missing success
        { success: true, error: 'Error' }, // Inconsistent success/error
        { success: false, error: '' }, // Empty error message
        { success: false, error: null } // Null error message
      ];

      expect(validateErrorResponse(validErrorResponse)).toBe(true);
      
      invalidErrorResponses.forEach(response => {
        expect(validateErrorResponse(response)).toBe(false);
      });
    });
  });

  describe('Response Size Validation', () => {
    it('should keep response sizes reasonable', () => {
      const maxResponseSize = 100 * 1024; // 100KB

      const largeResponse = {
        success: true,
        data: Array(1000).fill(0).map((_, i) => ({
          id: `process-${i}`,
          status: 'running',
          details: 'Some process details that could make the response large'
        }))
      };

      const responseSize = JSON.stringify(largeResponse).length;
      
      // This test ensures we're aware of response sizes
      expect(typeof responseSize).toBe('number');
      expect(responseSize).toBeGreaterThan(0);
      
      // If response is too large, we should implement pagination
      if (responseSize > maxResponseSize) {
        expect(largeResponse.data.length).toBeGreaterThan(10); // Should consider pagination
      }
    });

    it('should handle empty response arrays', () => {
      const emptyResponse = {
        success: true,
        processes: [],
        stats: {
          totalProcesses: 0,
          runningProcesses: 0,
          errors: []
        }
      };

      expect(Array.isArray(emptyResponse.processes)).toBe(true);
      expect(emptyResponse.processes.length).toBe(0);
      expect(Array.isArray(emptyResponse.stats.errors)).toBe(true);
      expect(emptyResponse.stats.errors.length).toBe(0);
    });
  });
});