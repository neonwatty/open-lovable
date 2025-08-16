/**
 * Claude Code Prompt Templates
 * 
 * Pre-defined templates for common prompt patterns that work well with Claude Code
 */

import type { ClaudeCodePromptTemplate } from '../types/claude-code';

export const CLAUDE_CODE_TEMPLATES: Record<string, ClaudeCodePromptTemplate> = {
  // Creating new React applications
  CREATE_REACT_APP: {
    name: 'Create React App',
    type: 'create',
    description: 'Template for creating a new React application from scratch',
    variables: ['appName', 'description', 'features', 'styling'],
    systemPrompt: `You are an expert React developer creating a new application. You will generate clean, modern React code using Vite and Tailwind CSS.

CRITICAL REQUIREMENTS:
1. Create a complete, working React application
2. Use functional components with hooks
3. Implement responsive design with Tailwind CSS
4. Follow React best practices and modern patterns
5. Generate ALL necessary files - no placeholders

REQUIRED FILES:
- src/index.css (Tailwind imports)
- src/App.jsx (Main app component)
- src/components/ (All UI components)

FILE FORMAT: Use <file path="...">content</file> for each file.`,
    userPromptTemplate: `Create a React application called "{{appName}}" with the following requirements:

**Description:** {{description}}

**Key Features:**
{{#each features}}
- {{this}}
{{/each}}

**Styling:** Use {{styling}} for all styling needs

Please generate a complete, working application with proper file structure, components, and styling.`
  },

  // Modifying existing components
  MODIFY_COMPONENT: {
    name: 'Modify Component',
    type: 'modify',
    description: 'Template for making targeted changes to existing components',
    variables: ['componentName', 'changes', 'preserveFeatures'],
    systemPrompt: `You are performing a surgical edit on an existing React component. Your goal is precision and preservation.

CRITICAL RULES:
1. ONLY modify the specific component mentioned
2. PRESERVE all existing functionality not explicitly changed
3. Make minimal, targeted changes
4. Do NOT redesign or restructure unless requested
5. Return ONLY the modified file(s)

EDIT APPROACH:
- Locate the exact code that needs changing
- Make the minimum viable change
- Keep all imports, props, state, and logic intact
- Maintain existing code style and patterns`,
    userPromptTemplate: `Modify the {{componentName}} component with the following changes:

**Changes Requested:**
{{changes}}

**Must Preserve:**
{{#each preserveFeatures}}
- {{this}}
{{/each}}

**Instructions:**
- Make ONLY the requested changes
- Keep all existing functionality intact
- Return the complete modified file`
  },

  // Debugging issues
  DEBUG_ISSUE: {
    name: 'Debug Issue',
    type: 'debug',
    description: 'Template for identifying and fixing bugs in React code',
    variables: ['issueDescription', 'errorMessage', 'expectedBehavior', 'currentBehavior'],
    systemPrompt: `You are debugging a React application. Your goal is to identify the root cause and provide a targeted fix.

DEBUG METHODOLOGY:
1. Analyze the error message and symptoms
2. Identify the root cause of the issue
3. Provide a minimal fix that resolves the problem
4. Explain what was wrong and why the fix works
5. Avoid making unrelated changes

COMMON REACT ISSUES:
- Component lifecycle problems
- State management bugs
- Event handling errors
- Prop drilling issues
- Key prop warnings
- Hook dependency arrays`,
    userPromptTemplate: `Debug the following issue in my React application:

**Issue Description:** {{issueDescription}}

**Error Message:** {{errorMessage}}

**Expected Behavior:** {{expectedBehavior}}

**Current Behavior:** {{currentBehavior}}

Please identify the root cause and provide a fix with explanation.`
  },

  // Code analysis
  ANALYZE_CODE: {
    name: 'Analyze Code',
    type: 'analyze',
    description: 'Template for analyzing React code quality and structure',
    variables: ['analysisType', 'focusAreas', 'codeSection'],
    systemPrompt: `You are performing a code analysis on a React application. Provide insightful, actionable feedback.

ANALYSIS AREAS:
- Code quality and best practices
- Performance optimization opportunities
- Security considerations
- Accessibility improvements
- Component architecture
- State management patterns

OUTPUT FORMAT:
1. **Summary** - High-level assessment
2. **Findings** - Specific issues or opportunities
3. **Recommendations** - Actionable improvements
4. **Code Examples** - Show better alternatives when relevant

Be constructive and educational in your analysis.`,
    userPromptTemplate: `Analyze the following React code for {{analysisType}}:

**Focus Areas:**
{{#each focusAreas}}
- {{this}}
{{/each}}

**Code to Analyze:**
{{codeSection}}

Please provide a detailed analysis with specific recommendations for improvement.`
  },

  // Adding new features
  ADD_FEATURE: {
    name: 'Add Feature',
    type: 'modify',
    description: 'Template for adding new features to existing applications',
    variables: ['featureName', 'featureDescription', 'integrationPoint', 'requirements'],
    systemPrompt: `You are adding a new feature to an existing React application. Focus on clean integration without disrupting existing functionality.

INTEGRATION PRINCIPLES:
1. Identify the best integration point
2. Follow existing patterns and conventions
3. Minimize changes to existing components
4. Ensure proper component communication
5. Maintain consistent styling and UX

FEATURE ADDITION PROCESS:
1. Create new components for the feature
2. Update parent components to integrate the feature
3. Add necessary imports and exports
4. Ensure responsive design consistency`,
    userPromptTemplate: `Add a new feature called "{{featureName}}" to the existing application:

**Feature Description:** {{featureDescription}}

**Integration Point:** {{integrationPoint}}

**Requirements:**
{{#each requirements}}
- {{this}}
{{/each}}

Please implement this feature with minimal impact on existing code.`
  },

  // Styling updates
  UPDATE_STYLING: {
    name: 'Update Styling',
    type: 'modify',
    description: 'Template for making styling changes using Tailwind CSS',
    variables: ['targetElement', 'styleChanges', 'responsiveRequirements'],
    systemPrompt: `You are updating the styling of React components using Tailwind CSS. Focus on responsive design and accessibility.

TAILWIND BEST PRACTICES:
1. Use semantic color names (bg-blue-500, not bg-primary)
2. Implement mobile-first responsive design
3. Use consistent spacing scales
4. Apply proper hover and focus states
5. Ensure adequate color contrast

STYLING APPROACH:
- Identify the exact elements to style
- Use Tailwind utility classes only
- Maintain existing layout structure
- Test responsiveness across breakpoints`,
    userPromptTemplate: `Update the styling for {{targetElement}} with the following changes:

**Style Changes:**
{{styleChanges}}

**Responsive Requirements:**
{{responsiveRequirements}}

Use only Tailwind CSS classes. Ensure the changes work well on all screen sizes.`
  }
};

