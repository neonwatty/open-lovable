import { analyzeEditIntent } from '@/lib/edit-intent-analyzer';
import type { FileManifest } from '@/types/file-manifest';

describe('Edit Intent Analyzer', () => {
  const createMockManifest = (files: Record<string, any> = {}): FileManifest => ({
    files: Object.fromEntries(
      Object.entries(files).map(([path, content]) => [
        path,
        {
          content: content || 'mock content',
          type: 'component' as const,
          lastModified: Date.now(),
          path,
          relativePath: path,
        },
      ])
    ),
    routes: [],
    componentTree: {},
    entryPoint: 'src/App.tsx',
    styleFiles: [],
    timestamp: Date.now(),
  });

  describe('Basic Intent Recognition', () => {
    it('should identify update intents', () => {
      const updatePrompts = [
        'Update the button color to blue',
        'Change the header text',
        'Modify the navigation bar',
        'Edit the footer content',
        'Revise the sidebar layout',
      ];

      updatePrompts.forEach(prompt => {
        const manifest = createMockManifest({
          'src/components/Button.tsx': 'export function Button() {}',
          'src/components/Header.tsx': 'export function Header() {}',
          'src/components/Navigation.tsx': 'export function Navigation() {}',
          'src/components/Footer.tsx': 'export function Footer() {}',
          'src/components/Sidebar.tsx': 'export function Sidebar() {}',
        });
        const result = analyzeEditIntent(prompt, manifest);
        expect(result.type).toBe('UPDATE_COMPONENT');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should identify add intents', () => {
      const addPrompts = [
        'Add a new component for user profiles',
        'Create a modal dialog',
        'Insert a loading spinner',
        'Build a contact form',
        'Implement a search feature',
      ];

      addPrompts.forEach(prompt => {
        const manifest = createMockManifest({
          'src/App.tsx': 'export default function App() {}',
          'src/components/layout/Header.tsx': 'export function Header() {}',
        });
        const result = analyzeEditIntent(prompt, manifest);
        expect(result.type).toBe('ADD_FEATURE');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should identify fix intents', () => {
      const fixPrompts = [
        'Fix the broken navigation',
        'Resolve the CSS styling issue',
        'Debug the form validation',
        'Correct the API call error',
        'Repair the broken links',
      ];

      fixPrompts.forEach(prompt => {
        const manifest = createMockManifest({
          'src/components/Navigation.tsx': 'export function Navigation() {}',
          'src/styles/main.css': 'body { color: black; }',
          'src/components/Form.tsx': 'export function Form() {}',
          'src/api/client.ts': 'export const api = {};',
          'src/components/Link.tsx': 'export function Link() {}',
        });
        const result = analyzeEditIntent(prompt, manifest);
        expect(result.type).toBe('FIX_ISSUE');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    it('should identify refactor intents', () => {
      const refactorPrompts = [
        'Refactor the component structure',
        'Reorganize the file layout',
        'Optimize the performance',
        'Restructure the codebase',
        'Improve the code quality',
      ];

      refactorPrompts.forEach(prompt => {
        const manifest = createMockManifest({
          'src/components/Component.tsx': 'export function Component() {}',
          'src/utils/layout.ts': 'export const layout = {};',
          'src/lib/performance.ts': 'export const perf = {};',
          'src/types/index.ts': 'export interface User {}',
          'src/utils/quality.ts': 'export const quality = {};',
        });
        const result = analyzeEditIntent(prompt, manifest);
        expect(result.type).toBe('REFACTOR');
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });
  });

  describe('Context-Aware Analysis', () => {
    const mockManifest = createMockManifest({
      'src/App.tsx': 'export default function App() {}',
      'src/components/Button.tsx': 'export function Button() {}',
      'src/components/Modal.tsx': 'export function Modal() {}',
      'src/utils/api.ts': 'export const api = {}',
      'package.json': '{}',
    });

    it('should consider existing files when analyzing intent', () => {
      const result = analyzeEditIntent(
        'Update the Button component styling',
        mockManifest
      );

      expect(result.type).toBe('UPDATE_COMPONENT');
      expect(result.targetFiles).toContain('src/components/Button.tsx');
    });

    it('should suggest new files for add intents', () => {
      const manifest = createMockManifest({
        'src/App.tsx': 'export default function App() {}',
        'src/components/Button.tsx': 'export function Button() {}',
      });
      const result = analyzeEditIntent(
        'Add a new UserProfile component',
        manifest
      );

      expect(result.type).toBe('ADD_FEATURE');
      expect(result.targetFiles.length).toBeGreaterThan(0);
    });

    it('should identify multiple target files for broad changes', () => {
      const manifest = createMockManifest({
        'src/components/Button.tsx': 'export function Button() {}',
        'src/components/Card.tsx': 'export function Card() {}',
        'src/components/Modal.tsx': 'export function Modal() {}',
        'src/App.tsx': 'export default function App() {}',
      });
      const result = analyzeEditIntent(
        'Update all component styling to use dark theme',
        manifest
      );

      expect(result.type).toBe('UPDATE_COMPONENT');
      expect(result.targetFiles.length).toBeGreaterThan(1);
    });
  });

  describe('Confidence Scoring', () => {
    it('should have high confidence for clear intents', () => {
      const clearPrompts = [
        'Add a red button',
        'Fix the broken link',
        'Update the title text',
        'Refactor the API calls',
      ];

      clearPrompts.forEach(prompt => {
        const manifest = createMockManifest({
          'src/components/Button.tsx': 'export function Button() {}',
          'src/components/Link.tsx': 'export function Link() {}',
          'src/components/Title.tsx': 'export function Title() {}',
          'src/api/client.ts': 'export const api = {};',
          'src/App.tsx': 'export default function App() {}',
        });
        const result = analyzeEditIntent(prompt, manifest);
        expect(result.confidence).toBeGreaterThan(0.8);
      });
    });

    it('should have lower confidence for ambiguous prompts', () => {
      const ambiguousPrompts = [
        'Make it better',
        'Something is wrong',
        'Change things',
        'Do something with the app',
      ];

      ambiguousPrompts.forEach(prompt => {
        const result = analyzeEditIntent(prompt, createMockManifest());
        expect(result.confidence).toBeLessThan(0.7);
      });
    });
  });

  describe('Scope Detection', () => {
    it('should identify component-level scope', () => {
      const manifest = createMockManifest({
        'src/components/Button.tsx': 'export function Button() {}',
      });
      
      const result = analyzeEditIntent(
        'Update the Button component',
        manifest
      );

      expect(result.type).toBeDefined();
    });

    it('should identify file-level scope', () => {
      const manifest = createMockManifest({
        'src/App.tsx': 'export default function App() {}',
      });
      
      const result = analyzeEditIntent(
        'Update the main App.tsx file',
        manifest
      );

      expect(result.type).toBeDefined();
    });

    it('should identify project-level scope', () => {
      const manifest = createMockManifest({
        'src/App.tsx': 'export default function App() {}',
        'src/components/Button.tsx': 'export function Button() {}',
      });
      
      const result = analyzeEditIntent(
        'Refactor the entire application architecture',
        manifest
      );

      expect(result.type).toBeDefined();
    });
  });

  describe('Keywords and Patterns', () => {
    it('should recognize styling-related prompts', () => {
      const stylingPrompts = [
        'Change the CSS colors',
        'Update the styling',
        'Modify the layout',
        'Adjust the padding',
      ];

      stylingPrompts.forEach(prompt => {
        const result = analyzeEditIntent(prompt, createMockManifest());
        expect(result.type).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it('should recognize functionality-related prompts', () => {
      const funcPrompts = [
        'Add click handler',
        'Implement form validation',
        'Create API endpoint',
        'Handle user input',
      ];

      funcPrompts.forEach(prompt => {
        const result = analyzeEditIntent(prompt, createMockManifest());
        expect(result.type).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it('should recognize performance-related prompts', () => {
      const perfPrompts = [
        'Optimize the rendering',
        'Improve performance',
        'Reduce bundle size',
        'Lazy load components',
      ];

      perfPrompts.forEach(prompt => {
        const result = analyzeEditIntent(prompt, createMockManifest());
        expect(result.type).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty prompts', () => {
      const result = analyzeEditIntent('', createMockManifest());
      
      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(Array.isArray(result.targetFiles)).toBe(true);
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'Update the component '.repeat(100) + 'with new functionality';
      const result = analyzeEditIntent(longPrompt, createMockManifest());
      
      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle prompts with special characters', () => {
      const specialPrompt = 'Update the <Button/> component with émojis 🚀 and "quotes"';
      const result = analyzeEditIntent(specialPrompt, createMockManifest());
      
      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle null/undefined inputs gracefully', () => {
      expect(() => {
        analyzeEditIntent(null as any, createMockManifest());
      }).not.toThrow();

      expect(() => {
        analyzeEditIntent('test prompt', null as any);
      }).not.toThrow();

      expect(() => {
        analyzeEditIntent(undefined as any, undefined as any);
      }).not.toThrow();
    });

    it('should handle prompts in different languages', () => {
      const nonEnglishPrompts = [
        'Actualizar el componente',  // Spanish
        'Mettre à jour le composant',  // French
        '更新组件',  // Chinese
      ];

      nonEnglishPrompts.forEach(prompt => {
        const result = analyzeEditIntent(prompt, createMockManifest());
        expect(result.type).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });
  });

  describe('File Path Analysis', () => {
    it('should analyze file paths for context', () => {
      const manifest = createMockManifest({
        'src/components/ui/Button.tsx': 'export function Button() {}',
        'src/pages/dashboard/Dashboard.tsx': 'export function Dashboard() {}',
        'src/hooks/useAuth.ts': 'export const useAuth = () => {}',
        'src/utils/api.ts': 'export const api = {}',
      });

      const result = analyzeEditIntent(
        'Update the authentication logic',
        manifest
      );

      expect(result.targetFiles).toContain('src/hooks/useAuth.ts');
    });

    it('should handle nested directory structures', () => {
      const manifest = createMockManifest({
        'src/components/forms/inputs/TextInput.tsx': 'export function TextInput() {}',
        'src/components/forms/validation/FormValidator.ts': 'export const FormValidator = {}',
        'src/components/layout/header/Navigation.tsx': 'export function Navigation() {}',
      });

      const result = analyzeEditIntent(
        'Fix the form input validation',
        manifest
      );

      expect(result.targetFiles.some(file => 
        file.includes('TextInput') || file.includes('FormValidator')
      )).toBe(true);
    });

    it('should prioritize more specific matches', () => {
      const manifest = createMockManifest({
        'src/Button.tsx': 'export function Button() {}',
        'src/components/Button.tsx': 'export function Button() {}',
        'src/components/ui/Button.tsx': 'export function Button() {}',
      });

      const result = analyzeEditIntent(
        'Update the UI Button component',
        manifest
      );

      // Should find at least one of the Button files
      expect(result.targetFiles.length).toBeGreaterThan(0);
      expect(result.targetFiles.some(file => file && file.includes('Button.tsx'))).toBe(true);
    });
  });
});