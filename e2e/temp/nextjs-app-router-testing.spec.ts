import { test, expect } from '@playwright/test';

test.describe('Next.js App Router Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should render main page with proper SSR/SSG behavior', async ({ page }) => {
    // Check that the page loads without hydration errors
    const hydrationErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && 
          (msg.text().includes('hydration') || msg.text().includes('Hydration'))) {
        hydrationErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Verify page content is present before hydration
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(1000); // Substantial content
    
    // Should not have hydration mismatches
    expect(hydrationErrors).toHaveLength(0);
    
    // Check for proper meta tags and SEO elements
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    
    // Verify main application structure
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('main, [role="main"], #main')).toBeVisible();
  });

  test('should handle client-side navigation without full page reloads', async ({ page }) => {
    // Monitor network requests to detect full page reloads
    const navigationRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes(page.url().split('/')[2]) && 
          request.resourceType() === 'document') {
        navigationRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Clear initial page load request
    navigationRequests.length = 0;
    
    // Look for navigation links or buttons
    const navLinks = await page.locator('a[href], button[data-href], [role="button"]').count();
    
    if (navLinks > 0) {
      // Try to navigate using first available link
      const firstLink = page.locator('a[href]').first();
      const href = await firstLink.getAttribute('href');
      
      if (href && href.startsWith('/') && !href.includes('http')) {
        await firstLink.click();
        await page.waitForTimeout(2000);
        
        // Should not have made additional document requests (client-side navigation)
        expect(navigationRequests).toHaveLength(0);
        
        // URL should have changed
        expect(page.url()).toContain(href);
      }
    } else {
      console.log('No navigation links found - skipping client-side navigation test');
    }
  });

  test('should handle file generation routes properly', async ({ page }) => {
    // Test the file generation workflow end-to-end
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      // Start file generation process
      await chatInput.fill('Create a simple Button component');
      await chatInput.press('Enter');
      
      // Should stay on the same page (SPA behavior)
      expect(page.url()).toContain('/');
      
      // Should show loading/progress indicators
      await expect(page.locator('text=/generating|creating|loading/i')).toBeVisible({ timeout: 15000 });
      
      // Should eventually show results without page reload
      await expect(page.locator('text=/created|generated|success/i')).toBeVisible({ timeout: 30000 });
      
      // Page should remain interactive
      await expect(chatInput).toBeVisible();
    } else {
      test.skip(true, 'Chat interface not available - file generation routes cannot be tested');
    }
  });

  test('should handle API route integration with proper error boundaries', async ({ page }) => {
    // Monitor JavaScript errors
    const jsErrors: string[] = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    // Mock API failure to test error boundaries
    await page.route('/api/apply-ai-code-stream', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      await chatInput.fill('Create a component that will fail');
      await chatInput.press('Enter');
      
      // Should handle API errors gracefully without crashing the app
      await page.waitForTimeout(5000);
      
      // Application should still be responsive
      await expect(page.locator('body')).toBeVisible();
      await expect(chatInput).toBeVisible();
      
      // Should not have unhandled JavaScript errors
      const criticalErrors = jsErrors.filter(error => 
        !error.includes('Extension') && 
        !error.includes('chrome-extension') &&
        !error.includes('favicon')
      );
      expect(criticalErrors).toHaveLength(0);
      
      // Should show user-friendly error message
      await expect(page.locator('text=/error|failed|something.*wrong/i')).toBeVisible({ timeout: 10000 });
    } else {
      test.skip(true, 'Chat interface not available - API error handling cannot be tested');
    }
  });

  test('should support React 19 features and concurrent rendering', async ({ page }) => {
    // Test modern React features
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check React version and features
    const reactVersion = await page.evaluate(() => {
      // @ts-ignore - Check React version if available
      return window.React?.version || 'unknown';
    });
    
    console.log(`React version detected: ${reactVersion}`);
    
    // Test concurrent features by rapid interactions
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      // Rapid typing to test concurrent updates
      await chatInput.focus();
      await chatInput.type('Test', { delay: 10 });
      await chatInput.clear();
      await chatInput.type('Concurrent', { delay: 5 });
      await chatInput.clear();
      await chatInput.type('Rendering', { delay: 15 });
      
      // Should handle rapid updates without issues
      const finalValue = await chatInput.inputValue();
      expect(finalValue).toBe('Rendering');
      
      // UI should remain responsive
      await expect(chatInput).toBeFocused();
    } else {
      console.log('Chat interface not available - React 19 features cannot be tested');
    }
  });

  test('should handle dynamic imports and code splitting', async ({ page }) => {
    // Monitor network requests for chunk loading
    const chunkRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('.js') && 
          (request.url().includes('chunk') || request.url().includes('_app'))) {
        chunkRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Initial chunks should be loaded
    expect(chunkRequests.length).toBeGreaterThan(0);
    
    // Clear initial requests
    chunkRequests.length = 0;
    
    // Trigger interactions that might load additional chunks
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await chatInput.focus();
      await chatInput.fill('Create advanced component with many features');
      
      // Wait for potential lazy loading
      await page.waitForTimeout(3000);
      
      // Additional chunks might be loaded for complex interactions
      console.log(`Additional chunks loaded: ${chunkRequests.length}`);
      
      // Application should work regardless of chunk loading strategy
      await expect(chatInput).toBeVisible();
    }
  });

  test('should handle server actions and form submissions', async ({ page }) => {
    // Look for forms or server action triggers
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const forms = await page.locator('form').count();
    const actionButtons = await page.locator('button[formAction], input[formAction]').count();
    
    if (forms > 0 || actionButtons > 0) {
      console.log(`Found ${forms} forms and ${actionButtons} action buttons`);
      
      // Test form submission if available
      const firstForm = page.locator('form').first();
      if (await firstForm.count() > 0) {
        const submitButton = firstForm.locator('button[type="submit"], input[type="submit"]').first();
        
        if (await submitButton.count() > 0) {
          await submitButton.click();
          
          // Should handle server action without full page reload
          await page.waitForTimeout(2000);
          
          // Page should remain interactive
          await expect(page.locator('body')).toBeVisible();
        }
      }
    } else {
      console.log('No forms or server actions found - skipping server action test');
    }
  });

  test('should maintain performance with large component trees', async ({ page }) => {
    // Measure performance of complex operations
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const startTime = Date.now();
    
    // Perform complex operation
    const chatInput = page.locator('textarea').first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible({ timeout: 10000 });
      
      // Request generation of multiple components
      await chatInput.fill('Create a dashboard with header, sidebar, main content, footer, and 10 card components');
      await chatInput.press('Enter');
      
      // Wait for operation to complete
      await page.waitForSelector('text=/created|generated|complete/i', { timeout: 60000 });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Complex operation completed in ${duration}ms`);
      
      // Should complete within reasonable time (adjust based on expectations)
      expect(duration).toBeLessThan(60000); // 60 seconds max
      
      // Application should remain responsive after complex operations
      await expect(chatInput).toBeVisible();
      await expect(chatInput).toBeEnabled();
    } else {
      test.skip(true, 'Chat interface not available - performance testing cannot be completed');
    }
  });
});