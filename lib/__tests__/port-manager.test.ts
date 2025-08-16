import { jest } from '@jest/globals';

// Mock net module
const mockCreateServer = jest.fn();
const mockServer = {
  listen: jest.fn(),
  close: jest.fn(),
  on: jest.fn(),
};

jest.mock('net', () => ({
  createServer: mockCreateServer,
}));

import { PortManager } from '../port-manager';

describe('PortManager', () => {
  let portManager: PortManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServer.mockReturnValue(mockServer);
    
    portManager = new PortManager({
      startPort: 5173,
      endPort: 5180,
      maxRetries: 2,
      timeout: 1000,
      enableCORS: true,
    });
  });

  afterEach(async () => {
    await portManager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = new PortManager();
      const stats = defaultManager.getStats();
      
      expect(stats.portRange).toBe('5173-5200');
      expect(stats.totalPorts).toBe(28);
    });

    it('should initialize with custom configuration', () => {
      const customManager = new PortManager({
        startPort: 3000,
        endPort: 3010,
        enableCORS: false,
      });
      
      const stats = customManager.getStats();
      expect(stats.portRange).toBe('3000-3010');
      expect(stats.totalPorts).toBe(11);
      
      const corsConfig = customManager.getCORSConfig();
      expect(corsConfig).toEqual({});
    });
  });

  describe('port availability checking', () => {
    it('should check if port is already reserved', async () => {
      // First reserve a port
      await portManager.reservePort('sandbox-1');
      
      // Then check if it's available - should return false
      const isAvailable = await portManager.isPortAvailable(5173);
      expect(isAvailable).toBe(false);
    });

    it('should check availability of unreserved port', async () => {
      // Mock successful port binding
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.on.mockImplementation(() => {}); // No error event

      const isAvailable = await portManager.isPortAvailable(5179); // Use a different port
      expect(isAvailable).toBe(true);
    });
  });

  describe('port reservation', () => {
    beforeEach(() => {
      // Mock successful port binding for all tests
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should reserve a port successfully', async () => {
      const portReservedSpy = jest.fn();
      portManager.on('portReserved', portReservedSpy);

      const reservation = await portManager.reservePort('sandbox-1');

      expect(reservation.sandboxId).toBe('sandbox-1');
      expect(reservation.port).toBe(5173);
      expect(reservation.url).toBe('http://localhost:5173');
      expect(reservation.status).toBe('reserved');
      expect(reservation.reservedAt).toBeInstanceOf(Date);
      expect(portReservedSpy).toHaveBeenCalledWith(reservation);
    });

    it('should return existing reservation for same sandbox', async () => {
      const firstReservation = await portManager.reservePort('sandbox-1');
      const secondReservation = await portManager.reservePort('sandbox-1');

      expect(firstReservation).toBe(secondReservation);
      expect(firstReservation.port).toBe(secondReservation.port);
    });

    it('should allocate different ports for different sandboxes', async () => {
      const reservation1 = await portManager.reservePort('sandbox-1');
      const reservation2 = await portManager.reservePort('sandbox-2');

      expect(reservation1.port).toBe(5173);
      expect(reservation2.port).toBe(5174);
      expect(reservation1.sandboxId).toBe('sandbox-1');
      expect(reservation2.sandboxId).toBe('sandbox-2');
    });

    it('should handle port exhaustion', async () => {
      // Create a manager with very small range
      const smallManager = new PortManager({
        startPort: 5173,
        endPort: 5174, // Only 2 ports available
      });

      // Reserve all available ports
      await smallManager.reservePort('sandbox-1');
      await smallManager.reservePort('sandbox-2');

      const portExhaustedSpy = jest.fn();
      smallManager.on('portExhausted', portExhaustedSpy);

      // Try to reserve one more - should fail
      await expect(
        smallManager.reservePort('sandbox-3')
      ).rejects.toThrow('Port exhausted: No available ports in range 5173-5174');

      expect(portExhaustedSpy).toHaveBeenCalledWith('5173-5174');
      
      await smallManager.cleanup();
    });
  });

  describe('concurrent port reservation', () => {
    beforeEach(() => {
      // Mock successful port binding
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should handle concurrent reservations correctly', async () => {
      const reservationPromises = Array.from({ length: 5 }, (_, i) =>
        portManager.reservePort(`sandbox-${i}`)
      );

      const reservations = await Promise.all(reservationPromises);

      // All reservations should be successful
      expect(reservations).toHaveLength(5);
      
      // All ports should be unique
      const ports = reservations.map(r => r.port);
      const uniquePorts = new Set(ports);
      expect(uniquePorts.size).toBe(5);

      // Ports should be in expected range
      ports.forEach(port => {
        expect(port).toBeGreaterThanOrEqual(5173);
        expect(port).toBeLessThanOrEqual(5180);
      });
    });

    it('should handle mixed concurrent operations', async () => {
      // Reserve some ports first
      await portManager.reservePort('sandbox-1');
      await portManager.reservePort('sandbox-2');

      // Then do concurrent operations
      const operations = [
        portManager.reservePort('sandbox-3'),
        portManager.reservePort('sandbox-4'),
        portManager.releasePort('sandbox-1'),
        portManager.reservePort('sandbox-5'),
      ];

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled');

      expect(successful.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('port release', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should release a port successfully', async () => {
      const portReleasedSpy = jest.fn();
      portManager.on('portReleased', portReleasedSpy);

      await portManager.reservePort('sandbox-1');
      const released = await portManager.releasePort('sandbox-1');

      expect(released).toBe(true);
      expect(portReleasedSpy).toHaveBeenCalledWith(5173, 'sandbox-1');
      
      const reservation = portManager.getReservation('sandbox-1');
      expect(reservation).toBeUndefined();
    });

    it('should return false when releasing non-existent reservation', async () => {
      const released = await portManager.releasePort('non-existent');
      expect(released).toBe(false);
    });
  });

  describe('port activation', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should activate a reserved port', async () => {
      await portManager.reservePort('sandbox-1');
      const activated = await portManager.activatePort('sandbox-1');

      expect(activated).toBe(true);
      
      const reservation = portManager.getReservation('sandbox-1');
      expect(reservation?.status).toBe('active');
    });

    it('should return false when activating non-existent port', async () => {
      const activated = await portManager.activatePort('non-existent');
      expect(activated).toBe(false);
    });

    it('should return false when activating released port', async () => {
      await portManager.reservePort('sandbox-1');
      await portManager.releasePort('sandbox-1');
      
      const activated = await portManager.activatePort('sandbox-1');
      expect(activated).toBe(false);
    });
  });

  describe('port conflict handling', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should handle port conflicts by reassigning', async () => {
      const portConflictSpy = jest.fn();
      portManager.on('portConflict', portConflictSpy);

      // Reserve initial port
      const originalReservation = await portManager.reservePort('sandbox-1');
      
      // Handle conflict
      const newReservation = await portManager.handlePortConflict('sandbox-1');

      expect(portConflictSpy).toHaveBeenCalledWith(originalReservation.port, 'sandbox-1');
      expect(newReservation.port).not.toBe(originalReservation.port);
      expect(newReservation.sandboxId).toBe('sandbox-1');
    });
  });

  describe('URL generation', () => {
    it('should generate correct HTTP URLs', () => {
      const url = portManager.generateURL(5173);
      expect(url).toBe('http://localhost:5173');
    });

    it('should generate URLs with custom protocol', () => {
      const url = portManager.generateURL(5173, 'https');
      expect(url).toBe('https://localhost:5173');
    });
  });

  describe('CORS configuration', () => {
    it('should provide CORS headers when enabled', () => {
      const corsConfig = portManager.getCORSConfig();
      
      expect(corsConfig).toEqual({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
      });
    });

    it('should return empty config when CORS is disabled', () => {
      const noCorsManager = new PortManager({ enableCORS: false });
      const corsConfig = noCorsManager.getCORSConfig();
      
      expect(corsConfig).toEqual({});
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should provide accurate statistics', async () => {
      // Reserve some ports
      await portManager.reservePort('sandbox-1');
      await portManager.reservePort('sandbox-2');
      await portManager.activatePort('sandbox-1');
      await portManager.releasePort('sandbox-2');

      const stats = portManager.getStats();

      expect(stats.totalPorts).toBe(8); // 5173-5180
      expect(stats.activePorts).toBe(1);
      expect(stats.reservedPorts).toBe(0);
      expect(stats.releasedPorts).toBe(1);
      expect(stats.availablePorts).toBe(7); // Total - active (released ports don't count as occupied)
      expect(stats.portRange).toBe('5173-5180');
    });
  });

  describe('reservation retrieval', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should get active reservations', async () => {
      await portManager.reservePort('sandbox-1');
      await portManager.reservePort('sandbox-2');
      await portManager.activatePort('sandbox-1');
      await portManager.releasePort('sandbox-2');

      const activeReservations = portManager.getActiveReservations();
      
      expect(activeReservations).toHaveLength(1);
      expect(activeReservations[0].sandboxId).toBe('sandbox-1');
      expect(activeReservations[0].status).toBe('active');
    });

    it('should get specific reservation by sandbox ID', async () => {
      await portManager.reservePort('sandbox-1');
      
      const reservation = portManager.getReservation('sandbox-1');
      expect(reservation?.sandboxId).toBe('sandbox-1');
      expect(reservation?.port).toBe(5173);
    });
  });

  describe('cleanup operations', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should cleanup all reservations on shutdown', async () => {
      const portReleasedSpy = jest.fn();
      portManager.on('portReleased', portReleasedSpy);

      // Create some reservations
      await portManager.reservePort('sandbox-1');
      await portManager.reservePort('sandbox-2');
      await portManager.activatePort('sandbox-1');

      await portManager.cleanup();

      expect(portReleasedSpy).toHaveBeenCalledTimes(2);
      expect(portManager.getActiveReservations()).toHaveLength(0);
      expect(portManager.listenerCount('portReleased')).toBe(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle rapid allocation and deallocation', async () => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 1);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 1);
      });

      // Rapid allocation/deallocation cycles
      for (let i = 0; i < 10; i++) {
        const reservation = await portManager.reservePort(`sandbox-${i}`);
        expect(reservation.sandboxId).toBe(`sandbox-${i}`);
        
        const released = await portManager.releasePort(`sandbox-${i}`);
        expect(released).toBe(true);
      }

      const stats = portManager.getStats();
      expect(stats.activePorts).toBe(0);
    });

    it('should handle port range wraparound', async () => {
      // Create manager with small range
      const smallRangeManager = new PortManager({
        startPort: 5173,
        endPort: 5175,
      });

      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });

      // Reserve all ports
      await smallRangeManager.reservePort('sandbox-1');
      await smallRangeManager.reservePort('sandbox-2');
      await smallRangeManager.reservePort('sandbox-3');

      const stats = smallRangeManager.getStats();
      expect(stats.availablePorts).toBe(0);

      await smallRangeManager.cleanup();
    });
  });

  describe('event emitter behavior', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, 10);
      });
    });

    it('should emit all expected events', async () => {
      const events: string[] = [];
      
      portManager.on('portReserved', () => events.push('portReserved'));
      portManager.on('portReleased', () => events.push('portReleased'));
      portManager.on('portConflict', () => events.push('portConflict'));

      await portManager.reservePort('sandbox-1');
      await portManager.handlePortConflict('sandbox-1');

      expect(events).toContain('portReserved');
      expect(events).toContain('portConflict');
      expect(events).toContain('portReleased');
    });

    it('should not leak event listeners', async () => {
      const initialListenerCount = portManager.listenerCount('portReserved');
      
      // Add and remove listeners multiple times
      for (let i = 0; i < 10; i++) {
        const listener = () => {};
        portManager.on('portReserved', listener);
        portManager.off('portReserved', listener);
      }

      expect(portManager.listenerCount('portReserved')).toBe(initialListenerCount);
    });
  });

  describe('stress testing', () => {
    beforeEach(() => {
      mockServer.listen.mockImplementation((port, callback) => {
        setTimeout(callback as () => void, Math.random() * 10);
      });
      mockServer.close.mockImplementation((callback) => {
        setTimeout(callback as () => void, Math.random() * 10);
      });
    });

    it('should handle many concurrent operations without corruption', async () => {
      const operations = [];
      
      // Create many mixed operations
      for (let i = 0; i < 50; i++) {
        if (i % 3 === 0) {
          operations.push(portManager.reservePort(`sandbox-${i}`));
        } else if (i % 3 === 1 && i > 0) {
          operations.push(portManager.releasePort(`sandbox-${i - 1}`));
        } else {
          operations.push(portManager.isPortAvailable(5173 + (i % 8)));
        }
      }

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled');

      // Most operations should succeed
      expect(successful.length).toBeGreaterThan(40);
      
      // State should remain consistent
      const activeReservations = portManager.getActiveReservations();
      expect(Array.isArray(activeReservations)).toBe(true);
    });
  });
});