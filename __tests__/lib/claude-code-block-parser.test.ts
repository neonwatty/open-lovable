/**
 * @jest-environment node
 */

import { 
  parseMarkdownCodeBlocks, 
  parseClaudeCodeResponse,
  formatParseResults 
} from '../../lib/claude-code-block-parser';

describe('Claude Code Block Parser', () => {
  describe('parseMarkdownCodeBlocks', () => {
    it('should parse simple code blocks', () => {
      const markdown = `
# Test

\`\`\`javascript
console.log('hello world');
\`\`\`

Some text.

\`\`\`typescript
const message: string = 'hello';
\`\`\`
      `;

      const result = parseMarkdownCodeBlocks(markdown);
      
      expect(result.codeBlocks).toHaveLength(2);
      expect(result.codeBlocks[0].language).toBe('javascript');
      expect(result.codeBlocks[0].content).toBe("console.log('hello world');");
      expect(result.codeBlocks[1].language).toBe('typescript');
      expect(result.metadata.languages).toEqual(['javascript', 'typescript']);
    });

    it('should handle unclosed code blocks', () => {
      const markdown = `
\`\`\`javascript
console.log('start');
// This block is never closed
      `;

      const result = parseMarkdownCodeBlocks(markdown);
      
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.metadata.errors).toContain('Unclosed code block starting at line 2');
    });

    it('should extract XML-style file tags', () => {
      const markdown = `
<file path="src/App.jsx">
import React from 'react';

export default function App() {
  return <div>Hello World</div>;
}
</file>

<file path="src/utils.ts" operation="update">
export const helper = () => 'helper';
</file>
      `;

      const result = parseMarkdownCodeBlocks(markdown);
      
      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('src/App.jsx');
      expect(result.files[0].operation).toBe('create');
      expect(result.files[0].language).toBe('javascript');
      expect(result.files[1].path).toBe('src/utils.ts');
      expect(result.files[1].operation).toBe('update');
      expect(result.files[1].language).toBe('typescript');
    });

    it('should infer filenames from context', () => {
      const markdown = `
## src/components/Button.jsx

Here's the Button component:

\`\`\`javascript
import React from 'react';

export default function Button({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}
\`\`\`
      `;

      const result = parseMarkdownCodeBlocks(markdown);
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/components/Button.jsx');
      expect(result.files[0].language).toBe('javascript');
    });

    it('should detect various file extensions', () => {
      const markdown = `
<file path="script.py">
print("Hello Python")
</file>

<file path="styles.css">
.button { color: blue; }
</file>

<file path="config.json">
{"name": "test"}
</file>
      `;

      const result = parseMarkdownCodeBlocks(markdown);
      
      expect(result.files).toHaveLength(3);
      expect(result.files[0].language).toBe('python');
      expect(result.files[1].language).toBe('css');
      expect(result.files[2].language).toBe('json');
    });

    it('should validate file content', () => {
      const markdown = `
<file path="broken.js">
function test() {
  console.log('missing closing brace'
</file>

<file path="empty.js">
</file>
      `;

      const result = parseMarkdownCodeBlocks(markdown);
      
      expect(result.metadata.warnings.length).toBeGreaterThan(0);
      expect(result.metadata.warnings.some(w => w.includes('very short content'))).toBe(true);
    });

    it('should prevent path traversal', () => {
      const markdown = `
<file path="../../../etc/passwd">
malicious content
</file>
      `;

      const result = parseMarkdownCodeBlocks(markdown);
      
      expect(result.metadata.errors.some(e => e.includes('path traversal'))).toBe(true);
    });
  });

  describe('parseClaudeCodeResponse', () => {
    it('should parse complex Claude Code responses', () => {
      const response = `
# Generated Components

I'll create the following components for you:

<file path="src/App.jsx">
import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
    </div>
  );
}
</file>

<file path="src/components/Header.jsx">
import React from 'react';

export default function Header() {
  return (
    <header className="bg-blue-600 text-white p-4">
      <h1>My App</h1>
    </header>
  );
}
</file>

## Explanation

Created a simple React app with header and hero components.
      `;

      const result = parseClaudeCodeResponse(response);
      
      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('src/App.jsx');
      expect(result.files[1].path).toBe('src/components/Header.jsx');
      expect(result.metadata.filesExtracted).toBe(2);
      expect(result.metadata.errors).toHaveLength(0);
    });
  });

  describe('formatParseResults', () => {
    it('should format results for logging', () => {
      const result = {
        files: [
          {
            path: 'test.js',
            content: 'console.log("test");',
            language: 'javascript',
            operation: 'create' as const,
            sourceBlock: {
              content: 'console.log("test");',
              startLine: 0,
              endLine: 0
            }
          }
        ],
        codeBlocks: [],
        metadata: {
          totalBlocks: 1,
          filesExtracted: 1,
          languages: ['javascript'],
          errors: [],
          warnings: ['Test warning']
        }
      };

      const formatted = formatParseResults(result);
      
      expect(formatted).toContain('Files extracted: 1');
      expect(formatted).toContain('Languages: javascript');
      expect(formatted).toContain('Test warning');
      expect(formatted).toContain('test.js (create, javascript)');
    });
  });
});