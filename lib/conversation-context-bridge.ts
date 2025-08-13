/**
 * Conversation Context Bridge
 * Integrates the enhanced conversation manager with existing API routes
 * Provides a seamless interface between conversation state and Claude Code integration
 */

import { conversationManager, type ConversationConfig } from '@/lib/conversation-manager';
import { selectEnhancedFilesForEdit, type EnhancedFileContext } from '@/lib/enhanced-context-selector';
import { formatCodeGenerationPrompt, type CodeGenerationContext } from '@/lib/claude-prompt-formatter';
import type { ConversationState, ConversationMessage, ConversationEdit } from '@/types/conversation';
import type { FileManifest } from '@/types/file-manifest';

export interface ContextBridgeOptions {
  enableConversationHistory: boolean;
  enableSmartContextSelection: boolean;
  enableUserPatternAdaptation: boolean;
  maxHistoryItems: number;
  persistAcrossSessions: boolean;
}

export interface ContextualCodeGenerationRequest {
  userRequest: string;
  isEdit: boolean;
  sandboxId?: string;
  currentFiles?: Record<string, string>;
  manifest?: FileManifest;
  scrapedContent?: Array<{
    url: string;
    content: string;
    timestamp: number;
  }>;
  bridgeOptions?: Partial<ContextBridgeOptions>;
}

export interface ContextualCodeGenerationResult {
  prompt: string;
  context: CodeGenerationContext;
  conversationState: ConversationState;
  enhancedFileContext?: EnhancedFileContext;
  contextQuality: {
    relevanceScore: number;
    completenessScore: number;
    recommendationsApplied: string[];
  };
}

/**
 * Conversation Context Bridge Class
 * Manages the integration between conversation state and code generation
 */
export class ConversationContextBridge {
  private options: ContextBridgeOptions;

  constructor(options: Partial<ContextBridgeOptions> = {}) {
    this.options = {
      enableConversationHistory: true,
      enableSmartContextSelection: true,
      enableUserPatternAdaptation: true,
      maxHistoryItems: 10,
      persistAcrossSessions: true,
      ...options
    };
  }

  /**
   * Process a code generation request with full conversation context
   */
  public async processCodeGenerationRequest(
    request: ContextualCodeGenerationRequest
  ): Promise<ContextualCodeGenerationResult> {
    const startTime = Date.now();

    // Ensure conversation manager is initialized
    if (!conversationManager.getState()) {
      conversationManager.initializeConversation(request.sandboxId || `conv-${startTime}`);
    }

    // Add user message to conversation
    const userMessage = conversationManager.addMessage(
      'user',
      request.userRequest,
      {
        sandboxId: request.sandboxId
      }
    );

    // Update current topic based on request
    conversationManager.updateCurrentTopic(request.userRequest);

    // Get conversation state and relevant context
    const conversationState = conversationManager.getState()!;
    const relevantContext = conversationManager.getRelevantContext(
      request.userRequest,
      request.currentFiles,
      request.manifest
    );

    console.log('[ContextBridge] Conversation context loaded:', {
      conversationId: conversationState.conversationId,
      totalMessages: conversationState.context.messages.length,
      relevantMessages: relevantContext.recentMessages.length,
      relevantEdits: relevantContext.relevantEdits.length,
      userPreferences: relevantContext.userPreferences
    });

    // Enhanced file context selection
    let enhancedFileContext: EnhancedFileContext | undefined;
    if (this.options.enableSmartContextSelection && request.manifest) {
      enhancedFileContext = selectEnhancedFilesForEdit(
        request.userRequest,
        request.manifest,
        relevantContext.recentMessages,
        relevantContext.relevantEdits,
        {
          includeConversationHistory: this.options.enableConversationHistory,
          maxHistoryItems: this.options.maxHistoryItems,
          adaptToUserStyle: this.options.enableUserPatternAdaptation,
          includeQualityAnalysis: true
        }
      );

      console.log('[ContextBridge] Enhanced file context:', {
        primaryFiles: enhancedFileContext.primaryFiles,
        contextFiles: enhancedFileContext.contextFiles.slice(0, 5), // Log first 5
        relevanceScore: enhancedFileContext.contextQuality.relevanceScore,
        completenessScore: enhancedFileContext.contextQuality.completenessScore,
        recentlyModified: enhancedFileContext.conversationContext.recentlyModifiedFiles
      });
    }

    // Build code generation context
    const codeGenContext: CodeGenerationContext = {
      userRequest: request.userRequest,
      isEdit: request.isEdit,
      editIntent: enhancedFileContext?.editIntent,
      primaryFiles: enhancedFileContext ? 
        await this.getFileContents(enhancedFileContext.primaryFiles, request.manifest) : undefined,
      contextFiles: enhancedFileContext ? 
        await this.getFileContents(enhancedFileContext.contextFiles, request.manifest) : undefined,
      conversationHistory: this.options.enableConversationHistory ? 
        relevantContext.recentMessages : undefined,
      scrapedContent: request.scrapedContent,
      manifest: request.manifest
    };

    // Format prompt with enhanced context
    const claudePrompt = formatCodeGenerationPrompt(codeGenContext);
    const finalPrompt = this.enhancePromptWithConversationInsights(
      claudePrompt,
      relevantContext,
      enhancedFileContext
    );

    // Calculate context quality
    const contextQuality = this.calculateContextQuality(
      enhancedFileContext,
      relevantContext,
      codeGenContext
    );

    const processingTime = Date.now() - startTime;
    console.log(`[ContextBridge] Request processed in ${processingTime}ms`);

    return {
      prompt: finalPrompt,
      context: codeGenContext,
      conversationState,
      enhancedFileContext,
      contextQuality
    };
  }

