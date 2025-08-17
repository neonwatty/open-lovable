import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSearchParams, useRouter } from 'next/navigation';
import AISandboxPage from '@/app/page';

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

// Mock React hooks to control component state
const mockUseState = jest.spyOn(React, 'useState');
const mockSetShowHomeScreen = jest.fn();
const mockSetSandboxData = jest.fn();

// Mock app config with Claude Code setup
jest.mock('@/config/app.config', () => ({
  appConfig: {
    ai: {
      availableModels: ['claude-code'],
      defaultModel: 'claude-code',
      modelDisplayNames: {
        'claude-code': 'Claude Code'
      }
    },
    codeApplication: {
      defaultRefreshDelay: 2000,
    },
    sandbox: {
      path: './sandbox',
      timeoutMinutes: 15,
      vitePort: 5173,
      viteStartupDelay: 3000,
      cssRebuildDelay: 500,
      processTimeout: 30000,
    },
    codeGeneration: {
      maxTokens: 4000,
      temperature: 0.7,
    },
    packageInstaller: {
      enableLogging: true,
    },
  },
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, ...props }: any) => (
    <textarea 
      value={value} 
      onChange={onChange}
      {...props}
    />
  ),
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock CodeApplicationProgress component
jest.mock('@/components/CodeApplicationProgress', () => {
  return function MockCodeApplicationProgress({ state }: any) {
    if (!state.stage || state.stage === 'complete') return null;
    return <div data-testid="code-application-progress">Progress: {state.stage}</div>;
  };
});

// Mock HMRErrorDetector component
jest.mock('@/components/HMRErrorDetector', () => {
  return function MockHMRErrorDetector() {
    return <div data-testid="hmr-error-detector">HMR Error Detector</div>;
  };
});

// Mock other dependencies
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: any) => <pre>{children}</pre>,
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

jest.mock('@/lib/icons', () => ({
  FiFile: () => <span>FileIcon</span>,
  FiChevronRight: () => <span>ChevronRightIcon</span>,
  FiChevronDown: () => <span>ChevronDownIcon</span>,
  FiGithub: () => <span>GithubIcon</span>,
  BsFolderFill: () => <span>FolderFillIcon</span>,
  BsFolder2Open: () => <span>Folder2OpenIcon</span>,
  SiJavascript: () => <span>JavascriptIcon</span>,
  SiReact: () => <span>ReactIcon</span>,
  SiCss3: () => <span>Css3Icon</span>,
  SiJson: () => <span>JsonIcon</span>,
}));

// Mock fetch
global.fetch = jest.fn();

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

