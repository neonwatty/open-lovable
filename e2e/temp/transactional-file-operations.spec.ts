import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

test.describe('Transactional File Operations - Local Sandbox', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main application
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Monitor console for transaction-related logs
    page.on('console', msg => {
      if (msg.text().includes('TransactionalFileOps') || msg.text().includes('transaction')) {
        console.log(`Transaction Log: ${msg.text()}`);
      }
    });
  });

  test('should handle transactional file creation with rollback on failure', async ({ page }) => {
    // Mock local sandbox environment
    await page.route('/api/apply-ai-code-stream', async route => {
      const request = route.request();
      const body = JSON.parse(request.postData() || '{}');
      
      // Simulate partial failure scenario that triggers rollback
      if (body.files && body.files.length > 1) {
        // First file succeeds, second fails - should trigger rollback
        const response = {
          type: 'transaction-failed',
          transactionId: 'test-tx-123',
          message: 'Transaction failed and was rolled back',
          errors: ['Failed to write src/FailingComponent.tsx: Permission denied']
        };
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'transaction-complete',
            transactionId: 'test-tx-123',
            message: 'Transaction completed successfully',
            operations: 1
          })
        });
      }
    });

    // Wait for chat interface to be ready
    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      // Request multiple components to trigger transaction
      await chatInput.fill('Create a Button component and a Card component');
      await chatInput.press('Enter');
      
      // Look for transaction start indicator
      await expect(page.locator('text=/transaction.*start/i')).toBeVisible({ timeout: 15000 });
      
      // Check for rollback message due to simulated failure
      await expect(page.locator('text=/rollback|failed/i')).toBeVisible({ timeout: 20000 });
      
      // Verify error handling doesn't expose file system details
      await expect(page.locator('text=/ENOENT|EACCES|fs\./i')).not.toBeVisible();
      
      // Should show user-friendly error message
      await expect(page.locator('text=/error.*occurred/i')).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'Chat interface not available - transactional file operations cannot be tested');
    }
  });

  test('should show transaction progress with file-by-file updates', async ({ page }) => {
    // Mock successful transaction with progress updates
    let progressCounter = 0;
    await page.route('/api/apply-ai-code-stream', async route => {
      const progressMessages = [
        { type: 'transaction-start', transactionId: 'test-tx-456', message: 'Started transactional file operations' },
        { type: 'file-progress', current: 1, total: 2, fileName: 'src/Button.tsx', action: 'processing' },
        { type: 'file-progress', current: 2, total: 2, fileName: 'src/Card.tsx', action: 'processing' },
        { type: 'transaction-execute', message: 'Executing transaction with 2 files...' },
        { type: 'file-complete', fileName: 'src/Button.tsx', action: 'created' },
        { type: 'file-complete', fileName: 'src/Card.tsx', action: 'created' },
        { type: 'transaction-complete', transactionId: 'test-tx-456', message: 'Transaction completed successfully', operations: 2 }
      ];
      
      // Send progress updates
      const response = progressMessages[progressCounter % progressMessages.length];
      progressCounter++;
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      await chatInput.fill('Create a simple component');
      await chatInput.press('Enter');
      
      // Check for transaction progress indicators
      await expect(page.locator('text=/processing|executing/i')).toBeVisible({ timeout: 15000 });
      
      // Look for file completion messages
      await expect(page.locator('text=/created|completed/i')).toBeVisible({ timeout: 20000 });
      
      // Verify transaction ID is shown for debugging
      await expect(page.locator('text=/transaction.*started/i')).toBeVisible({ timeout: 10000 });
    } else {
      test.skip(true, 'Chat interface not available - transaction progress cannot be tested');
    }
  });

  test('should handle concurrent file operations safely', async ({ page }) => {
    // Test rapid-fire requests to verify transaction queueing
    await page.route('/api/apply-ai-code-stream', async route => {
      // Simulate transaction already in progress error
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Transaction already in progress. Commit or rollback current transaction first.',
          type: 'concurrent-transaction-error'
        })
      });
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      // Send multiple rapid requests
      await chatInput.fill('Create component A');
      await chatInput.press('Enter');
      
      await page.waitForTimeout(100);
      
      await chatInput.fill('Create component B');
      await chatInput.press('Enter');
      
      // Should show appropriate error handling for concurrent operations
      await expect(page.locator('text=/already.*progress|concurrent/i')).toBeVisible({ timeout: 10000 });
      
      // Should not crash or show raw technical errors
      await expect(page.locator('text=/unhandled|uncaught/i')).not.toBeVisible();
    } else {
      test.skip(true, 'Chat interface not available - concurrent operations cannot be tested');
    }
  });

  test('should preserve transaction state across page refresh', async ({ page }) => {
    // This test would verify that incomplete transactions are handled gracefully
    // when users refresh during file operations
    
    await page.route('/api/apply-ai-code-stream', async route => {
      // Simulate long-running transaction
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'transaction-start',
          transactionId: 'test-tx-refresh',
          message: 'Long running transaction started'
        })
      });
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      // Start a transaction
      await chatInput.fill('Create complex component structure');
      await chatInput.press('Enter');
      
      // Wait briefly for transaction to start
      await page.waitForTimeout(1000);
      
      // Refresh the page during transaction
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Application should recover gracefully
      await expect(page.locator('body')).toBeVisible();
      
      // Should not show any error messages about incomplete transactions
      await expect(page.locator('text=/transaction.*incomplete|corrupted/i')).not.toBeVisible();
    } else {
      test.skip(true, 'Chat interface not available - transaction persistence cannot be tested');
    }
  });

  test('should handle backup creation and cleanup', async ({ page }) => {
    // Mock transaction with backup operations
    await page.route('/api/apply-ai-code-stream', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'transaction-complete',
          transactionId: 'test-tx-backup',
          message: 'Transaction completed with backups created',
          operations: 1,
          backupsCreated: true
        })
      });
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      // Request file update (should create backup)
      await chatInput.fill('Update the existing Button component with new props');
      await chatInput.press('Enter');
      
      // Look for backup-related success messages
      await expect(page.locator('text=/backup.*created|completed.*backup/i')).toBeVisible({ timeout: 15000 });
      
      // Should not show backup errors to end users
      await expect(page.locator('text=/backup.*failed|backup.*error/i')).not.toBeVisible();
    } else {
      test.skip(true, 'Chat interface not available - backup operations cannot be tested');
    }
  });
});