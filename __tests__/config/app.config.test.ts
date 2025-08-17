import { appConfig } from '@/config/app.config';

describe('App Configuration - AI Settings', () => {
  describe('AI Model Configuration', () => {
    it('should have Claude Code as the only available model', () => {
      expect(appConfig.ai.availableModels).toEqual(['claude-code']);
    });

    it('should have Claude Code as the default model', () => {
      expect(appConfig.ai.defaultModel).toBe('claude-code');
    });

    it('should have proper display name for Claude Code', () => {
      expect(appConfig.ai.modelDisplayNames['claude-code']).toBe('Claude Code');
    });

    it('should not include other AI models', () => {
      expect(appConfig.ai.availableModels).not.toContain('openai/gpt-4o');
      expect(appConfig.ai.availableModels).not.toContain('anthropic/claude-3-5-sonnet-20241022');
      expect(appConfig.ai.availableModels).not.toContain('moonshotai/kimi-k2-instruct');
    });

    it('should have consistent model references', () => {
      // Default model should be in available models
      expect(appConfig.ai.availableModels).toContain(appConfig.ai.defaultModel);
      
      // Display name should exist for default model
      expect(appConfig.ai.modelDisplayNames).toHaveProperty(appConfig.ai.defaultModel);
    });
  });

  describe('Configuration Structure', () => {
    it('should maintain backward compatibility with existing config structure', () => {
      expect(appConfig).toHaveProperty('sandbox');
      expect(appConfig).toHaveProperty('codeGeneration');
      expect(appConfig).toHaveProperty('ai');
    });

    it('should have proper TypeScript types', () => {
      expect(typeof appConfig.ai.availableModels).toBe('object');
      expect(Array.isArray(appConfig.ai.availableModels)).toBe(true);
      expect(typeof appConfig.ai.defaultModel).toBe('string');
      expect(typeof appConfig.ai.modelDisplayNames).toBe('object');
    });
  });

  describe('Environment-specific Configuration', () => {
    it('should handle development environment properly', () => {
      // Test development-specific settings
      if (process.env.NODE_ENV === 'development') {
        expect(appConfig.api.enableLogging).toBe(true);
      }
    });
  });

  describe('AI Configuration Validation', () => {
    it('should have valid model configuration structure', () => {
      // Ensure all available models have display names
      appConfig.ai.availableModels.forEach(model => {
        expect(appConfig.ai.modelDisplayNames).toHaveProperty(model);
        expect(typeof appConfig.ai.modelDisplayNames[model as keyof typeof appConfig.ai.modelDisplayNames]).toBe('string');
      });
    });

    it('should have non-empty model arrays and objects', () => {
      expect(appConfig.ai.availableModels.length).toBeGreaterThan(0);
      expect(Object.keys(appConfig.ai.modelDisplayNames).length).toBeGreaterThan(0);
      expect(appConfig.ai.defaultModel.length).toBeGreaterThan(0);
    });

    it('should have consistent model naming', () => {
      // All models should follow consistent naming convention
      appConfig.ai.availableModels.forEach(model => {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Configuration Consistency', () => {
    it('should have stable configuration structure', () => {
      // Test that configuration is well-formed and consistent
      expect(appConfig.ai.availableModels).toEqual(['claude-code']);
      expect(appConfig.ai.defaultModel).toBe('claude-code');
      expect(appConfig.ai.modelDisplayNames['claude-code']).toBe('Claude Code');
    });

    it('should have proper configuration defaults', () => {
      // Ensure configuration has sensible defaults
      expect(appConfig.ai.availableModels.length).toBe(1);
      expect(typeof appConfig.ai.defaultModel).toBe('string');
      expect(Object.keys(appConfig.ai.modelDisplayNames).length).toBe(1);
    });

    it('should maintain configuration integrity', () => {
      // Check that all models have corresponding display names
      appConfig.ai.availableModels.forEach(model => {
        expect(appConfig.ai.modelDisplayNames).toHaveProperty(model);
      });

      // Check that default model exists in available models
      expect(appConfig.ai.availableModels).toContain(appConfig.ai.defaultModel);
    });
  });
});