/**
 * Claude Code Context Manager
 * 
 * Adapts the existing context management system to work with Claude Code's 
 * conversation model and session structure.
 */

import type { 
  ClaudeCodeSession, 
  ClaudeCodeMessage, 
  EditHistoryEntry 
} from '@/types/claude-code';
import type { 
  ConversationState, 
  ConversationMessage, 
  ConversationContext,
  ConversationEdit
} from '@/types/conversation';
import type { FileManifest } from '@/types/file-manifest';

export interface ClaudeCodeContextOptions {
  maxContextSize?: number;
  messageRetentionCount?: number;
  includeScrapeHistory?: boolean;
  includeEditHistory?: boolean;
  pruneStrategy?: 'oldest' | 'least-relevant' | 'size-based';
}

export interface ClaudeCodeContextWindow {
  systemPrompt: string;
  conversationHistory: ClaudeCodeMessage[];
  currentFiles: Record<string, string>;
  scrapedWebsites: Array<{
    url: string;
    timestamp: number;
    content: string;
  }>;
  editHistory: EditHistoryEntry[];
  contextMetadata: {
    totalTokens: number;
    messagesCount: number;
    filesCount: number;
    lastPruned?: number;
  };
}

/**
 * Main context manager class for Claude Code integration
 */
export class ClaudeCodeContextManager {
  private options: Required<ClaudeCodeContextOptions>;

  constructor(options: ClaudeCodeContextOptions = {}) {
    this.options = {
      maxContextSize: options.maxContextSize || 16000, // tokens
      messageRetentionCount: options.messageRetentionCount || 20,
      includeScrapeHistory: options.includeScrapeHistory ?? true,
      includeEditHistory: options.includeEditHistory ?? true,
      pruneStrategy: options.pruneStrategy || 'size-based'
    };
  }

  /**
   * Convert conversation state to Claude Code session format
   */
  convertToClaudeCodeSession(
    conversationState: ConversationState,
    sandboxId?: string
  ): ClaudeCodeSession {
    const claudeCodeMessages = this.convertMessages(conversationState.context.messages);
    const editHistory = this.convertEditHistory(conversationState.context.edits);

    return {
      sessionId: conversationState.conversationId,
      startedAt: conversationState.startedAt,
      lastActivity: conversationState.lastUpdated,
      messages: claudeCodeMessages,
      context: {
        sandboxId: sandboxId,
        projectName: `project_${sandboxId || 'default'}`,
        currentFiles: {},
        editHistory: editHistory
      }
    };
  }

  /**
   * Convert Claude Code session back to conversation state
   */
  convertFromClaudeCodeSession(session: ClaudeCodeSession): ConversationState {
    const conversationMessages = this.convertFromClaudeCodeMessages(session.messages);
    const conversationEdits = this.convertFromEditHistory(session.context.editHistory);

    return {
      conversationId: session.sessionId,
      startedAt: session.startedAt,
      lastUpdated: session.lastActivity,
      context: {
        messages: conversationMessages,
        edits: conversationEdits,
        projectEvolution: {
          majorChanges: []
        },
        userPreferences: {}
      }
    };
  }

  /**
   * Build context window for Claude Code with intelligent pruning
   */
  buildContextWindow(
    conversationState: ConversationState,
    currentFiles?: Record<string, string>,
    manifest?: FileManifest
  ): ClaudeCodeContextWindow {
    const contextWindow: ClaudeCodeContextWindow = {
      systemPrompt: this.buildSystemPrompt(conversationState.context),
      conversationHistory: [],
      currentFiles: currentFiles || {},
      scrapedWebsites: conversationState.context.scrapedWebsites || [],
      editHistory: this.convertEditHistory(conversationState.context.edits),
      contextMetadata: {
        totalTokens: 0,
        messagesCount: 0,
        filesCount: Object.keys(currentFiles || {}).length
      }
    };

    // Convert and prune messages
    const claudeCodeMessages = this.convertMessages(conversationState.context.messages);
    contextWindow.conversationHistory = this.pruneMessages(claudeCodeMessages);
    contextWindow.contextMetadata.messagesCount = contextWindow.conversationHistory.length;

    // Estimate total tokens
    contextWindow.contextMetadata.totalTokens = this.estimateTokens(contextWindow);

    return contextWindow;
  }

