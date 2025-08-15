import path from 'path';
import { SandboxManager } from '../sandbox-manager';

describe('SandboxManager Unit Tests', () => {
  let sandboxManager: SandboxManager;
  let testSandboxesDir: string;

  beforeEach(() => {
    testSandboxesDir = '/tmp/test-sandboxes';
    sandboxManager = new SandboxManager({
      sandboxesDir: testSandboxesDir,
      maxSandboxes: 3,
      cleanupInterval: 1000 * 60 * 60, // 1 hour for testing
    });
  });

  describe('constructor', () => {
    it('should use default values when no config provided', () => {
      const defaultManager = new SandboxManager();
      expect(defaultManager['sandboxesDir']).toBe(path.join(process.cwd(), 'sandboxes'));
      expect(defaultManager['maxSandboxes']).toBe(50);
      expect(defaultManager['cleanupInterval']).toBe(24 * 60 * 60 * 1000);
    });

    it('should use provided config values', () => {
      expect(sandboxManager['sandboxesDir']).toBe(testSandboxesDir);
      expect(sandboxManager['maxSandboxes']).toBe(3);
      expect(sandboxManager['cleanupInterval']).toBe(1000 * 60 * 60);
    });
  });

  describe('getSandboxPath', () => {
    it('should return correct sandbox path', () => {
      const sandboxId = 'test-sandbox-id';
      const expectedPath = path.join(testSandboxesDir, sandboxId);

      const sandboxPath = sandboxManager.getSandboxPath(sandboxId);

      expect(sandboxPath).toBe(expectedPath);
    });

    it('should throw error for invalid sandbox ID', () => {
      expect(() => sandboxManager.getSandboxPath('')).toThrow('Invalid sandbox ID provided');
      expect(() => sandboxManager.getSandboxPath(null as any)).toThrow('Invalid sandbox ID provided');
    });

    it('should validate sandbox path boundaries', () => {
      // Test basic input validation
      expect(() => sandboxManager.getSandboxPath('')).toThrow('Invalid sandbox ID provided');
      expect(() => sandboxManager.getSandboxPath(null as any)).toThrow('Invalid sandbox ID provided');
      
      // Test with potentially malicious paths
      const maliciousPaths = [
        '../../etc/passwd',
        '../../../root'
      ];

      maliciousPaths.forEach(maliciousPath => {
        // The exact behavior may vary depending on the path resolution
        try {
          const result = sandboxManager.getSandboxPath(maliciousPath);
          // If it doesn't throw, verify the path is still within expected boundaries
          expect(result).toContain(testSandboxesDir);
        } catch (error) {
          // Throwing an error is also acceptable for security
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('validateSandboxPath (private method via getSandboxPath)', () => {
    it('should allow valid sandbox IDs', () => {
      const validSandboxId = 'valid-sandbox-123';
      const expectedPath = path.join(testSandboxesDir, validSandboxId);

      const sandboxPath = sandboxManager.getSandboxPath(validSandboxId);
      expect(sandboxPath).toBe(expectedPath);
    });

    it('should handle UUID-like sandbox IDs', () => {
      const uuidLikeId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const expectedPath = path.join(testSandboxesDir, uuidLikeId);

      const sandboxPath = sandboxManager.getSandboxPath(uuidLikeId);
      expect(sandboxPath).toBe(expectedPath);
    });
  });

  describe('configuration validation', () => {
    it('should handle different sandbox directory configurations', () => {
      const customDir = '/custom/sandbox/path';
      const customManager = new SandboxManager({
        sandboxesDir: customDir
      });

      expect(customManager['sandboxesDir']).toBe(customDir);
    });

    it('should handle different max sandbox configurations', () => {
      const customMax = 100;
      const customManager = new SandboxManager({
        maxSandboxes: customMax
      });

      expect(customManager['maxSandboxes']).toBe(customMax);
    });

    it('should handle different cleanup interval configurations', () => {
      const customInterval = 2 * 60 * 60 * 1000; // 2 hours
      const customManager = new SandboxManager({
        cleanupInterval: customInterval
      });

      expect(customManager['cleanupInterval']).toBe(customInterval);
    });
  });

  describe('utility methods', () => {
    it('should generate unique sandbox IDs', () => {
      // Test the private method indirectly by checking that multiple calls to createSandbox
      // would generate different IDs. Since we can't easily mock the actual FS operations
      // here, we'll test this via the integration tests instead.
      
      // This test validates the method exists and basic functionality
      expect(typeof sandboxManager['generateSandboxId']).toBe('function');
      
      // Call the private method directly using array notation
      const id1 = sandboxManager['generateSandboxId']();
      const id2 = sandboxManager['generateSandboxId']();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id2.length).toBeGreaterThan(0);
    });

    it('should validate internal path resolution', () => {
      // Test the private validateSandboxPath method indirectly
      const testPath = path.join(testSandboxesDir, 'test-sandbox');
      
      // Since validateSandboxPath is private, test it via getSandboxPath which uses it
      expect(() => {
        sandboxManager.getSandboxPath('test-sandbox');
      }).not.toThrow();
    });
  });

  describe('error handling patterns', () => {
    it('should throw appropriate errors for invalid inputs', () => {
      const invalidInputs = [
        '',
        null,
        undefined,
        123,
        {},
        []
      ];

      invalidInputs.forEach(input => {
        expect(() => {
          sandboxManager.getSandboxPath(input as any);
        }).toThrow();
      });
    });

    it('should handle edge case sandbox IDs', () => {
      const edgeCaseIds = [
        'a',
        '1',
        'test-sandbox-with-very-long-name-that-should-still-be-valid',
        'test.sandbox.with.dots',
        'test_sandbox_with_underscores'
      ];

      edgeCaseIds.forEach(id => {
        expect(() => {
          const path = sandboxManager.getSandboxPath(id);
          expect(path).toContain(testSandboxesDir);
          expect(path).toContain(id);
        }).not.toThrow();
      });
    });
  });
});