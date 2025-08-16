import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FileManager, WriteResult } from './file-manager';

export interface FileOperationSnapshot {
  path: string;
  existed: boolean;
  originalContent?: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
}

export interface TransactionResult {
  success: boolean;
  operations: FileOperationSnapshot[];
  errors: string[];
  rollbackData?: FileOperationSnapshot[];
}

export interface FileTransactionConfig {
  sandboxDir?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  createBackups?: boolean;
  backupDir?: string;
}

export class TransactionalFileOperations {
  private fileManager: FileManager;
  private config: Required<FileTransactionConfig>;
  private activeTransaction: FileOperationSnapshot[] | null = null;
  private transactionId: string | null = null;

  constructor(config: FileTransactionConfig = {}) {
    this.config = {
      sandboxDir: config.sandboxDir || path.join(process.cwd(), 'sandbox'),
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 100,
      createBackups: config.createBackups ?? true,
      backupDir: config.backupDir || path.join(process.cwd(), '.backups')
    };

    this.fileManager = new FileManager({
      sandboxDir: this.config.sandboxDir,
      maxFileSize: 50 * 1024 * 1024 // 50MB for generated files
    });
  }

  /**
   * Start a new file transaction
   */
  async beginTransaction(): Promise<string> {
    if (this.activeTransaction) {
      throw new Error('Transaction already in progress. Commit or rollback current transaction first.');
    }

    this.transactionId = crypto.randomBytes(16).toString('hex');
    this.activeTransaction = [];
    
    // Ensure backup directory exists if backups are enabled
    if (this.config.createBackups) {
      await this.ensureBackupDir();
    }

    console.log(`[TransactionalFileOps] Started transaction: ${this.transactionId}`);
    return this.transactionId;
  }

