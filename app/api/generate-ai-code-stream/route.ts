import { NextRequest, NextResponse } from 'next/server';
import type { SandboxState } from '@/types/sandbox';
import { selectFilesForEdit, getFileContents, formatFilesForAI } from '@/lib/context-selector';
import { executeSearchPlan, formatSearchResultsForAI, selectTargetFile } from '@/lib/file-search-executor';
import { FileManifest } from '@/types/file-manifest';
import type { ConversationState, ConversationMessage, ConversationEdit } from '@/types/conversation';
import { appConfig } from '@/config/app.config';
import { formatCodeGenerationPrompt, promptToString, type CodeGenerationContext } from '@/lib/claude-prompt-formatter';
import { parseClaudeCodeResponse, createStreamingResponse, validateClaudeCodeResponse, sendSSEChunk, type ClaudeCodeParseResult, type StreamChunk } from '@/lib/claude-response-parser';
import { aiFallbackSystem, generateWithFallback, type FallbackGenerationResult } from '@/lib/ai-fallback-system';

// Temporary stubs for AI SDK functionality
// These will be replaced with Claude Code-compatible interface
const groq = null;
const anthropic = null;
const openai = null;

// Temporary stub for streamText functionality
function streamText(options: any): any {
  throw new Error('streamText is temporarily disabled - Claude Code integration pending');
}

// Enhanced Claude Code response generator with fallback mechanisms
// Uses AI fallback system for robust code generation
async function generateClaudeCodeResponse(prompt: string, options: {
  isEdit: boolean;
  editIntent?: any;
  model: string;
  context?: any;
}): Promise<FallbackGenerationResult> {
  console.log('[generateClaudeCodeResponse] Generating response with fallback system');
  console.log('[generateClaudeCodeResponse] Options:', {
    isEdit: options.isEdit,
    model: options.model,
    hasContext: !!options.context
  });

  try {
    // First, check AI service status
    const serviceStatus = await aiFallbackSystem.checkAIServiceAvailability();
    console.log('[generateClaudeCodeResponse] AI service status:', {
      available: serviceStatus.available,
      degradedMode: serviceStatus.degradedMode,
      retryCount: serviceStatus.retryCount
    });

    // Use the fallback system to generate code
    const result = await generateWithFallback(prompt, {
      isEdit: options.isEdit,
      editIntent: options.editIntent,
      model: options.model,
      currentFiles: options.context?.currentFiles,
      manifest: options.context?.manifest
    });

    console.log('[generateClaudeCodeResponse] Generation result:', {
      success: result.success,
      method: result.method,
      confidenceScore: result.metadata.confidenceScore,
      limitations: result.metadata.limitations.length
    });

    return result;

  } catch (error) {
    console.error('[generateClaudeCodeResponse] Error in generation:', error);
    
    // Return a fallback error response
    return {
      success: false,
      content: `I apologize, but I'm currently experiencing technical difficulties. Here's what you can try:

## Alternative Options:

1. **Refresh and Retry**: The service may be temporarily unavailable
2. **Manual Creation**: You can create components manually using standard React patterns
3. **Try Again Later**: AI services are being restored

## Your Request:
"${prompt}"

## Basic Component Template:
\`\`\`tsx
import React from 'react';

export default function MyComponent() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Component Title</h1>
      {/* Add your content here */}
    </div>
  );
}
\`\`\`

The system will automatically retry when services are restored.`,
      method: 'static',
      metadata: {
        confidenceScore: 0.1,
        limitations: [
          'All generation methods failed',
          'AI services unavailable',
          'No suitable templates found',
          'Manual intervention required'
        ]
      }
    };
  }
}

