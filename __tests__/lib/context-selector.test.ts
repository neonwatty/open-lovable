import { selectFilesForEdit, getFileContents, formatFilesForAI } from '@/lib/context-selector';
import type { FileManifest } from '@/types/file-manifest';

describe('Context Selector', () => {
  describe('selectFilesForEdit', () => {
    const mockManifest: FileManifest = {
      files: {
        'src/App.tsx': {
          content: 'export default function App() {}',
          type: 'component',
          lastModified: Date.now(),
          path: 'src/App.tsx',
          relativePath: 'src/App.tsx',
        },
        'src/components/Button.tsx': {
          content: 'export function Button() {}',
          type: 'component',
          lastModified: Date.now(),
          path: 'src/components/Button.tsx',
          relativePath: 'src/components/Button.tsx',
        },
        'src/components/Modal.tsx': {
          content: 'export function Modal() {}',
          type: 'component',
          lastModified: Date.now(),
          path: 'src/components/Modal.tsx',
          relativePath: 'src/components/Modal.tsx',
        },
        'src/utils/helpers.ts': {
          content: 'export const helper = () => {}',
          type: 'utility',
          lastModified: Date.now(),
          path: 'src/utils/helpers.ts',
          relativePath: 'src/utils/helpers.ts',
        },
        'package.json': {
          content: '{}',
          type: 'config',
          lastModified: Date.now(),
          path: 'package.json',
          relativePath: 'package.json',
        },
        'README.md': {
          content: '# README',
          type: 'config',
          lastModified: Date.now(),
          path: 'README.md',
          relativePath: 'README.md',
        },
      },
      routes: [],
      componentTree: {},
      entryPoint: 'src/App.tsx',
      styleFiles: [],
      timestamp: Date.now(),
    };

    it('should select relevant files for component updates', async () => {
      const result = await selectFilesForEdit(
        'Update the Button component to have a loading state',
        mockManifest
      );

      expect(result.primaryFiles).toContain('src/components/Button.tsx');
      expect(result.contextFiles.length).toBeGreaterThan(0);
    });

    it('should select main app file for app-wide changes', async () => {
      const result = await selectFilesForEdit(
        'Add navigation to the main app',
        mockManifest
      );

      expect(result.primaryFiles).toContain('src/App.tsx');
    });

    it('should handle prompts about package management', async () => {
      const result = await selectFilesForEdit(
        'Add a new dependency for state management',
        mockManifest
      );

      expect(result.primaryFiles).toContain('package.json');
    });

    it('should return empty arrays for empty manifest', async () => {
      const emptyManifest: FileManifest = {
        files: {},
        routes: [],
        componentTree: {},
        entryPoint: '',
        styleFiles: [],
        timestamp: Date.now(),
      };
      
      const result = await selectFilesForEdit(
        'Create a new component',
        emptyManifest
      );

      expect(result.primaryFiles).toEqual([]);
      expect(result.contextFiles).toEqual([]);
    });

    it('should handle undefined manifest gracefully', async () => {
      const result = await selectFilesForEdit(
        'Create a new component',
        undefined as any
      );

      expect(result.primaryFiles).toEqual([]);
      expect(result.contextFiles).toEqual([]);
    });
  });

  describe('getFileContents', () => {
    const mockFileCache = {
      'src/App.tsx': {
        content: 'export default function App() { return <div>Hello</div>; }',
        path: 'src/App.tsx',
      },
      'src/components/Button.tsx': {
        content: 'export function Button() { return <button>Click me</button>; }',
        path: 'src/components/Button.tsx',
      },
    };

    const mockManifest: FileManifest = {
      files: {
        'src/App.tsx': {
          content: 'export default function App() {}',
          type: 'component',
          lastModified: Date.now(),
          path: 'src/App.tsx',
          relativePath: 'src/App.tsx',
        },
        'src/components/Button.tsx': {
          content: 'export function Button() {}',
          type: 'component',
          lastModified: Date.now(),
          path: 'src/components/Button.tsx',
          relativePath: 'src/components/Button.tsx',
        },
      },
      routes: [],
      componentTree: {},
      entryPoint: 'src/App.tsx',
      styleFiles: [],
      timestamp: Date.now(),
    };

    it('should return content for existing files', async () => {
      const result = await getFileContents(
        ['src/App.tsx', 'src/components/Button.tsx'],
        mockManifest,
        mockFileCache
      );

      expect(result['src/App.tsx']).toEqual(mockFileCache['src/App.tsx']);
      expect(result['src/components/Button.tsx']).toEqual(mockFileCache['src/components/Button.tsx']);
    });

    it('should handle missing files gracefully', async () => {
      const result = await getFileContents(
        ['src/NonExistent.tsx'],
        mockManifest,
        mockFileCache
      );

      expect(result['src/NonExistent.tsx']).toBeUndefined();
    });

    it('should handle empty file list', async () => {
      const result = await getFileContents(
        [],
        mockManifest,
        mockFileCache
      );

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle null/undefined file cache', async () => {
      const result = await getFileContents(
        ['src/App.tsx'],
        mockManifest,
        null as any
      );

      expect(result['src/App.tsx']).toBeUndefined();
    });

    it('should handle undefined manifest', async () => {
      const result = await getFileContents(
        ['src/App.tsx'],
        undefined as any,
        mockFileCache
      );

      expect(result).toEqual({});
    });
  });

  describe('formatFilesForAI', () => {
    const mockFileContents = {
      'src/App.tsx': {
        content: 'export default function App() { return <div>Hello</div>; }',
        path: 'src/App.tsx',
      },
      'src/components/Button.tsx': {
        content: 'export function Button() { return <button>Click me</button>; }',
        path: 'src/components/Button.tsx',
      },
    };

    it('should format files for AI consumption', () => {
      const result = formatFilesForAI(mockFileContents);

      expect(result).toContain('src/App.tsx');
      expect(result).toContain('export default function App()');
      expect(result).toContain('src/components/Button.tsx');
      expect(result).toContain('export function Button()');
    });

    it('should handle empty file contents', () => {
      const result = formatFilesForAI({});

      expect(result).toBe('');
    });

    it('should handle files with no content', () => {
      const filesWithNoContent = {
        'src/Empty.tsx': {
          content: '',
          path: 'src/Empty.tsx',
        },
      };

      const result = formatFilesForAI(filesWithNoContent);

      expect(result).toContain('src/Empty.tsx');
    });

    it('should handle undefined/null content gracefully', () => {
      const filesWithNullContent = {
        'src/Null.tsx': {
          content: null as any,
          path: 'src/Null.tsx',
        },
        'src/Undefined.tsx': {
          content: undefined as any,
          path: 'src/Undefined.tsx',
        },
      };

      const result = formatFilesForAI(filesWithNullContent);

      expect(result).toContain('src/Null.tsx');
      expect(result).toContain('src/Undefined.tsx');
    });

    it('should format multiple files with proper separation', () => {
      const result = formatFilesForAI(mockFileContents);

      // Should have file separators
      const fileCount = Object.keys(mockFileContents).length;
      expect(result.split('```').length).toBeGreaterThan(fileCount);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed manifest data', async () => {
      const malformedManifest = {
        files: [
          { path: null as any, size: 100 },
          { path: '', size: -1 },
          { size: 200 } as any, // missing path
        ],
      };

      const result = await selectFilesForEdit(
        'Create a component',
        malformedManifest as any
      );

      // Should not crash and return reasonable defaults
      expect(Array.isArray(result.primaryFiles)).toBe(true);
      expect(Array.isArray(result.contextFiles)).toBe(true);
    });

    it('should handle very long file paths', async () => {
      const longPath = 'src/' + 'very-long-directory-name/'.repeat(20) + 'Component.tsx';
      const manifestWithLongPath: FileManifest = {
        files: {
          [longPath]: {
            content: 'export function Component() {}',
            type: 'component',
            lastModified: Date.now(),
            path: longPath,
            relativePath: longPath,
          }
        },
        routes: [],
        componentTree: {},
        entryPoint: 'src/App.tsx',
        styleFiles: [],
        timestamp: Date.now(),
      };

      const result = await selectFilesForEdit(
        'Update the component',
        manifestWithLongPath
      );

      expect(result.primaryFiles.some(path => path && path.includes('Component.tsx'))).toBe(true);
    });

    it('should handle prompts with special characters', async () => {
      const specialPrompt = 'Update the <Button/> component with émojis 🚀 and "quotes"';
      
      const result = await selectFilesForEdit(
        specialPrompt,
        {
          files: {
            'src/components/Button.tsx': {
              content: 'export function Button() {}',
              type: 'component',
              lastModified: Date.now(),
              path: 'src/components/Button.tsx',
              relativePath: 'src/components/Button.tsx',
            }
          },
          routes: [],
          componentTree: {},
          entryPoint: 'src/App.tsx',
          styleFiles: [],
          timestamp: Date.now(),
        } as FileManifest
      );

      // Should handle special characters without crashing
      expect(Array.isArray(result.primaryFiles)).toBe(true);
    });

    it('should handle extremely large file lists', async () => {
      const files: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        const path = `src/component-${i}.tsx`;
        files[path] = {
          content: `export function Component${i}() {}`,
          type: 'component',
          lastModified: Date.now(),
          path: path,
          relativePath: path,
        };
      }

      const largeManifest: FileManifest = {
        files,
        routes: [],
        componentTree: {},
        entryPoint: 'src/App.tsx',
        styleFiles: [],
        timestamp: Date.now(),
      };

      const result = await selectFilesForEdit(
        'Update components',
        largeManifest
      );

      // Should handle large file lists efficiently
      expect(Array.isArray(result.primaryFiles)).toBe(true);
      expect(Array.isArray(result.contextFiles)).toBe(true);
    });
  });
});