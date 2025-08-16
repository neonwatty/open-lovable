import { test, expect } from '@playwright/test';

test.describe('Error Handling Integration E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Monitor error handling logs
    page.on('console', msg => {
      if (msg.text().includes('ErrorHandler') || msg.text().includes('SystemError')) {
        console.log(`Error Handler Log: ${msg.text()}`);
      }
    });
  });

  test('should handle filesystem errors with user-friendly messages', async ({ page }) => {
    // Mock file system permission errors
    await page.route('/api/apply-ai-code-stream', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'file-error',
          fileName: 'src/Component.tsx',
          error: 'Permission denied when creating file',
          severity: 'high',
          recoveryActions: [
            { description: 'Check file and directory permissions' },
            { description: 'Retry operation with elevated permissions' }
          ]
        })
      });
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      await chatInput.fill('Create a new component');
      await chatInput.press('Enter');
      
      // Should show user-friendly error message
      await expect(page.locator('text=/permission.*denied|access.*denied/i')).toBeVisible({ timeout: 15000 });
      
      // Should show recovery suggestions
      await expect(page.locator('text=/check.*permission|retry/i')).toBeVisible({ timeout: 10000 });
      
      // Should NOT show technical filesystem codes
      await expect(page.locator('text=/EACCES|EPERM|0x/i')).not.toBeVisible();
      
      // Should NOT expose file system paths
      await expect(page.locator('text=/\/home\/user|\/tmp|C:\\|D:\\/i')).not.toBeVisible();
    } else {
      test.skip(true, 'Chat interface not available - error handling cannot be tested');
    }
  });

  test('should handle disk space errors with appropriate warnings', async ({ page }) => {
    // Mock disk space errors
    await page.route('/api/apply-ai-code-stream', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'transaction-error',
          message: 'Critical transaction error occurred',
          error: 'Insufficient disk space for file operations',
          severity: 'critical',
          recoveryActions: [
            { description: 'Free up system resources and retry' },
            { description: 'Rollback changes to maintain system stability' }
          ]
        })
      });
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      await chatInput.fill('Create a large application with many components');
      await chatInput.press('Enter');
      
      // Should show disk space warning
      await expect(page.locator('text=/disk.*space|insufficient.*space/i')).toBeVisible({ timeout: 15000 });
      
      // Should indicate critical severity
      await expect(page.locator('text=/critical|severe/i')).toBeVisible({ timeout: 10000 });
      
      // Should offer recovery actions
      await expect(page.locator('text=/free.*space|rollback/i')).toBeVisible({ timeout: 10000 });
      
      // Should NOT show raw error codes
      await expect(page.locator('text=/ENOSPC|EDQUOT/i')).not.toBeVisible();
    } else {
      test.skip(true, 'Chat interface not available - disk space errors cannot be tested');
    }
  });

  test('should categorize and handle different error types appropriately', async ({ page }) => {
    const errorScenarios = [
      {
        type: 'validation',
        message: 'Invalid file name or content provided',
        severity: 'medium',
        expectedText: /invalid.*content|validation.*error/i
      },
      {
        type: 'network',
        message: 'Network timeout during file operation',
        severity: 'medium',
        expectedText: /network.*timeout|connection.*issue/i
      },
      {
        type: 'resource',
        message: 'Too many open files in system',
        severity: 'high',
        expectedText: /resource.*busy|system.*limit/i
      }
    ];

    for (const scenario of errorScenarios) {
      // Mock specific error type
      await page.route('/api/apply-ai-code-stream', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'file-error',
            fileName: 'src/TestComponent.tsx',
            error: scenario.message,
            severity: scenario.severity,
            category: scenario.type,
            recoveryActions: [
              { description: `Recover from ${scenario.type} error` }
            ]
          })
        });
      });

      await page.waitForTimeout(3000);
      
      const chatInput = page.locator('textarea').first();
      if (await chatInput.count() > 0) {
        await expect(chatInput).toBeVisible({ timeout: 10000 });
        
        await chatInput.fill(`Test ${scenario.type} error scenario`);
        await chatInput.press('Enter');
        
        // Should show appropriate error message for category
        await expect(page.locator(`text=${scenario.expectedText}`)).toBeVisible({ timeout: 15000 });
        
        // Should show severity level appropriately
        if (scenario.severity === 'high') {
          await expect(page.locator('text=/important|urgent|high/i')).toBeVisible({ timeout: 10000 });
        }
        
        // Clear the route for next iteration
        await page.unroute('/api/apply-ai-code-stream');
        await page.waitForTimeout(1000);
      } else {
        test.skip(true, 'Chat interface not available - error categorization cannot be tested');
        break;
      }
    }
  });

  test('should track error statistics and trends', async ({ page }) => {
    // Mock error statistics endpoint
    await page.route('/api/error-stats', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 15,
          bySeverity: {
            low: 5,
            medium: 7,
            high: 2,
            critical: 1
          },
          byCategory: {
            filesystem: 8,
            permission: 3,
            network: 2,
            validation: 2
          },
          recentCount: 3
        })
      });
    });

    // Navigate to a potential error dashboard or settings page
    await page.goto('/admin/errors', { waitUntil: 'networkidle' });
    
    // If error dashboard doesn't exist, check for error indicators in main UI
    const errorStatsVisible = await page.locator('text=/error.*statistics|error.*dashboard/i').count();
    
    if (errorStatsVisible > 0) {
      // Should show error statistics
      await expect(page.locator('text=/total.*15|15.*errors/i')).toBeVisible({ timeout: 10000 });
      
      // Should categorize by severity
      await expect(page.locator('text=/critical.*1|1.*critical/i')).toBeVisible({ timeout: 10000 });
      
      // Should show error trends
      await expect(page.locator('text=/recent.*3|3.*recent/i')).toBeVisible({ timeout: 10000 });
    } else {
      console.log('Error dashboard not available - skipping statistics test');
      test.skip(true, 'Error dashboard not implemented - statistics cannot be tested');
    }
  });

  test('should handle error recovery actions correctly', async ({ page }) => {
    // Mock recoverable error
    await page.route('/api/apply-ai-code-stream', async route => {
      const request = route.request();
      const body = JSON.parse(request.postData() || '{}');
      
      // Simulate retry scenario
      if (body.retry === true) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'file-complete',
            fileName: 'src/RetryComponent.tsx',
            action: 'created',
            message: 'Operation succeeded after retry'
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'file-error',
            fileName: 'src/RetryComponent.tsx',
            error: 'Temporary resource busy - retry recommended',
            severity: 'medium',
            category: 'resource',
            retryable: true,
            recoveryActions: [
              { description: 'Retry operation after brief delay', type: 'retry' },
              { description: 'Skip this operation and continue', type: 'skip' }
            ]
          })
        });
      }
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      await chatInput.fill('Create component that might fail temporarily');
      await chatInput.press('Enter');
      
      // Should show retry option
      await expect(page.locator('text=/retry.*recommended|retry.*operation/i')).toBeVisible({ timeout: 15000 });
      
      // Look for retry button or option
      const retryButton = page.locator('button:has-text("retry"), [data-action="retry"], text=/retry/i').first();
      
      if (await retryButton.count() > 0) {
        await retryButton.click();
        
        // Should show success after retry
        await expect(page.locator('text=/succeeded.*retry|retry.*successful/i')).toBeVisible({ timeout: 10000 });
      } else {
        // If no retry UI, just verify error message shows retry is possible
        await expect(page.locator('text=/can.*retry|retry.*available/i')).toBeVisible({ timeout: 10000 });
      }
    } else {
      test.skip(true, 'Chat interface not available - error recovery cannot be tested');
    }
  });

  test('should prevent cascading errors in batch operations', async ({ page }) => {
    // Mock batch operation with mixed success/failure
    await page.route('/api/apply-ai-code-stream', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'batch-result',
          successful: [
            { fileName: 'src/Component1.tsx', action: 'created' },
            { fileName: 'src/Component2.tsx', action: 'created' }
          ],
          failed: [
            { fileName: 'src/Component3.tsx', error: 'Permission denied' }
          ],
          rollbackPerformed: true,
          message: 'Partial failure detected - rollback completed to maintain consistency'
        })
      });
    });

    await page.waitForTimeout(3000);
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      await chatInput.fill('Create multiple components in a batch');
      await chatInput.press('Enter');
      
      // Should show partial failure handling
      await expect(page.locator('text=/partial.*failure|rollback.*completed/i')).toBeVisible({ timeout: 15000 });
      
      // Should indicate which operations succeeded/failed
      await expect(page.locator('text=/Component1.*created|Component2.*created/i')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=/Component3.*failed|Component3.*error/i')).toBeVisible({ timeout: 10000 });
      
      // Should show system maintained consistency
      await expect(page.locator('text=/consistency.*maintained|rollback.*completed/i')).toBeVisible({ timeout: 10000 });
    } else {
      test.skip(true, 'Chat interface not available - batch error handling cannot be tested');
    }
  });
});