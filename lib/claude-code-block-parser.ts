/**
 * Claude Code Block Parser
 * 
 * Robust markdown parser for extracting code blocks and file paths from Claude Code responses.
 * Handles various markdown formats, code block styles, and edge cases.
 */

export interface CodeBlock {
  content: string;
  language?: string;
  filename?: string;
  startLine: number;
  endLine: number;
  metadata?: {
    operation?: 'create' | 'update' | 'delete';
    description?: string;
    tags?: string[];
  };
}

export interface FileExtraction {
  path: string;
  content: string;
  language?: string;
  operation: 'create' | 'update' | 'delete';
  sourceBlock: CodeBlock;
}

export interface ParseResult {
  files: FileExtraction[];
  codeBlocks: CodeBlock[];
  metadata: {
    totalBlocks: number;
    filesExtracted: number;
    languages: string[];
    errors: string[];
    warnings: string[];
  };
}

/**
 * Main parser function that extracts code blocks from markdown text
 */
export function parseMarkdownCodeBlocks(markdown: string): ParseResult {
  const lines = markdown.split('\n');
  const codeBlocks: CodeBlock[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  
  let currentBlock: Partial<CodeBlock> | null = null;
  let inCodeBlock = false;
  let blockStartLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check for code block start
    if (trimmedLine.startsWith('```')) {
      if (inCodeBlock && currentBlock) {
        // End of current block
        currentBlock.endLine = i;
        codeBlocks.push(currentBlock as CodeBlock);
        currentBlock = null;
        inCodeBlock = false;
      } else {
        // Start of new block
        const language = extractLanguageFromFence(trimmedLine);
        currentBlock = {
          content: '',
          language,
          startLine: i,
          endLine: -1
        };
        blockStartLine = i;
        inCodeBlock = true;
      }
    } else if (inCodeBlock && currentBlock) {
      // Add line to current block
      if (currentBlock.content) {
        currentBlock.content += '\n';
      }
      currentBlock.content += line;
    }
  }
  
  // Handle unclosed code block
  if (inCodeBlock && currentBlock) {
    errors.push(`Unclosed code block starting at line ${blockStartLine + 1}`);
    currentBlock.endLine = lines.length - 1;
    codeBlocks.push(currentBlock as CodeBlock);
  }
  
  // Check for invalid XML file paths before extraction
  const fileRegex = /<file\s+path="([^"]+)"(?:\s+operation="[^"]*")?>/g;
  let match;
  while ((match = fileRegex.exec(markdown)) !== null) {
    const filePath = match[1];
    if (!isValidFilePath(filePath)) {
      if (filePath.includes('../') || filePath.includes('..\\') || filePath.startsWith('../')) {
        errors.push(`File ${filePath} contains path traversal`);
      } else {
        errors.push(`Invalid file path: ${filePath}`);
      }
    }
  }
  
  // Extract files from XML-style tags
  const xmlFiles = extractXmlFiles(markdown);
  
  // Extract files from code blocks with file annotations
  const annotatedFiles = extractAnnotatedFiles(codeBlocks, markdown);
  
  // Combine all file extractions
  const allFiles = [...xmlFiles, ...annotatedFiles];
  
  // Deduplicate files by path (prefer XML format over annotated)
  const uniqueFiles = deduplicateFiles(allFiles);
  
  // Collect metadata
  const languages = Array.from(new Set(codeBlocks.map(b => b.language).filter(Boolean))) as string[];
  
  const result = {
    files: uniqueFiles,
    codeBlocks,
    metadata: {
      totalBlocks: codeBlocks.length,
      filesExtracted: uniqueFiles.length,
      languages,
      errors,
      warnings
    }
  };
  
  // Run validation on the result
  return validateParseResult(result);
}

/**
 * Extract language identifier from code fence
 */
