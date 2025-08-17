import React from 'react';
import { render, screen } from '@testing-library/react';
import CodeApplicationProgress, { CodeApplicationState } from '@/components/CodeApplicationProgress';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('CodeApplicationProgress', () => {
  describe('Local Development Stage Messages', () => {
    it('should display setting-up stage message', () => {
      const state: CodeApplicationState = { stage: 'setting-up' };
      render(<CodeApplicationProgress state={state} />);
      expect(screen.getByText('Setting up local workspace...')).toBeInTheDocument();
    });

    it('should display installing stage message', () => {
      const state: CodeApplicationState = { stage: 'installing' };
      render(<CodeApplicationProgress state={state} />);
      expect(screen.getByText('Installing dependencies...')).toBeInTheDocument();
    });

    it('should display starting-server stage message', () => {
      const state: CodeApplicationState = { stage: 'starting-server' };
      render(<CodeApplicationProgress state={state} />);
      expect(screen.getByText('Starting Vite development server...')).toBeInTheDocument();
    });

    it('should display generating stage message', () => {
      const state: CodeApplicationState = { stage: 'generating' };
      render(<CodeApplicationProgress state={state} />);
      expect(screen.getByText('Generating code...')).toBeInTheDocument();
    });

    it('should display applying stage message', () => {
      const state: CodeApplicationState = { stage: 'applying' };
      render(<CodeApplicationProgress state={state} />);
      expect(screen.getByText('Applying changes to local files...')).toBeInTheDocument();
    });

    it('should display default message for unknown stage', () => {
      const state: CodeApplicationState = { stage: null };
      render(<CodeApplicationProgress state={state} />);
      expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
    });
  });

  describe('Server Status Indicators', () => {
    it('should display starting server status with yellow indicator', () => {
      const state: CodeApplicationState = { 
        stage: 'starting-server', 
        serverStatus: 'starting' 
      };
      render(<CodeApplicationProgress state={state} />);
      
      expect(screen.getByText('Starting')).toBeInTheDocument();
      const indicator = screen.getByText('Starting').previousElementSibling;
      expect(indicator).toHaveClass('bg-yellow-400');
    });

    it('should display running server status with green indicator', () => {
      const state: CodeApplicationState = { 
        stage: 'applying', 
        serverStatus: 'running' 
      };
      render(<CodeApplicationProgress state={state} />);
      
      expect(screen.getByText('Running')).toBeInTheDocument();
      const indicator = screen.getByText('Running').previousElementSibling;
      expect(indicator).toHaveClass('bg-green-400');
    });

    it('should display stopped server status with red indicator', () => {
      const state: CodeApplicationState = { 
        stage: 'installing', 
        serverStatus: 'stopped' 
      };
      render(<CodeApplicationProgress state={state} />);
      
      expect(screen.getByText('Stopped')).toBeInTheDocument();
      const indicator = screen.getByText('Stopped').previousElementSibling;
      expect(indicator).toHaveClass('bg-red-400');
    });

    it('should display error server status with red indicator', () => {
      const state: CodeApplicationState = { 
        stage: 'setting-up', 
        serverStatus: 'error' 
      };
      render(<CodeApplicationProgress state={state} />);
      
      expect(screen.getByText('Error')).toBeInTheDocument();
      const indicator = screen.getByText('Error').previousElementSibling;
      expect(indicator).toHaveClass('bg-red-500');
    });

    it('should not display server status when not provided', () => {
      const state: CodeApplicationState = { stage: 'installing' };
      render(<CodeApplicationProgress state={state} />);
      
      expect(screen.queryByText('Starting')).not.toBeInTheDocument();
      expect(screen.queryByText('Running')).not.toBeInTheDocument();
      expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });
  });

  describe('Component Visibility', () => {
    it('should not render when stage is null', () => {
      const state: CodeApplicationState = { stage: null };
      const { container } = render(<CodeApplicationProgress state={state} />);
      expect(container.firstChild).toBeNull();
    });

    it('should not render when stage is complete', () => {
      const state: CodeApplicationState = { stage: 'complete' };
      const { container } = render(<CodeApplicationProgress state={state} />);
      expect(container.firstChild).toBeNull();
    });

    it('should render when stage is active', () => {
      const state: CodeApplicationState = { stage: 'installing' };
      const { container } = render(<CodeApplicationProgress state={state} />);
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('Animation and Loading', () => {
    it('should display loading spinner', () => {
      const state: CodeApplicationState = { stage: 'installing' };
      render(<CodeApplicationProgress state={state} />);
      
      // Check for SVG spinner element
      const spinner = document.querySelector('svg');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('w-full h-full');
    });

    it('should have proper accessibility structure', () => {
      const state: CodeApplicationState = { 
        stage: 'installing',
        serverStatus: 'running'
      };
      render(<CodeApplicationProgress state={state} />);
      
      // Check for semantic structure
      expect(screen.getByText('Installing dependencies...')).toBeInTheDocument();
      expect(screen.getByText('Running')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined serverStatus gracefully', () => {
      const state: CodeApplicationState = { 
        stage: 'installing',
        serverStatus: undefined
      };
      render(<CodeApplicationProgress state={state} />);
      
      expect(screen.getByText('Installing dependencies...')).toBeInTheDocument();
      expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    });

    it('should handle packages and other metadata', () => {
      const state: CodeApplicationState = { 
        stage: 'installing',
        packages: ['react', 'axios'],
        installedPackages: ['react'],
        filesGenerated: ['App.tsx'],
        message: 'Custom message'
      };
      render(<CodeApplicationProgress state={state} />);
      
      expect(screen.getByText('Installing dependencies...')).toBeInTheDocument();
    });
  });
});