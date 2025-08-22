import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SandboxStatusBadge from '../../components/SandboxStatusBadge';

// Mock the fetch function
global.fetch = jest.fn();

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('SandboxStatusBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with checking status initially', async () => {
    // Mock the fetch to return a pending status
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        active: false,
        healthy: false,
        status: {
          port: { port: 5173, accessible: false },
          connectionHealth: 'checking',
        },
        message: 'Checking status...',
      }),
    });

    render(<SandboxStatusBadge />);

    // Should show checking status initially
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('displays healthy status when sandbox is running', async () => {
    // Mock the fetch to return a healthy status
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        active: true,
        healthy: true,
        status: {
          port: { port: 5173, accessible: true, responseTime: 50 },
          url: 'http://localhost:5173',
          connectionHealth: 'healthy',
        },
        message: 'Local Vite server is running and accessible',
      }),
    });

    render(<SandboxStatusBadge />);

    await waitFor(() => {
      expect(screen.getByText('Port 5173')).toBeInTheDocument();
      expect(screen.getByText('(50ms)')).toBeInTheDocument();
    });
  });

  it('displays error status when fetch fails', async () => {
    // Mock the fetch to fail
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<SandboxStatusBadge />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('displays offline status when sandbox is not accessible', async () => {
    // Mock the fetch to return unreachable status
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        active: false,
        healthy: false,
        status: {
          port: { port: 5173, accessible: false },
          connectionHealth: 'unreachable',
        },
        message: 'No active Vite server found',
      }),
    });

    render(<SandboxStatusBadge />);

    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  it('handles click events correctly', async () => {
    // Mock successful healthy response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        active: true,
        healthy: true,
        status: {
          port: { port: 5173, accessible: true },
          url: 'http://localhost:5173',
          connectionHealth: 'healthy',
        },
        message: 'Local Vite server is running',
      }),
    });

    // Mock window.open
    const mockOpen = jest.fn();
    Object.defineProperty(window, 'open', {
      writable: true,
      value: mockOpen,
    });

    render(<SandboxStatusBadge />);

    await waitFor(() => {
      const badge = screen.getByText('Port 5173').closest('div');
      expect(badge).toBeInTheDocument();
    });

    // Click the badge
    const badge = screen.getByText('Port 5173').closest('div');
    if (badge) {
      badge.click();
    }

    // Should open the URL
    expect(mockOpen).toHaveBeenCalledWith('http://localhost:5173', '_blank');
  });

  it('calls onStatusChange callback when status changes', async () => {
    const mockOnStatusChange = jest.fn();

    // Mock the fetch to return healthy status
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        active: true,
        healthy: true,
        status: {
          port: { port: 5173, accessible: true },
          connectionHealth: 'healthy',
        },
        message: 'Healthy',
      }),
    });

    render(<SandboxStatusBadge onStatusChange={mockOnStatusChange} />);

    await waitFor(() => {
      expect(mockOnStatusChange).toHaveBeenCalledWith('healthy');
    });
  });
});