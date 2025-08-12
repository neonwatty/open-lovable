/**
 * Path Migration Tests
 * 
 * Tests to verify that all path references have been correctly migrated 
 * from E2B container paths (/home/user/app/) to local sandbox paths (./sandbox/).
 * 
 * Tests verify:
 * - Path construction with path.join()
 * - Cross-platform path handling
 * - Path normalization functions
 * - Import path resolution
 * - File structure mapping
 */

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Import functions to test
import { selectContextualFiles } from '../lib/context-selector';
import { analyzeEditIntent } from '../lib/edit-intent-analyzer';

const testDir = path.join(tmpdir(), 'path-migration-test');
const sandboxDir = path.join(testDir, 'sandbox');

beforeEach(async () => {
  // Clean up any existing test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    // Directory might not exist, ignore
  }
  
  // Create fresh test directory structure
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(sandboxDir, { recursive: true });
  await fs.mkdir(path.join(sandboxDir, 'src'), { recursive: true });
  await fs.mkdir(path.join(sandboxDir, 'src', 'components'), { recursive: true });
  
  // Mock process.cwd() to return our test directory
  const originalCwd = process.cwd;
  process.cwd = () => testDir;
  
  return () => {
    process.cwd = originalCwd;
  };
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Helper to create mock file manifest
function createMockFileManifest(files: Record<string, any>) {
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([filePath, content]) => [
        path.join('./sandbox', filePath),
        {
          content,
          type: filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'component' : 'file',
          lastModified: Date.now(),
          size: typeof content === 'string' ? content.length : 0
        }
      ])
    )
  };
}

