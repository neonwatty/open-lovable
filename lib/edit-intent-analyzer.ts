import { FileManifest, EditType, EditIntent, IntentPattern } from '@/types/file-manifest';

/**
 * Analyze user prompts to determine edit intent and select relevant files
 */
export function analyzeEditIntent(
  prompt: string,
  manifest: FileManifest
): EditIntent {
  // Handle undefined or null manifest
  if (!manifest || !manifest.files) {
    return {
      type: EditType.ADD_FEATURE,
      description: 'Creating new files due to empty manifest',
      confidence: 0.5,
      targetFiles: [],
      suggestedContext: []
    };
  }

  // Handle undefined or null prompt
  if (!prompt || typeof prompt !== 'string') {
    return {
      type: EditType.UPDATE_COMPONENT,
      description: 'Empty or invalid prompt',
      confidence: 0.1,
      targetFiles: [],
      suggestedContext: []
    };
  }

  const lowerPrompt = prompt.toLowerCase();
  
  // Define intent patterns
  const patterns: IntentPattern[] = [
    {
      patterns: [
        /update\s+(the\s+)?(\w+)\s+(component|section|page)/i,
        /update\s+(the\s+)?.*?(component|section|page)/i,
        /update\s+(the\s+)?(\w+)\s+(logic|code|function|method|functionality)/i,
        /update\s+(the\s+)?(\w+)/i,
        /change\s+(the\s+)?(\w+)/i,
        /modify\s+(the\s+)?(\w+)/i,
        /edit\s+(the\s+)?(\w+)/i,
        /revise\s+(the\s+)?(\w+)/i,
        /fix\s+(the\s+)?(\w+)\s+(styling|style|css|layout)/i,
        /remove\s+.*\s+(button|link|text|element|section)/i,
        /delete\s+.*\s+(button|link|text|element|section)/i,
        /hide\s+.*\s+(button|link|text|element|section)/i,
      ],
      type: EditType.UPDATE_COMPONENT,
      fileResolver: (p, m) => findComponentByContent(p, m),
    },
    {
      patterns: [
        /add\s+(a\s+)?new\s+(\w+)\s+(page|section|feature|component)/i,
        /create\s+(a\s+)?(\w+)\s+(page|section|feature|component|dialog|modal|form|spinner)/i,
        /implement\s+(a\s+)?(\w+)\s+(page|section|feature)/i,
        /build\s+(a\s+)?(\w+)\s+(page|section|feature|form|component)/i,
        /add\s+(\w+)\s+to\s+(?:the\s+)?(\w+)/i,
        /add\s+(?:a\s+)?(\w+)\s+(?:component|section)/i,
        /add\s+(?:a\s+)?(\w+)\s+(component|feature|page|section|modal|dialog|form|button|element)/i,
        /insert\s+(?:a\s+)?(\w+)/i,
        /include\s+(?:a\s+)?(\w+)/i,
      ],
      type: EditType.ADD_FEATURE,
      fileResolver: (p, m) => findFeatureInsertionPoints(p, m),
    },
    {
      patterns: [
        /fix\s+(the\s+)?(\w+|\w+\s+\w+)(?!\s+styling|\s+style)/i,
        /resolve\s+(the\s+)?(\w+|\w+\s+\w+)/i,
        /debug\s+(the\s+)?(\w+)/i,
        /repair\s+(the\s+)?(\w+)/i,
        /correct\s+(the\s+)?(\w+|\w+\s+\w+)/i,
      ],
      type: EditType.FIX_ISSUE,
      fileResolver: (p, m) => findProblemFiles(p, m),
    },
    {
      patterns: [
        /change\s+(the\s+)?(color|theme|style|styling|css)/i,
        /update\s+(the\s+)?(color|theme|style|styling|css)/i,
        /make\s+it\s+(dark|light|blue|red|green)/i,
        /style\s+(the\s+)?(\w+)/i,
      ],
      type: EditType.UPDATE_STYLE,
      fileResolver: (p, m) => findStyleFiles(p, m),
    },
    {
      patterns: [
        /refactor\s+(the\s+)?(\w+)/i,
        /clean\s+up\s+(the\s+)?code/i,
        /reorganize\s+(the\s+)?(\w+)/i,
        /optimize\s+(the\s+)?(\w+)/i,
        /restructure\s+(the\s+)?(\w+)/i,
        /improve\s+(the\s+)?(\w+)/i,
      ],
      type: EditType.REFACTOR,
      fileResolver: (p, m) => findRefactorTargets(p, m),
    },
    {
      patterns: [
        /start\s+over/i,
        /recreate\s+everything/i,
        /rebuild\s+(the\s+)?app/i,
        /new\s+app/i,
        /from\s+scratch/i,
      ],
      type: EditType.FULL_REBUILD,
      fileResolver: (p, m) => [m.entryPoint],
    },
    {
      patterns: [
        /update\s+package\.json/i,
        /install\s+(\w+)/i,
        /add\s+.*?\s*(package|library|dependency)/i,
        /add\s+.*?dependency/i,
        /use\s+(\w+)\s+(library|framework)/i,
      ],
      type: EditType.ADD_DEPENDENCY,
      fileResolver: (p, m) => findPackageFiles(m),
    },
  ];
  
  // Find matching pattern
  for (const pattern of patterns) {
    for (const regex of pattern.patterns) {
      if (regex.test(lowerPrompt)) {
        const targetFiles = pattern.fileResolver(prompt, manifest);
        const suggestedContext = getSuggestedContext(targetFiles, manifest);
        
        return {
          type: pattern.type,
          targetFiles,
          confidence: calculateConfidence(prompt, pattern, targetFiles),
          description: generateDescription(pattern.type, prompt, targetFiles),
          suggestedContext,
        };
      }
    }
  }
  
  // Default to component update if no pattern matches
  const targetFiles = manifest.entryPoint && manifest.entryPoint.trim() ? [manifest.entryPoint] : [];
  return {
    type: EditType.UPDATE_COMPONENT,
    targetFiles,
    confidence: 0.3,
    description: 'General update to application',
    suggestedContext: [],
  };
}

