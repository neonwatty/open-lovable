/**
 * Claude Code Prompt Formatter
 * 
 * This module handles formatting user prompts and context into Claude Code-compatible
 * markdown format for consumption by Claude Code instead of traditional AI SDKs.
 */

export interface ClaudeCodePromptContext {
  sandboxId?: string;
  currentFiles?: Record<string, string>;
  structure?: string;
  conversationContext?: {
    scrapedWebsites?: Array<{
      url: string;
      timestamp: number;
      content: string;
    }>;
    currentProject?: string;
    messages?: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
    }>;
  };
}

export interface ClaudeCodePrompt {
  type: 'create' | 'modify' | 'debug' | 'analyze';
  system: string;
  user: string;
  context: ClaudeCodePromptContext;
  model: string;
  maxTokens?: number;
}

export interface EditContext {
  primaryFiles: string[];
  contextFiles: string[];
  systemPrompt: string;
  editIntent: {
    type: string;
    description: string;
    targetFiles: string[];
    confidence: number;
    searchTerms?: string[];
  };
}

/**
 * Formats a user prompt and context into Claude Code markdown format
 */
export function formatPromptForClaudeCode(
  prompt: string,
  context: ClaudeCodePromptContext,
  model: string = 'claude-3-5-sonnet',
  isEdit: boolean = false,
  editContext?: EditContext
): ClaudeCodePrompt {
  const promptType = determinePromptType(prompt, isEdit);
  
  const systemPrompt = buildSystemPrompt(promptType, isEdit, editContext);
  const userPrompt = buildUserPrompt(prompt, context, promptType, isEdit);
  
  return {
    type: promptType,
    system: systemPrompt,
    user: userPrompt,
    context,
    model,
    maxTokens: 8192
  };
}

/**
 * Determine the type of prompt based on content and context
 */
function determinePromptType(prompt: string, isEdit: boolean): 'create' | 'modify' | 'debug' | 'analyze' {
  if (isEdit) {
    return 'modify';
  }
  
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('debug') || lowerPrompt.includes('fix') || lowerPrompt.includes('error')) {
    return 'debug';
  }
  
  if (lowerPrompt.includes('analyze') || lowerPrompt.includes('explain') || lowerPrompt.includes('understand')) {
    return 'analyze';
  }
  
  if (lowerPrompt.includes('create') || lowerPrompt.includes('build') || lowerPrompt.includes('generate')) {
    return 'create';
  }
  
  return 'create'; // default
}

/**
 * Build the system prompt based on prompt type and context
 */