  /**
   * Track the completion of a code generation request
   */
  public async trackCodeGenerationCompletion(
    userRequest: string,
    generatedCode: string,
    isEdit: boolean,
    editType?: string,
    targetFiles?: string[],
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    // Add assistant message
    conversationManager.addMessage(
      'assistant',
      `Generated ${isEdit ? 'code modifications' : 'new code'} for: ${userRequest}`,
      {
        editType
      }
    );

    // Track edit if this was an edit operation
    if (isEdit && editType && targetFiles) {
      conversationManager.addEdit(
        userRequest,
        editType,
        targetFiles,
        0.8, // Default confidence
        success ? 'success' : 'failed',
        errorMessage
      );
    }

    console.log('[ContextBridge] Code generation completion tracked');
  }

  /**
   * Get conversation metrics and insights
   */
  public getConversationInsights(): {
    metrics: ReturnType<typeof conversationManager.getMetrics>;
    state: ConversationState | null;
    recommendations: string[];
  } {
    const metrics = conversationManager.getMetrics();
    const state = conversationManager.getState();
    const recommendations = this.generateRecommendations(metrics, state);

    return {
      metrics,
      state,
      recommendations
    };
  }

  /**
   * Cleanup conversation context (manual trigger)
   */
  public cleanupConversationContext(): void {
    conversationManager.cleanupContext();
    console.log('[ContextBridge] Conversation context cleanup completed');
  }

  /**
   * Reset conversation state
   */
  public resetConversation(): void {
    conversationManager.resetConversation();
    console.log('[ContextBridge] Conversation state reset');
  }

  /**
   * Update bridge options
   */
  public updateOptions(newOptions: Partial<ContextBridgeOptions>): void {
    this.options = { ...this.options, ...newOptions };
    console.log('[ContextBridge] Options updated:', this.options);
  }

  /**
   * Get file contents safely with error handling
   */
  private async getFileContents(
    filePaths: string[],
    manifest?: FileManifest
  ): Promise<Record<string, string> | undefined> {
    if (!manifest || filePaths.length === 0) return undefined;

    const contents: Record<string, string> = {};
    
    for (const path of filePaths) {
      const fileInfo = manifest.files[path];
      if (fileInfo) {
        contents[path] = fileInfo.content;
      }
    }

    return Object.keys(contents).length > 0 ? contents : undefined;
  }

