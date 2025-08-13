import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocalServerStatusIndicator from '@/components/LocalServerStatusIndicator';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LocalServerStatusIndicator', () => {
  const mockServerRunningResponse = {
    status: 'running',
    port: 5173,
    url: 'http://localhost:5173',
    pid: 12345,
    uptime: 120000, // 2 minutes
  };

  const mockServerOfflineResponse = {
    status: 'offline',
    error: 'Server not running',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve(mockServerRunningResponse),
        }), 100)
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initial Loading State', () => {
    test('should show loading state initially', async () => {
      await act(async () => {
        render(<LocalServerStatusIndicator />);
      });
      
      expect(screen.getByText('Checking server...')).toBeInTheDocument();
      expect(screen.getByTestId('loading-dot')).toBeInTheDocument();
    });

    test('should show loading state with custom className', async () => {
      await act(async () => {
        render(<LocalServerStatusIndicator className="custom-class" />);
      });
      
      const container = screen.getByText('Checking server...').closest('div');
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('Server Status API Integration (Task 8.4 - Critical)', () => {
    test('should fetch server status on mount', async () => {
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/sandbox-status');
      });
    });

    test('should display online status when server is running', async () => {
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      expect(screen.getByTestId('status-dot-green')).toBeInTheDocument();
      expect(screen.getByText(':5173')).toBeInTheDocument(); // Port badge
    });

    test('should display offline status when server is not running', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve(mockServerOfflineResponse),
      });
      
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Offline')).toBeInTheDocument();
      });
      
      expect(screen.getByTestId('status-dot-red')).toBeInTheDocument();
      expect(screen.queryByText(':5173')).not.toBeInTheDocument(); // No port badge when offline
    });

    test('should handle API fetch failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Offline')).toBeInTheDocument();
      });
      
      expect(screen.getByTestId('status-dot-red')).toBeInTheDocument();
    });

    test('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}), // Empty response
      });
      
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Offline')).toBeInTheDocument();
      });
    });
  });

  describe('Status Polling (10 Second Interval)', () => {
    test('should poll server status every 10 seconds', async () => {
      render(<LocalServerStatusIndicator />);
      
      // Initial call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
      
      // Fast-forward 10 seconds
      vi.advanceTimersByTime(10000);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
      
      // Fast-forward another 10 seconds
      vi.advanceTimersByTime(10000);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });
    });

    test('should update status when server state changes', async () => {
      render(<LocalServerStatusIndicator />);
      
      // Initially running
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      // Change mock to offline
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve(mockServerOfflineResponse),
      });
      
      // Trigger next poll
      vi.advanceTimersByTime(10000);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Offline')).toBeInTheDocument();
      });
    });

    test('should cleanup polling on unmount', async () => {
      const { unmount } = render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
      
      unmount();
      
      // Fast-forward time after unmount
      vi.advanceTimersByTime(20000);
      
      // Should not make additional calls
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status Display Colors and Icons', () => {
    test('should show green status for running server', async () => {
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByTestId('status-indicator')).toHaveClass('bg-green-100', 'text-green-800', 'border-green-200');
      });
      
      expect(screen.getByTestId('status-dot-green')).toBeInTheDocument();
    });

    test('should show red status for offline server', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve(mockServerOfflineResponse),
      });
      
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByTestId('status-indicator')).toHaveClass('bg-red-100', 'text-red-800', 'border-red-200');
      });
      
      expect(screen.getByTestId('status-dot-red')).toBeInTheDocument();
    });

    test('should show gray status during loading', () => {
      render(<LocalServerStatusIndicator />);
      
      expect(screen.getByTestId('loading-dot')).toHaveClass('bg-gray-400');
    });
  });

  describe('Expandable Details (showDetails=true)', () => {
    test('should expand details when clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      // Click to expand
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('Status:')).toBeInTheDocument();
        expect(screen.getByText('Server URL:')).toBeInTheDocument();
        expect(screen.getByText('Last Checked:')).toBeInTheDocument();
      });
    });

    test('should show detailed status information when expanded', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('Local Vite development server is running at http://localhost:5173. Ready for live preview.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'http://localhost:5173' })).toBeInTheDocument();
        expect(screen.getByText('Process ID:')).toBeInTheDocument();
        expect(screen.getByText('12345')).toBeInTheDocument(); // PID
        expect(screen.getByText('Uptime:')).toBeInTheDocument();
        expect(screen.getByText('2m 0s')).toBeInTheDocument(); // Formatted uptime
      });
    });

    test('should show error details when server is offline', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ ...mockServerOfflineResponse, error: 'Port 5173 is already in use' }),
      });
      
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Offline')).toBeInTheDocument();
      });
      
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('Server Not Running:')).toBeInTheDocument();
        expect(screen.getByText('• Live preview is not available')).toBeInTheDocument();
        expect(screen.getByText('• Start the development server manually')).toBeInTheDocument();
        expect(screen.getByText('• Check for port conflicts on port 5173')).toBeInTheDocument();
      });
    });

    test('should collapse when clicked again', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      // Expand
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('Status:')).toBeInTheDocument();
      });
      
      // Collapse
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.queryByText('Status:')).not.toBeInTheDocument();
      });
    });
  });

  describe('Manual Refresh Functionality', () => {
    test('should refresh status when refresh button clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
      
      // Expand to see refresh button
      await user.click(screen.getByTestId('status-indicator'));
      
      // Click refresh button
      const refreshButton = screen.getByText('Refresh Status');
      await user.click(refreshButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    test('should update last checked time after manual refresh', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      await user.click(screen.getByTestId('status-indicator'));
      
      // Get initial time
      const initialTime = screen.getByText(/Last Checked:/).textContent;
      
      // Wait a bit and refresh
      vi.advanceTimersByTime(1000);
      const refreshButton = screen.getByText('Refresh Status');
      await user.click(refreshButton);
      
      await waitFor(() => {
        const newTime = screen.getByText(/Last Checked:/).textContent;
        expect(newTime).not.toBe(initialTime);
      });
    });
  });

  describe('Uptime Formatting', () => {
    test('should format uptime correctly for seconds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerRunningResponse, uptime: 45000 }), // 45 seconds
      });
      
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('45s')).toBeInTheDocument();
      });
    });

    test('should format uptime correctly for minutes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerRunningResponse, uptime: 300000 }), // 5 minutes
      });
      
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('5m 0s')).toBeInTheDocument();
      });
    });

    test('should format uptime correctly for hours', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerRunningResponse, uptime: 7890000 }), // 2h 11m 30s
      });
      
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('2h 11m')).toBeInTheDocument();
      });
    });

    test('should handle missing uptime gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockServerRunningResponse, uptime: undefined }),
      });
      
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        expect(screen.getByText('Unknown')).toBeInTheDocument();
      });
    });
  });

  describe('External Link Functionality', () => {
    test('should create working external link to server', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      await user.click(screen.getByTestId('status-indicator'));
      
      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'http://localhost:5173' }) as HTMLAnchorElement;
        expect(link.href).toBe('http://localhost:5173/');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
      });
    });
  });

  describe('Props and Configuration', () => {
    test('should apply custom className', async () => {
      render(<LocalServerStatusIndicator className="my-custom-class" />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      const container = screen.getByTestId('status-indicator').closest('div');
      expect(container).toHaveClass('my-custom-class');
    });

    test('should show expand indicator when showDetails is true', async () => {
      render(<LocalServerStatusIndicator showDetails={true} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      expect(screen.getByText('▼')).toBeInTheDocument();
    });

    test('should not show expand indicator when showDetails is false', async () => {
      render(<LocalServerStatusIndicator showDetails={false} />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Online')).toBeInTheDocument();
      });
      
      expect(screen.queryByText('▼')).not.toBeInTheDocument();
    });
  });

  describe('Error Boundary and Edge Cases', () => {
    test('should handle JSON parsing errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });
      
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Offline')).toBeInTheDocument();
      });
    });

    test('should handle network timeout gracefully', async () => {
      mockFetch.mockImplementation(() => new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network timeout')), 100)
      ));
      
      render(<LocalServerStatusIndicator />);
      
      await waitFor(() => {
        expect(screen.getByText('Local Server Offline')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });
});