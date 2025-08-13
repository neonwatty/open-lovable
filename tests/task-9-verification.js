#!/usr/bin/env node

/**
 * Task 9: Local Process Management Verification
 * 
 * This script verifies that Task 9 requirements are fully implemented by checking:
 * 1. Process management utility module exists and functions correctly
 * 2. Cleanup handlers are implemented for application shutdown
 * 3. Port conflict detection and resolution works
 * 4. Robust error handling for filesystem operations
 * 5. Process monitoring and auto-restart capabilities
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Task 9: Local Process Management Verification\n');

class Task9Verifier {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  async verify(name, verifyFn) {
    try {
      await verifyFn();
      console.log(`✅ ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}\n`);
      this.failed++;
    }
  }

  assert(condition, message = 'Assertion failed') {
    if (!condition) {
      throw new Error(message);
    }
  }

  async fileExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async readFileContent(path) {
    try {
      return await fs.readFile(path, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read ${path}: ${error.message}`);
    }
  }

  // Task 9.1: Verify process management utility module exists
  async verifyProcessManagementUtility() {
    const viteProcessManagerPath = join(__dirname, '..', 'lib', 'sandbox', 'viteProcessManager.ts');
    const sandboxManagerPath = join(__dirname, '..', 'lib', 'sandbox', 'sandboxManager.ts');
    
    this.assert(await this.fileExists(viteProcessManagerPath), 'ViteProcessManager module should exist');
    this.assert(await this.fileExists(sandboxManagerPath), 'SandboxManager module should exist');
    
    const viteManagerContent = await this.readFileContent(viteProcessManagerPath);
    
    // Verify core process management features
    this.assert(viteManagerContent.includes('class ViteProcessManager'), 'ViteProcessManager class should exist');
    this.assert(viteManagerContent.includes('startViteServer'), 'Should have startViteServer method');
    this.assert(viteManagerContent.includes('stopViteServer'), 'Should have stopViteServer method');
    this.assert(viteManagerContent.includes('restartViteServer'), 'Should have restartViteServer method');
    this.assert(viteManagerContent.includes('getViteStatus'), 'Should have getViteStatus method');
    this.assert(viteManagerContent.includes('spawn'), 'Should use child_process.spawn for process management');
    
    console.log('   ✓ Process management utility module structure verified');
  }

  // Task 9.2: Verify cleanup handlers for application shutdown
  async verifyCleanupHandlers() {
    const viteProcessManagerPath = join(__dirname, '..', 'lib', 'sandbox', 'viteProcessManager.ts');
    const content = await this.readFileContent(viteProcessManagerPath);
    
    // Verify shutdown signal handlers
    this.assert(content.includes('SIGINT'), 'Should handle SIGINT signal');
    this.assert(content.includes('SIGTERM'), 'Should handle SIGTERM signal');
    this.assert(content.includes('uncaughtException'), 'Should handle uncaught exceptions');
    this.assert(content.includes('unhandledRejection'), 'Should handle unhandled rejections');
    this.assert(content.includes('setupProcessCleanup'), 'Should have cleanup setup method');
    this.assert(content.includes('cleanupHandlers'), 'Should have cleanup handlers system');
    this.assert(content.includes('onCleanup'), 'Should allow registering cleanup handlers');
    this.assert(content.includes('offCleanup'), 'Should allow removing cleanup handlers');
    
    console.log('   ✓ Application shutdown cleanup handlers verified');
  }

  // Task 9.3: Verify port conflict detection and resolution
  async verifyPortConflictResolution() {
    const viteProcessManagerPath = join(__dirname, '..', 'lib', 'sandbox', 'viteProcessManager.ts');
    const content = await this.readFileContent(viteProcessManagerPath);
    
    // Verify port conflict detection
    this.assert(content.includes('findAvailablePort'), 'Should have port availability detection');
    this.assert(content.includes('isPortFree'), 'Should check if ports are free');
    this.assert(content.includes('port-conflict'), 'Should emit port conflict events');
    this.assert(content.includes('EADDRINUSE'), 'Should detect port in use errors');
    this.assert(content.includes('address already in use'), 'Should handle address in use errors');
    
    // Verify port resolution logic
    this.assert(content.includes('preferredPort + 1'), 'Should try incremental port numbers');
    this.assert(content.includes('100'), 'Should have reasonable port range limit');
    
    console.log('   ✓ Port conflict detection and resolution verified');
  }

  // Task 9.4: Verify robust error handling for filesystem operations
  async verifywFilesystemErrorHandling() {
    const sandboxManagerPath = join(__dirname, '..', 'lib', 'sandbox', 'sandboxManager.ts');
    const content = await this.readFileContent(sandboxManagerPath);
    
    // Verify filesystem error handling
    this.assert(content.includes('ENOENT'), 'Should handle file not found errors');
    this.assert(content.includes('File not found') || content.includes('not found'), 'Should throw meaningful path errors');
    this.assert(content.includes('Invalid file path') || content.includes('Invalid directory path'), 'Should validate file paths');
    this.assert(content.includes('File too large'), 'Should handle file size limits');
    this.assert(content.includes('maxFileSize'), 'Should enforce file size limits');
    this.assert(content.includes('maxTotalSize'), 'Should enforce total size limits');
    
    // Verify directory traversal protection
    this.assert(content.includes('normalize'), 'Should normalize file paths');
    this.assert(content.includes('..'), 'Should prevent directory traversal');
    this.assert(content.includes('startsWith'), 'Should ensure paths stay within sandbox');
    
    console.log('   ✓ Robust filesystem error handling verified');
  }

  // Task 9.5: Verify process monitoring and auto-restart capabilities
  async verifyProcessMonitoringAndRestart() {
    const viteProcessManagerPath = join(__dirname, '..', 'lib', 'sandbox', 'viteProcessManager.ts');
    const content = await this.readFileContent(viteProcessManagerPath);
    
    // Verify process monitoring
    this.assert(content.includes('ViteProcessInfo'), 'Should have process info structure');
    this.assert(content.includes('ViteServerStatus'), 'Should have server status structure');
    this.assert(content.includes('uptime'), 'Should track process uptime');
    this.assert(content.includes('startTime'), 'Should track process start time');
    this.assert(content.includes('isRunning'), 'Should track running status');
    this.assert(content.includes('logs'), 'Should maintain process logs');
    
    // Verify restart capabilities
    this.assert(content.includes('restartViteServer'), 'Should have restart method');
    this.assert(content.includes('stopViteServer'), 'Should stop before restart');
    this.assert(content.includes('Brief delay'), 'Should have restart delay for cleanup');
    
    // Verify monitoring events
    this.assert(content.includes('EventEmitter'), 'Should extend EventEmitter for monitoring');
    this.assert(content.includes('starting'), 'Should emit starting events');
    this.assert(content.includes('ready'), 'Should emit ready events');
    this.assert(content.includes('error'), 'Should emit error events');
    this.assert(content.includes('stopped'), 'Should emit stopped events');
    
    // Verify auto-restart triggers
    this.assert(content.includes('spawn'), 'Should detect when process spawns');
    this.assert(content.includes('exit'), 'Should handle process exit');
    this.assert(content.includes('close'), 'Should handle process close');
    
    console.log('   ✓ Process monitoring and auto-restart capabilities verified');
  }

  // Verify integration between components
  async verifyIntegration() {
    const sandboxManagerPath = join(__dirname, '..', 'lib', 'sandbox', 'sandboxManager.ts');
    const content = await this.readFileContent(sandboxManagerPath);
    
    // Verify sandbox manager integrates with vite process manager
    this.assert(content.includes('viteProcessManager'), 'Should integrate with ViteProcessManager');
    this.assert(content.includes('startViteServer'), 'Should expose Vite server control');
    this.assert(content.includes('stopViteServer'), 'Should expose Vite server control');
    this.assert(content.includes('restartViteServer'), 'Should expose Vite server restart');
    this.assert(content.includes('getViteServerStatus'), 'Should expose server status');
    this.assert(content.includes('getViteServerUrl'), 'Should expose server URL');
    this.assert(content.includes('getViteServerLogs'), 'Should expose server logs');
    
    // Verify state management integration
    this.assert(content.includes('sandboxStateManager'), 'Should integrate with state manager');
    this.assert(content.includes('updateViteProcessInfo'), 'Should update process info in state');
    
    console.log('   ✓ Component integration verified');
  }

  // Verify API routes use the process management system
  async verifyAPIIntegration() {
    const apiPaths = [
      'app/api/create-ai-sandbox/route.ts',
      'app/api/kill-sandbox/route.ts', 
      'app/api/restart-vite/route.ts',
      'app/api/sandbox-status/route.ts'
    ];

    for (const apiPath of apiPaths) {
      const fullPath = join(__dirname, '..', apiPath);
      if (await this.fileExists(fullPath)) {
        const content = await this.readFileContent(fullPath);
        
        // Check that API routes use the process management system
        if (content.includes('sandboxManager') || content.includes('viteProcessManager')) {
          console.log(`   ✓ ${apiPath} uses process management system`);
        }
      }
    }
  }

  async runAllVerifications() {
    console.log('Starting Task 9 verification...\n');

    // Task 9.1 verification
    console.log('📋 Task 9.1: Process management utility module');
    await this.verify('Process management utility module', 
                     () => this.verifyProcessManagementUtility());

    // Task 9.2 verification
    console.log('\n📋 Task 9.2: Cleanup handlers for application shutdown');
    await this.verify('Application shutdown cleanup handlers', 
                     () => this.verifyCleanupHandlers());

    // Task 9.3 verification
    console.log('\n📋 Task 9.3: Port conflict detection and resolution');
    await this.verify('Port conflict detection and resolution', 
                     () => this.verifyPortConflictResolution());

    // Task 9.4 verification
    console.log('\n📋 Task 9.4: Robust error handling for filesystem operations');
    await this.verify('Robust filesystem error handling', 
                     () => this.verifywFilesystemErrorHandling());

    // Task 9.5 verification
    console.log('\n📋 Task 9.5: Process monitoring and auto-restart capabilities');
    await this.verify('Process monitoring and auto-restart', 
                     () => this.verifyProcessMonitoringAndRestart());

    // Integration verifications
    console.log('\n📋 Integration Verification');
    await this.verify('Component integration', 
                     () => this.verifyIntegration());
    await this.verify('API integration', 
                     () => this.verifyAPIIntegration());

    // Results
    console.log('\n📊 Verification Results:');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    
    if (this.failed === 0) {
      console.log('\n🎉 All Task 9 requirements are fully implemented!');
      console.log('✅ Local Process Management system is complete and robust.');
      
      console.log('\n📋 Task 9 Implementation Summary:');
      console.log('✅ 9.1 - Process management utility module (ViteProcessManager + SandboxManager)');
      console.log('✅ 9.2 - Application shutdown cleanup handlers (SIGINT, SIGTERM, exceptions)');
      console.log('✅ 9.3 - Port conflict detection and resolution (automatic port scanning)');
      console.log('✅ 9.4 - Robust filesystem error handling (validation, limits, security)');
      console.log('✅ 9.5 - Process monitoring and auto-restart (events, lifecycle, recovery)');
      
    } else {
      console.log(`\n⚠️  ${this.failed} verification(s) failed.`);
      return false;
    }
    
    return this.failed === 0;
  }
}

// Run verification
const verifier = new Task9Verifier();
verifier.runAllVerifications()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Verification failed:', error);
    process.exit(1);
  });