  /**
   * Enhance prompt with conversation insights
   */
  private enhancePromptWithConversationInsights(
    basePrompt: ReturnType<typeof formatCodeGenerationPrompt>,
    relevantContext: ReturnType<typeof conversationManager.getRelevantContext>,
    enhancedFileContext?: EnhancedFileContext
  ): string {
    let enhancedPrompt = basePrompt.systemMessage + '\n\n' + basePrompt.userMessage;

    // Add conversation insights section
    const insights: string[] = [];

    if (relevantContext.projectSummary && relevantContext.projectSummary !== 'New conversation') {
      insights.push(`## Project Context\n${relevantContext.projectSummary}`);
    }

    if (enhancedFileContext?.conversationContext.userPatterns.commonTargets.length) {
      insights.push(`## User Patterns\nThis user commonly works with: ${enhancedFileContext.conversationContext.userPatterns.commonTargets.join(', ')}`);
    }

    if (enhancedFileContext?.contextQuality.missingContext.length) {
      insights.push(`## Context Notes\nPotential missing context: ${enhancedFileContext.contextQuality.missingContext.join(', ')}`);
    }

    if (insights.length > 0) {
      enhancedPrompt += '\n\n' + insights.join('\n\n');
    }

    return enhancedPrompt;
  }

  /**
   * Calculate overall context quality score
   */
  private calculateContextQuality(
    enhancedFileContext?: EnhancedFileContext,
    relevantContext?: ReturnType<typeof conversationManager.getRelevantContext>,
    codeGenContext?: CodeGenerationContext
  ): ContextualCodeGenerationResult['contextQuality'] {
    let relevanceScore = 0.5; // Base score
    let completenessScore = 0.5; // Base score
    const recommendationsApplied: string[] = [];

    if (enhancedFileContext) {
      relevanceScore = enhancedFileContext.contextQuality.relevanceScore;
      completenessScore = enhancedFileContext.contextQuality.completenessScore;
      
      if (enhancedFileContext.contextQuality.recommendedFiles.length > 0) {
        recommendationsApplied.push('Additional relevant files suggested');
      }
    }

    if (relevantContext) {
      if (relevantContext.recentMessages.length > 0) {
        completenessScore += 0.1;
        recommendationsApplied.push('Conversation history included');
      }
      
      if (relevantContext.relevantEdits.length > 0) {
        completenessScore += 0.1;
        recommendationsApplied.push('Edit history analyzed');
      }

      if (relevantContext.userPreferences.editStyle) {
        completenessScore += 0.05;
        recommendationsApplied.push('User patterns adapted');
      }
    }

    if (codeGenContext?.scrapedContent?.length) {
      completenessScore += 0.1;
      recommendationsApplied.push('Scraped content included');
    }

    return {
      relevanceScore: Math.min(1, relevanceScore),
      completenessScore: Math.min(1, completenessScore),
      recommendationsApplied
    };
  }

  /**
   * Generate recommendations based on metrics and state
   */
  private generateRecommendations(
    metrics: ReturnType<typeof conversationManager.getMetrics>,
    state: ConversationState | null
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.averageEditConfidence < 0.7) {
      recommendations.push('Consider providing more specific details in your requests to improve edit accuracy');
    }

    if (metrics.memoryUsage.totalKB > 100) {
      recommendations.push('Conversation history is getting large - consider periodic cleanup for better performance');
    }

    if (metrics.recentActivity.messagesLast5Min > 10) {
      recommendations.push('High activity detected - you might benefit from batching related requests');
    }

    if (state && state.context.edits.filter(e => e.outcome === 'failed').length > 3) {
      recommendations.push('Several edit attempts have failed - consider reviewing file structure or request clarity');
    }

    if (metrics.primaryTopics.length > 5) {
      recommendations.push('Working on many different areas - consider focusing on one component at a time');
    }

    return recommendations;
  }
}

// Export singleton instance for global usage
export const conversationContextBridge = new ConversationContextBridge({
  enableConversationHistory: true,
  enableSmartContextSelection: true,
  enableUserPatternAdaptation: true,
  maxHistoryItems: 8,
  persistAcrossSessions: true
});