import React from 'react';
import { render, waitFor } from '@testing-library/react';
import HMRErrorDetector from '@/components/HMRErrorDetector';

describe('HMRErrorDetector', () => {
  let mockIframeRef: React.RefObject<HTMLIFrameElement>;
  let onErrorDetected: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    onErrorDetected = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createMockIframeWithError = (errorText: string) => {
    const mockErrorElement = {
      textContent: errorText,
    };

    const mockShadowRoot = {
      querySelector: jest.fn().mockReturnValue(mockErrorElement),
    };

    const mockErrorOverlay = {
      shadowRoot: mockShadowRoot,
    };

    mockIframeRef = {
      current: {
        contentDocument: {
          querySelector: jest.fn().mockReturnValue(mockErrorOverlay),
        } as any,
      } as HTMLIFrameElement,
    };

    return mockIframeRef;
  };

  describe('Local Development Error Detection', () => {
    it('should detect missing package import errors', async () => {
      mockIframeRef = createMockIframeWithError('Failed to resolve import "react-router-dom"');

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      // Fast-forward timers to trigger the check
      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(onErrorDetected).toHaveBeenCalledWith([{
          type: 'npm-missing',
          message: 'Missing package "react-router-dom" - Click \'Install Packages\' above or run \'npm install react-router-dom\' in your terminal',
          package: 'react-router-dom'
        }]);
      });
    });

    it('should detect port conflict errors', async () => {
      mockIframeRef = createMockIframeWithError('Error: EADDRINUSE: address already in use :::5173');

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(onErrorDetected).toHaveBeenCalledWith([{
          type: 'port-conflict',
          message: 'Port 5173 is already in use. Please stop other development servers or use a different port.'
        }]);
      });
    });

    it('should detect syntax errors', async () => {
      mockIframeRef = createMockIframeWithError('SyntaxError: Unexpected token');

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(onErrorDetected).toHaveBeenCalledWith([{
          type: 'syntax-error',
          message: 'Syntax error detected in your code. Please check the file content and fix any syntax issues.'
        }]);
      });
    });

    it('should detect Vite server errors', async () => {
      mockIframeRef = createMockIframeWithError('Vite dev server error occurred');

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(onErrorDetected).toHaveBeenCalledWith([{
          type: 'vite-error',
          message: 'Vite development server error. Try restarting the server with "npm run dev".'
        }]);
      });
    });

    it('should handle scoped package names correctly', async () => {
      mockIframeRef = createMockIframeWithError('Failed to resolve import "@testing-library/react"');

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(onErrorDetected).toHaveBeenCalledWith([{
          type: 'npm-missing',
          message: 'Missing package "@testing-library/react" - Click \'Install Packages\' above or run \'npm install @testing-library/react\' in your terminal',
          package: '@testing-library/react'
        }]);
      });
    });

    it('should not trigger on relative imports', async () => {
      mockIframeRef = createMockIframeWithError('Failed to resolve import "./components/Button"');

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      jest.advanceTimersByTime(100);

      // Wait a bit to ensure callback would have been called if it was going to be
      await waitFor(() => {
        expect(onErrorDetected).not.toHaveBeenCalled();
      }, { timeout: 100 });
    });

    it('should handle iframe without content document gracefully', async () => {
      mockIframeRef = {
        current: {
          contentDocument: null,
        } as HTMLIFrameElement,
      };

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(onErrorDetected).not.toHaveBeenCalled();
      }, { timeout: 100 });
    });

    it('should handle missing error element gracefully', async () => {
      mockIframeRef = {
        current: {
          contentDocument: {
            querySelector: jest.fn().mockReturnValue(null),
          } as any,
        } as HTMLIFrameElement,
      };

      render(<HMRErrorDetector iframeRef={mockIframeRef} onErrorDetected={onErrorDetected} />);

      jest.advanceTimersByTime(100);

      await waitFor(() => {
        expect(onErrorDetected).not.toHaveBeenCalled();
      }, { timeout: 100 });
    });
  });
});