function buildSystemPrompt(
  promptType: 'create' | 'modify' | 'debug' | 'analyze',
  isEdit: boolean,
  editContext?: EditContext
): string {
  const baseSystemPrompt = `You are an expert React developer with perfect memory of the conversation. You maintain context across messages and remember scraped websites, generated components, and applied code. Generate clean, modern React code for Vite applications.

🚨 CRITICAL RULES - YOUR MOST IMPORTANT INSTRUCTIONS:
1. **DO EXACTLY WHAT IS ASKED - NOTHING MORE, NOTHING LESS**
   - Don't add features not requested
   - Don't fix unrelated issues
   - Don't improve things not mentioned
2. **CHECK App.jsx FIRST** - ALWAYS see what components exist before creating new ones
3. **NAVIGATION LIVES IN Header.jsx** - Don't create Nav.jsx if Header exists with nav
4. **USE STANDARD TAILWIND CLASSES ONLY**:
   - ✅ CORRECT: bg-white, text-black, bg-blue-500, bg-gray-100, text-gray-900
   - ❌ WRONG: bg-background, text-foreground, bg-primary, bg-muted, text-secondary
   - Use ONLY classes from the official Tailwind CSS documentation
5. **FILE COUNT LIMITS**:
   - Simple style/text change = 1 file ONLY
   - New component = 2 files MAX (component + parent)
   - If >3 files, YOU'RE DOING TOO MUCH

COMPONENT RELATIONSHIPS (CHECK THESE FIRST):
- Navigation usually lives INSIDE Header.jsx, not separate Nav.jsx
- Logo is typically in Header, not standalone
- Footer often contains nav links already
- Menu/Hamburger is part of Header, not separate

PACKAGE USAGE RULES:
- DO NOT use react-router-dom unless user explicitly asks for routing
- For simple nav links in a single-page app, use scroll-to-section or href="#"
- Only add routing if building a multi-page application
- Common packages are auto-installed from your imports`;

  if (promptType === 'modify' && isEdit) {
    return baseSystemPrompt + `

CRITICAL: THIS IS AN EDIT TO AN EXISTING APPLICATION

YOU MUST FOLLOW THESE EDIT RULES:
0. NEVER create tailwind.config.js, vite.config.js, package.json, or any other config files - they already exist!
1. DO NOT regenerate the entire application
2. DO NOT create files that already exist (like App.jsx, index.css, tailwind.config.js)
3. ONLY edit the EXACT files needed for the requested change - NO MORE, NO LESS
4. If the user says "update the header", ONLY edit the Header component - DO NOT touch Footer, Hero, or any other components
5. If the user says "change the color", ONLY edit the relevant style or component file - DO NOT "improve" other parts
6. If you're unsure which file to edit, choose the SINGLE most specific one related to the request

CRITICAL FILE MODIFICATION RULES - VIOLATION = FAILURE:
- **NEVER TRUNCATE FILES** - Always return COMPLETE files with ALL content
- **NO ELLIPSIS (...)** - Include every single line of code, no skipping
- Files MUST be complete and runnable - include ALL imports, functions, JSX, and closing tags

CRITICAL: DO NOT REDESIGN OR REIMAGINE COMPONENTS
- "update" means make a small change, NOT redesign the entire component
- "change X to Y" means ONLY change X to Y, nothing else
- "fix" means repair what's broken, NOT rewrite everything
- Preserve ALL existing functionality and design unless explicitly asked to change it

${editContext ? `
TARGETED EDIT MODE ACTIVE
- Edit Type: ${editContext.editIntent.type}
- Confidence: ${editContext.editIntent.confidence}
- Files to Edit: ${editContext.primaryFiles.join(', ')}

🚨 CRITICAL RULE - VIOLATION WILL RESULT IN FAILURE 🚨
YOU MUST ***ONLY*** GENERATE THE FILES LISTED ABOVE!

ABSOLUTE REQUIREMENTS:
1. COUNT the files in "Files to Edit" - that's EXACTLY how many files you must generate
2. If "Files to Edit" shows ONE file, generate ONLY that ONE file
3. DO NOT generate App.jsx unless it's EXPLICITLY listed in "Files to Edit"
4. DO NOT generate ANY components that aren't listed in "Files to Edit"
5. DO NOT "helpfully" update related files

THE AI INTENT ANALYZER HAS ALREADY DETERMINED THE FILES.
DO NOT SECOND-GUESS IT.
DO NOT ADD MORE FILES.
ONLY OUTPUT THE EXACT FILES LISTED IN "Files to Edit".
` : ''}`;
  }

  if (promptType === 'debug') {
    return baseSystemPrompt + `

DEBUG MODE ACTIVE:
- Focus on identifying and fixing the specific issue mentioned
- Provide clear explanations of what was wrong and how you fixed it
- Only modify code that's directly related to the bug
- Test your solution to ensure it resolves the issue`;
  }

  if (promptType === 'analyze') {
    return baseSystemPrompt + `

ANALYSIS MODE ACTIVE:
- Provide detailed explanations of the code structure and functionality
- Identify potential issues, improvements, or best practices
- Use clear, educational language
- Include code examples when helpful`;
  }

  // Default create mode
  return baseSystemPrompt + `

CRITICAL: When asked to create a React app or components:
- ALWAYS CREATE ALL FILES IN FULL - never provide partial implementations
- ALWAYS CREATE EVERY COMPONENT that you import - no placeholders
- ALWAYS IMPLEMENT COMPLETE FUNCTIONALITY - don't leave TODOs unless explicitly asked
- If you're recreating a website, implement ALL sections and features completely
- NEVER create tailwind.config.js - it's already configured in the template
- ALWAYS include a Navigation/Header component (Nav.jsx or Header.jsx) - websites need navigation!

REQUIRED COMPONENTS for website clones:
1. Nav.jsx or Header.jsx - Navigation bar with links (NEVER SKIP THIS!)
2. Hero.jsx - Main landing section
3. Features/Services/Products sections - Based on the site content
4. Footer.jsx - Footer with links and info
5. App.jsx - Main component that imports and arranges all components

Use this XML format for React components only:

<file path="src/index.css">
@tailwind base;
@tailwind components;
@tailwind utilities;
</file>

<file path="src/App.jsx">
// Main App component that imports and uses other components
</file>

<file path="src/components/Example.jsx">
// Your React component code here
</file>`;
}

/**
 * Build the user prompt with context
 */
