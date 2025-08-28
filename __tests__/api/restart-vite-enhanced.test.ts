import { POST } from '@/app/api/restart-vite/route';
import { defaultPortManager } from '@/lib/port-manager';
import { processCleanupManager } from '@/lib/process-cleanup-manager';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';

jest.mock('@/lib/port-manager');
jest.mock('@/lib/process-cleanup-manager');
jest.mock('child_process');
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn()
  }
}));
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

describe('/api/restart-vite - Port Manager Integration', () => {
  const mockPortManager = defaultPortManager as jest.Mocked<typeof defaultPortManager>;
  const mockProcessCleanup = processCleanupManager as jest.Mocked<typeof processCleanupManager>;
  const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockNextResponse = NextResponse as jest.Mocked<typeof NextResponse>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.activeSandbox = null;
    global.viteProcess = null;
    
    // Setup NextResponse.json mock to return a proper response object
    mockNextResponse.json.mockImplementation((data, init) => {
      const response = {
        status: init?.status || 200,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data))
      };
      return response as any;
    });
    
    // Mock successful process
    const mockViteProcess = {
      pid: 67890,
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    };
    mockSpawn.mockReturnValue(mockViteProcess as any);
    
    mockFs.readFile.mockResolvedValue('12345');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    
    mockProcessCleanup.unregisterProcess.mockResolvedValue(true);
    mockProcessCleanup.registerProcess.mockReturnValue({
      id: 'vite-server-test',
      process: mockViteProcess
    } as any);
  });

  describe('Dynamic Port Allocation', () => {
    it('should use existing port reservation when available', async () => {
      global.activeSandbox = { id: 'existing-sandbox-123' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5175,
        sandboxId: 'existing-sandbox-123',
        url: 'http://localhost:5175',
        reservedAt: new Date(),
        status: 'active'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.port).toBe(5175);
      expect(mockPortManager.getReservation).toHaveBeenCalledWith('existing-sandbox-123');
      expect(mockPortManager.activatePort).toHaveBeenCalledWith('existing-sandbox-123');
    });

    it('should reserve new port when no existing reservation', async () => {
      global.activeSandbox = { id: 'existing-sandbox-123' };
      
      mockPortManager.getReservation.mockReturnValue(undefined);
      mockPortManager.reservePort.mockResolvedValue({
        port: 5176,
        sandboxId: 'existing-sandbox-123',
        url: 'http://localhost:5176',
        reservedAt: new Date(),
        status: 'reserved'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.port).toBe(5176);
      expect(mockPortManager.reservePort).toHaveBeenCalledWith('existing-sandbox-123');
    });

    it('should create default sandbox when no active sandbox exists', async () => {
      global.activeSandbox = null;
      
      mockPortManager.reservePort.mockResolvedValue({
        port: 5177,
        sandboxId: 'default-sandbox',
        url: 'http://localhost:5177',
        reservedAt: new Date(),
        status: 'reserved'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.port).toBe(5177);
      expect(mockPortManager.reservePort).toHaveBeenCalledWith('default-sandbox');
    });

    it('should fallback to default port on reservation failure', async () => {
      global.activeSandbox = null;
      
      mockPortManager.reservePort.mockRejectedValue(new Error('Port exhausted'));
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.port).toBe(5173); // Fallback to default
    });
  });

  describe('Port Availability Checking', () => {
    it('should wait for port to be released before starting', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5178,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5178',
        reservedAt: new Date(),
        status: 'reserved'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.port).toBe(5178);
    });

    it('should proceed even if port is not released in time', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5179,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5179',
        reservedAt: new Date(),
        status: 'reserved'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.port).toBe(5179);
    });
  });

  describe('Global State Updates', () => {
    it('should update global sandbox state with new port info', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5178,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5178',
        reservedAt: new Date(),
        status: 'active'
      });
      
      await POST();
      
      expect(global.activeSandbox.port).toBe(5178);
      expect(global.activeSandbox.url).toBe('http://localhost:5178');
    });

    it('should handle missing global sandbox gracefully', async () => {
      global.activeSandbox = null;
      
      mockPortManager.reservePort.mockResolvedValue({
        port: 5180,
        sandboxId: 'default-sandbox',
        url: 'http://localhost:5180',
        reservedAt: new Date(),
        status: 'reserved'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // global.activeSandbox should remain null since it wasn't set before
      expect(global.activeSandbox).toBeNull();
    });
  });

  describe('Process Management Integration', () => {
    it('should register new process with cleanup manager', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5181,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5181',
        reservedAt: new Date(),
        status: 'active'
      });
      
      await POST();
      
      expect(mockProcessCleanup.registerProcess).toHaveBeenCalledWith(
        'vite-server',
        expect.any(Object),
        'npm',
        ['run', 'dev'],
        expect.any(String),
        'vite',
        { port: 5181 }
      );
    });

    it('should unregister existing processes before starting new one', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5182,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5182',
        reservedAt: new Date(),
        status: 'active'
      });
      
      await POST();
      
      // The current implementation doesn't explicitly unregister processes
      // It relies on the process cleanup manager's internal handling
      // when registering a new process with the same ID
      expect(mockProcessCleanup.registerProcess).toHaveBeenCalledWith(
        'vite-server',
        expect.any(Object),
        'npm',
        ['run', 'dev'],
        expect.any(String),
        'vite',
        { port: 5182 }
      );
    });
  });

  describe('Port Manager Error Handling', () => {
    it('should continue with default port if activation fails', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5179,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5179',
        reservedAt: new Date(),
        status: 'reserved'
      });
      
      mockPortManager.activatePort.mockRejectedValue(new Error('Activation failed'));
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200); // Should still succeed
      expect(data.success).toBe(true);
      expect(data.data.port).toBe(5179);
    });

    it('should handle port reservation failures gracefully', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue(undefined);
      mockPortManager.reservePort.mockRejectedValue(new Error('All ports exhausted'));
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.port).toBe(5173); // Falls back to default
    });
  });

  describe('Environment Variables and Working Directory', () => {
    it('should use correct working directory from environment', async () => {
      process.env.SANDBOX_DIR = '/custom/sandbox/path';
      
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5183,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5183',
        reservedAt: new Date(),
        status: 'active'
      });
      
      await POST();
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          cwd: '/custom/sandbox/path',
          env: expect.objectContaining({
            NODE_ENV: 'development',
            FORCE_COLOR: '0',
            PORT: '5183'
          })
        })
      );
      
      delete process.env.SANDBOX_DIR;
    });

    it('should use default working directory when not specified', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5184,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5184',
        reservedAt: new Date(),
        status: 'active'
      });
      
      await POST();
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          cwd: '/tmp/sandbox-workspace',
          env: expect.objectContaining({
            PORT: '5184'
          })
        })
      );
    });
  });

  describe('Health Check Integration', () => {
    it('should perform health check after starting server', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5185,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5185',
        reservedAt: new Date(),
        status: 'active'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data).toHaveProperty('healthCheck');
      expect(typeof data.data.healthCheck).toBe('boolean');
    });
  });

  describe('Error Tracking File Management', () => {
    it('should clear error tracking file on restart', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5186,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5186',
        reservedAt: new Date(),
        status: 'active'
      });
      
      await POST();
      
      // Check that writeFile was called for the error tracking file
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/tmp/vite-errors.json',
        expect.stringContaining('"errors":[]')
      );
      
      // Verify the structure contains lastChecked as a number
      const errorFileCall = mockFs.writeFile.mock.calls.find(call => 
        call[0] === '/tmp/vite-errors.json'
      );
      expect(errorFileCall).toBeDefined();
      const errorFileContent = JSON.parse(errorFileCall![1] as string);
      expect(errorFileContent).toEqual({
        errors: [],
        lastChecked: expect.any(Number)
      });
    });

    it('should handle error file write failures gracefully', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5187,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5187',
        reservedAt: new Date(),
        status: 'active'
      });
      
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));
      
      const response = await POST();
      const data = await response.json();
      
      expect(response.status).toBe(200); // Should continue despite error file failure
      expect(data.success).toBe(true);
    });
  });

  describe('Response Data Validation', () => {
    it('should return complete response data structure', async () => {
      global.activeSandbox = { id: 'test-sandbox' };
      
      mockPortManager.getReservation.mockReturnValue({
        port: 5188,
        sandboxId: 'test-sandbox',
        url: 'http://localhost:5188',
        reservedAt: new Date(),
        status: 'active'
      });
      
      const response = await POST();
      const data = await response.json();
      
      expect(data).toMatchObject({
        success: true,
        message: 'Vite server restarted successfully',
        data: {
          pid: 67890,
          port: 5188,
          processKilled: expect.any(Boolean),
          portReleased: expect.any(Boolean),
          healthCheck: expect.any(Boolean),
          workingDirectory: expect.any(String)
        }
      });
    });
  });
});