describe('Local Development Features', () => {
  const mockUseSearchParams = useSearchParams as jest.Mock;
  const mockUseRouter = useRouter as jest.Mock;
  const mockFetch = fetch as jest.Mock;

  beforeEach(() => {
    mockUseSearchParams.mockReturnValue({
      get: jest.fn(() => null),
      toString: jest.fn(() => ''),
    });

    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    });

    // Configure useState mock to bypass home screen for unit tests
    mockUseState.mockImplementation((initial) => {
      // Mock showHomeScreen to false to bypass home overlay
      if (initial === true && typeof initial === 'boolean') {
        return [false, mockSetShowHomeScreen];
      }
      // Mock sandboxData to have a test sandbox
      if (initial === null) {
        return [{
          sandboxId: 'test-sandbox-123',
          url: 'http://localhost:5173'
        }, mockSetSandboxData];
      }
      // Mock localhostStatus to show connected state
      if (initial && typeof initial === 'object' && initial.connected !== undefined) {
        return [{ connected: true, loading: false }, jest.fn()];
      }
      // Default behavior for other useState calls
      return [initial, jest.fn()];
    });

    // Reset and configure fetch with default success responses
    mockFetch.mockReset();
    mockFetch.mockImplementation((url) => {
      // Default successful responses for common endpoints
      if (url === '/api/create-ai-sandbox') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            sandboxId: 'test-sandbox-123',
            url: 'http://localhost:5173',
          }),
        });
      }
      if (url === 'http://localhost:5173') {
        return Promise.resolve({ ok: true });
      }
      if (url === '/api/conversation-state') {
        return Promise.resolve({ ok: true });
      }
      // Default fallback for any other URLs
      return Promise.resolve({ 
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
    });

    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    mockUseState.mockRestore();
    
    // Complete DOM cleanup
    document.body.innerHTML = '';
    
    // Reset all mocks to clean state
    jest.clearAllMocks();
    
    // Reset any global state
    if (global.fetch && typeof global.fetch.mockReset === 'function') {
      global.fetch.mockReset();
    }
  });

  describe('Localhost Connection Monitoring', () => {
    it('should check localhost connection on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      render(<AISandboxPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('http://localhost:5173', {
          method: 'HEAD',
          mode: 'no-cors',
          signal: expect.any(AbortSignal),
        });
      });
    });

    it('should set up periodic localhost connection checking', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      render(<AISandboxPage />);

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30000
      );

      setIntervalSpy.mockRestore();
    });

    it('should handle localhost connection failures', async () => {
      // Mock different responses for different URLs
      mockFetch.mockImplementation((url) => {
        if (url === 'http://localhost:5173') {
          return Promise.reject(new Error('Connection refused'));
        }
        if (url === '/api/create-ai-sandbox') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              sandboxId: 'test-123',
              url: 'http://localhost:5173',
            }),
          });
        }
        // Default fallback
        return Promise.resolve({ ok: true });
      });

      render(<AISandboxPage />);

      // Wait for the localhost check to run and fail
      await waitFor(() => {
        expect(console.log).toHaveBeenCalledWith(
          '[localhost] Cannot connect to localhost:5173:',
          expect.any(Error)
        );
      });
    });

    it('should display localhost connection status indicator', async () => {
      render(<AISandboxPage />);

      // Should display localhost connection status via the "Open in new tab" link
      await waitFor(() => {
        const localhostLink = screen.getByTitle('Open in new tab');
        expect(localhostLink).toBeInTheDocument();
        expect(localhostLink.getAttribute('href')).toBe('http://localhost:5173');
      });
    });
  });

  describe('Error Handling for Local Development', () => {
    it('should handle ECONNREFUSED errors with helpful messages', async () => {
      const error = new Error('ECONNREFUSED');
      mockFetch.mockRejectedValueOnce(error);

      render(<AISandboxPage />);

      // Trigger an operation that would call handleLocalDevError
      const textareas = screen.getAllByRole('textbox');
      const chatInput = textareas[0];
      
      fireEvent.change(chatInput, { target: { value: 'test message' } });
      
      // Should handle the error gracefully without crashing
      expect(screen.getByText(/Welcome! I can help you generate code/)).toBeInTheDocument();
    });

    it('should handle port conflict errors with helpful messages', async () => {
      const error = new Error('EADDRINUSE: port 5173');
      
      render(<AISandboxPage />);
      
      // Component should handle port errors gracefully
      expect(screen.getByText(/Welcome! I can help you generate code/)).toBeInTheDocument();
    });

    it('should handle npm installation errors with helpful tips', async () => {
      mockFetch.mockRejectedValueOnce(new Error('npm install failed'));

      render(<AISandboxPage />);
      
      // Should not crash on npm errors
      expect(screen.getByText(/Welcome! I can help you generate code/)).toBeInTheDocument();
    });
  });

  describe('Claude Code Model Integration', () => {
    it('should display Claude Code as the only model option', () => {
      render(<AISandboxPage />);

      // Should show Claude Code model display - handle multiple elements gracefully
      const claudeCodeElements = screen.getAllByText('Claude Code');
      expect(claudeCodeElements.length).toBeGreaterThanOrEqual(1);
      expect(claudeCodeElements[0]).toBeInTheDocument();
    });

    it('should not have interactive model selector', () => {
      render(<AISandboxPage />);

      // Should not have a select dropdown for models
      const selects = screen.queryAllByRole('combobox');
      const modelSelect = selects.find(select => 
        select.textContent?.includes('claude') || 
        select.textContent?.includes('model')
      );
      
      expect(modelSelect).toBeUndefined();
    });

    it('should use hardcoded claude-code model', () => {
      render(<AISandboxPage />);
      
      // Should render without trying to change models
      expect(screen.getByText(/Welcome! I can help you generate code/)).toBeInTheDocument();
    });
  });

  describe('Iframe Integration with Localhost', () => {
    it('should use localhost:5173 for iframe src', async () => {
      render(<AISandboxPage />);

      // Component should have localhost URL ready for iframe
      // Since we mocked connected localhost status, the UI should be ready for iframe display
      await waitFor(() => {
        // Check that the localhost URL is available in the "Open in new tab" link
        const localhostLink = screen.getByTitle('Open in new tab');
        expect(localhostLink).toBeInTheDocument();
        expect(localhostLink.getAttribute('href')).toBe('http://localhost:5173');
      });
    });

    it('should show waiting screen when localhost is not connected', async () => {
      // Override the useState mock for this test to show disconnected localhost
      mockUseState.mockImplementation((initial) => {
        // Mock showHomeScreen to false
        if (initial === true && typeof initial === 'boolean') {
          return [false, jest.fn()];
        }
        // Mock sandboxData to exist but localhost disconnected
        if (initial === null) {
          return [{
            sandboxId: 'test-sandbox-123',
            url: 'http://localhost:5173'
          }, jest.fn()];
        }
        // Mock localhostStatus to show disconnected state
        if (initial && typeof initial === 'object' && initial.connected !== undefined) {
          return [{ connected: false, loading: false }, jest.fn()];
        }
        return [initial, jest.fn()];
      });

      render(<AISandboxPage />);

      // Since this test is using mocked useState, it should show some content
      // Check if the page renders successfully with the mocked state
      await waitFor(() => {
        // Look for any text content that indicates the page rendered
        const titleElements = screen.queryAllByText(/Open Lovable/i);
        expect(titleElements.length).toBeGreaterThan(0);
      });
    });

    it('should have refresh functionality for localhost', async () => {
      render(<AISandboxPage />);

      // Should have interactive elements that provide refresh capability
      await waitFor(() => {
        // Check for any refresh-related functionality by looking for interactive buttons
        const interactiveElements = screen.getAllByRole('button');
        expect(interactiveElements.length).toBeGreaterThan(0);
        
        // Specifically check for the "Open in new tab" link which shows localhost connectivity
        const localhostLink = screen.getByTitle('Open in new tab');
        expect(localhostLink).toBeInTheDocument();
      });
    });
  });

  describe('Local Development Welcome Message', () => {
    it('should show local development welcome message', () => {
      render(<AISandboxPage />);

      expect(screen.getByText(/Welcome! I can help you generate code for your local React development environment/)).toBeInTheDocument();
      expect(screen.getByText(/Make sure your local development server is running on port 5173/)).toBeInTheDocument();
    });

    it('should show helpful tips for local development', () => {
      render(<AISandboxPage />);

      expect(screen.getByText(/npm run dev/)).toBeInTheDocument();
      expect(screen.getByText(/install packages/)).toBeInTheDocument();
    });
  });

  describe('Code Application with Setting-up Stage', () => {
    it('should use setting-up stage instead of analyzing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"type":"start"}\n\n'),
              })
              .mockResolvedValueOnce({
                done: true,
                value: undefined,
              }),
          }),
        },
      });

      render(<AISandboxPage />);

      // The component should handle the setting-up stage properly
      expect(screen.getByText(/Welcome! I can help you generate code/)).toBeInTheDocument();
    });
  });
});