  /**
   * Add a file operation to the current transaction
   */
  async addFileOperation(
    filePath: string, 
    content: string, 
    operation: 'create' | 'update' = 'create'
  ): Promise<void> {
    if (!this.activeTransaction || !this.transactionId) {
      throw new Error('No active transaction. Call beginTransaction() first.');
    }

    const snapshot: FileOperationSnapshot = {
      path: filePath,
      existed: await this.fileManager.fileExists(filePath),
      operation,
      timestamp: Date.now()
    };

    // If file exists, backup the original content
    if (snapshot.existed) {
      try {
        snapshot.originalContent = await this.fileManager.readFile(filePath);
        snapshot.operation = 'update';
      } catch (error) {
        throw new Error(`Failed to read existing file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Create backup if configured
    if (this.config.createBackups && snapshot.existed && snapshot.originalContent) {
      await this.createBackup(filePath, snapshot.originalContent);
    }

    this.activeTransaction.push(snapshot);
    console.log(`[TransactionalFileOps] Added operation: ${operation} ${filePath}`);
  }

  /**
   * Execute all operations in the transaction with retry logic
   */
  async executeTransaction(files: Array<{ path: string; content: string }>): Promise<TransactionResult> {
    if (!this.activeTransaction || !this.transactionId) {
      throw new Error('No active transaction. Call beginTransaction() first.');
    }

    const result: TransactionResult = {
      success: false,
      operations: [],
      errors: [],
      rollbackData: [...this.activeTransaction]
    };

    console.log(`[TransactionalFileOps] Executing transaction ${this.transactionId} with ${files.length} files`);

    try {
      // First, add all file operations to the transaction if not already added
      for (const file of files) {
        const existingOp = this.activeTransaction.find(op => op.path === file.path);
        if (!existingOp) {
          await this.addFileOperation(file.path, file.content);
        }
      }

      // Execute all file writes with retry logic
      const writeResults: WriteResult[] = [];
      
      for (const file of files) {
        try {
          const writeResult = await this.executeWithRetry(async () => {
            const result = await this.fileManager.writeFile(file.path, file.content);
            if (!result.success) {
              throw new Error(result.error || 'File write failed');
            }
            return result;
          });

          writeResults.push(writeResult);

          if (!writeResult.success) {
            result.errors.push(`Failed to write ${file.path}: ${writeResult.error}`);
          }
        } catch (error) {
          // If retry exhausted, treat as failed operation
          const failedResult: WriteResult = {
            success: false,
            path: file.path,
            operation: 'created',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          
          writeResults.push(failedResult);
          result.errors.push(`Failed to write ${file.path}: ${failedResult.error}`);
        }
      }

      // Check if all operations succeeded
      const failedOperations = writeResults.filter(r => !r.success);
      
      if (failedOperations.length === 0) {
        result.success = true;
        result.operations = [...this.activeTransaction];
        console.log(`[TransactionalFileOps] Transaction ${this.transactionId} completed successfully`);
      } else {
        result.success = false;
        result.errors.push(`${failedOperations.length} file operations failed`);
        
        // Attempt rollback
        console.log(`[TransactionalFileOps] Transaction ${this.transactionId} failed, attempting rollback...`);
        const rollbackResult = await this.rollbackTransaction();
        
        if (!rollbackResult.success) {
          result.errors.push('Rollback also failed');
          result.errors.push(...rollbackResult.errors);
        } else {
          console.log(`[TransactionalFileOps] Rollback completed successfully`);
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Transaction execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Attempt rollback on unexpected errors
      try {
        const rollbackResult = await this.rollbackTransaction();
        if (!rollbackResult.success) {
          result.errors.push('Rollback also failed');
          result.errors.push(...rollbackResult.errors);
        }
      } catch (rollbackError) {
        result.errors.push(`Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Commit the transaction and clear state
   */
  async commitTransaction(): Promise<void> {
    if (!this.activeTransaction || !this.transactionId) {
      throw new Error('No active transaction to commit.');
    }

    console.log(`[TransactionalFileOps] Committing transaction: ${this.transactionId}`);
    this.activeTransaction = null;
    this.transactionId = null;
  }

  /**
   * Rollback the current transaction
   */
  async rollbackTransaction(): Promise<TransactionResult> {
    if (!this.activeTransaction || !this.transactionId) {
      throw new Error('No active transaction to rollback.');
    }

    const result: TransactionResult = {
      success: true,
      operations: [],
      errors: []
    };

    console.log(`[TransactionalFileOps] Rolling back transaction: ${this.transactionId}`);

    // Process operations in reverse order
    const reversedOperations = [...this.activeTransaction].reverse();

    for (const snapshot of reversedOperations) {
      try {
        if (snapshot.operation === 'create' && !snapshot.existed) {
          // File was created, so delete it
          const deleted = await this.fileManager.deleteFile(snapshot.path);
          if (deleted) {
            result.operations.push({
              ...snapshot,
              operation: 'delete',
              timestamp: Date.now()
            });
          } else {
            result.errors.push(`Failed to delete created file: ${snapshot.path}`);
            result.success = false;
          }
        } else if (snapshot.operation === 'update' && snapshot.existed && snapshot.originalContent !== undefined) {
          // File was updated, restore original content
          const writeResult = await this.fileManager.writeFile(snapshot.path, snapshot.originalContent);
          if (writeResult.success) {
            result.operations.push({
              ...snapshot,
              operation: 'update',
              timestamp: Date.now()
            });
          } else {
            result.errors.push(`Failed to restore original content for: ${snapshot.path}`);
            result.success = false;
          }
        }
      } catch (error) {
        result.errors.push(`Rollback operation failed for ${snapshot.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        result.success = false;
      }
    }

    // Clear transaction state
    this.activeTransaction = null;
    this.transactionId = null;

    return result;
  }

  /**
   * Execute an operation with retry logic
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.maxRetries) {
          console.log(`[TransactionalFileOps] Attempt ${attempt} failed, retrying in ${this.config.retryDelayMs * attempt}ms...`);
          await this.delay(this.config.retryDelayMs * attempt); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Create a backup of a file
   */
  private async createBackup(filePath: string, content: string): Promise<void> {
    if (!this.transactionId) return;

    const backupFileName = `${path.basename(filePath)}.${this.transactionId}.backup`;
    const backupPath = path.join(this.config.backupDir, backupFileName);

    try {
      await fs.writeFile(backupPath, content, 'utf8');
      console.log(`[TransactionalFileOps] Created backup: ${backupPath}`);
    } catch (error) {
      console.warn(`[TransactionalFileOps] Failed to create backup for ${filePath}:`, error);
      // Don't fail the transaction for backup failures
    }
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDir(): Promise<void> {
    try {
      await fs.access(this.config.backupDir);
    } catch {
      await fs.mkdir(this.config.backupDir, { recursive: true });
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the current transaction ID
   */
  getCurrentTransactionId(): string | null {
    return this.transactionId;
  }

  /**
   * Check if a transaction is active
   */
  isTransactionActive(): boolean {
    return this.activeTransaction !== null && this.transactionId !== null;
  }

  /**
   * Get current transaction operations
   */
  getCurrentOperations(): FileOperationSnapshot[] {
    return this.activeTransaction ? [...this.activeTransaction] : [];
  }

  /**
   * Clean up old backup files
   */
  async cleanupBackups(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    let cleanedCount = 0;
    const cutoffTime = Date.now() - olderThanMs;

    try {
      const backupFiles = await fs.readdir(this.config.backupDir);
      
      for (const fileName of backupFiles) {
        if (fileName.endsWith('.backup')) {
          const filePath = path.join(this.config.backupDir, fileName);
          try {
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(filePath);
              cleanedCount++;
            }
          } catch {
            // Ignore individual file errors
          }
        }
      }
    } catch {
      // Ignore directory access errors
    }

    return cleanedCount;
  }
}

// Global error handling for uncaught file operation errors
export class FileOperationError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly filePath: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'FileOperationError';
  }
}

// Export a default instance for convenience
export const defaultTransactionalFileOps = new TransactionalFileOperations();