import fs from 'fs/promises';
import path from 'path';

// Test the Node.js fs operations that replaced Python subprocess calls
describe('File Operations Integration Tests', () => {
  const testDir = path.join(process.cwd(), '__test_temp__');
  
  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  test('should create directories recursively using fs.mkdir', async () => {
    const nestedPath = path.join(testDir, 'components', 'ui', 'buttons');
    
    // This mimics the fs.mkdir({ recursive: true }) operation from the route
    await fs.mkdir(nestedPath, { recursive: true });
    
    // Verify directory was created
    const stats = await fs.stat(nestedPath);
    expect(stats.isDirectory()).toBe(true);
  });

  test('should write files with UTF-8 encoding using fs.writeFile', async () => {
    const testContent = 'export default function TestComponent() { return <div>Test with émojis 🚀</div>; }';
    const filePath = path.join(testDir, 'TestComponent.jsx');
    
    // Create directory first
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // This mimics the fs.writeFile operation from the route
    await fs.writeFile(filePath, testContent, 'utf8');
    
    // Verify file was written correctly
    const writtenContent = await fs.readFile(filePath, 'utf8');
    expect(writtenContent).toBe(testContent);
  });

  test('should handle concurrent file operations safely', async () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      path: path.join(testDir, `Component${i}.jsx`),
      content: `export default function Component${i}() { return <div>Component ${i}</div>; }`
    }));

    // Create directory first
    await fs.mkdir(testDir, { recursive: true });

    // Write all files concurrently
    await Promise.all(files.map(file => 
      fs.writeFile(file.path, file.content, 'utf8')
    ));

    // Verify all files were written
    for (const file of files) {
      const content = await fs.readFile(file.path, 'utf8');
      expect(content).toBe(file.content);
    }
  });

  test('should handle file write errors gracefully', async () => {
    // Try to write to a path that doesn't exist and we can't create
    const invalidPath = '/invalid/path/that/cannot/be/created/file.jsx';
    
    await expect(fs.writeFile(invalidPath, 'test content', 'utf8')).rejects.toThrow();
  });

  test('should preserve special characters in file content', async () => {
    const specialContent = `
      // File with special characters
      const message = "Hello 🌍 World!";
      const symbols = "¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿";
      const unicode = "Unicode: αβγδεζηθικλμνξοπρστυφχψω";
      export default function SpecialComponent() {
        return <div>{message} {symbols} {unicode}</div>;
      }
    `;
    
    const filePath = path.join(testDir, 'SpecialComponent.jsx');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, specialContent, 'utf8');
    
    const readContent = await fs.readFile(filePath, 'utf8');
    expect(readContent).toBe(specialContent);
  });

  test('should handle nested directory structures', async () => {
    const nestedFiles = [
      { path: 'src/components/ui/Button.jsx', content: 'Button component' },
      { path: 'src/pages/Home.jsx', content: 'Home page' },
      { path: 'public/images/logo.svg', content: '<svg>Logo</svg>' },
      { path: 'lib/utils/helpers.js', content: 'Helper functions' }
    ];

    for (const file of nestedFiles) {
      const fullPath = path.join(testDir, file.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, 'utf8');
    }

    // Verify all files exist and have correct content
    for (const file of nestedFiles) {
      const fullPath = path.join(testDir, file.path);
      const content = await fs.readFile(fullPath, 'utf8');
      expect(content).toBe(file.content);
    }
  });
});