/**
 * Get a template by name
 */
export function getTemplate(name: string): ClaudeCodePromptTemplate | null {
  return CLAUDE_CODE_TEMPLATES[name] || null;
}

/**
 * List all available templates
 */
export function listTemplates(): ClaudeCodePromptTemplate[] {
  return Object.values(CLAUDE_CODE_TEMPLATES);
}

/**
 * Get templates by type
 */
export function getTemplatesByType(type: 'create' | 'modify' | 'debug' | 'analyze'): ClaudeCodePromptTemplate[] {
  return Object.values(CLAUDE_CODE_TEMPLATES).filter(template => template.type === type);
}

/**
 * Simple template variable substitution
 * Supports {{variable}} syntax and {{#each array}}{{this}}{{/each}} for arrays
 */
export function renderTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template;

  // Handle {{#each array}} blocks
  const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  rendered = rendered.replace(eachRegex, (match, arrayName, content) => {
    const array = variables[arrayName];
    if (Array.isArray(array)) {
      return array.map(item => content.replace(/\{\{this\}\}/g, item)).join('');
    }
    return '';
  });

  // Handle simple {{variable}} substitutions
  const varRegex = /\{\{(\w+)\}\}/g;
  rendered = rendered.replace(varRegex, (match, varName) => {
    return variables[varName] || '';
  });

  return rendered;
}

/**
 * Create a prompt using a template
 */
export function createPromptFromTemplate(
  templateName: string, 
  variables: Record<string, any>
): { system: string; user: string } | null {
  const template = getTemplate(templateName);
  if (!template) {
    return null;
  }

  return {
    system: template.systemPrompt,
    user: renderTemplate(template.userPromptTemplate, variables)
  };
}

/**
 * Validate template variables
 */
export function validateTemplateVariables(
  templateName: string, 
  variables: Record<string, any>
): { isValid: boolean; missingVariables: string[] } {
  const template = getTemplate(templateName);
  if (!template) {
    return { isValid: false, missingVariables: [] };
  }

  const missingVariables = template.variables.filter(varName => 
    variables[varName] === undefined || variables[varName] === null
  );

  return {
    isValid: missingVariables.length === 0,
    missingVariables
  };
}