// Helper function to analyze user preferences from conversation history
function analyzeUserPreferences(messages: ConversationMessage[]): {
  commonPatterns: string[];
  preferredEditStyle: 'targeted' | 'comprehensive';
} {
  const userMessages = messages.filter(m => m.role === 'user');
  const patterns: string[] = [];
  
  // Count edit-related keywords
  let targetedEditCount = 0;
  let comprehensiveEditCount = 0;
  
  userMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    
    // Check for targeted edit patterns
    if (content.match(/\b(update|change|fix|modify|edit|remove|delete)\s+(\w+\s+)?(\w+)\b/)) {
      targetedEditCount++;
    }
    
    // Check for comprehensive edit patterns
    if (content.match(/\b(rebuild|recreate|redesign|overhaul|refactor)\b/)) {
      comprehensiveEditCount++;
    }
    
    // Extract common request patterns
    if (content.includes('hero')) patterns.push('hero section edits');
    if (content.includes('header')) patterns.push('header modifications');
    if (content.includes('color') || content.includes('style')) patterns.push('styling changes');
    if (content.includes('button')) patterns.push('button updates');
    if (content.includes('animation')) patterns.push('animation requests');
  });
  
  return {
    commonPatterns: [...new Set(patterns)].slice(0, 3), // Top 3 unique patterns
    preferredEditStyle: targetedEditCount > comprehensiveEditCount ? 'targeted' : 'comprehensive'
  };
}