/**
 * Find component files mentioned in the prompt
 */
function findComponentFiles(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  // Handle undefined or null manifest
  if (!manifest || !manifest.files) {
    console.log('[findComponentFiles] Manifest is undefined or has no files');
    return files;
  }
  
  // Extract component names from prompt
  const componentWords = extractComponentNames(prompt);
  console.log('[findComponentFiles] Extracted words:', componentWords);
  
  // First pass: Look for exact component file matches
  for (const [path, fileInfo] of Object.entries(manifest.files)) {
    // Check if file name, path, or component name matches
    const fileName = path.split('/').pop()?.toLowerCase() || '';
    const fullPath = path.toLowerCase();
    const componentName = fileInfo.componentInfo?.name.toLowerCase();
    
    for (const word of componentWords) {
      if (fileName.includes(word) || fullPath.includes(word) || componentName?.includes(word)) {
        console.log(`[findComponentFiles] Match found: word="${word}" in file="${path}"`);
        files.push(path);
        break; // Stop after first match to avoid duplicates
      }
      
      // Check semantic matches
      if (isSemanticMatch(word, fileName) || isSemanticMatch(word, componentName || '')) {
        console.log(`[findComponentFiles] Semantic match found: word="${word}" in file="${path}"`);
        files.push(path);
        break;
      }
    }
  }
  
  // If no specific component found, check for common UI elements
  if (files.length === 0) {
    const uiElements = ['header', 'footer', 'nav', 'sidebar', 'button', 'card', 'modal', 'hero', 'banner', 'about', 'services', 'features', 'testimonials', 'gallery', 'contact', 'team', 'pricing'];
    for (const element of uiElements) {
      if (lowerPrompt.includes(element)) {
        // Look for exact component file matches first
        for (const [path, fileInfo] of Object.entries(manifest.files)) {
          const fileName = path.split('/').pop()?.toLowerCase() || '';
          // Only match if the filename contains the element name
          if (fileName.includes(element + '.') || fileName === element) {
            files.push(path);
            console.log(`[findComponentFiles] UI element match: element="${element}" in file="${path}"`);
            break; // Exit loop when we find a match
          }
        }
        
        // If no exact file match, look for the element in file names (but be more selective)
        for (const [path, fileInfo] of Object.entries(manifest.files)) {
          const fileName = path.split('/').pop()?.toLowerCase() || '';
          if (fileName.includes(element)) {
            files.push(path);
            console.log(`[findComponentFiles] UI element partial match: element="${element}" in file="${path}"`);
            break; // Exit loop when we find a match
          }
        }
      }
    }
  }
  
  // Limit results to most specific matches, unless prompt mentions "all"
  if (files.length > 1 && !prompt.toLowerCase().includes('all')) {
    console.log(`[findComponentFiles] Multiple files found (${files.length}), limiting to first match`);
    return [files[0]]; // Only return the first match
  }
  
  return files.length > 0 ? files : [manifest.entryPoint];
}