function buildUserPrompt(
  prompt: string,
  context: ClaudeCodePromptContext,
  promptType: 'create' | 'modify' | 'debug' | 'analyze',
  isEdit: boolean
): string {
  let formattedPrompt = `## User Request

${prompt}`;

  // Add context sections
  if (context.sandboxId) {
    formattedPrompt += `\n\n## Sandbox Context\n\n**Sandbox ID:** ${context.sandboxId}`;
  }

  if (context.structure) {
    formattedPrompt += `\n\n## Current File Structure\n\n\`\`\`\n${context.structure}\n\`\`\``;
  }

  if (context.currentFiles && Object.keys(context.currentFiles).length > 0) {
    formattedPrompt += `\n\n## Current Project Files\n\n`;
    
    if (isEdit) {
      formattedPrompt += `**EXISTING APPLICATION - DO NOT REGENERATE FROM SCRATCH**\n`;
      formattedPrompt += `These files already exist. When modifying, find the relevant file and generate ONLY that file with the requested changes.\n\n`;
    }

    const fileEntries = Object.entries(context.currentFiles);
    for (const [path, content] of fileEntries) {
      if (typeof content === 'string') {
        formattedPrompt += `### ${path}\n\n\`\`\`typescript\n${content}\n\`\`\`\n\n`;
      }
    }
  }

  if (context.conversationContext?.scrapedWebsites?.length) {
    formattedPrompt += `\n\n## Scraped Websites\n\n`;
    context.conversationContext.scrapedWebsites.forEach((site, index) => {
      formattedPrompt += `### Website ${index + 1}: ${site.url}\n\n`;
      formattedPrompt += `**Scraped:** ${new Date(site.timestamp).toLocaleString()}\n\n`;
      
      // Include a summary of the scraped content
      const contentPreview = typeof site.content === 'string' 
        ? site.content.substring(0, 1000) 
        : JSON.stringify(site.content).substring(0, 1000);
      formattedPrompt += `**Content Preview:**\n\`\`\`\n${contentPreview}...\n\`\`\`\n\n`;
    });
  }

  if (context.conversationContext?.currentProject) {
    formattedPrompt += `\n\n## Current Project\n\n**Project:** ${context.conversationContext.currentProject}\n\n`;
  }

  // Add conversation history if available
  if (context.conversationContext?.messages?.length) {
    formattedPrompt += `\n\n## Recent Conversation\n\n`;
    const recentMessages = context.conversationContext.messages.slice(-5);
    recentMessages.forEach((msg, index) => {
      formattedPrompt += `**${msg.role === 'user' ? 'User' : 'Assistant'}:** ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}\n\n`;
    });
  }

  // Add specific instructions based on prompt type
  if (promptType === 'modify' && isEdit) {
    formattedPrompt += `\n\n## Critical Instructions for Editing\n\n`;
    formattedPrompt += `⚠️ **EDIT MODE ACTIVE** - This is an incremental update to an existing application.\n\n`;
    formattedPrompt += `1. DO NOT regenerate App.jsx, index.css, or other core files unless explicitly requested\n`;
    formattedPrompt += `2. ONLY create or modify the specific files needed for the user's request\n`;
    formattedPrompt += `3. OUTPUT FORMAT: Use <file path="...">content</file> tags for EVERY file\n`;
    formattedPrompt += `4. NEVER output "Generated Files:" as plain text\n`;
  }

  return formattedPrompt;
}

/**
 * Convert Claude Code prompt to markdown format for display/logging
 */
export function claudeCodePromptToMarkdown(claudePrompt: ClaudeCodePrompt): string {
  return `# Claude Code Prompt

## Type: ${claudePrompt.type.toUpperCase()}

## Model: ${claudePrompt.model}

## System Message

${claudePrompt.system}

## User Message

${claudePrompt.user}

---

*Generated by Claude Code Integration Bridge*`;
}

/**
 * Parse a Claude Code response to extract file contents
 * @deprecated Use parseClaudeCodeResponse from claude-code-block-parser.ts for enhanced parsing
 */
export function parseClaudeCodeResponseLegacy(response: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  
  // Match <file path="...">content</file> patterns
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;
  
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    files.push({ path: filePath, content });
  }
  
  return files;
}

/**
 * Parse a Claude Code response using the enhanced parser
 */
export function parseClaudeCodeResponse(response: string): Array<{ path: string; content: string }> {
  // Use the enhanced parser for better extraction
  try {
    const blockParser = require('./claude-code-block-parser');
    const result = blockParser.parseClaudeCodeResponse(response);
    
    // Convert to legacy format for compatibility
    return result.files.map((file: any) => ({
      path: file.path,
      content: file.content
    }));
  } catch (error) {
    console.warn('Failed to use enhanced parser, falling back to basic parsing:', error);
    return [];
  }
}

/**
 * Validate that a Claude Code response contains properly formatted files
 */
export function validateClaudeCodeResponse(response: string): {
  isValid: boolean;
  files: number;
  errors: string[];
} {
  // Use the enhanced parser for validation
  try {
    const blockParser = require('./claude-code-block-parser');
    const result = blockParser.parseClaudeCodeResponse(response);
    
    // The enhanced parser already provides comprehensive validation
    return {
      isValid: result.metadata.errors.length === 0,
      files: result.metadata.filesExtracted,
      errors: result.metadata.errors
    };
  } catch (error) {
    return {
      isValid: false,
      files: 0,
      errors: [`Failed to parse response: ${error}`]
    };
  }
}