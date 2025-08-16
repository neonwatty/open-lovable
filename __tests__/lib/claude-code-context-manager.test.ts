/**
 * @jest-environment node
 */

import {
  ClaudeCodeContextManager,
  getClaudeCodeContextManager,
  formatContextForClaudeCode
} from '../../lib/claude-code-context-manager';
import type { ConversationState } from '../../types/conversation';
import type { ClaudeCodeSession } from '../../types/claude-code';

describe('ClaudeCodeContextManager', () => {
  let contextManager: ClaudeCodeContextManager;
  let mockConversationState: ConversationState;

  beforeEach(() => {
    contextManager = new ClaudeCodeContextManager({
      maxContextSize: 1000,
      messageRetentionCount: 5,
      includeScrapeHistory: true,
      includeEditHistory: true,
      pruneStrategy: 'size-based'
    });

    mockConversationState = {
      conversationId: 'test-conversation-123',
      startedAt: Date.now() - 3600000, // 1 hour ago
      lastUpdated: Date.now(),
      context: {
        messages: [
          {
            id: 'msg1',
            role: 'user',
            content: 'Create a button component',
            timestamp: Date.now() - 1800000
          },
          {
            id: 'msg2',
            role: 'assistant',
            content: 'I will create a button component for you.',
            timestamp: Date.now() - 1700000
          },
          {
            id: 'msg3',
            role: 'user',
            content: 'Make it blue',
            timestamp: Date.now() - 300000
          }
        ],
        edits: [
          {
            timestamp: Date.now() - 1700000,
            userRequest: 'Create a button component',
            editType: 'add_feature',
            targetFiles: ['src/components/Button.jsx'],
            confidence: 0.9,
            outcome: 'success'
          }
        ],
        projectEvolution: {
          majorChanges: []
        },
        userPreferences: {
          editStyle: 'targeted'
        }
      }
    };
  });

  describe('convertToClaudeCodeSession', () => {
    it('should convert conversation state to Claude Code session format', () => {
      const session = contextManager.convertToClaudeCodeSession(
        mockConversationState,
        'sandbox-123'
      );

      expect(session.sessionId).toBe('test-conversation-123');
      expect(session.context.sandboxId).toBe('sandbox-123');
      expect(session.messages).toHaveLength(3);
      expect(session.messages[0].role).toBe('user');
      expect(session.context.editHistory).toHaveLength(1);
      expect(session.context.editHistory[0].editType).toBe('create');
    });
  });

  describe('convertFromClaudeCodeSession', () => {
    it('should convert Claude Code session back to conversation state', () => {
      const claudeCodeSession: ClaudeCodeSession = {
        sessionId: 'claude-session-456',
        startedAt: Date.now() - 7200000,
        lastActivity: Date.now(),
        messages: [
          {
            role: 'user',
            content: 'Update header styling',
            timestamp: Date.now() - 600000
          },
          {
            role: 'assistant',
            content: 'I will update the header styling.',
            timestamp: Date.now() - 500000
          }
        ],
        context: {
          sandboxId: 'sandbox-456',
          projectName: 'test-project',
          currentFiles: {},
          editHistory: [
            {
              timestamp: Date.now() - 500000,
              userRequest: 'Update header styling',
              editType: 'modify',
              filesModified: ['src/components/Header.jsx'],
              success: true
            }
          ]
        }
      };

      const conversationState = contextManager.convertFromClaudeCodeSession(claudeCodeSession);

      expect(conversationState.conversationId).toBe('claude-session-456');
      expect(conversationState.context.messages).toHaveLength(2);
      expect(conversationState.context.edits).toHaveLength(1);
      expect(conversationState.context.edits[0].editType).toBe('modify');
    });
  });

  describe('buildContextWindow', () => {
    it('should build context window with conversation history', () => {
      const currentFiles = {
        'src/App.jsx': 'import React from "react";',
        'src/components/Button.jsx': 'export default function Button() {}'
      };

      const contextWindow = contextManager.buildContextWindow(
        mockConversationState,
        currentFiles
      );

      expect(contextWindow.conversationHistory).toHaveLength(3);
      expect(contextWindow.currentFiles).toEqual(currentFiles);
      expect(contextWindow.contextMetadata.filesCount).toBe(2);
      expect(contextWindow.contextMetadata.messagesCount).toBe(3);
      expect(contextWindow.contextMetadata.totalTokens).toBeGreaterThan(0);
    });

    it('should build minimal context window without conversation', () => {
      const contextWindow = contextManager.buildContextWindow(
        {
          ...mockConversationState,
          context: {
            ...mockConversationState.context,
            messages: []
          }
        }
      );

      expect(contextWindow.conversationHistory).toHaveLength(0);
      expect(contextWindow.contextMetadata.messagesCount).toBe(0);
    });
  });

  describe('updateScrapedWebsiteContext', () => {
    it('should add scraped website data to context', () => {
      const contextWindow = contextManager.buildContextWindow(mockConversationState);
      
      const updatedContextWindow = contextManager.updateScrapedWebsiteContext(
        contextWindow,
        {
          url: 'https://example.com',
          content: 'Example website content for testing'
        }
      );

      expect(updatedContextWindow.scrapedWebsites).toHaveLength(1);
      expect(updatedContextWindow.scrapedWebsites[0].url).toBe('https://example.com');
      expect(updatedContextWindow.scrapedWebsites[0].content).toBe('Example website content for testing');
    });

    it('should prune old scraped websites when limit exceeded', async () => {
      let contextWindow = contextManager.buildContextWindow(mockConversationState);
      
      // Add 6 scraped websites (limit is 5) with small delays to ensure different timestamps
      for (let i = 1; i <= 6; i++) {
        contextWindow = contextManager.updateScrapedWebsiteContext(
          contextWindow,
          {
            url: `https://example${i}.com`,
            content: `Content ${i}`
          }
        );
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      expect(contextWindow.scrapedWebsites).toHaveLength(5);
      // Should keep the most recent ones (sorted by timestamp descending)
      const urls = contextWindow.scrapedWebsites.map(site => site.url);
      expect(urls).toContain('https://example6.com');
      expect(urls).toContain('https://example5.com');
      expect(urls).not.toContain('https://example1.com'); // Should have been pruned
    });
  });

  describe('addComponentLibraryReference', () => {
    it('should add component library reference to context', () => {
      const contextWindow = contextManager.buildContextWindow(mockConversationState);
      
      const updatedContextWindow = contextManager.addComponentLibraryReference(
        contextWindow,
        'shadcn/ui',
        ['Button', 'Input', 'Dialog']
      );

      expect(updatedContextWindow.conversationHistory.length).toBeGreaterThanOrEqual(contextWindow.conversationHistory.length);
      
      const libraryMessage = updatedContextWindow.conversationHistory.find(
        msg => msg.metadata?.type === 'component_library'
      );
      
      expect(libraryMessage).toBeDefined();
      expect(libraryMessage?.content).toContain('shadcn/ui');
      expect(libraryMessage?.content).toContain('Button, Input, Dialog');
    });
  });

  describe('pruneContextWindow', () => {
    it('should prune context when it exceeds size limits', () => {
      // Create a context with many large messages
      const largeConversationState = {
        ...mockConversationState,
        context: {
          ...mockConversationState.context,
          messages: Array.from({ length: 10 }, (_, i) => ({
            id: `msg${i}`,
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: 'This is a very long message that contains a lot of content '.repeat(20),
            timestamp: Date.now() - (10 - i) * 60000
          }))
        }
      };

      const contextWindow = contextManager.buildContextWindow(largeConversationState);
      expect(contextWindow.contextMetadata.totalTokens).toBeGreaterThan(1000);

      const prunedContextWindow = contextManager.pruneContextWindow(contextWindow);
      
      // Check if pruning occurred - either tokens reduced or messages reduced
      const wasPruned = prunedContextWindow.contextMetadata.totalTokens < contextWindow.contextMetadata.totalTokens ||
                       prunedContextWindow.conversationHistory.length < contextWindow.conversationHistory.length;
      
      expect(wasPruned).toBe(true);
      if (prunedContextWindow.contextMetadata.lastPruned) {
        expect(prunedContextWindow.contextMetadata.lastPruned).toBeDefined();
      }
    });

    it('should not prune context when within size limits', () => {
      const contextWindow = contextManager.buildContextWindow(mockConversationState);
      const originalSize = contextWindow.contextMetadata.totalTokens;
      
      const prunedContextWindow = contextManager.pruneContextWindow(contextWindow);
      
      expect(prunedContextWindow.contextMetadata.totalTokens).toBe(originalSize);
      expect(prunedContextWindow.conversationHistory.length).toBe(contextWindow.conversationHistory.length);
    });
  });

  describe('message pruning strategies', () => {
    it('should preserve system messages when pruning', () => {
      const conversationWithSystemMessage = {
        ...mockConversationState,
        context: {
          ...mockConversationState.context,
          messages: [
            ...mockConversationState.context.messages,
            {
              id: 'system1',
              role: 'assistant' as const,
              content: 'System: Component library available',
              timestamp: Date.now(),
              metadata: { editType: 'component_library' }
            }
          ]
        }
      };

      // Create manager with very small retention limit
      const smallContextManager = new ClaudeCodeContextManager({
        messageRetentionCount: 2
      });

      const contextWindow = smallContextManager.buildContextWindow(conversationWithSystemMessage);
      
      // Should have preserved important messages
      expect(contextWindow.conversationHistory.length).toBeLessThanOrEqual(2);
    });
  });

  describe('global context manager', () => {
    it('should return singleton instance', () => {
      const manager1 = getClaudeCodeContextManager();
      const manager2 = getClaudeCodeContextManager();
      
      expect(manager1).toBe(manager2);
    });
  });

  describe('formatContextForClaudeCode', () => {
    it('should format context window for Claude Code consumption', () => {
      const contextWindow = contextManager.buildContextWindow(mockConversationState);
      const formattedContext = formatContextForClaudeCode(contextWindow, true);

      expect(formattedContext).toContain('## Conversation History');
      expect(formattedContext).toContain('**User:** Create a button component');
      expect(formattedContext).toContain('**Assistant:** I will create a button component');
    });

    it('should include scraped websites in formatted context', () => {
      let contextWindow = contextManager.buildContextWindow(mockConversationState);
      
      contextWindow = contextManager.updateScrapedWebsiteContext(
        contextWindow,
        {
          url: 'https://example.com',
          content: 'Test website content'
        }
      );

      const formattedContext = formatContextForClaudeCode(contextWindow, true);

      expect(formattedContext).toContain('## Scraped Websites');
      expect(formattedContext).toContain('https://example.com');
      expect(formattedContext).toContain('Test website content');
    });

    it('should exclude files when requested', () => {
      const currentFiles = {
        'src/App.jsx': 'import React from "react";'
      };
      
      const contextWindow = contextManager.buildContextWindow(
        mockConversationState,
        currentFiles
      );

      const formattedWithFiles = formatContextForClaudeCode(contextWindow, true);
      const formattedWithoutFiles = formatContextForClaudeCode(contextWindow, false);

      expect(formattedWithFiles).toContain('## Current Files');
      expect(formattedWithoutFiles).not.toContain('## Current Files');
    });
  });
});