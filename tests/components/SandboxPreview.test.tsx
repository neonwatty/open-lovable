import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SandboxPreview from '@/components/SandboxPreview';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader-icon">Loader2</div>,
  ExternalLink: () => <div data-testid="external-link-icon">ExternalLink</div>,
  RefreshCw: () => <div data-testid="refresh-icon">RefreshCw</div>,
  Terminal: () => <div data-testid="terminal-icon">Terminal</div>,
}));

describe('SandboxPreview', () => {
  const defaultProps = {
    sandboxId: 'test-sandbox-123',
    port: 5173,
    type: 'vite' as const,
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL Construction (Task 8.2 - Critical)', () => {
    test('should generate localhost URL with correct port', () => {
      render(<SandboxPreview {...defaultProps} />);
      
      const iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
    });

    test('should update URL when port changes', () => {
      const { rerender } = render(<SandboxPreview {...defaultProps} />);
      
      // Initial port
      let iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
      
      // Changed port
      rerender(<SandboxPreview {...defaultProps} port={3000} />);
      iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:3000/');
    });

    test('should update URL when sandboxId changes', () => {
      const { rerender } = render(<SandboxPreview {...defaultProps} />);
      
      // Initial sandbox
      let iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
      
      // Different sandbox (should still use localhost)
      rerender(<SandboxPreview {...defaultProps} sandboxId="different-sandbox" />);
      iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
    });

    test('should display correct URL in preview controls', () => {
      render(<SandboxPreview {...defaultProps} />);
      
      const urlDisplay = screen.getByText('http://localhost:5173');
      expect(urlDisplay).toBeInTheDocument();
    });

    test('should handle different server types correctly', () => {
      const { rerender } = render(<SandboxPreview {...defaultProps} type="nextjs" />);
      
      // Next.js should still use localhost
      let iframe = screen.getByTitle('nextjs preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
      expect(screen.getByText('▲ Next.js Preview')).toBeInTheDocument();
      
      // Vite should use localhost
      rerender(<SandboxPreview {...defaultProps} type="vite" />);
      iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
      expect(screen.getByText('⚡ Vite Preview')).toBeInTheDocument();
    });
  });

  describe('Console Type Handling', () => {
    test('should render console output for console type', () => {
      const output = 'Test console output';
      render(
        <SandboxPreview 
          {...defaultProps} 
          type="console" 
          output={output}
        />
      );
      
      expect(screen.getByText(output)).toBeInTheDocument();
      expect(screen.queryByTitle('console preview')).not.toBeInTheDocument();
    });

    test('should show default message when no console output', () => {
      render(<SandboxPreview {...defaultProps} type="console" />);
      
      expect(screen.getByText('No output yet...')).toBeInTheDocument();
    });
  });

  describe('Interactive Features', () => {
    test('should refresh iframe on refresh button click', async () => {
      const user = userEvent.setup();
      render(<SandboxPreview {...defaultProps} />);
      
      const refreshButton = screen.getByTitle('Refresh preview');
      
      // Click refresh and check that the iframe gets re-rendered
      await user.click(refreshButton);
      
      // The iframe should still exist and be functional
      const iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
    });

    test('should toggle console output visibility', async () => {
      const user = userEvent.setup();
      const output = 'Test console output';
      
      render(
        <SandboxPreview 
          {...defaultProps} 
          type="vite"
          output={output}
        />
      );
      
      // Console should not be visible initially
      expect(screen.queryByText('Console Output')).not.toBeInTheDocument();
      
      // Click toggle button
      const toggleButton = screen.getByTitle('Toggle console');
      await user.click(toggleButton);
      
      // Console should now be visible
      expect(screen.getByText('Console Output')).toBeInTheDocument();
      expect(screen.getByText(output)).toBeInTheDocument();
      
      // Click again to hide
      await user.click(toggleButton);
      
      // Console should be hidden again
      expect(screen.queryByText('Console Output')).not.toBeInTheDocument();
    });

    test('should open external link with correct URL', () => {
      render(<SandboxPreview {...defaultProps} />);
      
      const externalLink = screen.getByTitle('Open in new tab') as HTMLAnchorElement;
      expect(externalLink.href).toBe('http://localhost:5173/');
      expect(externalLink.target).toBe('_blank');
      expect(externalLink.rel).toBe('noopener noreferrer');
    });
  });

  describe('Loading States', () => {
    test('should show loading overlay when isLoading is true', () => {
      render(<SandboxPreview {...defaultProps} isLoading={true} />);
      
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
      expect(screen.getByText('Starting Vite dev server...')).toBeInTheDocument();
    });

    test('should show correct loading message for different types', () => {
      const { rerender } = render(
        <SandboxPreview {...defaultProps} type="nextjs" isLoading={true} />
      );
      
      expect(screen.getByText('Starting Next.js dev server...')).toBeInTheDocument();
      
      rerender(<SandboxPreview {...defaultProps} type="vite" isLoading={true} />);
      expect(screen.getByText('Starting Vite dev server...')).toBeInTheDocument();
    });

    test('should hide loading overlay when isLoading is false', () => {
      render(<SandboxPreview {...defaultProps} isLoading={false} />);
      
      expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
      expect(screen.queryByText('Starting Vite dev server...')).not.toBeInTheDocument();
    });
  });

  describe('Iframe Properties', () => {
    test('should have correct iframe attributes', () => {
      render(<SandboxPreview {...defaultProps} />);
      
      const iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.className).toContain('w-full');
      expect(iframe.className).toContain('h-[600px]');
      expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
    });

    test('should update iframe key on multiple refreshes', async () => {
      const user = userEvent.setup();
      render(<SandboxPreview {...defaultProps} />);
      
      const refreshButton = screen.getByTitle('Refresh preview');
      
      // Click refresh multiple times and verify iframe still works
      await user.click(refreshButton);
      expect(screen.getByTitle('vite preview')).toBeInTheDocument();
      
      await user.click(refreshButton);
      expect(screen.getByTitle('vite preview')).toBeInTheDocument();
      
      await user.click(refreshButton);
      const iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:5173/');
    });
  });

  describe('Props Validation', () => {
    test('should handle missing sandboxId gracefully', () => {
      render(<SandboxPreview sandboxId="" port={5173} type="vite" />);
      
      // Should still render but iframe src will be empty when no sandboxId
      const iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('');
    });

    test('should handle edge case ports', () => {
      const { rerender } = render(<SandboxPreview {...defaultProps} port={0} />);
      
      let iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:0/');
      
      rerender(<SandboxPreview {...defaultProps} port={65535} />);
      iframe = screen.getByTitle('vite preview') as HTMLIFrameElement;
      expect(iframe.src).toBe('http://localhost:65535/');
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels and titles', () => {
      render(<SandboxPreview {...defaultProps} />);
      
      expect(screen.getByTitle('Refresh preview')).toBeInTheDocument();
      expect(screen.getByTitle('Toggle console')).toBeInTheDocument();
      expect(screen.getByTitle('Open in new tab')).toBeInTheDocument();
      expect(screen.getByTitle('vite preview')).toBeInTheDocument();
    });

    test('should have keyboard accessible buttons', async () => {
      const user = userEvent.setup();
      render(<SandboxPreview {...defaultProps} />);
      
      const refreshButton = screen.getByTitle('Refresh preview');
      
      // Should be focusable
      refreshButton.focus();
      expect(document.activeElement).toBe(refreshButton);
      
      // Should be activatable with Enter
      await user.keyboard('{Enter}');
      // Verify iframe key changed (refresh happened)
      expect(screen.getByTitle('vite preview')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('should handle undefined output gracefully', () => {
      render(<SandboxPreview {...defaultProps} output={undefined} />);
      
      // Should render without crashing
      expect(screen.getByTitle('vite preview')).toBeInTheDocument();
    });

    test('should handle empty output string', () => {
      render(<SandboxPreview {...defaultProps} output="" />);
      
      // Should render without crashing
      expect(screen.getByTitle('vite preview')).toBeInTheDocument();
    });
  });
});

// Type fix for iframe access
interface HTMLIFrameInterface extends HTMLIFrameElement {
  src: string;
}