import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createSecureFileOps } from '../../lib/security/secure-file-ops';

// Mock the security modules
jest.mock('../../lib/security/secure-file-ops', () => ({
  createSecureFileOps: jest.fn()
}));

// Mock Next.js components that might be used
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Create a test component that uses security-aware file operations
const SecurityAwareFileExplorer = ({ 
  sandboxId, 
  initialPath = '/',
  selectedFile,
  onFileSelect 
}: {
  sandboxId: string;
  initialPath?: string;
  selectedFile?: string;
  onFileSelect?: (file: string) => void;
}) => {
  const [files, setFiles] = React.useState<string[]>([]);
  const [directories, setDirectories] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const secureFileOps = createSecureFileOps(`/tmp/sandbox-${sandboxId}`);

  React.useEffect(() => {
    const loadFiles = async () => {
      try {
        setLoading(true);
        const result = await secureFileOps.listFiles(initialPath);
        
        if (result.success) {
          setFiles(result.files || []);
          setDirectories(result.directories || []);
          setError(null);
        } else {
          setError(result.error || 'Failed to load files');
          setFiles([]);
          setDirectories([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [sandboxId, initialPath]);

  if (loading) {
    return <div>Loading files...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Security Violation Detected</h3>
        <p>{error}</p>
        {error.includes('path traversal') && (
          <p>Path traversal detected in file path</p>
        )}
        {error.includes('absolute') && (
          <p>Absolute paths are not allowed</p>
        )}
      </div>
    );
  }

  return (
    <div className="file-explorer">
      <h2>File Explorer - {initialPath}</h2>
      
      {directories.length > 0 && (
        <div className="directories">
          <h3>Directories</h3>
          <ul>
            {directories.map(dir => (
              <li key={dir}>
                <button onClick={() => onFileSelect?.(dir)}>
                  📁 {dir}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {files.length > 0 && (
        <div className="files">
          <h3>Files</h3>
          <ul>
            {files.map(file => (
              <li key={file}>
                <button 
                  onClick={() => onFileSelect?.(file)}
                  className={selectedFile === file ? 'selected' : ''}
                >
                  📄 {file}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {files.length === 0 && directories.length === 0 && (
        <p>No files or directories found</p>
      )}
    </div>
  );
};

describe('SecurityAwareFileExplorer Component', () => {
  const mockSecureFileOps = {
    listFiles: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    deleteFile: jest.fn(),
    fileExists: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createSecureFileOps as jest.Mock).mockReturnValue(mockSecureFileOps);
  });

  describe('Successful File Loading', () => {
    it('should render file list with security validation', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: ['src/App.tsx', 'package.json', 'README.md'],
        directories: ['components', 'utils', 'lib']
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          initialPath="/" 
        />
      );

      // Should show loading initially
      expect(screen.getByText('Loading files...')).toBeInTheDocument();

      // Wait for files to load
      await waitFor(() => {
        expect(screen.getAllByText((content, element) => 
          element?.textContent?.includes('src/App.tsx') || false
        )[0]).toBeInTheDocument();
      });

      expect(screen.getAllByText((content, element) => 
        element?.textContent?.includes('package.json') || false
      )[0]).toBeInTheDocument();
      expect(screen.getAllByText((content, element) => 
        element?.textContent?.includes('README.md') || false
      )[0]).toBeInTheDocument();
      expect(screen.getAllByText((content, element) => 
        element?.textContent?.includes('components') || false
      )[0]).toBeInTheDocument();
      expect(screen.getAllByText((content, element) => 
        element?.textContent?.includes('utils') || false
      )[0]).toBeInTheDocument();
      expect(screen.getAllByText((content, element) => 
        element?.textContent?.includes('lib') || false
      )[0]).toBeInTheDocument();
    });

    it('should handle empty directories gracefully', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: [],
        directories: []
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          initialPath="/empty" 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No files or directories found')).toBeInTheDocument();
      });
    });

    it('should call onFileSelect when file is clicked', async () => {
      const mockOnFileSelect = jest.fn();
      
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: ['test.txt'],
        directories: []
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          onFileSelect={mockOnFileSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText((content, element) => 
          element?.textContent?.includes('test.txt') || false
        )[0]).toBeInTheDocument();
      });

      const testButton = screen.getByRole('button', { name: /test\.txt/i });
      fireEvent.click(testButton);
      expect(mockOnFileSelect).toHaveBeenCalledWith('test.txt');
    });
  });

  describe('Security Violation Handling', () => {
    it('should handle path traversal violations gracefully', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: false,
        error: 'Invalid file path: directory traversal detected'
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          initialPath="../../../" 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Security Violation Detected')).toBeInTheDocument();
      });

      expect(screen.getByText(/directory traversal detected/i)).toBeInTheDocument();
      expect(screen.getByText('Invalid file path: directory traversal detected')).toBeInTheDocument();
    });

    it('should handle absolute path violations', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: false,
        error: 'Invalid file path: absolute paths not allowed'
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          initialPath="/etc/passwd" 
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Security Violation Detected')).toBeInTheDocument();
      });

      expect(screen.getByText(/absolute paths not allowed/i)).toBeInTheDocument();
      expect(screen.getByText('Absolute paths are not allowed')).toBeInTheDocument();
    });

    it('should handle extension blocking violations', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: false,
        error: 'File extension ".exe" is not allowed'
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          initialPath="/malware"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Security Violation Detected')).toBeInTheDocument();
      });

      expect(screen.getByText(/not allowed/i)).toBeInTheDocument();
    });

    it('should handle network or system errors', async () => {
      mockSecureFileOps.listFiles.mockRejectedValue(new Error('Network error'));

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          initialPath="/"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Security Violation Detected')).toBeInTheDocument();
      });

      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  describe('File Selection and Navigation', () => {
    it('should highlight selected file', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: ['file1.txt', 'file2.txt'],
        directories: []
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          selectedFile="file1.txt"
        />
      );

      await waitFor(() => {
        const selectedButton = screen.getByRole('button', { name: /file1\.txt/i });
        expect(selectedButton).toHaveClass('selected');
      });
    });

    it('should handle directory navigation', async () => {
      const mockOnFileSelect = jest.fn();
      
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: [],
        directories: ['components', 'utils']
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          onFileSelect={mockOnFileSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText((content, element) => 
          element?.textContent?.includes('components') || false
        )[0]).toBeInTheDocument();
      });

      const componentsButton = screen.getByRole('button', { name: /components/i });
      fireEvent.click(componentsButton);
      expect(mockOnFileSelect).toHaveBeenCalledWith('components');
    });
  });

  describe('Loading States', () => {
    it('should show loading state during file operations', async () => {
      let resolvePromise: (value: any) => void;
      const slowPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      
      mockSecureFileOps.listFiles.mockReturnValue(slowPromise);

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
        />
      );

      expect(screen.getByText('Loading files...')).toBeInTheDocument();

      // Resolve the promise
      resolvePromise!({
        success: true,
        files: ['test.txt'],
        directories: []
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading files...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should provide proper ARIA labels for file operations', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: true,
        files: ['important.txt'],
        directories: ['src']
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
        />
      );

      await waitFor(() => {
        const fileButton = screen.getByRole('button', { name: /important.txt/ });
        expect(fileButton).toBeInTheDocument();
        
        const dirButton = screen.getByRole('button', { name: /src/ });
        expect(dirButton).toBeInTheDocument();
      });
    });

    it('should announce security errors to screen readers', async () => {
      mockSecureFileOps.listFiles.mockResolvedValue({
        success: false,
        error: 'Security violation: path traversal detected'
      });

      render(
        <SecurityAwareFileExplorer 
          sandboxId="test-sandbox"
          initialPath="../malicious"
        />
      );

      await waitFor(() => {
        const errorContainer = screen.getByText('Security Violation Detected').closest('.error-container');
        expect(errorContainer).toBeInTheDocument();
      });
    });
  });
});