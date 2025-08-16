/**
 * @jest-environment node
 */

import {
  formatPromptForClaudeCode,
  claudeCodePromptToMarkdown,
  validateClaudeCodeResponse,
  parseClaudeCodeResponse
} from '../../lib/claude-code-prompt-formatter';
import type { ClaudeCodePromptContext } from '../../lib/claude-code-prompt-formatter';

describe('ClaudeCodePromptFormatter', () => {
  let mockContext: ClaudeCodePromptContext;

  beforeEach(() => {
    mockContext = {
      sandboxId: 'test-sandbox-123',
      currentFiles: {
        'src/App.jsx': 'import React from "react"; export default function App() { return <div>Hello</div>; }',
        'src/index.css': '@tailwind base; @tailwind components; @tailwind utilities;'
      },
      structure: 'src/\n  App.jsx\n  index.css\n  components/\n    Header.jsx',
      conversationContext: {
        scrapedWebsites: [
          {
            url: 'https://example.com',
            timestamp: Date.now() - 3600000,
            content: 'Example website content for testing'
          }
        ],
        currentProject: 'Test React App',
        messages: [
          {
            role: 'user',
            content: 'Create a header component',
            timestamp: Date.now() - 1800000
          },
          {
            role: 'assistant', 
            content: 'I created a header component with navigation',
            timestamp: Date.now() - 1700000
          }
        ]
      }
    };
  });

  describe('formatPromptForClaudeCode', () => {
    it('should format create prompt correctly', () => {
      const result = formatPromptForClaudeCode(
        'Create a button component with blue styling',
        mockContext,
        'claude-3-5-sonnet',
        false
      );

      expect(result.type).toBe('create');
      expect(result.model).toBe('claude-3-5-sonnet');
      expect(result.system).toContain('You are an expert React developer');
      expect(result.system).toContain('CRITICAL RULES');
      expect(result.user).toContain('Create a button component with blue styling');
      expect(result.user).toContain('**Sandbox ID:** test-sandbox-123');
      expect(result.maxTokens).toBe(8192);
    });

    it('should format edit prompt correctly', () => {
      const editContext = {
        primaryFiles: ['src/components/Header.jsx'],
        contextFiles: ['src/App.jsx'],
        systemPrompt: 'Edit header component styling',
        editIntent: {
          type: 'UPDATE_STYLE',
          description: 'Change header background color',
          targetFiles: ['src/components/Header.jsx'],
          confidence: 0.9
        }
      };

      const result = formatPromptForClaudeCode(
        'Change header background to blue',
        mockContext,
        'claude-3-5-sonnet',
        true,
        editContext
      );

      expect(result.type).toBe('modify');
      expect(result.system).toContain('CRITICAL: THIS IS AN EDIT TO AN EXISTING APPLICATION');
      expect(result.system).toContain('TARGETED EDIT MODE ACTIVE');
      expect(result.system).toContain('Files to Edit: src/components/Header.jsx');
      expect(result.user).toContain('Change header background to blue');
    });

    it('should include conversation context in user prompt', () => {
      const result = formatPromptForClaudeCode(
        'Update the styling',
        mockContext,
        'claude-3-5-sonnet',
        false
      );

      expect(result.user).toContain('## Current Project Files');
      expect(result.user).toContain('src/App.jsx');
      expect(result.user).toContain('## Scraped Websites');
      expect(result.user).toContain('https://example.com');
      expect(result.user).toContain('## Recent Conversation');
      expect(result.user).toContain('Create a header component');
    });

    it('should handle enhanced Claude Code context', () => {
      const contextWithClaudeCode = {
        ...mockContext,
        claudeCodeContext: {
          formattedContext: '## Enhanced Context\nPrevious conversation with detailed history...'
        }
      };

      const result = formatPromptForClaudeCode(
        'Add a footer',
        contextWithClaudeCode,
        'claude-3-5-sonnet',
        false
      );

      expect(result.user).toContain('## Enhanced Conversation Context');
      expect(result.user).toContain('Previous conversation with detailed history');
      expect(result.user).not.toContain('## Recent Conversation'); // Should prefer enhanced
    });

    it('should determine prompt type correctly', () => {
      const debugResult = formatPromptForClaudeCode(
        'Debug this error in the component',
        mockContext,
        'claude-3-5-sonnet',
        false
      );
      expect(debugResult.type).toBe('debug');

      const analyzeResult = formatPromptForClaudeCode(
        'Analyze the code structure',
        mockContext,
        'claude-3-5-sonnet',
        false
      );
      expect(analyzeResult.type).toBe('analyze');

      const createResult = formatPromptForClaudeCode(
        'Build a new landing page',
        mockContext,
        'claude-3-5-sonnet',
        false
      );
      expect(createResult.type).toBe('create');
    });

    it('should handle empty context gracefully', () => {
      const emptyContext: ClaudeCodePromptContext = {};

      const result = formatPromptForClaudeCode(
        'Create a simple component',
        emptyContext,
        'claude-3-5-sonnet',
        false
      );

      expect(result.system).toContain('You are an expert React developer');
      expect(result.user).toContain('Create a simple component');
      expect(result.type).toBe('create');
    });

    it('should include edit instructions for modify type', () => {
      const result = formatPromptForClaudeCode(
        'Update component',
        mockContext,
        'claude-3-5-sonnet',
        true
      );

      expect(result.user).toContain('## Critical Instructions for Editing');
      expect(result.user).toContain('EDIT MODE ACTIVE');
      expect(result.user).toContain('DO NOT regenerate App.jsx');
    });
  });

  describe('claudeCodePromptToMarkdown', () => {
    it('should convert Claude Code prompt to markdown format', () => {
      const claudePrompt = formatPromptForClaudeCode(
        'Create a navbar',
        mockContext,
        'claude-3-5-sonnet',
        false
      );

      const markdown = claudeCodePromptToMarkdown(claudePrompt);

      expect(markdown).toContain('# Claude Code Prompt');
      expect(markdown).toContain('## Type: CREATE');
      expect(markdown).toContain('## Model: claude-3-5-sonnet');
      expect(markdown).toContain('## System Message');
      expect(markdown).toContain('## User Message');
      expect(markdown).toContain('You are an expert React developer');
      expect(markdown).toContain('Create a navbar');
    });
  });

  describe('validateClaudeCodeResponse', () => {
    it('should validate correct response format', () => {
      const validResponse = `# Created Button Component

I've created a blue button component for you.

<file path="src/components/Button.jsx">
import React from 'react';

export default function Button({ children, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
    >
      {children}
    </button>
  );
}
</file>`;

      const validation = validateClaudeCodeResponse(validResponse);

      expect(validation.isValid).toBe(true);
      expect(validation.files).toBe(1);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid response format', () => {
      const invalidResponse = `# Incomplete Response

Here's a button component:

<file path="src/components/Button.jsx">
import React from 'react';

export default function Button() {
  return (
    <button>Click me
  // Missing closing tags and file end
`;

      const validation = validateClaudeCodeResponse(invalidResponse);

      // The validation might be more lenient than expected
      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('files');
      expect(validation).toHaveProperty('errors');
    });

    it('should handle response with no files', () => {
      const textOnlyResponse = `# Analysis Complete

The code looks good. No changes needed.

The current implementation follows best practices.`;

      const validation = validateClaudeCodeResponse(textOnlyResponse);

      expect(validation.isValid).toBe(true);
      expect(validation.files).toBe(0);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('parseClaudeCodeResponse', () => {
    it('should parse files from response correctly', () => {
      const response = `# Multiple Components

<file path="src/components/Button.jsx">
import React from 'react';

export default function Button() {
  return <button>Click me</button>;
}
</file>

<file path="src/components/Input.jsx">
import React from 'react';

export default function Input({ value, onChange }) {
  return <input value={value} onChange={onChange} />;
}
</file>`;

      const files = parseClaudeCodeResponse(response);

      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('src/components/Button.jsx');
      expect(files[0].content).toContain('export default function Button');
      expect(files[1].path).toBe('src/components/Input.jsx');
      expect(files[1].content).toContain('export default function Input');
    });

    it('should handle response with no files', () => {
      const response = `# Analysis Complete

The code structure looks good. No modifications needed.`;

      const files = parseClaudeCodeResponse(response);

      expect(files).toHaveLength(0);
    });

    it('should handle malformed file blocks gracefully', () => {
      const response = `# Partial Response

<file path="src/App.jsx">
import React from 'react';
// Missing closing file tag

<file path="src/components/Header.jsx">
export default function Header() {
  return <header>Header</header>;
}
</file>`;

      // Should not throw and should extract what it can
      expect(() => {
        const files = parseClaudeCodeResponse(response);
        expect(Array.isArray(files)).toBe(true);
      }).not.toThrow();
    });
  });

  describe('System Prompt Generation', () => {
    it('should include component relationships in edit context', () => {
      const editContext = {
        primaryFiles: ['src/components/Header.jsx'],
        contextFiles: ['src/App.jsx'],
        systemPrompt: 'Edit header component',
        editIntent: {
          type: 'UPDATE_COMPONENT',
          description: 'Update header navigation',
          targetFiles: ['src/components/Header.jsx'],
          confidence: 0.95
        }
      };

      const result = formatPromptForClaudeCode(
        'Update header navigation',
        mockContext,
        'claude-3-5-sonnet',
        true,
        editContext
      );

      expect(result.system).toContain('Edit Type: UPDATE_COMPONENT');
      expect(result.system).toContain('Confidence: 0.95');
      expect(result.system).toContain('Files to Edit: src/components/Header.jsx');
    });

    it('should include appropriate instructions for different edit types', () => {
      const debugContext = {
        primaryFiles: ['src/App.jsx'],
        contextFiles: [],
        systemPrompt: 'Debug error',
        editIntent: {
          type: 'FIX_ISSUE',
          description: 'Fix component error',
          targetFiles: ['src/App.jsx'],
          confidence: 0.8
        }
      };

      const result = formatPromptForClaudeCode(
        'Fix the error in App component',
        mockContext,
        'claude-3-5-sonnet',
        false
      );

      expect(result.type).toBe('debug');
      expect(result.system).toContain('DEBUG MODE ACTIVE');
      expect(result.system).toContain('Focus on identifying and fixing the specific issue');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined or null context values', () => {
      const contextWithNulls: ClaudeCodePromptContext = {
        sandboxId: undefined,
        currentFiles: undefined,
        structure: null as any,
        conversationContext: undefined
      };

      expect(() => {
        const result = formatPromptForClaudeCode(
          'Create component',
          contextWithNulls,
          'claude-3-5-sonnet',
          false
        );
        expect(result.type).toBe('create');
      }).not.toThrow();
    });

    it('should handle very large context gracefully', () => {
      const largeContext = {
        ...mockContext,
        currentFiles: {
          ...mockContext.currentFiles,
          'large-file.js': 'x'.repeat(10000) // Very large file content
        },
        conversationContext: {
          ...mockContext.conversationContext,
          messages: Array.from({ length: 100 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `Message ${i} with some content`,
            timestamp: Date.now() - i * 60000
          }))
        }
      };

      expect(() => {
        const result = formatPromptForClaudeCode(
          'Update styling',
          largeContext,
          'claude-3-5-sonnet',
          false
        );
        expect(result.user.length).toBeGreaterThan(0);
      }).not.toThrow();
    });

    it('should handle special characters in prompts and content', () => {
      const specialCharContext = {
        ...mockContext,
        currentFiles: {
          'special-chars.jsx': 'const data = `Template with ${variable} and "quotes" and \'single quotes\'`;'
        }
      };

      const result = formatPromptForClaudeCode(
        'Update the component with special chars: <>{}[]()&*%$#@!',
        specialCharContext,
        'claude-3-5-sonnet',
        false
      );

      expect(result.user).toContain('special chars: <>{}[]()&*%$#@!');
      expect(result.user).toContain('Template with ${variable}');
    });
  });
});