  /**
   * Update context with new scraped website data
   */
  updateScrapedWebsiteContext(
    contextWindow: ClaudeCodeContextWindow,
    scrapedData: {
      url: string;
      content: string;
    }
  ): ClaudeCodeContextWindow {
    const newScrapedSite = {
      url: scrapedData.url,
      timestamp: Date.now(),
      content: scrapedData.content
    };

    // Create a new context window to avoid mutation
    const updatedContextWindow = {
      ...contextWindow,
      scrapedWebsites: [...contextWindow.scrapedWebsites, newScrapedSite]
    };

    // Prune old scraped data if needed
    if (updatedContextWindow.scrapedWebsites.length > 5) {
      updatedContextWindow.scrapedWebsites = updatedContextWindow.scrapedWebsites
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5);
    }

    // Update token estimate
    updatedContextWindow.contextMetadata = {
      ...updatedContextWindow.contextMetadata,
      totalTokens: this.estimateTokens(updatedContextWindow)
    };

    return updatedContextWindow;
  }

  /**
   * Add component library reference to context
   */
  addComponentLibraryReference(
    contextWindow: ClaudeCodeContextWindow,
    libraryName: string,
    components: string[]
  ): ClaudeCodeContextWindow {
    // Add system message about available components
    const componentMessage: ClaudeCodeMessage = {
      role: 'system',
      content: `Component Library Available: ${libraryName}
Available Components: ${components.join(', ')}
Use these components when building the application.`,
      timestamp: Date.now(),
      metadata: {
        type: 'component_library',
        library: libraryName,
        components: components
      }
    };

    contextWindow.conversationHistory.unshift(componentMessage);
    contextWindow.contextMetadata.messagesCount++;
    contextWindow.contextMetadata.totalTokens = this.estimateTokens(contextWindow);

    return contextWindow;
  }

  /**
   * Prune context to fit within size limits
   */
  pruneContextWindow(contextWindow: ClaudeCodeContextWindow): ClaudeCodeContextWindow {
    if (contextWindow.contextMetadata.totalTokens <= this.options.maxContextSize) {
      return contextWindow;
    }

    const prunedWindow = { ...contextWindow };

    // Apply pruning strategy
    switch (this.options.pruneStrategy) {
      case 'oldest':
        prunedWindow.conversationHistory = this.pruneOldestMessages(
          prunedWindow.conversationHistory
        );
        break;
      case 'least-relevant':
        prunedWindow.conversationHistory = this.pruneLeastRelevantMessages(
          prunedWindow.conversationHistory
        );
        break;
      case 'size-based':
      default:
        prunedWindow.conversationHistory = this.pruneBySizeTargets(
          prunedWindow.conversationHistory
        );
        break;
    }

    // Prune scraped websites if still too large
    if (this.estimateTokens(prunedWindow) > this.options.maxContextSize) {
      prunedWindow.scrapedWebsites = prunedWindow.scrapedWebsites.slice(0, 2);
    }

    // Update metadata
    prunedWindow.contextMetadata.totalTokens = this.estimateTokens(prunedWindow);
    prunedWindow.contextMetadata.messagesCount = prunedWindow.conversationHistory.length;
    prunedWindow.contextMetadata.lastPruned = Date.now();

    return prunedWindow;
  }

  /**
   * Convert conversation messages to Claude Code format
   */
  private convertMessages(messages: ConversationMessage[]): ClaudeCodeMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata
    }));
  }

  /**
   * Convert Claude Code messages back to conversation format
   */
  private convertFromClaudeCodeMessages(messages: ClaudeCodeMessage[]): ConversationMessage[] {
    return messages.map(msg => ({
      id: `msg_${msg.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      role: msg.role === 'system' ? 'assistant' : msg.role,
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      metadata: msg.metadata
    }));
  }

  /**
   * Convert conversation edits to Claude Code edit history
   */
  private convertEditHistory(edits: ConversationEdit[]): EditHistoryEntry[] {
    return edits.map(edit => ({
      timestamp: edit.timestamp,
      userRequest: edit.userRequest,
      editType: this.mapEditType(edit.editType),
      filesModified: edit.targetFiles,
      success: edit.outcome === 'success',
      errorMessage: edit.errorMessage
    }));
  }

  /**
   * Convert Claude Code edit history back to conversation format
   */
  private convertFromEditHistory(editHistory: EditHistoryEntry[]): ConversationEdit[] {
    return editHistory.map(entry => ({
      timestamp: entry.timestamp,
      userRequest: entry.userRequest,
      editType: entry.editType,
      targetFiles: entry.filesModified,
      confidence: entry.success ? 1.0 : 0.5,
      outcome: entry.success ? 'success' : 'failed',
      errorMessage: entry.errorMessage
    }));
  }

  /**
   * Map edit types between formats
   */
  private mapEditType(editType: string): 'create' | 'modify' | 'debug' | 'analyze' {
    switch (editType.toLowerCase()) {
      case 'add_feature':
      case 'add_component':
      case 'add_dependency':
        return 'create';
      case 'fix_issue':
      case 'fix_bug':
        return 'debug';
      case 'analyze':
      case 'explain':
        return 'analyze';
      default:
        return 'modify';
    }
  }

  /**
   * Build system prompt with conversation context
   */
  private buildSystemPrompt(context: ConversationContext): string {
    const sections: string[] = [];

    sections.push(`You are an expert React developer with perfect memory of the conversation. You maintain context across messages and remember scraped websites, generated components, and applied code.`);

    // Add user preferences if available
    if (context.userPreferences.editStyle) {
      sections.push(`User prefers ${context.userPreferences.editStyle} editing style.`);
    }

    // Add current topic if available
    if (context.currentTopic) {
      sections.push(`Current focus: ${context.currentTopic}`);
    }

    // Add recently generated components
    if (context.generatedComponents?.length) {
      sections.push(`Recently generated components: ${context.generatedComponents.slice(-5).join(', ')}`);
    }

    // Add major project changes context
    if (context.projectEvolution.majorChanges.length > 0) {
      const recentChanges = context.projectEvolution.majorChanges.slice(-3);
      sections.push(`Recent major changes:\n${recentChanges.map(change => `- ${change.description}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Prune messages to fit within retention count
   */
  private pruneMessages(messages: ClaudeCodeMessage[]): ClaudeCodeMessage[] {
    if (messages.length <= this.options.messageRetentionCount) {
      return messages;
    }

    // Always keep system messages
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

    // Keep most recent non-system messages
    const recentMessages = nonSystemMessages.slice(-this.options.messageRetentionCount);

    return [...systemMessages, ...recentMessages];
  }

  /**
   * Prune oldest messages first
   */
  private pruneOldestMessages(messages: ClaudeCodeMessage[]): ClaudeCodeMessage[] {
    const sorted = [...messages].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return sorted.slice(0, this.options.messageRetentionCount);
  }

  /**
   * Prune least relevant messages (heuristic-based)
   */
  private pruneLeastRelevantMessages(messages: ClaudeCodeMessage[]): ClaudeCodeMessage[] {
    // Score messages by relevance
    const scoredMessages = messages.map(msg => ({
      message: msg,
      score: this.calculateRelevanceScore(msg)
    }));

    // Sort by score (highest first) and take top messages
    scoredMessages.sort((a, b) => b.score - a.score);
    return scoredMessages
      .slice(0, this.options.messageRetentionCount)
      .map(item => item.message);
  }

  /**
   * Calculate relevance score for a message
   */
  private calculateRelevanceScore(message: ClaudeCodeMessage): number {
    let score = 0;

    // System messages are always relevant
    if (message.role === 'system') {
      score += 100;
    }

    // Recent messages are more relevant
    const age = Date.now() - (message.timestamp || 0);
    const hoursSinceMessage = age / (1000 * 60 * 60);
    score += Math.max(0, 50 - hoursSinceMessage);

    // Messages with file edits are more relevant
    if (message.metadata?.editedFiles?.length) {
      score += 30;
    }

    // Longer messages might be more substantial
    score += Math.min(20, message.content.length / 100);

    return score;
  }

  /**
   * Prune by size targets to fit context window
   */
  private pruneBySizeTargets(messages: ClaudeCodeMessage[]): ClaudeCodeMessage[] {
    const targetSize = Math.floor(this.options.maxContextSize * 0.7); // Leave room for other context
    let currentSize = 0;
    const prunedMessages: ClaudeCodeMessage[] = [];

    // Start from most recent and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const messageSize = this.estimateMessageTokens(messages[i]);
      
      if (currentSize + messageSize <= targetSize) {
        prunedMessages.unshift(messages[i]);
        currentSize += messageSize;
      } else if (messages[i].role === 'system') {
        // Always include system messages, even if they push us over
        prunedMessages.unshift(messages[i]);
      }
    }

    return prunedMessages;
  }

  /**
   * Estimate token count for the entire context window
   */
  private estimateTokens(contextWindow: ClaudeCodeContextWindow): number {
    let tokens = 0;

    // System prompt
    tokens += this.estimateTextTokens(contextWindow.systemPrompt);

    // Messages
    tokens += contextWindow.conversationHistory.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg), 
      0
    );

    // Files (approximate)
    tokens += Object.values(contextWindow.currentFiles).reduce(
      (sum, content) => sum + this.estimateTextTokens(content), 
      0
    );

    // Scraped websites (approximate)
    tokens += contextWindow.scrapedWebsites.reduce(
      (sum, site) => sum + this.estimateTextTokens(site.content), 
      0
    );

    return tokens;
  }

  /**
   * Estimate tokens for a single message
   */
  private estimateMessageTokens(message: ClaudeCodeMessage): number {
    return this.estimateTextTokens(message.content) + 10; // overhead for role/metadata
  }

  /**
   * Estimate tokens for text content (rough approximation)
   */
  private estimateTextTokens(text: string): number {
    // Very rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}

/**
 * Global context manager instance
 */
let globalContextManager: ClaudeCodeContextManager | null = null;

/**
 * Get or create the global context manager
 */
export function getClaudeCodeContextManager(
  options?: ClaudeCodeContextOptions
): ClaudeCodeContextManager {
  if (!globalContextManager) {
    globalContextManager = new ClaudeCodeContextManager(options);
  }
  return globalContextManager;
}

/**
 * Utility function to format context for Claude Code prompts
 */
export function formatContextForClaudeCode(
  contextWindow: ClaudeCodeContextWindow,
  includeFiles: boolean = true
): string {
  const sections: string[] = [];

  // Add conversation history
  if (contextWindow.conversationHistory.length > 0) {
    sections.push('## Conversation History\n');
    contextWindow.conversationHistory.forEach((msg, index) => {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      const content = msg.content.length > 300 
        ? msg.content.substring(0, 300) + '...' 
        : msg.content;
      sections.push(`**${role}:** ${content}\n`);
    });
  }

  // Add scraped websites
  if (contextWindow.scrapedWebsites.length > 0) {
    sections.push('## Scraped Websites\n');
    contextWindow.scrapedWebsites.forEach((site, index) => {
      sections.push(`### ${site.url}\n`);
      sections.push(`*Scraped: ${new Date(site.timestamp).toLocaleString()}*\n`);
      const preview = site.content.substring(0, 500);
      sections.push(`${preview}...\n`);
    });
  }

  // Add current files if requested
  if (includeFiles && Object.keys(contextWindow.currentFiles).length > 0) {
    sections.push('## Current Files\n');
    Object.entries(contextWindow.currentFiles).forEach(([path, content]) => {
      sections.push(`### ${path}\n`);
      sections.push(`\`\`\`typescript\n${content}\n\`\`\`\n`);
    });
  }

  return sections.join('\n');
}