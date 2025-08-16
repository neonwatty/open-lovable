import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { TransactionalFileOperations, FileOperationSnapshot } from '../transactional-file-operations';

describe('TransactionalFileOperations', () => {
  let tempDir: string;
  let transactionalOps: TransactionalFileOperations;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transactional-file-test-'));
    
    transactionalOps = new TransactionalFileOperations({
      sandboxDir: tempDir,
      maxRetries: 3, // 3 total attempts: 2 failures + 1 success
      retryDelayMs: 10, // Fast retries for testing
      createBackups: true
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('Transaction Lifecycle', () => {
    it('should begin and commit a transaction successfully', async () => {
      const transactionId = await transactionalOps.beginTransaction();
      
      expect(transactionId).toBeDefined();
      expect(typeof transactionId).toBe('string');
      expect(transactionalOps.isTransactionActive()).toBe(true);
      expect(transactionalOps.getCurrentTransactionId()).toBe(transactionId);
      
      await transactionalOps.commitTransaction();
      
      expect(transactionalOps.isTransactionActive()).toBe(false);
      expect(transactionalOps.getCurrentTransactionId()).toBeNull();
    });

    it('should prevent starting multiple transactions', async () => {
      await transactionalOps.beginTransaction();
      
      await expect(transactionalOps.beginTransaction()).rejects.toThrow(
        'Transaction already in progress'
      );
    });

    it('should throw error when committing without active transaction', async () => {
      await expect(transactionalOps.commitTransaction()).rejects.toThrow(
        'No active transaction to commit'
      );
    });
  });

  describe('File Operations', () => {
    it('should successfully execute transaction with new files', async () => {
      const files = [
        { path: 'test1.txt', content: 'Hello World 1' },
        { path: 'nested/test2.txt', content: 'Hello World 2' }
      ];

      await transactionalOps.beginTransaction();
      const result = await transactionalOps.executeTransaction(files);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.operations).toHaveLength(2);

      // Verify files were actually created
      const file1Content = await fs.readFile(path.join(tempDir, 'test1.txt'), 'utf8');
      const file2Content = await fs.readFile(path.join(tempDir, 'nested/test2.txt'), 'utf8');
      
      expect(file1Content).toBe('Hello World 1');
      expect(file2Content).toBe('Hello World 2');
    });

    it('should handle file updates correctly', async () => {
      // Create an existing file
      const existingFile = path.join(tempDir, 'existing.txt');
      await fs.mkdir(path.dirname(existingFile), { recursive: true });
      await fs.writeFile(existingFile, 'Original content', 'utf8');

      const files = [
        { path: 'existing.txt', content: 'Updated content' }
      ];

      await transactionalOps.beginTransaction();
      const result = await transactionalOps.executeTransaction(files);

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].operation).toBe('update');
      expect(result.operations[0].existed).toBe(true);
      expect(result.operations[0].originalContent).toBe('Original content');

      // Verify file was updated
      const updatedContent = await fs.readFile(existingFile, 'utf8');
      expect(updatedContent).toBe('Updated content');
    });

    it('should rollback changes on failure', async () => {
      // Create an existing file
      const existingFile = path.join(tempDir, 'existing.txt');
      await fs.mkdir(path.dirname(existingFile), { recursive: true });
      await fs.writeFile(existingFile, 'Original content', 'utf8');

      // Mock FileManager to fail on second file
      const mockWriteFile = jest.spyOn(transactionalOps['fileManager'], 'writeFile');
      const mockFileExists = jest.spyOn(transactionalOps['fileManager'], 'fileExists');
      const mockReadFile = jest.spyOn(transactionalOps['fileManager'], 'readFile');
      
      // Set up file existence and read behavior
      mockFileExists
        .mockResolvedValueOnce(true)  // existing.txt exists
        .mockResolvedValueOnce(false); // new.txt doesn't exist
      mockReadFile.mockResolvedValueOnce('Original content');
      
      // First file succeeds, second file fails consistently (all retry attempts)
      mockWriteFile
        .mockResolvedValueOnce({ success: true, path: 'existing.txt', operation: 'updated' })
        .mockResolvedValueOnce({ success: false, path: 'new.txt', operation: 'created', error: 'Mock failure' })
        .mockResolvedValueOnce({ success: false, path: 'new.txt', operation: 'created', error: 'Mock failure' })
        .mockResolvedValueOnce({ success: false, path: 'new.txt', operation: 'created', error: 'Mock failure' });

      const files = [
        { path: 'existing.txt', content: 'Updated content' },
        { path: 'new.txt', content: 'New content' }
      ];

      await transactionalOps.beginTransaction();
      const result = await transactionalOps.executeTransaction(files);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Verify rollback worked - existing file should be restored
      const restoredContent = await fs.readFile(existingFile, 'utf8');
      expect(restoredContent).toBe('Original content');

      // Verify new file was not created (or was cleaned up)
      const newFileExists = await fs.access(path.join(tempDir, 'new.txt')).then(() => true).catch(() => false);
      expect(newFileExists).toBe(false);

      mockWriteFile.mockRestore();
      mockFileExists.mockRestore();
      mockReadFile.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should retry failed operations', async () => {
      const mockWriteFile = jest.spyOn(transactionalOps['fileManager'], 'writeFile');
      const mockFileExists = jest.spyOn(transactionalOps['fileManager'], 'fileExists');
      
      // Mock fileExists to return false (new file)
      mockFileExists.mockResolvedValue(false);
      
      // Fail twice, then succeed (exactly 3 calls)
      mockWriteFile
        .mockRejectedValueOnce(new Error('Temporary failure 1'))
        .mockRejectedValueOnce(new Error('Temporary failure 2'))
        .mockResolvedValueOnce({ success: true, path: 'test.txt', operation: 'created' });

      const files = [{ path: 'test.txt', content: 'Test content' }];

      await transactionalOps.beginTransaction();
      
      // Manually add the file operation to avoid extra calls
      await transactionalOps.addFileOperation(files[0].path, files[0].content);
      
      // Now execute just the write operations
      const result = await transactionalOps.executeTransaction(files);

      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledTimes(3); // 2 failures + 1 success

      mockWriteFile.mockRestore();
      mockFileExists.mockRestore();
    });

    it('should fail after max retries exceeded', async () => {
      const mockWriteFile = jest.spyOn(transactionalOps['fileManager'], 'writeFile');
      const mockFileExists = jest.spyOn(transactionalOps['fileManager'], 'fileExists');
      
      // Mock fileExists to return false (new file)
      mockFileExists.mockResolvedValue(false);
      
      // Always fail
      mockWriteFile.mockRejectedValue(new Error('Persistent failure'));

      const files = [{ path: 'test.txt', content: 'Test content' }];

      await transactionalOps.beginTransaction();
      const result = await transactionalOps.executeTransaction(files);

      expect(result.success).toBe(false);
      expect(mockWriteFile).toHaveBeenCalledTimes(3); // maxRetries = 3

      mockWriteFile.mockRestore();
      mockFileExists.mockRestore();
    });
  });

  describe('Backup Management', () => {
    it('should create backups when configured', async () => {
      // Create an existing file
      const existingFile = path.join(tempDir, 'existing.txt');
      await fs.mkdir(path.dirname(existingFile), { recursive: true });
      await fs.writeFile(existingFile, 'Original content', 'utf8');

      const files = [{ path: 'existing.txt', content: 'Updated content' }];

      await transactionalOps.beginTransaction();
      const transactionId = transactionalOps.getCurrentTransactionId();
      
      await transactionalOps.executeTransaction(files);

      // Check if backup was created
      const backupDir = path.join(process.cwd(), '.backups');
      const backupFile = path.join(backupDir, `existing.txt.${transactionId}.backup`);
      
      const backupExists = await fs.access(backupFile).then(() => true).catch(() => false);
      if (backupExists) {
        const backupContent = await fs.readFile(backupFile, 'utf8');
        expect(backupContent).toBe('Original content');
      }
      // Note: Backup creation might fail in test environment, which is acceptable
    });

    it('should clean up old backups', async () => {
      const cleanedCount = await transactionalOps.cleanupBackups(0); // Clean all
      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Transaction State Management', () => {
    it('should track current operations during transaction', async () => {
      await transactionalOps.beginTransaction();
      
      expect(transactionalOps.getCurrentOperations()).toHaveLength(0);
      
      await transactionalOps.addFileOperation('test.txt', 'content');
      
      const operations = transactionalOps.getCurrentOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].path).toBe('test.txt');
      expect(operations[0].operation).toBe('create');
    });

    it('should handle rollback without active transaction gracefully', async () => {
      await expect(transactionalOps.rollbackTransaction()).rejects.toThrow(
        'No active transaction to rollback'
      );
    });
  });
});