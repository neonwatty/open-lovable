import { render, screen } from '@testing-library/react';
import { SandboxManager } from '@/lib/sandbox-manager';

// Mock SandboxManager
jest.mock('@/lib/sandbox-manager');

// Mock Next.js server components
jest.mock('next/headers', () => ({
  headers: jest.fn(() => new Map()),
  cookies: jest.fn(() => new Map()),
}));

// Mock server component that would use SandboxManager
const SandboxStatsPage = async () => {
  const manager = new SandboxManager();
  const stats = await manager.getStats();
  const sandboxes = await manager.listSandboxes();
  
  return (
    <div>
      <h1>Sandbox Dashboard</h1>
      <div data-testid="stats-section">
        <h2>Statistics</h2>
        <p data-testid="total-sandboxes">
          Total Sandboxes: {stats.totalSandboxes}
        </p>
        <p data-testid="max-sandboxes">
          Max Sandboxes: {stats.maxSandboxes}
        </p>
        <p data-testid="sandboxes-dir">
          Directory: {stats.sandboxesDir}
        </p>
        <p data-testid="cleanup-interval">
          Cleanup Interval: {stats.cleanupInterval}ms
        </p>
      </div>
      
      <div data-testid="sandboxes-section">
        <h2>Active Sandboxes</h2>
        {sandboxes.length === 0 ? (
          <p data-testid="no-sandboxes">No active sandboxes</p>
        ) : (
          <ul data-testid="sandbox-list">
            {sandboxes.map(sandbox => (
              <li key={sandbox.id} data-testid={`sandbox-item-${sandbox.id}`}>
                <strong>ID:</strong> {sandbox.id}<br />
                <strong>Path:</strong> {sandbox.path}<br />
                <strong>Created:</strong> {sandbox.createdAt.toISOString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// Mock server component for sandbox details
const SandboxDetailsPage = async ({ params }: { params: { id: string } }) => {
  const manager = new SandboxManager();
  const sandboxInfo = await manager.getSandboxInfo(params.id);
  const exists = await manager.sandboxExists(params.id);
  
  if (!exists || !sandboxInfo) {
    return (
      <div>
        <h1>Sandbox Not Found</h1>
        <p data-testid="not-found-message">
          Sandbox with ID "{params.id}" was not found.
        </p>
      </div>
    );
  }
  
  return (
    <div>
      <h1>Sandbox Details</h1>
      <div data-testid="sandbox-details">
        <p data-testid="sandbox-id">ID: {sandboxInfo.id}</p>
        <p data-testid="sandbox-path">Path: {sandboxInfo.path}</p>
        <p data-testid="sandbox-created">
          Created: {sandboxInfo.createdAt.toLocaleString()}
        </p>
      </div>
    </div>
  );
};

// Mock server component with error handling
const SandboxPageWithErrorHandling = async () => {
  const manager = new SandboxManager();
  
  try {
    await manager.initialize();
    const stats = await manager.getStats();
    
    return (
      <div>
        <h1>Sandbox Manager Initialized</h1>
        <p data-testid="initialization-success">
          Successfully initialized with {stats.totalSandboxes} sandboxes
        </p>
      </div>
    );
  } catch (error) {
    return (
      <div>
        <h1>Initialization Failed</h1>
        <p data-testid="initialization-error">
          Failed to initialize sandbox manager: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }
};

describe('Next.js Server Components with SandboxManager', () => {
  const mockManager = SandboxManager as jest.MockedClass<typeof SandboxManager>;
  let mockGetStats: jest.Mock;
  let mockListSandboxes: jest.Mock;
  let mockGetSandboxInfo: jest.Mock;
  let mockSandboxExists: jest.Mock;
  let mockInitialize: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock methods
    mockGetStats = jest.fn();
    mockListSandboxes = jest.fn();
    mockGetSandboxInfo = jest.fn();
    mockSandboxExists = jest.fn();
    mockInitialize = jest.fn();

    // Mock the SandboxManager implementation
    mockManager.mockImplementation(() => ({
      getStats: mockGetStats,
      listSandboxes: mockListSandboxes,
      getSandboxInfo: mockGetSandboxInfo,
      sandboxExists: mockSandboxExists,
      initialize: mockInitialize,
      createSandbox: jest.fn(),
      deleteSandbox: jest.fn(),
      getSandboxPath: jest.fn(),
      cleanupOldSandboxes: jest.fn(),
    } as any));
  });

  describe('SandboxStatsPage Server Component', () => {
    it('should render sandbox statistics on server', async () => {
      const mockStats = {
        totalSandboxes: 3,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 86400000
      };

      const mockSandboxes = [
        {
          id: 'sandbox-1',
          path: '/tmp/test-sandboxes/sandbox-1',
          createdAt: new Date('2023-01-01T10:00:00Z')
        },
        {
          id: 'sandbox-2', 
          path: '/tmp/test-sandboxes/sandbox-2',
          createdAt: new Date('2023-01-01T11:00:00Z')
        }
      ];

      mockGetStats.mockResolvedValueOnce(mockStats);
      mockListSandboxes.mockResolvedValueOnce(mockSandboxes);

      const { container } = render(await SandboxStatsPage());

      expect(container).toHaveTextContent('Sandbox Dashboard');
      expect(screen.getByTestId('total-sandboxes')).toHaveTextContent('Total Sandboxes: 3');
      expect(screen.getByTestId('max-sandboxes')).toHaveTextContent('Max Sandboxes: 10');
      expect(screen.getByTestId('sandboxes-dir')).toHaveTextContent('Directory: /tmp/test-sandboxes');
      expect(screen.getByTestId('cleanup-interval')).toHaveTextContent('Cleanup Interval: 86400000ms');

      expect(screen.getByTestId('sandbox-list')).toBeInTheDocument();
      expect(screen.getByTestId('sandbox-item-sandbox-1')).toBeInTheDocument();
      expect(screen.getByTestId('sandbox-item-sandbox-2')).toBeInTheDocument();
    });

    it('should handle empty sandbox list', async () => {
      const mockStats = {
        totalSandboxes: 0,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 86400000
      };

      mockGetStats.mockResolvedValueOnce(mockStats);
      mockListSandboxes.mockResolvedValueOnce([]);

      const { container } = render(await SandboxStatsPage());

      expect(container).toHaveTextContent('Sandbox Dashboard');
      expect(screen.getByTestId('total-sandboxes')).toHaveTextContent('Total Sandboxes: 0');
      expect(screen.getByTestId('no-sandboxes')).toHaveTextContent('No active sandboxes');
      expect(screen.queryByTestId('sandbox-list')).not.toBeInTheDocument();
    });

    it('should display sandbox creation dates correctly', async () => {
      const mockStats = {
        totalSandboxes: 1,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 86400000
      };

      const testDate = new Date('2023-06-15T14:30:00Z');
      const mockSandboxes = [
        {
          id: 'sandbox-with-date',
          path: '/tmp/test-sandboxes/sandbox-with-date',
          createdAt: testDate
        }
      ];

      mockGetStats.mockResolvedValueOnce(mockStats);
      mockListSandboxes.mockResolvedValueOnce(mockSandboxes);

      render(await SandboxStatsPage());

      const sandboxItem = screen.getByTestId('sandbox-item-sandbox-with-date');
      expect(sandboxItem).toHaveTextContent('Created: 2023-06-15T14:30:00.000Z');
    });
  });

  describe('SandboxDetailsPage Server Component', () => {
    it('should render sandbox details when sandbox exists', async () => {
      const mockSandboxInfo = {
        id: 'test-sandbox-123',
        path: '/tmp/test-sandboxes/test-sandbox-123',
        createdAt: new Date('2023-01-01T12:00:00Z')
      };

      mockSandboxExists.mockResolvedValueOnce(true);
      mockGetSandboxInfo.mockResolvedValueOnce(mockSandboxInfo);

      render(await SandboxDetailsPage({ params: { id: 'test-sandbox-123' } }));

      expect(screen.getByText('Sandbox Details')).toBeInTheDocument();
      expect(screen.getByTestId('sandbox-id')).toHaveTextContent('ID: test-sandbox-123');
      expect(screen.getByTestId('sandbox-path')).toHaveTextContent('Path: /tmp/test-sandboxes/test-sandbox-123');
      expect(screen.getByTestId('sandbox-created')).toHaveTextContent('Created:');
    });

    it('should show not found message when sandbox does not exist', async () => {
      mockSandboxExists.mockResolvedValueOnce(false);
      mockGetSandboxInfo.mockResolvedValueOnce(null);

      render(await SandboxDetailsPage({ params: { id: 'non-existent-sandbox' } }));

      expect(screen.getByText('Sandbox Not Found')).toBeInTheDocument();
      expect(screen.getByTestId('not-found-message')).toHaveTextContent(
        'Sandbox with ID "non-existent-sandbox" was not found.'
      );
      expect(screen.queryByTestId('sandbox-details')).not.toBeInTheDocument();
    });

    it('should handle null sandbox info gracefully', async () => {
      mockSandboxExists.mockResolvedValueOnce(true);
      mockGetSandboxInfo.mockResolvedValueOnce(null);

      render(await SandboxDetailsPage({ params: { id: 'corrupted-sandbox' } }));

      expect(screen.getByText('Sandbox Not Found')).toBeInTheDocument();
      expect(screen.getByTestId('not-found-message')).toHaveTextContent(
        'Sandbox with ID "corrupted-sandbox" was not found.'
      );
    });
  });

  describe('Error Handling in Server Components', () => {
    it('should handle initialization success', async () => {
      const mockStats = {
        totalSandboxes: 5,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 86400000
      };

      mockInitialize.mockResolvedValueOnce(undefined);
      mockGetStats.mockResolvedValueOnce(mockStats);

      render(await SandboxPageWithErrorHandling());

      expect(screen.getByText('Sandbox Manager Initialized')).toBeInTheDocument();
      expect(screen.getByTestId('initialization-success')).toHaveTextContent(
        'Successfully initialized with 5 sandboxes'
      );
    });

    it('should handle initialization errors', async () => {
      const errorMessage = 'Permission denied: Cannot create sandbox directory';
      mockInitialize.mockRejectedValueOnce(new Error(errorMessage));

      render(await SandboxPageWithErrorHandling());

      expect(screen.getByText('Initialization Failed')).toBeInTheDocument();
      expect(screen.getByTestId('initialization-error')).toHaveTextContent(
        `Failed to initialize sandbox manager: ${errorMessage}`
      );
    });

    it('should handle unknown errors gracefully', async () => {
      mockInitialize.mockRejectedValueOnce('Unknown error type');

      render(await SandboxPageWithErrorHandling());

      expect(screen.getByTestId('initialization-error')).toHaveTextContent(
        'Failed to initialize sandbox manager: Unknown error'
      );
    });
  });

  describe('Server-Side Data Fetching', () => {
    it('should call SandboxManager methods during server rendering', async () => {
      const mockStats = {
        totalSandboxes: 2,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 86400000
      };

      mockGetStats.mockResolvedValueOnce(mockStats);
      mockListSandboxes.mockResolvedValueOnce([]);

      await SandboxStatsPage();

      expect(mockGetStats).toHaveBeenCalledTimes(1);
      expect(mockListSandboxes).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent server component requests', async () => {
      const mockStats = {
        totalSandboxes: 1,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 86400000
      };

      mockGetStats.mockResolvedValue(mockStats);
      mockListSandboxes.mockResolvedValue([]);

      // Simulate multiple concurrent requests
      const promises = [
        SandboxStatsPage(),
        SandboxStatsPage(),
        SandboxStatsPage()
      ];

      await Promise.all(promises);

      // Each request should create its own SandboxManager instance
      expect(mockManager).toHaveBeenCalledTimes(3);
      expect(mockGetStats).toHaveBeenCalledTimes(3);
      expect(mockListSandboxes).toHaveBeenCalledTimes(3);
    });
  });

  describe('Performance Considerations', () => {
    it('should not block rendering with expensive operations', async () => {
      // Mock slow operations
      mockGetStats.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          totalSandboxes: 100,
          sandboxesDir: '/tmp/test-sandboxes',
          maxSandboxes: 1000,
          cleanupInterval: 86400000
        }), 10))
      );
      
      mockListSandboxes.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 10))
      );

      const start = performance.now();
      render(await SandboxStatsPage());
      const duration = performance.now() - start;

      // Should complete within reasonable time for test environment
      expect(duration).toBeLessThan(1000);
      expect(screen.getByText('Total Sandboxes: 100')).toBeInTheDocument();
    });
  });
});