declare global {
  var sandboxState: SandboxState;
  var conversationState: ConversationState | null;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'openai/gpt-oss-20b', context, isEdit = false } = await request.json();
    
    console.log('[generate-ai-code-stream] Received request:');
    console.log('[generate-ai-code-stream] - prompt:', prompt);
    console.log('[generate-ai-code-stream] - isEdit:', isEdit);
    console.log('[generate-ai-code-stream] - context.sandboxId:', context?.sandboxId);
    console.log('[generate-ai-code-stream] - context.currentFiles:', context?.currentFiles ? Object.keys(context.currentFiles) : 'none');
    console.log('[generate-ai-code-stream] - currentFiles count:', context?.currentFiles ? Object.keys(context.currentFiles).length : 0);
    
    // Initialize conversation state if not exists
    if (!global.conversationState) {
      global.conversationState = {
        conversationId: `conv-${Date.now()}`,
        startedAt: Date.now(),
        lastUpdated: Date.now(),
        context: {
          messages: [],
          edits: [],
          projectEvolution: { majorChanges: [] },
          userPreferences: {}
        }
      };
    }
    
    // Add user message to conversation history
    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      metadata: {
        sandboxId: context?.sandboxId
      }
    };
    global.conversationState.context.messages.push(userMessage);
    
    // Clean up old messages to prevent unbounded growth
    if (global.conversationState.context.messages.length > 20) {
      // Keep only the last 15 messages
      global.conversationState.context.messages = global.conversationState.context.messages.slice(-15);
      console.log('[generate-ai-code-stream] Trimmed conversation history to prevent context overflow');
    }
    
    // Clean up old edits
    if (global.conversationState.context.edits.length > 10) {
      global.conversationState.context.edits = global.conversationState.context.edits.slice(-8);
    }
    
    // Debug: Show a sample of actual file content
    if (context?.currentFiles && Object.keys(context.currentFiles).length > 0) {
      const firstFile = Object.entries(context.currentFiles)[0];
      console.log('[generate-ai-code-stream] - sample file:', firstFile[0]);
      console.log('[generate-ai-code-stream] - sample content preview:', 
        typeof firstFile[1] === 'string' ? firstFile[1].substring(0, 100) + '...' : 'not a string');
    }
    
    if (!prompt) {
      return NextResponse.json({ 
        success: false, 
        error: 'Prompt is required' 
      }, { status: 400 });
    }
    
    // Create a stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Function to send progress updates (legacy compatibility)
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };
    
    // Function to send status updates using new SSE system
    const sendStatus = async (message: string) => {
      await sendSSEChunk(writer, {
        type: 'status',
        message
      }, encoder);
    };
    
    // Start processing in background
    (async () => {
      let contextualResult: any = null;
      try {
        // Send initial status
        await sendStatus('Initializing AI...');
        
        // No keep-alive needed - sandbox provisioned for 10 minutes
        
        // Check if we have a file manifest for edit mode
        let editContext = null;
        let enhancedSystemPrompt = '';
        
        if (isEdit) {
          console.log('[generate-ai-code-stream] Edit mode detected - starting agentic search workflow');
          console.log('[generate-ai-code-stream] Has fileCache:', !!global.sandboxState?.fileCache);
          console.log('[generate-ai-code-stream] Has manifest:', !!global.sandboxState?.fileCache?.manifest);
          
          const manifest: FileManifest | undefined = global.sandboxState?.fileCache?.manifest;
          
          if (manifest) {
            await sendStatus('🔍 Creating search plan...');
            
            const fileContents = global.sandboxState.fileCache?.files || {};
            console.log('[generate-ai-code-stream] Files available for search:', Object.keys(fileContents).length);
            
            // STEP 1: Get search plan from AI
            try {
              const intentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/analyze-edit-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, manifest, model })
              });
              
              if (intentResponse.ok) {
                const { searchPlan } = await intentResponse.json();
                console.log('[generate-ai-code-stream] Search plan received:', searchPlan);
                
                await sendProgress({ 
                  type: 'status', 
                  message: `🔎 Searching for: "${searchPlan.searchTerms.join('", "')}"`
                });
                
                // STEP 2: Execute the search plan
                const searchExecution = executeSearchPlan(searchPlan, 
                  Object.fromEntries(
                    Object.entries(fileContents).map(([path, data]) => [
                      path.startsWith('/') ? path : `./sandbox/${path}`,
                      data.content
                    ])
                  )
                );
                
                console.log('[generate-ai-code-stream] Search execution:', {
                  success: searchExecution.success,
                  resultsCount: searchExecution.results.length,
                  filesSearched: searchExecution.filesSearched,
                  time: searchExecution.executionTime + 'ms'
                });
                
                if (searchExecution.success && searchExecution.results.length > 0) {
                  // STEP 3: Select the best target file
                  const target = selectTargetFile(searchExecution.results, searchPlan.editType);
                  
                  if (target) {
                    await sendProgress({ 
                      type: 'status', 
                      message: `✅ Found code in ${target.filePath.split('/').pop()} at line ${target.lineNumber}`
                    });
                    
                    console.log('[generate-ai-code-stream] Target selected:', target);
                    
                    // Create surgical edit context with exact location
                    const normalizedPath = target.filePath.replace('./sandbox/', '');
                    const fileContent = fileContents[normalizedPath]?.content || '';
                    
                    // Build enhanced context with search results
                    enhancedSystemPrompt = `
${formatSearchResultsForAI(searchExecution.results)}

SURGICAL EDIT INSTRUCTIONS:
You have been given the EXACT location of the code to edit.
- File: ${target.filePath}
- Line: ${target.lineNumber}
- Reason: ${target.reason}

Make ONLY the change requested by the user. Do not modify any other code.
User request: "${prompt}"`;
                    
                    // Set up edit context with just this one file
                    editContext = {
                      primaryFiles: [target.filePath],
                      contextFiles: [],
                      systemPrompt: enhancedSystemPrompt,
                      editIntent: {
                        type: searchPlan.editType,
                        description: searchPlan.reasoning,
                        targetFiles: [target.filePath],
                        confidence: 0.95, // High confidence since we found exact location
                        suggestedContext: []
                      }
                    };
                    
                    console.log('[generate-ai-code-stream] Surgical edit context created');
                  }
                } else {
                  // Search failed - fall back to old behavior but inform user
                  console.warn('[generate-ai-code-stream] Search found no results, falling back to broader context');
                  await sendProgress({ 
                    type: 'status', 
                    message: '⚠️ Could not find exact match, using broader search...'
                  });
                }
              } else {
                console.error('[generate-ai-code-stream] Failed to get search plan');
              }
            } catch (error) {
              console.error('[generate-ai-code-stream] Error in agentic search workflow:', error);
              await sendProgress({ 
                type: 'status', 
                message: '⚠️ Search workflow error, falling back to keyword method...'
              });
              // Fall back to old method on any error if we have a manifest
              if (manifest) {
                editContext = selectFilesForEdit(prompt, manifest);
              }
            }
          } else {
            // Fall back to old method if AI analysis fails
            console.warn('[generate-ai-code-stream] AI intent analysis failed, falling back to keyword method');
            if (manifest) {
              editContext = selectFilesForEdit(prompt, manifest);
            } else {
              console.log('[generate-ai-code-stream] No manifest available for fallback');
              await sendProgress({ 
                type: 'status', 
                message: '⚠️ No file manifest available, will use broad context'
              });
            }
          }
          
          // If we got an edit context from any method, use its system prompt
          if (editContext) {
            enhancedSystemPrompt = editContext.systemPrompt;
            
            await sendProgress({ 
              type: 'status', 
              message: `Identified edit type: ${editContext.editIntent?.description || 'Code modification'}`
            });
          } else if (!manifest) {
            console.log('[generate-ai-code-stream] WARNING: No manifest available for edit mode!');
            
            // Try to fetch files from sandbox if we have one
            if (global.activeSandbox) {
              await sendProgress({ type: 'status', message: 'Fetching current files from sandbox...' });
              
              try {
                // Fetch files directly from sandbox
                const filesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/get-sandbox-files`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                });
                
                if (filesResponse.ok) {
                  const filesData = await filesResponse.json();
                  
                  if (filesData.success && filesData.manifest) {
                    console.log('[generate-ai-code-stream] Successfully fetched manifest from sandbox');
                    const manifest = filesData.manifest;
                    
                    // Now try to analyze edit intent with the fetched manifest
                    try {
                      const intentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/analyze-edit-intent`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt, manifest, model })
                      });
                      
                      if (intentResponse.ok) {
                        const { searchPlan } = await intentResponse.json();
                        console.log('[generate-ai-code-stream] Search plan received (after fetch):', searchPlan);
                        
                        // For now, fall back to keyword search since we don't have file contents for search execution
                        // This path happens when no manifest was initially available
                        let targetFiles: string[] = [];
                        if (!searchPlan || searchPlan.searchTerms.length === 0) {
                          console.warn('[generate-ai-code-stream] No target files after fetch, searching for relevant files');
                          
                          const promptLower = prompt.toLowerCase();
                          const allFilePaths = Object.keys(manifest.files);
                          
                          // Look for component names mentioned in the prompt
                          if (promptLower.includes('hero')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('hero'));
                          } else if (promptLower.includes('header')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('header'));
                          } else if (promptLower.includes('footer')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('footer'));
                          } else if (promptLower.includes('nav')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('nav'));
                          } else if (promptLower.includes('button')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('button'));
                          }
                          
                          if (targetFiles.length > 0) {
                            console.log('[generate-ai-code-stream] Found target files by keyword search after fetch:', targetFiles);
                          }
                        }
                        
                        const allFiles = Object.keys(manifest.files)
                          .filter(path => !targetFiles.includes(path));
                        
                        editContext = {
                          primaryFiles: targetFiles,
                          contextFiles: allFiles,
                          systemPrompt: `
You are an expert senior software engineer performing a surgical, context-aware code modification. Your primary directive is **precision and preservation**.

Think of yourself as a surgeon making a precise incision, not a construction worker demolishing a wall.

## Search-Based Edit
Search Terms: ${searchPlan?.searchTerms?.join(', ') || 'keyword-based'}
Edit Type: ${searchPlan?.editType || 'UPDATE_COMPONENT'}
Reasoning: ${searchPlan?.reasoning || 'Modifying based on user request'}

Files to Edit: ${targetFiles.join(', ') || 'To be determined'}
User Request: "${prompt}"

## Your Mandatory Thought Process (Execute Internally):
Before writing ANY code, you MUST follow these steps:

1. **Understand Intent:**
   - What is the user's core goal? (adding feature, fixing bug, changing style?)
   - Does the conversation history provide extra clues?

2. **Locate the Code:**
   - First examine the Primary Files provided
   - Check the "ALL PROJECT FILES" list to find the EXACT file name
   - "nav" might be Navigation.tsx, NavBar.tsx, Nav.tsx, or Header.tsx
   - DO NOT create a new file if a similar one exists!

3. **Plan the Changes (Mental Diff):**
   - What is the *minimal* set of changes required?
   - Which exact lines need to be added, modified, or deleted?
   - Will this require new packages?

4. **Verify Preservation:**
   - What existing code, props, state, and logic must NOT be touched?
   - How can I make my change without disrupting surrounding code?

5. **Construct the Final Code:**
   - Only after completing steps above, generate the final code
   - Provide the ENTIRE file content with modifications integrated

## Critical Rules & Constraints:

**PRESERVATION IS KEY:** You MUST NOT rewrite entire components or files. Integrate your changes into the existing code. Preserve all existing logic, props, state, and comments not directly related to the user's request.

**MINIMALISM:** Only output files you have actually changed. If a file doesn't need modification, don't include it.

**COMPLETENESS:** Each file must be COMPLETE from first line to last:
- NEVER TRUNCATE - Include EVERY line
- NO ellipsis (...) to skip content
- ALL imports, functions, JSX, and closing tags must be present
- The file MUST be runnable

**SURGICAL PRECISION:**
- Change ONLY what's explicitly requested
- If user says "change background to green", change ONLY the background class
- 99% of the original code should remain untouched
- NO refactoring, reformatting, or "improvements" unless requested

**NO CONVERSATION:** Your output must contain ONLY the code. No explanations or apologies.

## EXAMPLES:

### CORRECT APPROACH for "change hero background to blue":
<thinking>
I need to change the background color of the Hero component. Looking at the file, I see the main div has 'bg-gray-900'. I will change ONLY this to 'bg-blue-500' and leave everything else exactly as is.
</thinking>

Then return the EXACT same file with only 'bg-gray-900' changed to 'bg-blue-500'.

### WRONG APPROACH (DO NOT DO THIS):
- Rewriting the Hero component from scratch
- Changing the structure or reorganizing imports
- Adding or removing unrelated code
- Reformatting or "cleaning up" the code

Remember: You are a SURGEON making a precise incision, not an artist repainting the canvas!`,
                          editIntent: {
                            type: searchPlan?.editType || 'UPDATE_COMPONENT',
                            targetFiles: targetFiles,
                            confidence: searchPlan ? 0.85 : 0.6,
                            description: searchPlan?.reasoning || 'Keyword-based file selection',
                            suggestedContext: []
                          }
                        };
                        
                        enhancedSystemPrompt = editContext.systemPrompt;
                        
                        await sendProgress({ 
                          type: 'status', 
                          message: `Identified edit type: ${editContext.editIntent.description}`
                        });
                      }
                    } catch (error) {
                      console.error('[generate-ai-code-stream] Error analyzing intent after fetch:', error);
                    }
                  } else {
                    console.error('[generate-ai-code-stream] Failed to get manifest from sandbox files');
                  }
                } else {
                  console.error('[generate-ai-code-stream] Failed to fetch sandbox files:', filesResponse.status);
                }
              } catch (error) {
                console.error('[generate-ai-code-stream] Error fetching sandbox files:', error);
                await sendProgress({ 
                  type: 'warning', 
                  message: 'Could not analyze existing files for targeted edits. Proceeding with general edit mode.'
                });
              }
            } else {
              console.log('[generate-ai-code-stream] No active sandbox to fetch files from');
              await sendProgress({ 
                type: 'warning', 
                message: 'No existing files found. Consider generating initial code first.'
              });
            }
          }
        }
        
        // Use enhanced conversation context bridge for better context management
        const { conversationContextBridge } = await import('@/lib/conversation-context-bridge');
        
        const contextualRequest = {
          userRequest: prompt,
          isEdit,
          sandboxId: context?.sandboxId,
          currentFiles: global.sandboxState?.fileCache?.files ? 
            Object.fromEntries(
              Object.entries(global.sandboxState.fileCache.files).map(([path, data]) => [path, data.content])
            ) : undefined,
          manifest: global.sandboxState?.fileCache?.manifest,
          scrapedContent: context?.conversationContext?.scrapedWebsites?.map((site: any) => ({
            url: site.url,
            content: site.content,
            timestamp: site.timestamp.getTime()
          }))
        };
        
        console.log('[generate-ai-code-stream] Processing request with conversation context bridge...');
        
        // Process with enhanced conversation context
        contextualResult = await conversationContextBridge.processCodeGenerationRequest(contextualRequest);
        
        console.log('[generate-ai-code-stream] Context bridge result:', {
          conversationId: contextualResult.conversationState.conversationId,
          relevanceScore: contextualResult.contextQuality.relevanceScore,
          completenessScore: contextualResult.contextQuality.completenessScore,
          recommendationsApplied: contextualResult.contextQuality.recommendationsApplied
        });
        
        const finalPrompt = contextualResult.prompt;
        
        console.log('[generate-ai-code-stream] Formatted prompt length:', finalPrompt.length);
        console.log('[generate-ai-code-stream] Enhanced context applied with quality scores:', {
          relevance: contextualResult.contextQuality.relevanceScore,
          completeness: contextualResult.contextQuality.completenessScore
        });
        
        await sendStatus('Planning application structure...');
        
        console.log('\n[generate-ai-code-stream] Starting streaming response...\n');
        
        // Temporarily disabled - will be replaced with Claude Code integration
        // For now, return a mock response indicating the feature is being updated
        await sendStatus('AI SDK integration is being replaced with Claude Code interface...');

        // Use the formatted prompt for Claude Code
        console.log('[generate-ai-code-stream] Using formatted prompt of length:', finalPrompt.length);
        
        // Claude Code integration options (placeholder for now)
        const claudeCodeOptions: any = {
          model: model || 'claude-3-5-sonnet-20241022',
          prompt: finalPrompt,
          maxTokens: 8192,
          temperature: 0.7,
          stream: true
        };
        
        console.log('[generate-ai-code-stream] Claude Code options prepared:', {
          model: claudeCodeOptions.model,
          promptLength: claudeCodeOptions.prompt.length,
          maxTokens: claudeCodeOptions.maxTokens,
          stream: claudeCodeOptions.stream
        });
        
        // Generate a Claude Code response based on the request with fallback support
        const fallbackResult = await generateClaudeCodeResponse(finalPrompt, {
          isEdit,
          editIntent: contextualResult.context.editIntent,
          model: claudeCodeOptions.model,
          context: {
            currentFiles: global.sandboxState?.fileCache?.files ? 
              Object.fromEntries(
                Object.entries(global.sandboxState.fileCache.files).map(([path, data]) => [path, data.content])
              ) : undefined,
            manifest: global.sandboxState?.fileCache?.manifest
          }
        });
        
        console.log('[generate-ai-code-stream] Fallback response received:', {
          success: fallbackResult.success,
          method: fallbackResult.method,
          contentLength: fallbackResult.content.length,
          confidenceScore: fallbackResult.metadata.confidenceScore
        });

        // Send status update about the generation method used
        if (fallbackResult.method === 'template') {
          await sendStatus(`Using template: ${fallbackResult.metadata.templateUsed || 'Generic template'}`);
        } else if (fallbackResult.method === 'cached') {
          await sendStatus('Using cached response for similar request');
        } else if (fallbackResult.method === 'static') {
          await sendStatus('Using static analysis and pattern matching');
        } else if (fallbackResult.method === 'ai') {
          await sendStatus('AI code generation successful');
        }

        // Send warnings about limitations if any
        if (fallbackResult.metadata.limitations.length > 0) {
          await sendSSEChunk(writer, {
            type: 'status',
            message: 'Generation limitations',
            data: {
              limitations: fallbackResult.metadata.limitations,
              confidenceScore: fallbackResult.metadata.confidenceScore,
              method: fallbackResult.method
            }
          }, encoder);
        }

        const claudeCodeResponse = fallbackResult.content;
        
        // Create streaming generator from the response
        const responseStream = createStreamingResponse(claudeCodeResponse);
        
        // Stream the response using our new parser
        let generatedCode = claudeCodeResponse;
        let componentCount = 0;
        const packagesToInstall: string[] = [];
        
        // Stream the parsed response chunks using new SSE-compatible system
        for await (const chunk of responseStream) {
          console.log('[generate-ai-code-stream] Streaming chunk:', chunk.type);
          
          // Use the new SSE helper to send properly formatted chunks
          await sendSSEChunk(writer, chunk, encoder);
          
          // Track packages and components for final summary
          if (chunk.type === 'component') {
            componentCount++;
          } else if (chunk.type === 'package') {
            const packageName = chunk.name || chunk.data?.name;
            if (packageName && !packagesToInstall.includes(packageName)) {
              packagesToInstall.push(packageName);
              console.log(`[generate-ai-code-stream] Package detected: ${packageName}`);
            }
          } else if (chunk.type === 'complete') {
            // Handle completion in the next section
            break;
          }
        }
        
        console.log('\n\n[generate-ai-code-stream] Streaming complete.');
        
        // Parse the complete response to get final data
        const parseResult = parseClaudeCodeResponse(claudeCodeResponse);
        
        // Add any additional packages that weren't caught during streaming
        for (const pkg of parseResult.packages) {
          if (!packagesToInstall.includes(pkg.name)) {
            packagesToInstall.push(pkg.name);
            console.log(`[generate-ai-code-stream] Additional package detected: ${pkg.name}`);
            await sendProgress({
              type: 'package',
              name: pkg.name,
              message: `Package detected: ${pkg.name}`
            });
          }
        }
        
        // Use parsed data for validation and completion
        const files = parseResult.files;
        const explanation = parseResult.explanation || 'Code generated successfully!';
        
        // Basic validation using our parser's validation
        const validation = validateClaudeCodeResponse(claudeCodeResponse);
        const truncationWarnings = validation.valid ? [] : validation.errors;
        
        // Handle validation warnings
        if (truncationWarnings.length > 0) {
          console.warn('[generate-ai-code-stream] Response validation warnings:', truncationWarnings);
          
          await sendProgress({
            type: 'warning',
            message: 'Response validation warnings detected',
            warnings: truncationWarnings
          });
        }
        
        // Send completion with packages info and fallback details
        await sendProgress({ 
          type: 'complete', 
          generatedCode,
          explanation,
          files: files.length,
          components: componentCount,
          model,
          packagesToInstall: packagesToInstall.length > 0 ? packagesToInstall : undefined,
          warnings: truncationWarnings.length > 0 ? truncationWarnings : undefined,
          fallbackInfo: {
            method: fallbackResult.method,
            confidenceScore: fallbackResult.metadata.confidenceScore,
            limitations: fallbackResult.metadata.limitations,
            templateUsed: fallbackResult.metadata.templateUsed,
            cacheKey: fallbackResult.metadata.cacheKey
          }
        });
        
        // Track code generation completion in conversation bridge
        const editType = contextualResult.context.editIntent?.type || 'GENERATE_CODE';
        const targetFiles = contextualResult.enhancedFileContext?.primaryFiles || [];
        
        await conversationContextBridge.trackCodeGenerationCompletion(
          prompt,
          claudeCodeResponse,
          isEdit,
          editType,
          targetFiles,
          fallbackResult.success,
          fallbackResult.success ? undefined : `Generation failed with method: ${fallbackResult.method}`
        );
        
        console.log('[generate-ai-code-stream] Tracked code generation completion in conversation bridge');
        
      } catch (error) {
        console.error('[generate-ai-code-stream] Stream processing error:', error);
        
        // NOTE: Conversation context bridge tracking removed for local-only operation
        console.log(`[generate-ai-code-stream] Error tracking skipped - local-only mode`);
        
        // Check if it's a tool validation error
        if ((error as any).message?.includes('tool call validation failed')) {
          console.error('[generate-ai-code-stream] Tool call validation error - this may be due to the AI model sending incorrect parameters');
          await sendProgress({ 
            type: 'warning', 
            message: 'Package installation tool encountered an issue. Packages will be detected from imports instead.'
          });
          // Continue processing - packages can still be detected from the code
        } else {
          await sendProgress({ 
            type: 'error', 
            error: (error as Error).message 
          });
        }
      } finally {
        await writer.close();
      }
    })();
    
    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('[generate-ai-code-stream] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}