function extractLanguageFromFence(fenceLine: string): string | undefined {
  const match = fenceLine.match(/^```(\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Extract files from XML-style <file> tags
 */
function extractXmlFiles(markdown: string): FileExtraction[] {
  const files: FileExtraction[] = [];
  
  // Match <file path="...">content</file> patterns
  const fileRegex = /<file\s+path="([^"]+)"(?:\s+operation="(create|update|delete)")?>([\s\S]*?)<\/file>/g;
  let match;
  
  while ((match = fileRegex.exec(markdown)) !== null) {
    const filePath = match[1];
    const operation = (match[2] as 'create' | 'update' | 'delete') || 'create';
    const content = match[3].trim();
    
    // Skip invalid file paths - they will be caught by validation later
    if (!isValidFilePath(filePath)) {
      continue;
    }
    
    // Determine language from file extension
    const language = getLanguageFromPath(filePath);
    
    // Create a code block for this file
    const sourceBlock: CodeBlock = {
      content,
      language,
      filename: filePath,
      startLine: 0,
      endLine: content.split('\n').length - 1,
      metadata: {
        operation,
        description: `File: ${filePath}`
      }
    };
    
    files.push({
      path: filePath,
      content,
      language,
      operation,
      sourceBlock
    });
  }
  
  return files;
}

/**
 * Extract files from code blocks with filename annotations
 */
function extractAnnotatedFiles(codeBlocks: CodeBlock[], markdown: string): FileExtraction[] {
  const files: FileExtraction[] = [];
  
  for (const block of codeBlocks) {
    const filename = extractFilenameFromBlock(block, markdown);
    if (filename) {
      files.push({
        path: filename,
        content: block.content,
        language: block.language || getLanguageFromPath(filename),
        operation: 'create', // Default operation for annotated files
        sourceBlock: block
      });
    }
  }
  
  return files;
}

/**
 * Extract filename from code block context
 */
function extractFilenameFromBlock(block: CodeBlock, markdown: string): string | undefined {
  const lines = markdown.split('\n');
  
  // Check lines before the code block for file path annotations
  for (let i = Math.max(0, block.startLine - 5); i < block.startLine; i++) {
    const line = lines[i];
    
    // Look for various filename patterns
    const patterns = [
      /##\s+([a-zA-Z0-9_\-\/\.]+\.[a-zA-Z0-9]+)/, // Markdown header with filename (most specific first)
      /#\s+([a-zA-Z0-9_\-\/\.]+\.[a-zA-Z0-9]+)/, // Markdown header with filename
      /File:\s*([^\s]+)/, // "File: filename"
      /Path:\s*([^\s]+)/, // "Path: filename"
      /\/\/\s*([a-zA-Z0-9_\-\/\.]+\.[a-zA-Z0-9]+)/, // Comment with filename
      /(?:^|\s)([a-zA-Z0-9_\-\/\.]+\.[a-zA-Z0-9]+)(?:\s|$)/, // Simple filename (least specific last)
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && isValidFilePath(match[1])) {
        return match[1];
      }
    }
  }
  
  // If no filename found in context, check if the block content itself contains path hints
  const contentLines = block.content.split('\n').slice(0, 5); // Check first 5 lines
  for (const line of contentLines) {
    const trimmed = line.trim();
    
    // Look for import/export statements that might hint at the filename
    const importMatch = trimmed.match(/(?:import|export).*from\s*['"]\.\/([^'"]+)['"]/) ||
                       trimmed.match(/(?:import|export).*['"]\.\/([^'"]+)['"]/);
    if (importMatch) {
      const path = importMatch[1];
      if (!path.includes('.')) {
        // Add common extensions based on language
        if (block.language === 'typescript' || block.language === 'ts') {
          return `${path}.ts`;
        } else if (block.language === 'javascript' || block.language === 'js') {
          return `${path}.js`;
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Validate if a string looks like a valid file path
 */
function isValidFilePath(path: string): boolean {
  // Basic validation for file paths
  return /^[a-zA-Z0-9_\-\/\.]+\.[a-zA-Z0-9]+$/.test(path) &&
         !path.includes('../') && // Prevent path traversal
         !path.includes('..\\') && // Prevent Windows path traversal
         !path.startsWith('../') && // Prevent relative path traversal
         path.length < 500; // Reasonable length limit
}

/**
 * Get programming language from file path extension
 */
function getLanguageFromPath(path: string): string | undefined {
  const extension = path.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'json': 'json',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml',
    'xml': 'xml',
    'sh': 'bash',
    'bash': 'bash',
    'sql': 'sql',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp'
  };
  
  return extension ? languageMap[extension] : undefined;
}

/**
 * Remove duplicate files, preferring XML format over annotated
 */
function deduplicateFiles(files: FileExtraction[]): FileExtraction[] {
  const fileMap = new Map<string, FileExtraction>();
  
  for (const file of files) {
    const existing = fileMap.get(file.path);
    
    if (!existing) {
      fileMap.set(file.path, file);
    } else {
      // Prefer XML format (has explicit filename) over annotated (inferred filename)
      if (existing.sourceBlock.filename && !file.sourceBlock.filename) {
        // Keep existing XML format
        continue;
      } else if (!existing.sourceBlock.filename && file.sourceBlock.filename) {
        // Replace with XML format
        fileMap.set(file.path, file);
      } else {
        // Both same format, keep the first one but warn
        // Could implement more sophisticated conflict resolution here
      }
    }
  }
  
  return Array.from(fileMap.values());
}

/**
 * Advanced parsing for complex markdown structures
 */
export function parseAdvancedMarkdown(markdown: string): ParseResult {
  const result = parseMarkdownCodeBlocks(markdown);
  
  // Additional processing for complex cases
  result.files = enhanceFileOperations(result.files, markdown);
  result.codeBlocks = enhanceCodeBlocks(result.codeBlocks, markdown);
  
  return result;
}

/**
 * Enhance file operations by analyzing surrounding context
 */
function enhanceFileOperations(files: FileExtraction[], markdown: string): FileExtraction[] {
  return files.map(file => {
    const operation = inferFileOperation(file, markdown);
    return {
      ...file,
      operation
    };
  });
}

/**
 * Infer file operation from context
 */
function inferFileOperation(file: FileExtraction, markdown: string): 'create' | 'update' | 'delete' {
  const lines = markdown.split('\n');
  
  // Look for operation keywords near the file
  for (let i = Math.max(0, file.sourceBlock.startLine - 5); i <= Math.min(lines.length - 1, file.sourceBlock.endLine + 5); i++) {
    const line = lines[i].toLowerCase();
    
    if (line.includes('delete') || line.includes('remove')) {
      return 'delete';
    } else if (line.includes('update') || line.includes('modify') || line.includes('edit') || line.includes('change')) {
      return 'update';
    } else if (line.includes('create') || line.includes('add') || line.includes('new')) {
      return 'create';
    }
  }
  
  return file.operation; // Keep existing operation
}

/**
 * Enhance code blocks with additional metadata
 */
function enhanceCodeBlocks(codeBlocks: CodeBlock[], markdown: string): CodeBlock[] {
  return codeBlocks.map(block => {
    const metadata = extractBlockMetadata(block, markdown);
    return {
      ...block,
      metadata: {
        ...block.metadata,
        ...metadata
      }
    };
  });
}

/**
 * Extract metadata from code block context
 */
function extractBlockMetadata(block: CodeBlock, markdown: string): Partial<CodeBlock['metadata']> {
  const lines = markdown.split('\n');
  const metadata: Partial<CodeBlock['metadata']> = {};
  
  // Look for description in lines before the block
  for (let i = Math.max(0, block.startLine - 3); i < block.startLine; i++) {
    const line = lines[i].trim();
    
    // Extract description from markdown headers or comments
    if (line.startsWith('#') || line.startsWith('//') || line.startsWith('/*')) {
      metadata.description = line.replace(/^#+\s*/, '').replace(/^\/\/\s*/, '').replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '');
      break;
    }
  }
  
  // Extract tags from content
  const tags: string[] = [];
  const content = block.content.toLowerCase();
  
  if (content.includes('react') || content.includes('jsx')) tags.push('react');
  if (content.includes('typescript') || block.language === 'typescript') tags.push('typescript');
  if (content.includes('test') || content.includes('spec')) tags.push('test');
  if (content.includes('component')) tags.push('component');
  if (content.includes('api') || content.includes('endpoint')) tags.push('api');
  if (content.includes('util') || content.includes('helper')) tags.push('utility');
  
  if (tags.length > 0) {
    metadata.tags = tags;
  }
  
  return metadata;
}

/**
 * Parse and validate Claude Code response format
 */
export function parseClaudeCodeResponse(response: string): ParseResult {
  // First try to parse as structured markdown
  let result = parseAdvancedMarkdown(response);
  
  // If no files found, try legacy XML parsing
  if (result.files.length === 0) {
    const xmlFiles = extractXmlFiles(response);
    if (xmlFiles.length > 0) {
      result.files = xmlFiles;
      result.metadata.filesExtracted = xmlFiles.length;
      result.metadata.warnings.push('Used legacy XML parsing as fallback');
    }
  }
  
  // Validate results
  result = validateParseResult(result);
  
  return result;
}

/**
 * Validate parse results and add warnings for potential issues
 */
function validateParseResult(result: ParseResult): ParseResult {
  const warnings = [...result.metadata.warnings];
  const errors = [...result.metadata.errors];
  
  // Check for potential issues
  for (const file of result.files) {
    // Check for suspiciously short files
    if (file.content.trim().length < 10) {
      warnings.push(`File ${file.path} has very short content`);
    }
    
    // Check for completely empty files
    if (file.content.trim().length === 0) {
      warnings.push(`File ${file.path} is empty`);
    }
    
    // Check for unmatched braces in JavaScript/TypeScript files
    if (file.language === 'javascript' || file.language === 'typescript') {
      const openBraces = (file.content.match(/{/g) || []).length;
      const closeBraces = (file.content.match(/}/g) || []).length;
      
      if (Math.abs(openBraces - closeBraces) > 2) {
        warnings.push(`File ${file.path} may have unmatched braces`);
      }
    }
    
    // Check for file path issues - be more thorough
    if (file.path.includes('../') || file.path.includes('..\\') || file.path.startsWith('../')) {
      errors.push(`File ${file.path} contains path traversal`);
    }
    
    if (file.path.length > 255) {
      warnings.push(`File ${file.path} has very long path name`);
    }
  }
  
  return {
    ...result,
    metadata: {
      ...result.metadata,
      warnings,
      errors
    }
  };
}

/**
 * Utility function to format parse results for logging
 */
export function formatParseResults(result: ParseResult): string {
  const { files, codeBlocks, metadata } = result;
  
  let output = `Parse Results:\n`;
  output += `- Files extracted: ${metadata.filesExtracted}\n`;
  output += `- Code blocks: ${metadata.totalBlocks}\n`;
  output += `- Languages: ${metadata.languages.join(', ')}\n`;
  
  if (metadata.errors.length > 0) {
    output += `\nErrors:\n`;
    metadata.errors.forEach(error => output += `  - ${error}\n`);
  }
  
  if (metadata.warnings.length > 0) {
    output += `\nWarnings:\n`;
    metadata.warnings.forEach(warning => output += `  - ${warning}\n`);
  }
  
  if (files.length > 0) {
    output += `\nFiles:\n`;
    files.forEach(file => {
      output += `  - ${file.path} (${file.operation}, ${file.language || 'unknown'})\n`;
    });
  }
  
  return output;
}