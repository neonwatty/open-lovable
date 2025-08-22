import { renderHook, waitFor, act } from '@testing-library/react';
import { useSandboxStatus } from '../../hooks/useSandboxStatus';

// Mock fetch
global.fetch = jest.fn();

describe('useSandboxStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches status data on mount', async () => {
    const mockStatusData = {
      success: true,
      active: true,
      healthy: true,
      status: {
        port: { port: 5173, accessible: true },
        connectionHealth: 'healthy' as const,
        process: { pid: 1234, isRunning: true },
        workingDirectory: '/tmp/sandbox',
        lastHealthCheck: new Date().toISOString(),
        filesTracked: [],
      },
      message: 'Running',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockStatusData,
    });

    const { result } = renderHook(() => useSandboxStatus());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.statusData).toBe(null);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.statusData).toEqual(mockStatusData);
      expect(result.current.overallStatus).toBe('healthy');
    });
  });

  it('handles fetch errors correctly', async () => {
    const mockOnError = jest.fn();
    
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => 
      useSandboxStatus({ onError: mockOnError })
    );

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
      expect(result.current.overallStatus).toBe('error');
      expect(mockOnError).toHaveBeenCalledWith('Network error');
    });
  });

  it('polls status data when autoRefresh is enabled', async () => {
    const mockStatusData = {
      success: true,
      active: true,
      healthy: true,
      status: {
        port: { port: 5173, accessible: true },
        connectionHealth: 'healthy' as const,
        process: null,
        workingDirectory: '/tmp',
        lastHealthCheck: new Date().toISOString(),
        filesTracked: [],
      },
      message: 'Running',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockStatusData,
    });

    const { result } = renderHook(() => 
      useSandboxStatus({ 
        autoRefresh: true, 
        refreshInterval: 1000 
      })
    );

    // Initial fetch
    await waitFor(() => {
      expect(result.current.statusData).toEqual(mockStatusData);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Advance timer to trigger next poll
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('stops polling when autoRefresh is disabled', async () => {
    const mockStatusData = {
      success: true,
      active: false,
      healthy: false,
      status: {
        port: { port: 5173, accessible: false },
        connectionHealth: 'unreachable' as const,
        process: null,
        workingDirectory: '/tmp',
        lastHealthCheck: new Date().toISOString(),
        filesTracked: [],
      },
      message: 'Not running',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockStatusData,
    });

    const { result } = renderHook(() => 
      useSandboxStatus({ autoRefresh: false })
    );

    // Initial fetch should happen
    await waitFor(() => {
      expect(result.current.statusData).toEqual(mockStatusData);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Advance timer - should not trigger additional fetches
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('calls onStatusChange when status changes', async () => {
    const mockOnStatusChange = jest.fn();

    const mockStatusData = {
      success: true,
      active: true,
      healthy: true,
      status: {
        port: { port: 5173, accessible: true },
        connectionHealth: 'healthy' as const,
        process: { pid: 1234, isRunning: true },
        workingDirectory: '/tmp',
        lastHealthCheck: new Date().toISOString(),
        filesTracked: [],
      },
      message: 'Healthy',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockStatusData,
    });

    renderHook(() => 
      useSandboxStatus({ onStatusChange: mockOnStatusChange })
    );

    await waitFor(() => {
      expect(mockOnStatusChange).toHaveBeenCalledWith('healthy', mockStatusData);
    });
  });

  it('allows manual refresh', async () => {
    const mockStatusData = {
      success: true,
      active: true,
      healthy: true,
      status: {
        port: { port: 5173, accessible: true },
        connectionHealth: 'healthy' as const,
        process: null,
        workingDirectory: '/tmp',
        lastHealthCheck: new Date().toISOString(),
        filesTracked: [],
      },
      message: 'Running',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockStatusData,
    });

    const { result } = renderHook(() => 
      useSandboxStatus({ autoRefresh: false })
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.statusData).toEqual(mockStatusData);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Manual refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('provides correct overall status based on data', async () => {
    const testCases = [
      {
        data: null,
        error: 'Network error',
        expected: 'error' as const,
      },
      {
        data: {
          success: true,
          status: { connectionHealth: 'healthy' as const },
        },
        error: null,
        expected: 'healthy' as const,
      },
      {
        data: {
          success: true,
          status: { connectionHealth: 'unreachable' as const },
        },
        error: null,
        expected: 'unreachable' as const,
      },
      {
        data: {
          success: true,
          status: { connectionHealth: 'checking' as const },
        },
        error: null,
        expected: 'checking' as const,
      },
    ];

    for (const testCase of testCases) {
      if (testCase.error) {
        (global.fetch as jest.Mock).mockRejectedValue(new Error(testCase.error));
      } else {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => testCase.data,
        });
      }

      const { result, unmount } = renderHook(() => useSandboxStatus());

      await waitFor(() => {
        expect(result.current.overallStatus).toBe(testCase.expected);
      });

      unmount();
      jest.clearAllMocks();
    }
  });
});