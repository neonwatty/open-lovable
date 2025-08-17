import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock security error boundary component
interface SecurityErrorBoundaryProps {
  children: React.ReactNode;
  onSecurityIncident?: (incident: {
    type: string;
    message: string;
    timestamp: Date;
    path?: string;
    userAgent?: string;
    ip?: string;
  }) => void;
  fallbackComponent?: React.ComponentType<{ error: Error; resetErrorBoundary: () => void }>;
}

const SecurityErrorFallback = ({ 
  error, 
  resetErrorBoundary,
  onSecurityIncident 
}: { 
  error: Error; 
  resetErrorBoundary: () => void;
  onSecurityIncident?: SecurityErrorBoundaryProps['onSecurityIncident'];
}) => {
  const isSecurityViolation = error.message.includes('SECURITY_VIOLATION:');
  
  React.useEffect(() => {
    if (isSecurityViolation && onSecurityIncident) {
      const violationMatch = error.message.match(/SECURITY_VIOLATION:\s*(.+?)(?:\s*\(path:\s*(.+?)\))?$/);
      const violationType = violationMatch?.[1]?.toLowerCase().replace(/\s+/g, '_') || 'unknown';
      const violationPath = violationMatch?.[2];
      
      onSecurityIncident({
        type: violationType,
        message: violationMatch?.[1] || error.message,
        timestamp: new Date(),
        path: violationPath,
        userAgent: navigator?.userAgent,
        ip: 'client-side' // Would be populated server-side
      });
    }
  }, [error, isSecurityViolation, onSecurityIncident]);

  if (isSecurityViolation) {
    const violationMatch = error.message.match(/SECURITY_VIOLATION:\s*(.+?)(?:\s*\(path:\s*(.+?)\))?$/);
    const violationType = violationMatch?.[1] || 'Unknown security violation';
    const violationPath = violationMatch?.[2];

    return (
      <div className="security-error-boundary" role="alert">
        <div className="error-header">
          <h2>🚨 Security Violation Detected</h2>
          <p className="error-summary">
            A security violation has been detected and blocked to protect your system.
          </p>
        </div>
        
        <div className="error-details">
          <h3>Violation Details:</h3>
          <dl>
            <dt>Type:</dt>
            <dd>{violationType}</dd>
            {violationPath && (
              <>
                <dt>Path:</dt>
                <dd><code>{violationPath}</code></dd>
              </>
            )}
            <dt>Time:</dt>
            <dd>{new Date().toLocaleString()}</dd>
          </dl>
        </div>

        <div className="error-actions">
          <button 
            onClick={resetErrorBoundary}
            className="retry-button"
          >
            Try Again
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="reload-button"
          >
            Reload Page
          </button>
        </div>

        <div className="security-info">
          <h4>What happened?</h4>
          <p>
            Our security system detected potentially dangerous activity and blocked it automatically.
            This helps protect your files and system from unauthorized access.
          </p>
          
          <h4>What should I do?</h4>
          <ul>
            <li>If this was intentional, please check your file paths and try again</li>
            <li>Ensure you're only accessing files within your project directory</li>
            <li>Contact support if you believe this is an error</li>
          </ul>
        </div>
      </div>
    );
  }

  // Non-security error fallback
  return (
    <div className="general-error-boundary" role="alert">
      <h2>Something went wrong</h2>
      <details>
        <summary>Error details</summary>
        <pre>{error.message}</pre>
      </details>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
};

class SecurityErrorBoundary extends React.Component<
  SecurityErrorBoundaryProps,
  { hasError: boolean; error?: Error }
> {
  constructor(props: SecurityErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('SecurityErrorBoundary caught an error:', error, errorInfo);
    
    if (error.message.includes('SECURITY_VIOLATION:')) {
      console.warn('🚨 Security violation detected:', error.message);
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallbackComponent || SecurityErrorFallback;
      return (
        <FallbackComponent 
          error={this.state.error} 
          resetErrorBoundary={this.resetErrorBoundary}
          onSecurityIncident={this.props.onSecurityIncident}
        />
      );
    }

    return this.props.children;
  }
}

describe('SecurityErrorBoundary', () => {
  const mockOnSecurityIncident = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console errors during testing
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Security Violation Handling', () => {
    it('should catch and display path traversal violations', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Path traversal detected (path: ../../../etc/passwd)');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      expect(screen.getByText(/path traversal detected/i)).toBeInTheDocument();
      expect(screen.getByText('../../../etc/passwd')).toBeInTheDocument();
      
      // Should show security guidance
      expect(screen.getByText(/what happened/i)).toBeInTheDocument();
      expect(screen.getByText(/what should i do/i)).toBeInTheDocument();
    });

    it('should handle symlink escape violations', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Symlink escape attempt (path: /tmp/symlink)');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      expect(screen.getByText(/symlink escape attempt/i)).toBeInTheDocument();
      expect(screen.getByText('/tmp/symlink')).toBeInTheDocument();
    });

    it('should handle extension blocking violations', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: File extension not allowed (path: malware.exe)');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      expect(screen.getByText(/file extension not allowed/i)).toBeInTheDocument();
      expect(screen.getByText('malware.exe')).toBeInTheDocument();
    });

    it('should handle violations without path information', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Rate limit exceeded');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      expect(screen.getByText(/rate limit exceeded/i)).toBeInTheDocument();
      expect(screen.queryByText('Path:')).not.toBeInTheDocument();
    });
  });

  describe('Security Incident Reporting', () => {
    it('should report path traversal incidents', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Path traversal detected (path: ../../../etc/passwd)');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(mockOnSecurityIncident).toHaveBeenCalledWith({
        type: 'path_traversal_detected',
        message: 'Path traversal detected',
        timestamp: expect.any(Date),
        path: '../../../etc/passwd',
        userAgent: expect.any(String),
        ip: 'client-side'
      });
    });

    it('should report symlink escape incidents', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Symlink escape attempt (path: /tmp/symlink)');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(mockOnSecurityIncident).toHaveBeenCalledWith({
        type: 'symlink_escape_attempt',
        message: 'Symlink escape attempt',
        timestamp: expect.any(Date),
        path: '/tmp/symlink',
        userAgent: expect.any(String),
        ip: 'client-side'
      });
    });

    it('should report extension blocking incidents', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: File extension not allowed (path: virus.exe)');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(mockOnSecurityIncident).toHaveBeenCalledWith({
        type: 'file_extension_not_allowed',
        message: 'File extension not allowed',
        timestamp: expect.any(Date),
        path: 'virus.exe',
        userAgent: expect.any(String),
        ip: 'client-side'
      });
    });

    it('should not report non-security errors', () => {
      const ThrowingComponent = () => {
        throw new Error('Regular application error');
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(mockOnSecurityIncident).not.toHaveBeenCalled();
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  describe('User Interface', () => {
    it('should provide retry functionality', () => {
      let throwError = true;
      const ConditionalThrowingComponent = () => {
        if (throwError) {
          throw new Error('SECURITY_VIOLATION: Path traversal detected (path: ../attack.txt)');
        }
        return <div>Component rendered successfully</div>;
      };

      render(
        <SecurityErrorBoundary>
          <ConditionalThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      
      const tryAgainButton = screen.getByRole('button', { name: /try again/i });
      expect(tryAgainButton).toBeInTheDocument();

      // Simulate fixing the error
      throwError = false;
      fireEvent.click(tryAgainButton);

      expect(screen.getByText('Component rendered successfully')).toBeInTheDocument();
    });

    it('should provide page reload functionality', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Security violation');
      };

      render(
        <SecurityErrorBoundary>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      const reloadButton = screen.getByText(/reload page/i);
      expect(reloadButton).toBeInTheDocument();
      expect(reloadButton.tagName).toBe('BUTTON');
    });

    it('should display helpful security information', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Security violation');
      };

      render(
        <SecurityErrorBoundary>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      // Should provide explanations
      expect(screen.getByText(/our security system detected/i)).toBeInTheDocument();
      expect(screen.getByText(/protect your files/i)).toBeInTheDocument();
      
      // Should provide guidance
      expect(screen.getByText(/check your file paths/i)).toBeInTheDocument();
      expect(screen.getByText(/within your project directory/i)).toBeInTheDocument();
      expect(screen.getByText(/contact support/i)).toBeInTheDocument();
    });

    it('should show timestamp of the violation', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Security violation');
      };

      render(
        <SecurityErrorBoundary>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText('Time:')).toBeInTheDocument();
      // Should show current timestamp (check that it's recent)
      const timeElement = screen.getByText(/\d{1,2}\/\d{1,2}\/\d{4}/); // Date format
      expect(timeElement).toBeInTheDocument();
    });
  });

  describe('Custom Fallback Component', () => {
    it('should use custom fallback component when provided', () => {
      const CustomFallback = ({ error }: { error: Error }) => (
        <div>Custom security error: {error.message}</div>
      );

      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Custom violation');
      };

      render(
        <SecurityErrorBoundary fallbackComponent={CustomFallback}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/custom security error/i)).toBeInTheDocument();
      expect(screen.getByText(/custom violation/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes for screen readers', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Security violation');
      };

      render(
        <SecurityErrorBoundary>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      const alertElement = screen.getByRole('alert');
      expect(alertElement).toBeInTheDocument();
      expect(alertElement).toHaveClass('security-error-boundary');
    });

    it('should have accessible button labels', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Security violation');
      };

      render(
        <SecurityErrorBoundary>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      const reloadButton = screen.getByRole('button', { name: /reload page/i });
      
      expect(retryButton).toBeInTheDocument();
      expect(reloadButton).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Security violation');
      };

      render(
        <SecurityErrorBoundary>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByRole('heading', { level: 2, name: /security violation detected/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: /violation details/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 4, name: /what happened/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 4, name: /what should i do/i })).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed security violation messages', () => {
      const ThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION:'); // Empty violation
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      expect(mockOnSecurityIncident).toHaveBeenCalledWith({
        type: 'unknown',
        message: 'SECURITY_VIOLATION:',
        timestamp: expect.any(Date),
        path: undefined,
        userAgent: expect.any(String),
        ip: 'client-side'
      });
    });

    it('should handle errors without SECURITY_VIOLATION prefix', () => {
      const ThrowingComponent = () => {
        throw new Error('Network error: Connection failed');
      };

      render(
        <SecurityErrorBoundary>
          <ThrowingComponent />
        </SecurityErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText(/network error: connection failed/i)).toBeInTheDocument();
      expect(screen.queryByText(/security violation/i)).not.toBeInTheDocument();
    });

    it('should handle nested error boundaries', () => {
      const InnerThrowingComponent = () => {
        throw new Error('SECURITY_VIOLATION: Inner violation');
      };

      const OuterThrowingComponent = () => {
        return (
          <SecurityErrorBoundary>
            <InnerThrowingComponent />
          </SecurityErrorBoundary>
        );
      };

      render(
        <SecurityErrorBoundary onSecurityIncident={mockOnSecurityIncident}>
          <OuterThrowingComponent />
        </SecurityErrorBoundary>
      );

      // Inner boundary should catch the error
      expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      expect(screen.getByText(/inner violation/i)).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should not impact performance when no errors occur', () => {
      const NormalComponent = () => <div>Normal rendering</div>;

      const startTime = performance.now();
      
      render(
        <SecurityErrorBoundary>
          <NormalComponent />
        </SecurityErrorBoundary>
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;

      expect(screen.getByText('Normal rendering')).toBeInTheDocument();
      expect(renderTime).toBeLessThan(50); // Should render quickly
    });
  });
});