/**
 * Find where to add new features
 */
function findFeatureInsertionPoints(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  // For new pages, we need routing files and layout
  if (lowerPrompt.includes('page')) {
    // Find router configuration
    for (const [path, fileInfo] of Object.entries(manifest.files)) {
      if (fileInfo.content.includes('Route') || 
          fileInfo.content.includes('createBrowserRouter') ||
          path.includes('router') ||
          path.includes('routes')) {
        files.push(path);
      }
    }
    
    // Also include App.jsx for navigation updates
    if (manifest.entryPoint) {
      files.push(manifest.entryPoint);
    }
  }
  
  // For new components, find the most appropriate parent
  if (lowerPrompt.includes('component') || lowerPrompt.includes('section') || 
      lowerPrompt.includes('add') || lowerPrompt.includes('create')) {
    // Extract where to add it (e.g., "to the footer", "in header")
    const locationMatch = prompt.match(/(?:in|to|on|inside)\s+(?:the\s+)?(\w+)/i);
    if (locationMatch) {
      const location = locationMatch[1];
      const parentFiles = findComponentFiles(location, manifest);
      files.push(...parentFiles);
      console.log(`[findFeatureInsertionPoints] Adding to ${location}, parent files:`, parentFiles);
    } else {
      // Look for component mentions in the prompt
      const componentWords = extractComponentNames(prompt);
      for (const word of componentWords) {
        const relatedFiles = findComponentFiles(word, manifest);
        if (relatedFiles.length > 0 && relatedFiles[0] !== manifest.entryPoint) {
          files.push(...relatedFiles);
        }
      }
      
      // Default to App.jsx if no specific location found
      if (files.length === 0) {
        files.push(manifest.entryPoint);
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(files)];
}

/**
 * Find files that might have problems
 */
function findProblemFiles(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = [];
  
  // Look for error keywords
  if (prompt.match(/error|bug|issue|problem|broken|not working/i)) {
    // Check recently modified files first
    const sortedFiles = Object.entries(manifest.files)
      .sort(([, a], [, b]) => b.lastModified - a.lastModified)
      .slice(0, 5);
    
    files.push(...sortedFiles.map(([path]) => path));
  }
  
  // Also check for specific component mentions
  const componentFiles = findComponentFiles(prompt, manifest);
  files.push(...componentFiles);
  
  return [...new Set(files)];
}

/**
 * Find style-related files
 */
function findStyleFiles(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = [];
  
  // Add all CSS files
  files.push(...manifest.styleFiles);
  
  // Check for Tailwind config
  const tailwindConfig = Object.keys(manifest.files).find(
    path => path.includes('tailwind.config')
  );
  if (tailwindConfig) files.push(tailwindConfig);
  
  // If specific component styling mentioned, include that component
  const componentFiles = findComponentFiles(prompt, manifest);
  files.push(...componentFiles);
  
  return files;
}

/**
 * Find files to refactor
 */
function findRefactorTargets(prompt: string, manifest: FileManifest): string[] {
  // Similar to findComponentFiles but broader
  return findComponentFiles(prompt, manifest);
}

/**
 * Find package configuration files
 */
function findPackageFiles(manifest: FileManifest): string[] {
  const files: string[] = [];
  
  // Handle undefined or null manifest
  if (!manifest || !manifest.files) {
    return files;
  }
  
  for (const path of Object.keys(manifest.files)) {
    if (path.endsWith('package.json') || 
        path.endsWith('vite.config.js') ||
        path.endsWith('tsconfig.json')) {
      files.push(path);
    }
  }
  
  return files;
}

/**
 * Find component by searching for content mentioned in the prompt
 */
function findComponentByContent(prompt: string, manifest: FileManifest): string[] {
  const files: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  console.log('[findComponentByContent] Searching for content in prompt:', prompt);
  
  // Extract quoted strings or specific button/link text
  const quotedStrings = prompt.match(/["']([^"']+)["']/g) || [];
  const searchTerms: string[] = quotedStrings.map(s => s.replace(/["']/g, ''));
  
  // Also look for specific terms after 'remove', 'delete', 'hide'
  const actionMatch = prompt.match(/(?:remove|delete|hide)\s+(?:the\s+)?(.+?)(?:\s+button|\s+link|\s+text|\s+element|\s+section|$)/i);
  if (actionMatch) {
    searchTerms.push(actionMatch[1].trim());
  }
  
  console.log('[findComponentByContent] Search terms:', searchTerms);
  
  // If we have search terms, look for them in file contents
  if (searchTerms.length > 0) {
    for (const [path, fileInfo] of Object.entries(manifest.files)) {
      // Only search in component files
      if (!path.includes('.jsx') && !path.includes('.tsx')) continue;
      
      const content = fileInfo.content.toLowerCase();
      
      for (const term of searchTerms) {
        if (content.includes(term.toLowerCase())) {
          console.log(`[findComponentByContent] Found "${term}" in ${path}`);
          files.push(path);
          break; // Only add file once
        }
      }
    }
  }
  
  // If no files found by content, fall back to component name search
  if (files.length === 0) {
    console.log('[findComponentByContent] No files found by content, falling back to component name search');
    return findComponentFiles(prompt, manifest);
  }
  
  // Return only the first match to avoid editing multiple files
  return [files[0]];
}

/**
 * Extract component names from prompt
 */
function extractComponentNames(prompt: string): string[] {
  const words: string[] = [];
  
  // Remove common words but keep component-related words
  const cleanPrompt = prompt
    .replace(/\b(the|a|an|in|on|to|from|update|change|modify|edit|fix|make)\b/gi, '')
    .toLowerCase();
  
  // Extract potential component names (words that might be components)
  const matches = cleanPrompt.match(/\b\w+\b/g) || [];
  
  for (const match of matches) {
    if (match.length > 2) { // Skip very short words
      words.push(match);
    }
  }
  
  return words;
}

/**
 * Check if two words are semantically related
 */
function isSemanticMatch(word: string, target: string): boolean {
  if (!word || !target) return false;
  
  // Define semantic mappings
  const semanticMappings: Record<string, string[]> = {
    'authentication': ['auth', 'login', 'signin', 'user'],
    'auth': ['authentication', 'login', 'signin', 'user'],
    'login': ['auth', 'authentication', 'signin'],
    'navigation': ['nav', 'navbar', 'menu'],
    'nav': ['navigation', 'navbar', 'menu'],
    'button': ['btn', 'click', 'submit'],
    'form': ['input', 'field', 'validation'],
    'validation': ['validate', 'form', 'field'],
    'modal': ['popup', 'dialog', 'overlay'],
    'popup': ['modal', 'dialog', 'overlay'],
    'dashboard': ['dash', 'overview', 'home'],
    'profile': ['user', 'account', 'settings'],
    'settings': ['config', 'preferences', 'options']
  };
  
  const lowerWord = word.toLowerCase();
  const lowerTarget = target.toLowerCase();
  
  // Check if target contains any semantic matches for the word
  if (semanticMappings[lowerWord]) {
    return semanticMappings[lowerWord].some(synonym => lowerTarget.includes(synonym));
  }
  
  // Check reverse mapping
  for (const [key, synonyms] of Object.entries(semanticMappings)) {
    if (synonyms.includes(lowerWord) && lowerTarget.includes(key)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get additional files for context - returns ALL files for comprehensive context
 */
function getSuggestedContext(
  targetFiles: string[],
  manifest: FileManifest
): string[] {
  // Return all files except the ones being edited
  const allFiles = Object.keys(manifest.files);
  return allFiles.filter(file => !targetFiles.includes(file));
}

/**
 * Resolve import path to actual file path
 */
function resolveImportPath(
  fromFile: string,
  importPath: string,
  manifest: FileManifest
): string | null {
  // Handle relative imports
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
    const resolved = resolveRelativePath(fromDir, importPath);
    
    // Try with different extensions
    const extensions = ['.jsx', '.js', '.tsx', '.ts', ''];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (manifest.files[fullPath]) {
        return fullPath;
      }
      
      // Try index file
      const indexPath = resolved + '/index' + ext;
      if (manifest.files[indexPath]) {
        return indexPath;
      }
    }
  }
  
  // Handle @/ alias (common in Vite projects)
  if (importPath.startsWith('@/')) {
    const srcPath = importPath.replace('@/', '/home/user/app/src/');
    return resolveImportPath(fromFile, srcPath, manifest);
  }
  
  return null;
}

/**
 * Resolve relative path
 */
function resolveRelativePath(fromDir: string, relativePath: string): string {
  const parts = fromDir.split('/');
  const relParts = relativePath.split('/');
  
  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }
  
  return parts.join('/');
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  prompt: string,
  pattern: IntentPattern,
  targetFiles: string[]
): number {
  let confidence = 0.5; // Base confidence
  
  // Higher confidence if we found specific files
  if (targetFiles.length > 0 && targetFiles[0] !== '') {
    confidence += 0.2;
  }
  
  // Higher confidence for more specific prompts
  if (prompt.split(' ').length > 5) {
    confidence += 0.1;
  }
  
  // Higher confidence for exact pattern matches
  for (const regex of pattern.patterns) {
    if (regex.test(prompt)) {
      confidence += 0.2;
      break;
    }
  }
  
  // Lower confidence for vague/ambiguous words
  const vagueness = calculateVagueness(prompt);
  confidence -= vagueness;
  
  return Math.min(confidence, 1.0);
}

/**
 * Calculate vagueness penalty for ambiguous prompts
 */
function calculateVagueness(prompt: string): number {
  const words = prompt.toLowerCase().split(/\s+/);
  const vagueWords = ['things', 'stuff', 'something', 'anything', 'everything', 'it', 'this', 'that'];
  const ambiguousWords = ['better', 'good', 'nice', 'wrong', 'bad', 'fine', 'ok', 'okay'];
  
  let vagueness = 0;
  
  for (const word of words) {
    if (vagueWords.includes(word)) {
      vagueness += 0.3; // Heavy penalty for very vague words
    } else if (ambiguousWords.includes(word)) {
      vagueness += 0.2; // Medium penalty for ambiguous words
    }
  }
  
  // Additional penalty for very short prompts (likely too vague)
  if (words.length <= 2) {
    vagueness += 0.1;
  }
  
  return Math.min(vagueness, 0.8); // Cap maximum penalty
}

/**
 * Generate human-readable description
 */
function generateDescription(
  type: EditType,
  prompt: string,
  targetFiles: string[]
): string {
  const fileNames = targetFiles.filter(f => f && typeof f === 'string').map(f => f.split('/').pop()).join(', ');
  
  switch (type) {
    case EditType.UPDATE_COMPONENT:
      return `Updating component(s): ${fileNames}`;
    case EditType.ADD_FEATURE:
      return `Adding new feature to: ${fileNames}`;
    case EditType.FIX_ISSUE:
      return `Fixing issue in: ${fileNames}`;
    case EditType.UPDATE_STYLE:
      return `Updating styles in: ${fileNames}`;
    case EditType.REFACTOR:
      return `Refactoring: ${fileNames}`;
    case EditType.FULL_REBUILD:
      return 'Rebuilding entire application';
    case EditType.ADD_DEPENDENCY:
      return 'Adding new dependency';
    default:
      return `Editing: ${fileNames}`;
  }
}