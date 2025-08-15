import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SandboxManager } from '@/lib/sandbox-manager';

// Mock SandboxManager
jest.mock('@/lib/sandbox-manager');

// Create a test component that uses SandboxManager
const TestSandboxComponent = () => {
  const [sandboxes, setSandboxes] = useState<Array<{ id: string; path: string; createdAt: Date }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manager = new SandboxManager();

  const handleCreateSandbox = async () => {
    setLoading(true);
    setError(null);
    try {
      const sandbox = await manager.createSandbox();
      setSandboxes(prev => [...prev, sandbox]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sandbox');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSandbox = async (sandboxId: string) => {
    try {
      await manager.deleteSandbox(sandboxId);
      setSandboxes(prev => prev.filter(s => s.id !== sandboxId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sandbox');
    }
  };

  const handleListSandboxes = async () => {
    setLoading(true);
    try {
      const allSandboxes = await manager.listSandboxes();
      setSandboxes(allSandboxes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list sandboxes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Sandbox Manager Test</h1>
      
      <div>
        <button 
          onClick={handleCreateSandbox} 
          disabled={loading}
          data-testid="create-sandbox-btn"
        >
          {loading ? 'Creating...' : 'Create Sandbox'}
        </button>
        
        <button 
          onClick={handleListSandboxes}
          disabled={loading}
          data-testid="list-sandboxes-btn"
        >
          {loading ? 'Loading...' : 'List Sandboxes'}
        </button>
      </div>

      {error && (
        <div data-testid="error-message" role="alert">
          Error: {error}
        </div>
      )}

      <div data-testid="sandbox-list">
        {sandboxes.length === 0 ? (
          <p data-testid="no-sandboxes">No sandboxes found</p>
        ) : (
          sandboxes.map(sandbox => (
            <div key={sandbox.id} data-testid={`sandbox-${sandbox.id}`}>
              <span>ID: {sandbox.id}</span>
              <span>Path: {sandbox.path}</span>
              <button 
                onClick={() => handleDeleteSandbox(sandbox.id)}
                data-testid={`delete-${sandbox.id}`}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Complex sandbox dashboard component
const SandboxDashboard = () => {
  const [stats, setStats] = useState<{
    totalSandboxes: number;
    sandboxesDir: string;
    maxSandboxes: number;
    cleanupInterval: number;
  } | null>(null);
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);

  const manager = new SandboxManager();

  const loadStats = async () => {
    try {
      const sandboxStats = await manager.getStats();
      setStats(sandboxStats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const performCleanup = async () => {
    try {
      const cleaned = await manager.cleanupOldSandboxes();
      setCleanupCount(cleaned);
      await loadStats(); // Refresh stats after cleanup
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
  };

  React.useEffect(() => {
    loadStats();
  }, []);

  return (
    <div>
      <h2>Sandbox Dashboard</h2>
      
      {stats && (
        <div data-testid="stats-display">
          <p data-testid="total-sandboxes">Total Sandboxes: {stats.totalSandboxes}</p>
          <p data-testid="max-sandboxes">Max Sandboxes: {stats.maxSandboxes}</p>
          <p data-testid="sandboxes-dir">Directory: {stats.sandboxesDir}</p>
        </div>
      )}
      
      <button onClick={performCleanup} data-testid="cleanup-btn">
        Cleanup Old Sandboxes
      </button>
      
      {cleanupCount !== null && (
        <p data-testid="cleanup-result">
          Cleaned up {cleanupCount} sandboxes
        </p>
      )}
    </div>
  );
};

describe('SandboxManager React Integration', () => {
  const mockManager = SandboxManager as jest.MockedClass<typeof SandboxManager>;
  let mockCreateSandbox: jest.Mock;
  let mockDeleteSandbox: jest.Mock;
  let mockListSandboxes: jest.Mock;
  let mockGetStats: jest.Mock;
  let mockCleanupOldSandboxes: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock methods
    mockCreateSandbox = jest.fn();
    mockDeleteSandbox = jest.fn();
    mockListSandboxes = jest.fn();
    mockGetStats = jest.fn();
    mockCleanupOldSandboxes = jest.fn();

    // Mock the SandboxManager implementation
    mockManager.mockImplementation(() => ({
      createSandbox: mockCreateSandbox,
      deleteSandbox: mockDeleteSandbox,
      listSandboxes: mockListSandboxes,
      getStats: mockGetStats,
      cleanupOldSandboxes: mockCleanupOldSandboxes,
      getSandboxPath: jest.fn(),
      sandboxExists: jest.fn(),
      getSandboxInfo: jest.fn(),
      initialize: jest.fn(),
    } as any));
  });

  describe('Basic Sandbox Operations', () => {
    it('should create sandbox when button clicked', async () => {
      const user = userEvent.setup();
      const mockSandbox = {
        id: 'test-sandbox-123',
        path: '/tmp/sandboxes/test-sandbox-123',
        createdAt: new Date()
      };

      // Add a delay to simulate async operation
      mockCreateSandbox.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockSandbox), 50))
      );

      render(<TestSandboxComponent />);
      
      const createButton = screen.getByTestId('create-sandbox-btn');
      await user.click(createButton);

      // Check for loading state
      expect(screen.getByText('Creating...')).toBeInTheDocument();
      expect(createButton).toBeDisabled();
      
      await waitFor(() => {
        expect(screen.getByTestId(`sandbox-${mockSandbox.id}`)).toBeInTheDocument();
      });

      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);
      expect(screen.getByText(`ID: ${mockSandbox.id}`)).toBeInTheDocument();
    });

    it('should show loading state during sandbox creation', async () => {
      const user = userEvent.setup();
      
      // Mock a slow sandbox creation
      mockCreateSandbox.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          id: 'slow-sandbox',
          path: '/tmp/sandboxes/slow-sandbox',
          createdAt: new Date()
        }), 100))
      );

      render(<TestSandboxComponent />);
      
      const createButton = screen.getByTestId('create-sandbox-btn');
      await user.click(createButton);

      expect(createButton).toBeDisabled();
      expect(screen.getByText('Creating...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Create Sandbox')).toBeInTheDocument();
      });
    });

    it('should handle sandbox creation errors', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Failed to create sandbox: Permission denied';
      
      mockCreateSandbox.mockRejectedValueOnce(new Error(errorMessage));

      render(<TestSandboxComponent />);
      
      const createButton = screen.getByTestId('create-sandbox-btn');
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });

      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });

    it('should delete sandbox when delete button clicked', async () => {
      const user = userEvent.setup();
      const mockSandbox = {
        id: 'delete-test-sandbox',
        path: '/tmp/sandboxes/delete-test-sandbox',
        createdAt: new Date()
      };

      mockCreateSandbox.mockResolvedValueOnce(mockSandbox);
      mockDeleteSandbox.mockResolvedValueOnce(undefined);

      render(<TestSandboxComponent />);
      
      // First create a sandbox
      const createButton = screen.getByTestId('create-sandbox-btn');
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId(`sandbox-${mockSandbox.id}`)).toBeInTheDocument();
      });

      // Then delete it
      const deleteButton = screen.getByTestId(`delete-${mockSandbox.id}`);
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByTestId(`sandbox-${mockSandbox.id}`)).not.toBeInTheDocument();
      });

      expect(mockDeleteSandbox).toHaveBeenCalledWith(mockSandbox.id);
    });

    it('should list existing sandboxes', async () => {
      const user = userEvent.setup();
      const mockSandboxes = [
        { id: 'sandbox-1', path: '/tmp/sandboxes/sandbox-1', createdAt: new Date() },
        { id: 'sandbox-2', path: '/tmp/sandboxes/sandbox-2', createdAt: new Date() },
      ];

      mockListSandboxes.mockResolvedValueOnce(mockSandboxes);

      render(<TestSandboxComponent />);
      
      const listButton = screen.getByTestId('list-sandboxes-btn');
      await user.click(listButton);

      await waitFor(() => {
        expect(screen.getByTestId('sandbox-sandbox-1')).toBeInTheDocument();
        expect(screen.getByTestId('sandbox-sandbox-2')).toBeInTheDocument();
      });

      expect(mockListSandboxes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sandbox Dashboard Component', () => {
    it('should display sandbox statistics', async () => {
      const mockStats = {
        totalSandboxes: 5,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 3600000
      };

      mockGetStats.mockResolvedValueOnce(mockStats);

      render(<SandboxDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('stats-display')).toBeInTheDocument();
      });

      expect(screen.getByTestId('total-sandboxes')).toHaveTextContent('Total Sandboxes: 5');
      expect(screen.getByTestId('max-sandboxes')).toHaveTextContent('Max Sandboxes: 10');
      expect(screen.getByTestId('sandboxes-dir')).toHaveTextContent('Directory: /tmp/test-sandboxes');
    });

    it('should perform cleanup and update stats', async () => {
      const user = userEvent.setup();
      const initialStats = {
        totalSandboxes: 5,
        sandboxesDir: '/tmp/test-sandboxes',
        maxSandboxes: 10,
        cleanupInterval: 3600000
      };
      
      const updatedStats = { ...initialStats, totalSandboxes: 3 };

      mockGetStats
        .mockResolvedValueOnce(initialStats)  // Initial load
        .mockResolvedValueOnce(updatedStats); // After cleanup
      
      mockCleanupOldSandboxes.mockResolvedValueOnce(2);

      render(<SandboxDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Total Sandboxes: 5')).toBeInTheDocument();
      });

      const cleanupButton = screen.getByTestId('cleanup-btn');
      await user.click(cleanupButton);

      await waitFor(() => {
        expect(screen.getByTestId('cleanup-result')).toBeInTheDocument();
      });

      expect(screen.getByText('Cleaned up 2 sandboxes')).toBeInTheDocument();
      expect(screen.getByText('Total Sandboxes: 3')).toBeInTheDocument();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should show no sandboxes message when list is empty', async () => {
      const user = userEvent.setup();
      
      mockListSandboxes.mockResolvedValueOnce([]);

      render(<TestSandboxComponent />);
      
      const listButton = screen.getByTestId('list-sandboxes-btn');
      await user.click(listButton);

      await waitFor(() => {
        expect(screen.getByTestId('no-sandboxes')).toBeInTheDocument();
      });

      expect(screen.getByText('No sandboxes found')).toBeInTheDocument();
    });

    it('should handle multiple rapid clicks gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock slow sandbox creation
      mockCreateSandbox.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          id: `sandbox-${Date.now()}`,
          path: '/tmp/sandboxes/test',
          createdAt: new Date()
        }), 50))
      );

      render(<TestSandboxComponent />);
      
      const createButton = screen.getByTestId('create-sandbox-btn');
      
      // Click multiple times rapidly
      await user.click(createButton);
      await user.click(createButton);
      await user.click(createButton);

      // Should only call createSandbox once due to disabled state
      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);
    });

    it('should maintain component state after errors', async () => {
      const user = userEvent.setup();
      
      // First operation succeeds
      const successSandbox = {
        id: 'success-sandbox',
        path: '/tmp/sandboxes/success',
        createdAt: new Date()
      };
      
      mockCreateSandbox
        .mockResolvedValueOnce(successSandbox)
        .mockRejectedValueOnce(new Error('Second creation failed'));

      render(<TestSandboxComponent />);
      
      // First creation succeeds
      const createButton = screen.getByTestId('create-sandbox-btn');
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId(`sandbox-${successSandbox.id}`)).toBeInTheDocument();
      });

      // Second creation fails
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });

      // First sandbox should still be visible
      expect(screen.getByTestId(`sandbox-${successSandbox.id}`)).toBeInTheDocument();
      expect(screen.getByText('Error: Second creation failed')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(<TestSandboxComponent />);
      
      expect(screen.getByRole('button', { name: /create sandbox/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /list sandboxes/i })).toBeInTheDocument();
    });

    it('should announce errors to screen readers', async () => {
      const user = userEvent.setup();
      
      mockCreateSandbox.mockRejectedValueOnce(new Error('Test error'));

      render(<TestSandboxComponent />);
      
      const createButton = screen.getByTestId('create-sandbox-btn');
      await user.click(createButton);

      await waitFor(() => {
        const errorElement = screen.getByRole('alert');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveTextContent('Error: Test error');
      });
    });
  });
});