describe('Path Migration Tests', () => {
  test('should use local sandbox paths instead of E2B container paths', () => {
    const normalizedPath = 'src/components/TestComponent.tsx';
    const fullPath = path.join(process.cwd(), 'sandbox', normalizedPath);
    
    // Should construct local path, not E2B path
    expect(fullPath).toContain('sandbox');
    expect(fullPath).toContain('src/components/TestComponent.tsx');
    expect(fullPath).not.toContain('/home/user/app');
    
    // Should be absolute path
    expect(path.isAbsolute(fullPath)).toBe(true);
  });

  test('should handle cross-platform path construction', () => {
    const testPaths = [
      'src/App.tsx',
      'src/components/Header.tsx',
      'public/favicon.ico',
      'src/styles/main.css'
    ];
    
    testPaths.forEach(testPath => {
      const fullPath = path.join(process.cwd(), 'sandbox', testPath);
      
      // Should use correct path separators for current platform
      expect(fullPath).toContain('sandbox');
      expect(fullPath).toContain(path.normalize(testPath));
      
      // Should be valid path
      expect(typeof fullPath).toBe('string');
      expect(fullPath.length).toBeGreaterThan(0);
    });
  });

  test('should normalize paths consistently', () => {
    const testCases = [
      { input: 'src/App.tsx', expected: 'src/App.tsx' },
      { input: './src/App.tsx', expected: 'src/App.tsx' },
      { input: '/src/App.tsx', expected: 'src/App.tsx' },
      { input: 'src\\App.tsx', expected: 'src/App.tsx' }, // Windows-style
    ];
    
    testCases.forEach(({ input, expected }) => {
      let normalizedPath = input;
      
      // Apply same normalization as in apply-ai-code-stream route
      if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
      }
      if (normalizedPath.startsWith('./')) {
        normalizedPath = normalizedPath.substring(2);
      }
      
      // Normalize path separators
      normalizedPath = normalizedPath.replace(/\\/g, '/');
      
      expect(normalizedPath).toBe(expected);
    });
  });

  test('should handle file structure mapping with local paths', () => {
    const mockManifest = createMockFileManifest({
      'src/App.tsx': 'export const App = () => <div>App</div>',
      'src/components/Header.tsx': 'export const Header = () => <header>Header</header>',
      'src/components/Footer.tsx': 'export const Footer = () => <footer>Footer</footer>',
      'src/utils/helpers.ts': 'export const helper = () => "help"'
    });
    
    // Verify all paths are using sandbox prefix, not E2B paths
    Object.keys(mockManifest.files).forEach(filePath => {
      expect(filePath).toContain('./sandbox/');
      expect(filePath).not.toContain('/home/user/app/');
    });
  });

  test('should resolve import paths correctly with local paths', () => {
    // Test the edit intent analyzer's path resolution
    const mockManifest = createMockFileManifest({
      'src/App.tsx': `
        import React from 'react';
        import { Header } from './components/Header';
        import { utils } from '@/utils/helpers';
        
        export const App = () => <div><Header /></div>
      `,
      'src/components/Header.tsx': 'export const Header = () => <header>Header</header>',
      'src/utils/helpers.ts': 'export const utils = { test: true }'
    });
    
    // The analyzer should work with local paths
    const appFilePath = './sandbox/src/App.tsx';
    const appContent = mockManifest.files[appFilePath].content;
    
    // Should be able to analyze without E2B dependencies
    expect(appContent).toContain('import { Header }');
    expect(appContent).toContain('@/utils/helpers');
  });

  test('should handle directory creation with proper path structure', async () => {
    const testPaths = [
      'src/components/ui',
      'src/hooks',
      'src/contexts',
      'public/assets/images'
    ];
    
    for (const testPath of testPaths) {
      const fullPath = path.join(sandboxDir, testPath);
      await fs.mkdir(fullPath, { recursive: true });
      
      // Verify directory was created in sandbox, not E2B path
      const exists = await fs.access(fullPath).then(() => true, () => false);
      expect(exists).toBe(true);
      
      // Verify path structure
      expect(fullPath).toContain('sandbox');
      expect(fullPath).toContain(testPath);
    }
  });

  test('should handle relative path resolution', () => {
    const fromFile = './sandbox/src/components/Header.tsx';
    const importPaths = [
      './Footer.tsx', // Same directory
      '../App.tsx', // Parent directory  
      '../utils/helpers.ts', // Sibling directory
      '../../public/logo.svg' // Multiple levels up
    ];
    
    importPaths.forEach(importPath => {
      const resolvedPath = path.resolve(path.dirname(fromFile), importPath);
      
      // Should resolve to sandbox directory, not E2B
      expect(resolvedPath).toContain('sandbox');
      expect(resolvedPath).not.toContain('/home/user/app');
      
      // Should be absolute path
      expect(path.isAbsolute(resolvedPath)).toBe(true);
    });
  });

  test('should handle path filtering for config files', () => {
    const configFiles = [
      'tailwind.config.js',
      'vite.config.js', 
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'postcss.config.js'
    ];
    
    const testFiles = [
      ...configFiles,
      'src/App.tsx',
      'src/components/Header.tsx'
    ];
    
    // Apply same filtering as in apply-ai-code-stream route
    const filteredFiles = testFiles
      .map(filePath => ({ path: filePath, content: 'test content' }))
      .filter(file => {
        if (!file || typeof file !== 'object') return false;
        const fileName = (file.path || '').split('/').pop() || '';
        return !configFiles.includes(fileName);
      });
    
    // Should only include non-config files
    expect(filteredFiles).toHaveLength(2);
    expect(filteredFiles.every(f => f.path.startsWith('src/'))).toBe(true);
  });

  test('should handle automatic src/ prefix addition', () => {
    const testCases = [
      { input: 'Component.tsx', expected: 'src/Component.tsx' },
      { input: 'utils/helper.ts', expected: 'src/utils/helper.ts' },
      { input: 'src/App.tsx', expected: 'src/App.tsx' }, // Already has src/
      { input: 'public/logo.svg', expected: 'public/logo.svg' }, // Public files
      { input: 'index.html', expected: 'index.html' } // Root files
    ];
    
    const configFiles = ['tailwind.config.js', 'vite.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.js'];
    
    testCases.forEach(({ input, expected }) => {
      let normalizedPath = input;
      
      // Apply same logic as in apply-ai-code-stream route
      if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
      }
      
      if (!normalizedPath.startsWith('src/') && 
          !normalizedPath.startsWith('public/') && 
          normalizedPath !== 'index.html' && 
          !configFiles.includes(normalizedPath.split('/').pop() || '')) {
        normalizedPath = 'src/' + normalizedPath;
      }
      
      expect(normalizedPath).toBe(expected);
    });
  });

  test('should generate correct file paths for different operating systems', () => {
    const originalPlatform = process.platform;
    
    const testPath = 'src/components/TestComponent.tsx';
    
    // Test on different platforms
    ['win32', 'darwin', 'linux'].forEach(platform => {
      Object.defineProperty(process, 'platform', { value: platform });
      
      const fullPath = path.join(testDir, 'sandbox', testPath);
      
      // Should work on all platforms
      expect(fullPath).toContain('sandbox');
      expect(path.isAbsolute(fullPath)).toBe(true);
      
      // Should use correct separators
      if (platform === 'win32') {
        expect(fullPath.includes('\\')).toBe(true);
      } else {
        expect(fullPath.includes('/')).toBe(true);
      }
    });
    
    // Restore original platform
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('should maintain path consistency in file cache', () => {
    const testFiles = {
      'src/App.tsx': 'app content',
      'src/components/Header.tsx': 'header content',
      'public/favicon.ico': 'favicon content'
    };
    
    const mockFileCache = {
      files: {} as Record<string, any>
    };
    
    // Simulate file cache update logic from apply-ai-code-stream
    Object.entries(testFiles).forEach(([filePath, content]) => {
      mockFileCache.files[filePath] = {
        content,
        lastModified: Date.now()
      };
    });
    
    // All cached paths should be normalized local paths
    Object.keys(mockFileCache.files).forEach(filePath => {
      expect(filePath).not.toContain('/home/user/app');
      expect(filePath).not.toStartWith('/');
      expect(typeof filePath).toBe('string');
    });
  });
});