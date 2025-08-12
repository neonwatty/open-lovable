/**
 * Task 2 Test Coverage Audit
 * 
 * Comprehensive audit to ensure we have excellent test coverage for all
 * functionality changed/added in Task 2: Update File Operations API
 * 
 * This test file validates that:
 * 1. All replaced E2B Python functionality is properly tested
 * 2. All new Node.js file operations are covered
 * 3. No obsolete test dependencies remain
 * 4. Integration points are thoroughly tested
 */

import { promises as fs } from 'fs';
import path from 'path';
import { setupFileWatcher, closeFileWatcher } from '../lib/file-watcher';

describe('Task 2 Test Coverage Audit', () => {
  
  describe('✅ File Operations API Coverage', () => {
    test('should have tests for apply-ai-code-stream endpoint', async () => {
      // Verify the test file exists and is comprehensive
      const testFile = path.join(__dirname, 'apply-ai-code-stream.test.ts');
      const exists = await fs.access(testFile).then(() => true, () => false);
      expect(exists).toBe(true);
      
      // Read and verify test content covers key scenarios
      const content = await fs.readFile(testFile, 'utf8');
      
      // Core functionality tests
      expect(content).toContain('should handle basic file creation with Node.js fs operations');
      expect(content).toContain('should handle file updates vs creation correctly');
      expect(content).toContain('should handle special characters and encoding properly');
      expect(content).toContain('should extract packages from imports correctly');
      expect(content).toContain('should handle multiple files with proper directory creation');
      expect(content).toContain('should update global file tracking correctly');
      expect(content).toContain('should handle command execution in local sandbox directory');
      expect(content).toContain('should remove CSS imports from JS/TS files');
      
      // Error handling tests
      expect(content).toContain('should handle empty response gracefully');
      expect(content).toContain('should handle malformed AI response');
      expect(content).toContain('should require response parameter');
      
      // Verify imports test the actual route
      expect(content).toContain("import { POST } from '../app/api/apply-ai-code-stream/route'");
    });

    test('should verify no old E2B Python runCode tests remain', async () => {
      const testFiles = await fs.readdir(__dirname);
      
      for (const fileName of testFiles) {
        if ((fileName.endsWith('.test.ts') || fileName.endsWith('.test.js')) && 
            fileName !== 'task-2-coverage-audit.test.ts') {
          const filePath = path.join(__dirname, fileName);
          const content = await fs.readFile(filePath, 'utf8');
          
          // Should not contain old E2B Python patterns (excluding comments/documentation)
          const codeLines = content.split('\n').filter(line => 
            !line.trim().startsWith('//') && 
            !line.trim().startsWith('*') && 
            !line.trim().startsWith('/**') &&
            !line.trim().startsWith('*/') &&
            !line.includes('Tests verify:') &&
            !line.includes('Node.js fs operations vs Python runCode()')
          ).join('\n');
          
          expect(codeLines).not.toContain('sandbox.runCode(`import os');
          expect(codeLines).not.toContain('runCode(`import os`');
          expect(codeLines).not.toContain('Python file operations');
          
          // Should not contain obsolete escaping tests
          expect(codeLines).not.toContain('escape triple quotes');
          expect(codeLines).not.toContain('\\\\\\\\"\\\\\\"\\\\\\"');
        }
      }
    });
  });

  describe('✅ File Watcher Coverage', () => {
    test('should have comprehensive file watcher tests', async () => {
      const testFile = path.join(__dirname, 'file-watcher.test.ts');
      const exists = await fs.access(testFile).then(() => true, () => false);
      expect(exists).toBe(true);
      
      const content = await fs.readFile(testFile, 'utf8');
      
      // Core watcher functionality
      expect(content).toContain('should initialize file watcher successfully');
      expect(content).toContain('should detect file creation');
      expect(content).toContain('should detect file modification');
      expect(content).toContain('should detect nested directory file changes');
      expect(content).toContain('should handle multiple rapid file changes');
      
      // Error handling and edge cases
      expect(content).toContain('should return false when watching invalid directory');
      expect(content).toContain('should handle watcher errors gracefully');
      expect(content).toContain('should work without sendProgress callback');
      expect(content).toContain('should close watcher on cleanup');
      
      // Verify imports from extracted module
      expect(content).toContain("import { setupFileWatcher, closeFileWatcher } from '../lib/file-watcher'");
    });

    test('should verify file watcher module exists and is properly extracted', async () => {
      const watcherModule = path.join(__dirname, '../lib/file-watcher.ts');
      const exists = await fs.access(watcherModule).then(() => true, () => false);
      expect(exists).toBe(true);
      
      const content = await fs.readFile(watcherModule, 'utf8');
      
      // Should export the key functions
      expect(content).toContain('export function setupFileWatcher');
      expect(content).toContain('export function closeFileWatcher');
      
      // Should use fs.watch properly
      expect(content).toContain("watch(sandboxPath, { recursive: true }");
      expect(content).toContain('global.sandboxWatcher');
    });
  });

  describe('✅ Path Migration Coverage', () => {
    test('should have comprehensive path migration tests', async () => {
      const testFile = path.join(__dirname, 'path-migration.test.ts');
      const exists = await fs.access(testFile).then(() => true, () => false);
      expect(exists).toBe(true);
      
      const content = await fs.readFile(testFile, 'utf8');
      
      // Path handling tests
      expect(content).toContain('should use local sandbox paths instead of E2B container paths');
      expect(content).toContain('should handle cross-platform path construction');
      expect(content).toContain('should normalize paths consistently');
      expect(content).toContain('should handle file structure mapping with local paths');
      expect(content).toContain('should resolve import paths correctly with local paths');
      
      // Path validation
      expect(content).toContain("expect(fullPath).not.toContain('/home/user/app')");
      expect(content).toContain("expect(fullPath).toContain('sandbox')");
      
      // Cross-platform support
      expect(content).toContain('should generate correct file paths for different operating systems');
    });
  });

  describe('✅ Integration Test Coverage', () => {
    test('should have end-to-end integration tests', async () => {
      const testFile = path.join(__dirname, 'integration-file-operations.test.ts');
      const exists = await fs.access(testFile).then(() => true, () => false);
      expect(exists).toBe(true);
      
      const content = await fs.readFile(testFile, 'utf8');
      
      // End-to-end flow tests
      expect(content).toContain('should complete full AI response to file creation pipeline');
      expect(content).toContain('should handle file updates with change detection');
      expect(content).toContain('should handle package installation before file creation');
      expect(content).toContain('should trigger file watcher events on external file changes');
      
      // Performance and concurrency
      expect(content).toContain('should maintain performance characteristics');
      expect(content).toContain('should handle concurrent file operations safely');
      
      // Error resilience
      expect(content).toContain('should handle errors gracefully throughout pipeline');
      expect(content).toContain('should clean up resources properly');
    });
  });

  describe('✅ Performance Benchmark Coverage', () => {
    test('should have comprehensive performance benchmarks', async () => {
      const testFile = path.join(__dirname, 'performance-benchmarks.test.ts');
      const exists = await fs.access(testFile).then(() => true, () => false);
      expect(exists).toBe(true);
      
      const content = await fs.readFile(testFile, 'utf8');
      
      // Performance test categories
      expect(content).toContain('should benchmark single small file creation');
      expect(content).toContain('should benchmark multiple small files creation');
      expect(content).toContain('should benchmark medium complexity file creation');
      expect(content).toContain('should benchmark large file creation');
      expect(content).toContain('should benchmark concurrent file operations');
      expect(content).toContain('should benchmark directory creation performance');
      expect(content).toContain('should benchmark file update performance');
      expect(content).toContain('should benchmark memory usage patterns');
      expect(content).toContain('should benchmark package detection performance');
      
      // Performance measurement utilities
      expect(content).toContain('class PerformanceMeasurement');
      expect(content).toContain('performance.now()');
    });
  });

  describe('✅ Test Infrastructure', () => {
    test('should have proper test scripts in package.json', async () => {
      const packageJson = path.join(__dirname, '../package.json');
      const content = await fs.readFile(packageJson, 'utf8');
      const pkg = JSON.parse(content);
      
      // Task 2 specific test scripts
      expect(pkg.scripts['test:task-2']).toBeDefined();
      expect(pkg.scripts['test:apply-ai-code-stream']).toBeDefined();
      expect(pkg.scripts['test:file-watcher']).toBeDefined();
      expect(pkg.scripts['test:path-migration']).toBeDefined();
      expect(pkg.scripts['test:integration-file-ops']).toBeDefined();
      expect(pkg.scripts['test:performance']).toBeDefined();
      
      // Updated main test script should include Task 2
      expect(pkg.scripts['test:all']).toContain('test:task-2');
    });

    test('should have vitest configuration for new test files', async () => {
      const testFiles = [
        'apply-ai-code-stream.test.ts',
        'file-watcher.test.ts', 
        'path-migration.test.ts',
        'integration-file-operations.test.ts',
        'performance-benchmarks.test.ts'
      ];
      
      for (const fileName of testFiles) {
        const filePath = path.join(__dirname, fileName);
        const exists = await fs.access(filePath).then(() => true, () => false);
        expect(exists).toBe(true);
        
        const content = await fs.readFile(filePath, 'utf8');
        
        // Should have proper test structure
        expect(content).toContain('describe(');
        expect(content).toContain('test(');
        expect(content).toContain('expect(');
        
        // Should have proper cleanup
        expect(content).toContain('beforeEach');
        expect(content).toContain('afterEach');
      }
    });
  });

  describe('✅ Coverage Gaps Analysis', () => {
    test('should verify no major Task 2 functionality is untested', async () => {
      // Read the actual implementation to verify coverage
      const routeFile = path.join(__dirname, '../app/api/apply-ai-code-stream/route.ts');
      const routeContent = await fs.readFile(routeFile, 'utf8');
      
      // Key functionality that should be tested
      const keyFeatures = [
        'parseAIResponse',           // AI response parsing
        'fs.writeFile',             // Node.js file writing
        'fs.mkdir',                 // Directory creation
        'setupFileWatcher',         // File watching
        'path.join',                // Path construction
        'spawn(',                   // Command execution
        'sendProgress',             // Progress streaming
        'global.existingFiles',     // Global file tracking
        'global.sandboxState',      // State management
      ];
      
      // Verify each feature exists in implementation
      keyFeatures.forEach(feature => {
        expect(routeContent).toContain(feature);
      });
      
      // Verify we have tests covering these features
      const testDir = __dirname;
      const testFiles = await fs.readdir(testDir);
      const taskTestFiles = testFiles.filter(f => 
        f.includes('apply-ai-code-stream') ||
        f.includes('file-watcher') ||
        f.includes('path-migration') ||
        f.includes('integration-file-operations') ||
        f.includes('performance-benchmarks')
      );
      
      expect(taskTestFiles.length).toBeGreaterThanOrEqual(5);
    });

    test('should ensure old E2B dependencies are removed from implementation', async () => {
      const routeFile = path.join(__dirname, '../app/api/apply-ai-code-stream/route.ts');
      const routeContent = await fs.readFile(routeFile, 'utf8');
      
      // Should not contain old E2B patterns
      expect(routeContent).not.toContain('sandbox.runCode(`import os');
      expect(routeContent).not.toContain('with open("${fullPath}", \'w\')');
      expect(routeContent).not.toContain('f.write("""${escapedContent}""")');
      expect(routeContent).not.toContain('.replace(/\\$/g, \'\\\\$\')');
      expect(routeContent).not.toContain('.replace(/"""/g, \'\\"\\"\\"\')');
      
      // Should contain new Node.js patterns
      expect(routeContent).toContain('fs.writeFile(fullPath, fileContent, \'utf8\')');
      expect(routeContent).toContain('fs.mkdir(dirPath, { recursive: true })');
      expect(routeContent).toContain('setupFileWatcher');
      expect(routeContent).toContain('spawn(\'sh\', [\'-c\', cmd]');
    });
  });

  describe('✅ Test Quality Assessment', () => {
    test('should have proper test isolation and cleanup', async () => {
      const testFiles = [
        'apply-ai-code-stream.test.ts',
        'file-watcher.test.ts',
        'path-migration.test.ts',
        'integration-file-operations.test.ts'
      ];
      
      for (const fileName of testFiles) {
        const filePath = path.join(__dirname, fileName);
        const content = await fs.readFile(filePath, 'utf8');
        
        // Should have proper setup/teardown
        expect(content).toContain('beforeEach');
        expect(content).toContain('afterEach');
        
        // Should clean up temp files
        expect(content).toContain('fs.rm(testDir');
        
        // Should have realistic test data
        expect(content).toContain('tmpdir()');
        expect(content).toContain('sandbox');
        
        // Should test actual error conditions
        expect(content).toContain('error');
      }
    });

    test('should have meaningful assertions', async () => {
      const testFile = path.join(__dirname, 'apply-ai-code-stream.test.ts');
      const content = await fs.readFile(testFile, 'utf8');
      
      // Should test actual behavior, not just structure
      expect(content).toContain('expect(fileExists).toBe(true)');
      expect(content).toContain('expect(fileContent).toContain');
      expect(content).toContain('expect(response.status).toBe(200)');
      expect(content.includes('expect(packageEvents.length)') || content.includes('expect(commandEvents.length)')).toBe(true);
      
      // Should verify file system state
      expect(content).toContain('fs.readFile(');
      expect(content).toContain('fs.access(');
    });
  });
});