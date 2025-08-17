import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { validateSafePath } from '../../lib/security/path-security';

// Mock the security validation
jest.mock('../../lib/security/path-security', () => ({
  validateSafePath: jest.fn()
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Test component that implements secure file upload
const FileUploadSecure = ({ 
  onUpload, 
  sandboxId = 'test-sandbox',
  maxFileSize = 1024 * 1024,
  allowedExtensions = ['.txt', '.js', '.tsx', '.json', '.md']
}: {
  onUpload: (result: any) => void;
  sandboxId?: string;
  maxFileSize?: number;
  allowedExtensions?: string[];
}) => {
  const [filePath, setFilePath] = React.useState('');
  const [content, setContent] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [blockInfo, setBlockInfo] = React.useState<{ blockedUntil?: string } | null>(null);

  const validatePath = (path: string): string | null => {
    // Client-side validation
    if (!path.trim()) {
      return 'File path is required';
    }

    if (path.includes('..')) {
      return 'Invalid file path: directory traversal detected';
    }

    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      return 'Invalid file path: absolute paths not allowed';
    }

    const extension = path.substring(path.lastIndexOf('.')).toLowerCase();
    if (extension && !allowedExtensions.includes(extension)) {
      return `File extension "${extension}" is not allowed`;
    }

    return null;
  };

  const validateContentSize = (content: string): string | null => {
    const size = new Blob([content]).size;
    if (size > maxFileSize) {
      return `File size ${size} bytes exceeds maximum allowed size of ${maxFileSize} bytes`;
    }
    return null;
  };

  const handleUpload = async () => {
    setError(null);
    setBlockInfo(null);

    // Client-side validation
    const pathError = validatePath(filePath);
    if (pathError) {
      setError(pathError);
      return;
    }

    const sizeError = validateContentSize(content);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    setIsUploading(true);

    try {
      const response = await fetch('/api/upload-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sandboxId,
          filePath,
          content
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setError(`Security violation detected: ${data.message || 'Path validation failed'}`);
        } else if (response.status === 429) {
          setError(data.error || 'Access denied due to security violations');
          if (data.blockedUntil) {
            setBlockInfo({ blockedUntil: data.blockedUntil });
          }
        } else {
          setError(data.error || 'Upload failed');
        }
        return;
      }

      onUpload(data);
      setFilePath('');
      setContent('');
    } catch (err) {
      setError('Network error: Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="file-upload-secure">
      <h3>Secure File Upload</h3>
      
      <div className="form-group">
        <label htmlFor="file-path">File Path:</label>
        <input
          id="file-path"
          type="text"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="e.g., components/Button.tsx"
          disabled={isUploading}
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="file-content">Content:</label>
        <textarea
          id="file-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter file content..."
          rows={10}
          disabled={isUploading}
        />
      </div>
      
      {error && (
        <div className="error-message" role="alert">
          {error}
          {blockInfo?.blockedUntil && (
            <p className="block-info">
              Access blocked until: {new Date(blockInfo.blockedUntil).toLocaleString()}
            </p>
          )}
        </div>
      )}
      
      <div className="form-actions">
        <button
          onClick={handleUpload}
          disabled={isUploading || !filePath.trim() || !content.trim()}
          type="button"
        >
          {isUploading ? 'Uploading...' : 'Upload File'}
        </button>
      </div>
      
      <div className="security-info">
        <h4>Security Guidelines:</h4>
        <ul>
          <li>Only relative paths are allowed</li>
          <li>Path traversal attempts (..) are blocked</li>
          <li>Allowed extensions: {allowedExtensions.join(', ')}</li>
          <li>Maximum file size: {Math.round(maxFileSize / 1024)} KB</li>
        </ul>
      </div>
    </div>
  );
};

describe('FileUploadSecure Client Component', () => {
  const mockOnUpload = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    (validateSafePath as jest.Mock).mockResolvedValue('/resolved/path');
  });

  describe('Form Validation', () => {
    it('should validate file paths on client side before upload', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      const pathInput = screen.getByLabelText(/file path/i);
      const contentInput = screen.getByLabelText(/content/i);
      const uploadButton = screen.getByRole('button', { name: /upload/i });

      await user.type(pathInput, '../../../malicious.txt');
      await user.type(contentInput, 'malicious content');
      await user.click(uploadButton);

      expect(screen.getByText(/invalid file path.*directory traversal/i)).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject absolute paths', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      const pathInput = screen.getByLabelText(/file path/i);
      const uploadButton = screen.getByRole('button', { name: /upload/i });

      await user.type(pathInput, '/etc/passwd');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(uploadButton);

      expect(screen.getByText(/invalid file path.*absolute paths/i)).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject Windows absolute paths', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      const pathInput = screen.getByLabelText(/file path/i);
      const uploadButton = screen.getByRole('button', { name: /upload/i });

      await user.type(pathInput, 'C:\\Windows\\System32\\file.txt');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(uploadButton);

      expect(screen.getByText(/invalid file path.*absolute paths/i)).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should validate file extensions', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      const pathInput = screen.getByLabelText(/file path/i);
      const uploadButton = screen.getByRole('button', { name: /upload/i });

      await user.type(pathInput, 'malware.exe');
      await user.type(screen.getByLabelText(/content/i), 'malicious executable');
      await user.click(uploadButton);

      expect(screen.getByText(/file extension.*not allowed/i)).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should validate file size', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} maxFileSize={100} />);

      const pathInput = screen.getByLabelText(/file path/i);
      const contentInput = screen.getByLabelText(/content/i);
      const uploadButton = screen.getByRole('button', { name: /upload/i });

      await user.type(pathInput, 'large.txt');
      await user.type(contentInput, 'x'.repeat(200)); // Exceeds 100 byte limit
      await user.click(uploadButton);

      expect(screen.getByText(/file size.*exceeds maximum/i)).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should require both path and content', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      const uploadButton = screen.getByRole('button', { name: /upload/i });
      
      // Button should be disabled when fields are empty
      expect(uploadButton).toBeDisabled();

      // Add path only
      await user.type(screen.getByLabelText(/file path/i), 'test.txt');
      expect(uploadButton).toBeDisabled();

      // Add content
      await user.type(screen.getByLabelText(/content/i), 'test content');
      expect(uploadButton).not.toBeDisabled();
    });
  });

  describe('Server Response Handling', () => {
    it('should handle successful uploads', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          path: 'test.txt',
          operation: 'created'
        })
      });

      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), 'test.txt');
      await user.type(screen.getByLabelText(/content/i), 'test content');
      await user.click(screen.getByRole('button', { name: /upload/i }));

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith({
          success: true,
          path: 'test.txt',
          operation: 'created'
        });
      });

      // Form should be cleared after successful upload
      expect(screen.getByLabelText(/file path/i)).toHaveValue('');
      expect(screen.getByLabelText(/content/i)).toHaveValue('');
    });

    it('should show security error messages from server', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'Security violation detected',
          type: 'path_traversal',
          message: 'Directory traversal attempt blocked'
        })
      });

      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), 'valid.txt');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(screen.getByRole('button', { name: /upload/i }));

      await waitFor(() => {
        expect(screen.getByText(/security violation detected/i)).toBeInTheDocument();
      });

      expect(mockOnUpload).not.toHaveBeenCalled();
    });

    it('should handle rate limiting responses', async () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Access denied due to security violations',
          blockedUntil: futureTime,
          violationCount: 5
        })
      });

      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), 'test.txt');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(screen.getByRole('button', { name: /upload/i }));

      await waitFor(() => {
        expect(screen.getByText(/access denied/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/access blocked until/i)).toBeInTheDocument();
      expect(mockOnUpload).not.toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), 'test.txt');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(screen.getByRole('button', { name: /upload/i }));

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      expect(mockOnUpload).not.toHaveBeenCalled();
    });

    it('should handle general server errors', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Internal server error'
        })
      });

      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), 'test.txt');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(screen.getByRole('button', { name: /upload/i }));

      await waitFor(() => {
        expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading state during upload', async () => {
      let resolvePromise: (value: any) => void;
      const slowPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      
      (fetch as jest.Mock).mockReturnValue(slowPromise);

      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), 'test.txt');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(screen.getByRole('button', { name: /upload/i }));

      expect(screen.getByText('Uploading...')).toBeInTheDocument();
      expect(screen.getByLabelText(/file path/i)).toBeDisabled();
      expect(screen.getByLabelText(/content/i)).toBeDisabled();

      // Resolve the promise
      resolvePromise!({
        ok: true,
        json: async () => ({ success: true })
      });

      await waitFor(() => {
        expect(screen.queryByText('Uploading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Security Information Display', () => {
    it('should display security guidelines', () => {
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      expect(screen.getByText('Security Guidelines:')).toBeInTheDocument();
      expect(screen.getByText(/only relative paths are allowed/i)).toBeInTheDocument();
      expect(screen.getByText(/path traversal attempts.*blocked/i)).toBeInTheDocument();
      expect(screen.getByText(/allowed extensions/i)).toBeInTheDocument();
      expect(screen.getByText(/maximum file size/i)).toBeInTheDocument();
    });

    it('should show custom file size limits', () => {
      render(
        <FileUploadSecure 
          onUpload={mockOnUpload} 
          maxFileSize={512 * 1024} // 512 KB
        />
      );

      expect(screen.getByText(/maximum file size: 512 kb/i)).toBeInTheDocument();
    });

    it('should show custom allowed extensions', () => {
      render(
        <FileUploadSecure 
          onUpload={mockOnUpload} 
          allowedExtensions={['.py', '.java', '.cpp']}
        />
      );

      expect(screen.getByText(/allowed extensions: \.py, \.java, \.cpp/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels and ARIA attributes', () => {
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      expect(screen.getByLabelText(/file path/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      expect(uploadButton).toBeInTheDocument();
    });

    it('should announce errors to screen readers', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), '../malicious.txt');
      await user.type(screen.getByLabelText(/content/i), 'content');
      await user.click(screen.getByRole('button', { name: /upload/i }));

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent(/directory traversal detected/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file path validation', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      const pathInput = screen.getByLabelText(/file path/i);
      const uploadButton = screen.getByRole('button', { name: /upload/i });

      await user.type(pathInput, '   '); // Only whitespace
      await user.clear(pathInput);
      await user.type(screen.getByLabelText(/content/i), 'content');

      expect(uploadButton).toBeDisabled();
    });

    it('should handle files without extensions', async () => {
      const user = userEvent.setup();
      render(<FileUploadSecure onUpload={mockOnUpload} />);

      await user.type(screen.getByLabelText(/file path/i), 'README');
      await user.type(screen.getByLabelText(/content/i), 'readme content');

      // Should not show extension error for files without extensions
      expect(screen.queryByText(/extension.*not allowed/i)).not.toBeInTheDocument();
    });
  });
});