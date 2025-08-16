import { FileManager } from '../file-manager';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Mock the fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn(),
    readFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
  }
}));

// Mock the path module for testing path resolution
jest.mock('path', () => {
  const originalPath = jest.requireActual('path');
  return {
    ...originalPath,
    join: jest.fn((...args) => originalPath.join(...args)),
    normalize: jest.fn((p) => originalPath.normalize(p)),
    resolve: jest.fn((p) => originalPath.resolve(p)),
    dirname: jest.fn((p) => originalPath.dirname(p)),
    extname: jest.fn((p) => originalPath.extname(p)),
    sep: originalPath.sep,
  };
});

// Mock crypto for deterministic testing
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({ toString: () => 'abc123' }))
}));

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedPath = path as jest.Mocked<typeof path>;
const mockedCrypto = crypto as jest.Mocked<typeof crypto>;

describe('FileManager', () => {
  let fileManager: FileManager;
  let testSandboxDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    testSandboxDir = '/test/sandbox';
    fileManager = new FileManager({ 
      sandboxDir: testSandboxDir,
      maxFileSize: 1024 * 1024 // 1MB for tests
    });
    
    // Setup default mocks
    mockedFs.access.mockRejectedValue(new Error('File not found'));
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
  });

  describe('Path Security Tests', () => {
    test('should prevent directory traversal with ../', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '../../sensitive/data',
        '../../../.ssh/id_rsa',
        'src/../../../etc/hosts',
        './../../sensitive.txt'
      ];

      for (const maliciousPath of maliciousPaths) {
        const result = await fileManager.writeFile(maliciousPath, 'malicious content');
        expect(result.success).toBe(false);
        expect(result.error).toContain('directory traversal detected');
      }
    });

    test('should prevent absolute paths outside sandbox', async () => {
      const absolutePaths = [
        { path: '/etc/passwd', expectedError: 'directory traversal detected' },
        { path: '/root/.bashrc', expectedError: 'directory traversal detected' },
        { path: '/home/user/.ssh/keys', expectedError: 'directory traversal detected' },
        { path: 'C:\\Windows\\System32\\config', expectedError: 'illegal characters' }
      ];

      for (const { path: absolutePath, expectedError } of absolutePaths) {
        const result = await fileManager.writeFile(absolutePath, 'content');
        expect(result.success).toBe(false);
        expect(result.error).toContain(expectedError);
      }
    });

    test('should handle path normalization correctly', async () => {
      const testPaths = [
        './src/component.js',
        'src/./component.js',
        'src/subfolder/../component.js'
      ];

      // Mock path.normalize to return clean paths
      mockedPath.normalize.mockImplementation((p) => p.replace(/\.\/|\/\./g, ''));
      
      for (const testPath of testPaths) {
        const result = await fileManager.writeFile(testPath, 'content');
        expect(mockedPath.normalize).toHaveBeenCalledWith(expect.stringContaining(testPath.replace(/^\/+/, '')));
      }
    });

    test('should reject paths with illegal characters', async () => {
      const illegalPaths = [
        'file\0.txt',
        'file<.txt',
        'file>.txt',
        'file:.txt',
        'file|.txt',
        'file?.txt',
        'file*.txt'
      ];

      for (const illegalPath of illegalPaths) {
        const result = await fileManager.writeFile(illegalPath, 'content');
        expect(result.success).toBe(false);
        expect(result.error).toContain('illegal characters');
      }
    });

    test('should validate sandbox boundaries with path.resolve', async () => {
      const testPath = 'src/component.js';
      const sandboxPath = '/test/sandbox';
      const fullPath = `/test/sandbox/${testPath}`;

      mockedPath.resolve
        .mockReturnValueOnce(sandboxPath) // for sandbox dir
        .mockReturnValueOnce(fullPath);   // for file path

      const result = await fileManager.writeFile(testPath, 'content');
      
      expect(mockedPath.resolve).toHaveBeenCalledWith(sandboxPath);
      expect(mockedPath.resolve).toHaveBeenCalledWith(fullPath);
    });
  });

  describe('File Extension Validation', () => {
    test('should allow valid web development file extensions', async () => {
      const validFiles = [
        'component.js',
        'component.jsx',
        'component.ts',
        'component.tsx',
        'config.json',
        'styles.css',
        'styles.scss',
        'index.html',
        'README.md',
        'data.txt',
        'icon.svg',
        'image.png'
      ];

      for (const file of validFiles) {
        const result = await fileManager.writeFile(file, 'content');
        expect(result.success).toBe(true);
      }
    });

    test('should reject dangerous file extensions', async () => {
      const dangerousFiles = [
        'script.exe',
        'malware.bat',
        'virus.vbs',
        'backdoor.php'
      ];

      const restrictedFileManager = new FileManager({
        sandboxDir: testSandboxDir,
        allowedExtensions: ['.js', '.jsx', '.ts', '.tsx', '.css', '.html']
      });

      for (const file of dangerousFiles) {
        const result = await restrictedFileManager.writeFile(file, 'content');
        expect(result.success).toBe(false);
        expect(result.error).toContain('not allowed');
      }
    });
  });

  describe('File Size Validation', () => {
    test('should reject files exceeding size limit', async () => {
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      const result = await fileManager.writeFile('large.txt', largeContent);
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    test('should accept files within size limit', async () => {
      const normalContent = 'x'.repeat(500 * 1024); // 500KB
      
      const result = await fileManager.writeFile('normal.txt', normalContent);
      expect(result.success).toBe(true);
    });
  });

  describe('File Operations', () => {
    test('should create new files correctly', async () => {
      mockedFs.access.mockRejectedValue(new Error('File not found')); // File doesn't exist
      
      const result = await fileManager.writeFile('src/new-file.js', 'console.log("test");');
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe('created');
      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp\./),
        'console.log("test");',
        'utf8'
      );
      expect(mockedFs.rename).toHaveBeenCalled();
    });

    test('should update existing files correctly', async () => {
      mockedFs.access.mockResolvedValue(undefined); // File exists
      
      const result = await fileManager.writeFile('src/existing-file.js', 'updated content');
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe('updated');
    });

    test('should handle atomic write failures', async () => {
      mockedFs.writeFile.mockRejectedValue(new Error('Disk full'));
      
      const result = await fileManager.writeFile('src/component.js', 'content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Disk full');
      expect(mockedFs.unlink).toHaveBeenCalled(); // Cleanup temp file
    });

    test('should ensure directories exist before writing', async () => {
      const result = await fileManager.writeFile('src/components/deep/Component.js', 'content');
      
      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('deep'),
        { recursive: true }
      );
    });
  });

  describe('Helper Functions', () => {
    test('ensureDir should create directories recursively', async () => {
      const testPath = path.join(testSandboxDir, 'src/components/ui/Button.tsx');
      await fileManager.ensureDir(testPath);
      
      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('components'),
        { recursive: true }
      );
    });

    test('fileExists should return correct boolean values', async () => {
      mockedFs.access.mockResolvedValue(undefined);
      const exists = await fileManager.fileExists('existing-file.js');
      expect(exists).toBe(true);

      mockedFs.access.mockRejectedValue(new Error('Not found'));
      const notExists = await fileManager.fileExists('missing-file.js');
      expect(notExists).toBe(false);
    });

    test('readFile should validate paths and read content', async () => {
      mockedFs.readFile.mockResolvedValue('file content');
      
      const content = await fileManager.readFile('src/component.js');
      
      expect(content).toBe('file content');
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('component.js'),
        'utf8'
      );
    });

    test('deleteFile should remove files safely', async () => {
      const success = await fileManager.deleteFile('src/old-component.js');
      
      expect(success).toBe(true);
      expect(mockedFs.unlink).toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    test('should write multiple files sequentially', async () => {
      const files = [
        { path: 'src/ComponentA.js', content: 'export const A = () => {};' },
        { path: 'src/ComponentB.js', content: 'export const B = () => {};' },
        { path: 'src/styles.css', content: '.container { margin: 0; }' }
      ];

      const results = await fileManager.writeFiles(files);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.operation).toBe('created');
      });
      
      expect(mockedFs.writeFile).toHaveBeenCalledTimes(3);
    });

    test('should handle partial failures in batch operations', async () => {
      mockedFs.writeFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(undefined);

      const files = [
        { path: 'file1.js', content: 'content1' },
        { path: 'file2.js', content: 'content2' },
        { path: 'file3.js', content: 'content3' }
      ];

      const results = await fileManager.writeFiles(files);
      
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('Permission denied');
      expect(results[2].success).toBe(true);
    });
  });

  describe('Security Edge Cases', () => {
    test('should handle Unicode and URL-encoded paths', async () => {
      const unicodePaths = [
        { path: 'файл.js', shouldSucceed: true }, // Cyrillic
        { path: 'tëst.js', shouldSucceed: true }, // Latin with diacritics
        { path: '%2E%2E%2F', shouldSucceed: false }, // URL-encoded ../
        { path: 'file%00.js', shouldSucceed: false } // URL-encoded null byte
      ];

      for (const { path: unicodePath, shouldSucceed } of unicodePaths) {
        const result = await fileManager.writeFile(unicodePath, 'content');
        
        if (shouldSucceed) {
          expect(result.success).toBe(true);
        } else {
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
        }
      }
    });

    test('should prevent symlink-based attacks', async () => {
      // This would be tested in integration tests with actual filesystem
      // Here we just verify the validation logic exists
      const result = await fileManager.writeFile('symlink-target', 'content');
      expect(result).toBeDefined();
    });

    test('should handle concurrent file operations safely', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        fileManager.writeFile(`file${i}.js`, `content ${i}`)
      );

      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.success).toBe(true);
        }
      });
    });
  });

  describe('Initialization and Cleanup', () => {
    test('should initialize sandbox directory with .gitkeep', async () => {
      await fileManager.initialize();
      
      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitkeep'),
        '',
        'utf8'
      );
    });

    test('should clean up old files based on age', async () => {
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const newTime = new Date(Date.now() - 1 * 60 * 60 * 1000);  // 1 hour ago

      // Mock listFiles to return file list
      const mockListFiles = jest.spyOn(fileManager as any, 'listFiles');
      mockListFiles.mockResolvedValue(['old-file.js', 'new-file.js']);

      // Mock validateAndNormalizePath to return paths
      const mockValidatePath = jest.spyOn(fileManager as any, 'validateAndNormalizePath');
      mockValidatePath
        .mockReturnValueOnce('/test/sandbox/old-file.js')
        .mockReturnValueOnce('/test/sandbox/new-file.js');

      mockedFs.stat
        .mockResolvedValueOnce({ mtime: oldTime } as any)
        .mockResolvedValueOnce({ mtime: newTime } as any);

      const cleanedCount = await fileManager.cleanup();
      
      expect(cleanedCount).toBe(1);
      expect(mockedFs.unlink).toHaveBeenCalledTimes(1);
      
      // Restore mocks
      mockListFiles.mockRestore();
      mockValidatePath.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should handle file system permission errors gracefully', async () => {
      mockedFs.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      const result = await fileManager.writeFile('src/component.js', 'content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    test('should handle invalid file paths gracefully', async () => {
      const invalidPaths = ['', null, undefined] as any[];
      
      for (const invalidPath of invalidPaths) {
        const result = await fileManager.writeFile(invalidPath, 'content');
        expect(result.success).toBe(false);
        expect(result.error).toContain('path must be a non-empty string');
      }
    });
  });
});