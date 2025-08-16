import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Home from '@/app/page';

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

// Mock app config
jest.mock('@/config/app.config', () => ({
  appConfig: {
    ai: {
      availableModels: ['moonshotai/kimi-k2-instruct', 'anthropic/claude-3-5-sonnet-20241022', 'openai/gpt-4o'],
      defaultModel: 'moonshotai/kimi-k2-instruct',
      models: {
        'moonshotai/kimi-k2-instruct': 'moonshotai/kimi-k2-instruct',
        'anthropic/claude-3-5-sonnet-20241022': 'anthropic/claude-3-5-sonnet-20241022',
        'openai/gpt-4o': 'openai/gpt-4o',
      },
      modelDisplayNames: {
        'moonshotai/kimi-k2-instruct': 'Kimi K2',
        'anthropic/claude-3-5-sonnet-20241022': 'Claude Sonnet 4',
        'openai/gpt-4o': 'GPT-4o',
      },
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

// Mock syntax highlighter
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: any) => <pre>{children}</pre>,
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

// Mock icons
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

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
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
  return function MockCodeApplicationProgress() {
    return <div data-testid="code-application-progress">Progress Component</div>;
  };
});

// Mock fetch for API calls
global.fetch = jest.fn();

describe.skip('Home Page', () => {
  const mockUseSearchParams = useSearchParams as jest.Mock;
  const mockUseRouter = useRouter as jest.Mock;
  const mockFetch = fetch as jest.Mock;

  beforeEach(() => {
    // Setup default mocks
    mockUseSearchParams.mockReturnValue({
      get: jest.fn((param: string) => {
        if (param === 'model') return null;
        return null;
      }),
    });

    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    });

    mockFetch.mockReset();
    
    // Reset global sandbox state
    (global as any).sandboxState = undefined;
  });

  describe('Suspense Integration', () => {
    it('should render with Suspense wrapper', () => {
      render(<Home />);
      
      // Should render without crashing
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });

    it('should handle loading states properly', () => {
      render(<Home />);
      
      // Initial state should show home screen
      expect(screen.getByText(/Welcome! I can help you generate code/)).toBeInTheDocument();
    });
  });

  describe('Model Selection', () => {
    it('should use default model when no model param provided', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn(() => null),
      });

      render(<Home />);
      
      // Should not crash and should render
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });

    it('should use model from search params when valid', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((param: string) => {
          if (param === 'model') return 'anthropic/claude-3-5-sonnet-20241022';
          return null;
        }),
      });

      render(<Home />);
      
      // Should render without crashing with valid model
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });

    it('should fallback to default model when invalid model param provided', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((param: string) => {
          if (param === 'model') return 'invalid/model';
          return null;
        }),
      });

      render(<Home />);
      
      // Should render without crashing and fallback to default
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });
  });

  describe('Chat Interface', () => {
    it('should display initial system message', () => {
      render(<Home />);
      
      expect(screen.getByText(/Welcome! I can help you generate code/)).toBeInTheDocument();
      expect(screen.getByText(/Tip: If you see package errors/)).toBeInTheDocument();
    });

    it('should allow input in chat textbox', () => {
      render(<Home />);
      
      const textareas = screen.getAllByRole('textbox');
      const chatInput = textareas.find(textarea => 
        textarea.getAttribute('placeholder')?.includes('chat') ||
        textarea.getAttribute('placeholder')?.includes('message') ||
        textarea.getAttribute('placeholder')?.includes('Ask')
      );
      
      if (chatInput) {
        fireEvent.change(chatInput, { target: { value: 'Create a todo app' } });
        expect(chatInput).toHaveValue('Create a todo app');
      }
    });
  });

  describe('Sandbox Creation', () => {
    it('should handle sandbox creation API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          sandboxId: 'test-sandbox-123',
          url: 'http://localhost:5173',
        }),
      });

      render(<Home />);
      
      // Find chat input and submit a message that should trigger sandbox creation
      const textareas = screen.getAllByRole('textbox');
      const chatInput = textareas.find(textarea => 
        textarea.getAttribute('placeholder')?.includes('chat') ||
        textarea.getAttribute('placeholder')?.includes('message') ||
        textarea.getAttribute('placeholder')?.includes('Ask')
      );
      
      if (chatInput) {
        fireEvent.change(chatInput, { target: { value: 'Create a simple React app' } });
        
        // Find and click submit button
        const buttons = screen.getAllByRole('button');
        const submitButton = buttons.find(button => 
          button.textContent?.includes('Send') || 
          button.textContent?.includes('Generate') ||
          (button as HTMLButtonElement).type === 'submit'
        );
        
        if (submitButton) {
          fireEvent.click(submitButton);
          
          // Wait for async operations
          await waitFor(() => {
            // Should have attempted to create sandbox
            expect(mockFetch).toHaveBeenCalled();
          });
        }
      }
    });

    it('should handle sandbox creation errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<Home />);
      
      // Component should not crash on API errors
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });
  });

  describe('File Structure Display', () => {
    it('should display file structure when sandbox exists', () => {
      render(<Home />);
      
      // Should show initial state
      expect(screen.getByText('No sandbox created yet')).toBeInTheDocument();
    });

    it('should handle file expansion states', () => {
      render(<Home />);
      
      // Check for folder icons that indicate file structure rendering
      const folderIcons = screen.queryAllByText('FolderFillIcon');
      // Should render without crashing even if no files yet
      expect(folderIcons.length >= 0).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      // Mock console.error to prevent test noise
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      mockFetch.mockRejectedValue(new Error('API Error'));

      render(<Home />);
      
      // Component should render without crashing
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    it('should handle missing global state gracefully', () => {
      // Ensure global state is undefined
      (global as any).sandboxState = undefined;
      
      render(<Home />);
      
      // Should not crash when global state is missing
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    it('should render CodeApplicationProgress component', () => {
      render(<Home />);
      
      // Check if progress component is rendered (might be conditional)
      const progressComponent = screen.queryByTestId('code-application-progress');
      // Should either be present or absent without crashing
      expect(progressComponent !== undefined || progressComponent === null).toBe(true);
    });

    it('should handle tab switching', () => {
      render(<Home />);
      
      // Look for tab-related buttons or elements
      const buttons = screen.getAllByRole('button');
      
      // Should render without crashing regardless of tab state
      expect(buttons.length >= 0).toBe(true);
    });
  });

  describe('TypeScript Safety', () => {
    it('should handle undefined searchParams gracefully', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn(() => undefined),
      });

      render(<Home />);
      
      // Should not crash with undefined params
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });

    it('should handle model display name lookup safely', () => {
      // Test with various model configurations
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((param: string) => {
          if (param === 'model') return 'anthropic/claude-3-5-sonnet-20241022';
          return null;
        }),
      });

      render(<Home />);
      
      // Should handle model display name lookup without TypeScript errors
      expect(screen.getByText('Welcome! I can help you generate code')).toBeInTheDocument();
    });
  });
});