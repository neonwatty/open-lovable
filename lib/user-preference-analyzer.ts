/**
 * User Preference Analysis Engine
 * Analyzes user patterns and preferences without AI SDKs using rule-based algorithms
 */

import type { ConversationMessage, ConversationEdit } from '@/types/conversation';
import type { FileManifest } from '@/types/file-manifest';

export interface UserPreferenceProfile {
  editStyle: 'targeted' | 'comprehensive' | 'experimental';
  commonPatterns: string[];
  preferredComponents: string[];
  frequentEditTypes: Array<{ type: string; frequency: number; confidence: number }>;
  vocabularyPatterns: string[];
  timePatterns: {
    preferredEditTime: 'morning' | 'afternoon' | 'evening' | 'any';
    averageSessionLength: number;
    batchEditingTendency: number; // 0-1 score
  };
  complexityPreference: 'simple' | 'moderate' | 'complex';
  communicationStyle: 'brief' | 'detailed' | 'technical';
  packagePreferences: string[];
  stylePreferences: {
    colorSchemes: string[];
    layoutStyles: string[];
    componentStyles: string[];
  };
}

export interface IntentAnalysisResult {
  primaryIntent: string;
  confidence: number;
  entityMentions: Array<{ entity: string; type: 'component' | 'action' | 'style' | 'feature'; confidence: number }>;
  urgencyLevel: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'moderate' | 'complex';
  reasoning: string[];
}

export interface ContextRelevanceScore {
  filePath: string;
  relevanceScore: number;
  reasons: string[];
  suggestedPriority: 'primary' | 'secondary' | 'context';
}

export class UserPreferenceAnalyzer {
  private profile: UserPreferenceProfile;
  private patternDatabase: Map<string, number> = new Map();
  private vocabularyFrequency: Map<string, number> = new Map();

  constructor(initialProfile?: Partial<UserPreferenceProfile>) {
    this.profile = {
      editStyle: 'targeted',
      commonPatterns: [],
      preferredComponents: [],
      frequentEditTypes: [],
      vocabularyPatterns: [],
      timePatterns: {
        preferredEditTime: 'any',
        averageSessionLength: 15,
        batchEditingTendency: 0.3
      },
      complexityPreference: 'moderate',
      communicationStyle: 'detailed',
      packagePreferences: [],
      stylePreferences: {
        colorSchemes: [],
        layoutStyles: [],
        componentStyles: []
      },
      ...initialProfile
    };
  }

  /**
   * Analyze user intent from prompt using rule-based pattern matching
   */
  public analyzeUserIntent(prompt: string, conversationHistory?: ConversationMessage[]): IntentAnalysisResult {
    const normalizedPrompt = prompt.toLowerCase().trim();
    const words = this.extractWords(normalizedPrompt);
    
    // Extract entities mentioned in the prompt
    const entityMentions = this.extractEntityMentions(normalizedPrompt);
    
    // Determine primary intent using pattern matching
    const intentPatterns = this.getIntentPatterns();
    let bestMatch = { intent: 'UPDATE_COMPONENT', confidence: 0.3, patterns: [] as string[] };
    
    for (const [intent, patterns] of intentPatterns) {
      let score = 0;
      const matchedPatterns: string[] = [];
      
      for (const pattern of patterns) {
        if (pattern.test(normalizedPrompt)) {
          score += this.calculatePatternWeight(pattern, normalizedPrompt);
          matchedPatterns.push(pattern.source);
        }
      }
      
      if (score > bestMatch.confidence) {
        bestMatch = { intent, confidence: score, patterns: matchedPatterns };
      }
    }
    
    // Adjust confidence based on entity mentions
    const entityBonus = entityMentions.length * 0.1;
    bestMatch.confidence = Math.min(1.0, bestMatch.confidence + entityBonus);
    
    // Determine urgency level
    const urgencyLevel = this.determineUrgencyLevel(normalizedPrompt);
    
    // Determine complexity
    const complexity = this.determineComplexity(normalizedPrompt, entityMentions);
    
    // Generate reasoning
    const reasoning = this.generateIntentReasoning(bestMatch, entityMentions, urgencyLevel, complexity);
    
    return {
      primaryIntent: bestMatch.intent,
      confidence: bestMatch.confidence,
      entityMentions,
      urgencyLevel,
      complexity,
      reasoning
    };
  }

  /**
   * Score file relevance for a given prompt without AI
   */
  public analyzeFileRelevance(
    prompt: string, 
    manifest: FileManifest,
    intentAnalysis?: IntentAnalysisResult
  ): ContextRelevanceScore[] {
    const normalizedPrompt = prompt.toLowerCase();
    const relevanceScores: ContextRelevanceScore[] = [];
    
    // Extract search terms from prompt
    const searchTerms = this.extractSearchTerms(normalizedPrompt);
    const entityMentions = intentAnalysis?.entityMentions || this.extractEntityMentions(normalizedPrompt);
    
    for (const [filePath, fileInfo] of Object.entries(manifest.files)) {
      const score = this.calculateFileRelevance(
        filePath,
        fileInfo,
        searchTerms,
        entityMentions,
        normalizedPrompt
      );
      
      if (score.relevanceScore > 0.1) { // Only include files with some relevance
        relevanceScores.push(score);
      }
    }
    
    // Sort by relevance score (highest first)
    return relevanceScores.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Update user preference profile based on interaction patterns
   */
  public updatePreferenceProfile(
    messages: ConversationMessage[],
    edits: ConversationEdit[]
  ): void {
    // Analyze edit style preference
    this.updateEditStylePreference(edits);
    
    // Extract common patterns from messages
    this.updateCommonPatterns(messages);
    
    // Analyze preferred components
    this.updatePreferredComponents(messages, edits);
    
    // Update frequent edit types
    this.updateFrequentEditTypes(edits);
    
    // Analyze vocabulary patterns
    this.updateVocabularyPatterns(messages);
    
    // Update time patterns
    this.updateTimePatterns(messages, edits);
    
    // Determine complexity preference
    this.updateComplexityPreference(messages, edits);
    
    // Analyze communication style
    this.updateCommunicationStyle(messages);
    
    // Update style preferences
    this.updateStylePreferences(messages);
  }

  /**
   * Get current user preference profile
   */
  public getPreferenceProfile(): UserPreferenceProfile {
    return { ...this.profile };
  }

  /**
   * Get search plan for file discovery (replaces AI-generated search plan)
   */
  public generateSearchPlan(prompt: string, manifest: FileManifest) {
    const intentAnalysis = this.analyzeUserIntent(prompt);
    const relevanceScores = this.analyzeFileRelevance(prompt, manifest, intentAnalysis);
    
    // Extract specific search terms and patterns
    const searchTerms = this.extractSearchTerms(prompt.toLowerCase());
    const regexPatterns = this.generateRegexPatterns(prompt, intentAnalysis);
    
    // Determine file types to search based on intent
    const fileTypesToSearch = this.determineFileTypesToSearch(intentAnalysis.primaryIntent);
    
    // Estimate expected matches
    const expectedMatches = Math.min(5, Math.max(1, relevanceScores.filter(s => s.relevanceScore > 0.5).length));
    
    return {
      editType: intentAnalysis.primaryIntent,
      reasoning: `Rule-based analysis: ${intentAnalysis.reasoning.join(', ')}`,
      searchTerms,
      regexPatterns,
      fileTypesToSearch,
      expectedMatches,
      fallbackSearch: {
        terms: this.generateFallbackTerms(prompt),
        patterns: this.generateFallbackPatterns(intentAnalysis.primaryIntent)
      }
    };
  }

  // Private methods

  private extractWords(text: string): string[] {
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .map(word => word.toLowerCase());
  }

  private extractEntityMentions(prompt: string): Array<{ entity: string; type: 'component' | 'action' | 'style' | 'feature'; confidence: number }> {
    const entities: Array<{ entity: string; type: 'component' | 'action' | 'style' | 'feature'; confidence: number }> = [];
    
    // Component patterns
    const componentPatterns = [
      { pattern: /\b(header|nav|navigation|navbar)\b/g, type: 'component' as const },
      { pattern: /\b(footer|bottom)\b/g, type: 'component' as const },
      { pattern: /\b(hero|banner|jumbotron)\b/g, type: 'component' as const },
      { pattern: /\b(button|btn)\b/g, type: 'component' as const },
      { pattern: /\b(sidebar|aside)\b/g, type: 'component' as const },
      { pattern: /\b(modal|dialog|popup)\b/g, type: 'component' as const },
      { pattern: /\b(card|tile)\b/g, type: 'component' as const },
      { pattern: /\b(form|input|field)\b/g, type: 'component' as const },
      { pattern: /\b(menu|dropdown)\b/g, type: 'component' as const },
      { pattern: /\b(gallery|carousel|slider)\b/g, type: 'component' as const }
    ];
    
    // Action patterns
    const actionPatterns = [
      { pattern: /\b(add|create|build|implement|include)\b/g, type: 'action' as const },
      { pattern: /\b(update|change|modify|edit|alter)\b/g, type: 'action' as const },
      { pattern: /\b(remove|delete|hide|eliminate)\b/g, type: 'action' as const },
      { pattern: /\b(fix|repair|resolve|debug)\b/g, type: 'action' as const },
      { pattern: /\b(refactor|reorganize|restructure)\b/g, type: 'action' as const }
    ];
    
    // Style patterns
    const stylePatterns = [
      { pattern: /\b(color|colour|theme|palette|blue|red|green|yellow|purple|orange|pink|white|black|gray|grey)\b/g, type: 'style' as const },
      { pattern: /\b(layout|position|alignment)\b/g, type: 'style' as const },
      { pattern: /\b(responsive|mobile|desktop)\b/g, type: 'style' as const },
      { pattern: /\b(animation|transition|effect)\b/g, type: 'style' as const },
      { pattern: /\b(background|bg|foreground)\b/g, type: 'style' as const }
    ];
    
    // Feature patterns
    const featurePatterns = [
      { pattern: /\b(authentication|auth|login|signin)\b/g, type: 'feature' as const },
      { pattern: /\b(search|filter|sort)\b/g, type: 'feature' as const },
      { pattern: /\b(analytics|tracking|metrics)\b/g, type: 'feature' as const },
      { pattern: /\b(api|endpoint|service)\b/g, type: 'feature' as const },
      { pattern: /\b(database|storage|persistence)\b/g, type: 'feature' as const }
    ];
    
    const allPatterns = [...componentPatterns, ...actionPatterns, ...stylePatterns, ...featurePatterns];
    
    for (const { pattern, type } of allPatterns) {
      const matches = Array.from(prompt.matchAll(pattern));
      for (const match of matches) {
        entities.push({
          entity: match[0],
          type,
          confidence: 0.8 + (match[0].length / 20) // Longer entities get slightly higher confidence
        });
      }
    }
    
    return entities;
  }

  private getIntentPatterns(): Map<string, RegExp[]> {
    return new Map([
      ['UPDATE_STYLE', [
        /\b(change|update|modify)\s+(?:the\s+)?(color|colour|theme|style|styling|background)/i,
        /\bmake\s+(?:it\s+|(?:the\s+)?(?:background|color|colour|theme)\s+)+(darker|lighter|bigger|smaller|blue|red|green|purple|orange|pink|white|black|gray|grey)/i,
        /\bmake\s+(?:the\s+)?background\s+(blue|red|green|purple|orange|pink|white|black|gray|grey)/i,
        /\b(?:style|color|colour|theme|background)\s+(?:should|to)\s+be/i,
        /\bbackground\s+(?:color|colour)/i,
        /\bchange.*(?:color|colour|theme|background)/i,
        /\b(?:blue|red|green|purple|orange|pink|white|black|gray|grey)\s+(?:color|background|theme)/i
      ]],
      ['UPDATE_COMPONENT', [
        /\b(update|change|modify|edit|alter|adjust)\s+(?:the\s+)?(\w+)(?!\s+(?:color|colour|theme|style|styling|background))/i,
        /\bmake\s+(?:the\s+)?(\w+)\s+(\w+)(?!\s+(?:color|colour|theme|style|styling|background))/i,
        /\bset\s+(?:the\s+)?(\w+)\s+to/i,
        /\bfix\s+(?:the\s+)?(\w+)\s+(?:styling|style|appearance)/i
      ]],
      ['ADD_FEATURE', [
        /\b(add|create|build|implement|include)\s+(?:a\s+)?(?:new\s+)?(\w+)/i,
        /\bi\s+(?:want|need)\s+(?:a\s+)?(\w+)/i,
        /\blet\'s\s+(?:add|create|build)/i,
        /\bcan\s+you\s+(?:add|create|make)/i
      ]],
      ['FIX_ISSUE', [
        /\b(fix|repair|resolve|debug|correct)\s+(?:the\s+)?(\w+)/i,
        /\b(?:there\'s|there\s+is)\s+(?:a\s+)?(?:bug|error|issue|problem)/i,
        /\b(?:not\s+working|broken|doesn\'t\s+work)/i,
        /\bsomething\s+(?:wrong|off)/i
      ]],
      ['REFACTOR', [
        /\b(refactor|reorganize|restructure|clean\s+up|optimize)/i,
        /\bimprove\s+(?:the\s+)?code/i,
        /\bbetter\s+(?:structure|organization)/i,
        /\bcode\s+quality/i
      ]],
      ['REMOVE_ELEMENT', [
        /\b(remove|delete|hide|eliminate|get\s+rid\s+of)\s+(?:the\s+)?(\w+)/i,
        /\bi\s+don\'t\s+(?:want|need)\s+(?:the\s+)?(\w+)/i,
        /\btake\s+(?:away|out)\s+(?:the\s+)?(\w+)/i
      ]],
      ['ADD_DEPENDENCY', [
        /\b(install|add)\s+(\w+)\s+(?:package|library|dependency)/i,
        /\buse\s+(\w+)\s+(?:library|framework|package)/i,
        /\bnpm\s+install/i,
        /\byarn\s+add/i
      ]]
    ]);
  }

  private calculatePatternWeight(pattern: RegExp, text: string): number {
    const matches = text.match(pattern);
    if (!matches) return 0;
    
    let weight = 0.5; // Base weight for a match
    
    // Increase weight for more specific patterns
    if (pattern.source.includes('\\b')) weight += 0.2; // Word boundary patterns are more specific
    if (pattern.source.length > 30) weight += 0.1; // Longer patterns are more specific
    if (matches.length > 1) weight += 0.1; // Multiple matches increase confidence
    
    return weight;
  }

  private determineUrgencyLevel(prompt: string): 'low' | 'medium' | 'high' {
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'now', 'quickly', 'fast', 'emergency'];
    const moderateKeywords = ['soon', 'please', 'when possible', 'priority'];
    
    const hasUrgent = urgentKeywords.some(keyword => prompt.includes(keyword));
    const hasModerate = moderateKeywords.some(keyword => prompt.includes(keyword));
    
    if (hasUrgent) return 'high';
    if (hasModerate) return 'medium';
    return 'low';
  }

  private determineComplexity(prompt: string, entities: Array<{ entity: string; type: string }>): 'simple' | 'moderate' | 'complex' {
    let complexityScore = 0;
    
    // More entities = higher complexity
    complexityScore += entities.length * 0.3;
    
    // Longer prompts tend to be more complex
    complexityScore += Math.min(1.5, prompt.length / 150);
    
    // Technical terms increase complexity significantly
    const technicalTerms = ['authentication', 'api', 'database', 'responsive', 'animation', 'optimization', 'integration', 'framework', 'library'];
    complexityScore += technicalTerms.filter(term => prompt.toLowerCase().includes(term)).length * 1.0;
    
    // Multiple actions increase complexity
    const actionWords = ['add', 'update', 'change', 'remove', 'fix', 'create', 'implement', 'build'];
    const actionCount = actionWords.filter(action => prompt.toLowerCase().includes(action)).length;
    if (actionCount > 1) complexityScore += 1.5;
    
    // Multiple file types or components mentioned
    const componentWords = ['component', 'page', 'section', 'module', 'service'];
    const componentCount = componentWords.filter(comp => prompt.toLowerCase().includes(comp)).length;
    if (componentCount > 1) complexityScore += 1.0;
    
    // Complex sentence structures
    if (prompt.includes(' and ') || prompt.includes(' with ') || prompt.includes(' including ')) {
      complexityScore += 0.5;
    }
    
    if (complexityScore >= 4) return 'complex';
    if (complexityScore >= 1.5) return 'moderate';
    return 'simple';
  }

  private generateIntentReasoning(
    bestMatch: { intent: string; confidence: number; patterns: string[] },
    entities: Array<{ entity: string; type: string }>,
    urgencyLevel: string,
    complexity: string
  ): string[] {
    const reasoning: string[] = [];
    
    reasoning.push(`Primary intent '${bestMatch.intent}' detected with ${(bestMatch.confidence * 100).toFixed(1)}% confidence`);
    
    if (bestMatch.patterns.length > 0) {
      reasoning.push(`Matched patterns: ${bestMatch.patterns.length} intent indicators`);
    }
    
    if (entities.length > 0) {
      const entityTypes = entities.map(e => e.type);
      const uniqueTypes = [...new Set(entityTypes)];
      reasoning.push(`Identified ${entities.length} entities of types: ${uniqueTypes.join(', ')}`);
    }
    
    reasoning.push(`Complexity: ${complexity}, Urgency: ${urgencyLevel}`);
    
    return reasoning;
  }

  private extractSearchTerms(prompt: string): string[] {
    const terms: string[] = [];
    
    // Extract quoted strings
    const quotedMatches = prompt.match(/"([^"]+)"/g) || [];
    quotedMatches.forEach(match => {
      terms.push(match.replace(/"/g, ''));
    });
    
    // Extract component names and important nouns
    const componentPattern = /\b(header|footer|nav|navigation|button|hero|card|modal|sidebar|menu|form|input)\b/g;
    const componentMatches = prompt.match(componentPattern) || [];
    terms.push(...componentMatches);
    
    // Extract action-specific terms
    const actionPattern = /\b(?:add|update|change|fix|remove|create)\s+(\w+)/g;
    let match;
    while ((match = actionPattern.exec(prompt)) !== null) {
      terms.push(match[1]);
    }
    
    // Remove duplicates and filter short terms
    return [...new Set(terms)]
      .filter(term => term.length > 2)
      .slice(0, 8); // Limit to 8 terms for performance
  }

  private generateRegexPatterns(prompt: string, intentAnalysis: IntentAnalysisResult): string[] {
    const patterns: string[] = [];
    
    // Generate patterns based on intent type
    switch (intentAnalysis.primaryIntent) {
      case 'UPDATE_COMPONENT':
        patterns.push('className=["\'].*\\b(nav|header|footer|button)\\b.*["\']');
        patterns.push('function\\s+\\w*(?:Nav|Header|Footer|Button)\\w*');
        break;
      case 'UPDATE_STYLE':
        patterns.push('className=["\'].*\\b(bg-|text-|border-)\\w+.*["\']');
        patterns.push('style\\s*=\\s*\\{[^}]*\\}');
        break;
      case 'ADD_FEATURE':
        patterns.push('import\\s+\\w+\\s+from\\s+["\'].*["\']');
        patterns.push('export\\s+(?:default\\s+)?(?:function|const|class)');
        break;
    }
    
    // Add entity-specific patterns
    intentAnalysis.entityMentions.forEach(entity => {
      if (entity.type === 'component') {
        patterns.push(`\\b${entity.entity}\\b`);
      }
    });
    
    return patterns.slice(0, 3); // Limit to 3 patterns for performance
  }

  private determineFileTypesToSearch(intent: string): string[] {
    const baseTypes = ['.jsx', '.tsx', '.js', '.ts'];
    
    switch (intent) {
      case 'UPDATE_STYLE':
        return ['.jsx', '.tsx', '.css', '.scss', '.js', '.ts'];
      case 'ADD_DEPENDENCY':
        return ['.json', '.js', '.ts', '.jsx', '.tsx'];
      case 'UPDATE_COMPONENT':
      case 'ADD_FEATURE':
      case 'FIX_ISSUE':
      case 'REFACTOR':
      default:
        return baseTypes;
    }
  }

  private generateFallbackTerms(prompt: string): string[] {
    // Extract all meaningful words as fallback
    return this.extractWords(prompt)
      .filter(word => word.length > 3)
      .slice(0, 5);
  }

  private generateFallbackPatterns(intent: string): string[] {
    const fallbackPatterns: Record<string, string[]> = {
      'UPDATE_COMPONENT': ['function\\s+\\w+', 'const\\s+\\w+\\s*='],
      'ADD_FEATURE': ['export', 'import'],
      'UPDATE_STYLE': ['className', 'style'],
      'FIX_ISSUE': ['console\\.', 'error', 'catch'],
      'REFACTOR': ['function', 'const', 'class']
    };
    
    return fallbackPatterns[intent] || ['function', 'const'];
  }

  private calculateFileRelevance(
    filePath: string,
    fileInfo: any,
    searchTerms: string[],
    entityMentions: Array<{ entity: string; type: string }>,
    prompt: string
  ): ContextRelevanceScore {
    let score = 0;
    const reasons: string[] = [];
    
    // File name relevance
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
    for (const term of searchTerms) {
      if (fileName.includes(term.toLowerCase())) {
        score += 0.3;
        reasons.push(`File name contains "${term}"`);
      }
    }
    
    // Component name relevance
    if (fileInfo.componentInfo?.name) {
      const componentName = fileInfo.componentInfo.name.toLowerCase();
      for (const term of searchTerms) {
        if (componentName.includes(term.toLowerCase())) {
          score += 0.25;
          reasons.push(`Component name contains "${term}"`);
        }
      }
    }
    
    // Content relevance
    const content = fileInfo.content?.toLowerCase() || '';
    for (const term of searchTerms) {
      const termCount = (content.match(new RegExp(term.toLowerCase(), 'g')) || []).length;
      if (termCount > 0) {
        score += Math.min(0.2, termCount * 0.05);
        reasons.push(`Content mentions "${term}" ${termCount} times`);
      }
    }
    
    // Entity relevance
    for (const entity of entityMentions) {
      if (fileName.includes(entity.entity) || content.includes(entity.entity)) {
        score += (entity as any).confidence * 0.15;
        reasons.push(`Contains entity "${entity.entity}"`);
      }
    }
    
    // File type bonus
    if (fileInfo.type === 'component' || fileInfo.type === 'page') {
      score += 0.1;
      reasons.push(`Is a ${fileInfo.type} file`);
    }
    
    // Recent modification bonus
    const daysSinceModified = (Date.now() - fileInfo.lastModified) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 1) {
      score += 0.1;
      reasons.push('Recently modified');
    }
    
    // Determine priority
    let suggestedPriority: 'primary' | 'secondary' | 'context' = 'context';
    if (score >= 0.5) suggestedPriority = 'primary';
    else if (score >= 0.2) suggestedPriority = 'secondary';
    
    return {
      filePath,
      relevanceScore: Math.min(1.0, score),
      reasons,
      suggestedPriority
    };
  }

  private updateEditStylePreference(edits: ConversationEdit[]): void {
    if (edits.length < 3) return; // Need sufficient data
    
    const targetedEdits = edits.filter(e => 
      e.editType === 'UPDATE_COMPONENT' || e.editType === 'UPDATE_STYLE'
    ).length;
    
    const comprehensiveEdits = edits.filter(e => 
      e.editType === 'ADD_FEATURE' || e.editType === 'REFACTOR'
    ).length;
    
    const experimentalEdits = edits.filter(e => 
      e.confidence < 0.5 || e.targetFiles.length > 5
    ).length;
    
    if (experimentalEdits > targetedEdits && experimentalEdits > comprehensiveEdits) {
      this.profile.editStyle = 'experimental';
    } else if (targetedEdits > comprehensiveEdits) {
      this.profile.editStyle = 'targeted';
    } else {
      this.profile.editStyle = 'comprehensive';
    }
  }

  private updateCommonPatterns(messages: ConversationMessage[]): void {
    const userMessages = messages.filter(m => m.role === 'user');
    const allText = userMessages.map(m => m.content.toLowerCase()).join(' ');
    
    const patterns = [
      'header', 'navigation', 'nav', 'footer', 'hero', 'button', 'form',
      'style', 'color', 'layout', 'responsive', 'mobile', 'desktop',
      'add', 'update', 'change', 'fix', 'remove', 'create', 'modify'
    ];
    
    const patternCounts = patterns.map(pattern => ({
      pattern,
      count: (allText.match(new RegExp(`\\b${pattern}\\b`, 'g')) || []).length
    })).filter(p => p.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    
    this.profile.commonPatterns = patternCounts.map(p => p.pattern);
  }

  private updatePreferredComponents(messages: ConversationMessage[], edits: ConversationEdit[]): void {
    const componentMentions = new Map<string, number>();
    
    // Count mentions in messages
    messages.forEach(msg => {
      if (msg.role === 'user') {
        const content = msg.content.toLowerCase();
        const components = ['header', 'footer', 'nav', 'hero', 'button', 'card', 'modal', 'sidebar'];
        components.forEach(comp => {
          const count = (content.match(new RegExp(`\\b${comp}\\b`, 'g')) || []).length;
          componentMentions.set(comp, (componentMentions.get(comp) || 0) + count);
        });
      }
    });
    
    // Count files edited
    edits.forEach(edit => {
      edit.targetFiles.forEach(file => {
        const fileName = file.split('/').pop()?.toLowerCase() || '';
        const components = ['header', 'footer', 'nav', 'hero', 'button', 'card', 'modal', 'sidebar'];
        components.forEach(comp => {
          if (fileName.includes(comp)) {
            componentMentions.set(comp, (componentMentions.get(comp) || 0) + 2); // Higher weight for actual edits
          }
        });
      });
    });
    
    this.profile.preferredComponents = Array.from(componentMentions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([comp]) => comp);
  }

  private updateFrequentEditTypes(edits: ConversationEdit[]): void {
    const typeCounts = new Map<string, { count: number; totalConfidence: number }>();
    
    edits.forEach(edit => {
      const current = typeCounts.get(edit.editType) || { count: 0, totalConfidence: 0 };
      current.count++;
      current.totalConfidence += edit.confidence;
      typeCounts.set(edit.editType, current);
    });
    
    this.profile.frequentEditTypes = Array.from(typeCounts.entries())
      .map(([type, data]) => ({
        type,
        frequency: data.count / edits.length,
        confidence: data.totalConfidence / data.count
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
  }

  private updateVocabularyPatterns(messages: ConversationMessage[]): void {
    const userMessages = messages.filter(m => m.role === 'user');
    const words = userMessages.flatMap(m => this.extractWords(m.content));
    
    words.forEach(word => {
      this.vocabularyFrequency.set(word, (this.vocabularyFrequency.get(word) || 0) + 1);
    });
    
    const frequentWords = Array.from(this.vocabularyFrequency.entries())
      .filter(([word, count]) => count > 1 && word.length > 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
    
    this.profile.vocabularyPatterns = frequentWords;
  }

  private updateTimePatterns(messages: ConversationMessage[], edits: ConversationEdit[]): void {
    if (messages.length < 5) return;
    
    // Analyze edit times
    const editTimes = edits.map(e => new Date(e.timestamp).getHours());
    const timeDistribution = { morning: 0, afternoon: 0, evening: 0 };
    
    editTimes.forEach(hour => {
      if (hour >= 6 && hour < 12) timeDistribution.morning++;
      else if (hour >= 12 && hour < 18) timeDistribution.afternoon++;
      else timeDistribution.evening++;
    });
    
    const maxTime = Object.entries(timeDistribution).reduce((a, b) => 
      timeDistribution[a[0] as keyof typeof timeDistribution] > timeDistribution[b[0] as keyof typeof timeDistribution] ? a : b
    );
    
    this.profile.timePatterns.preferredEditTime = maxTime[0] as 'morning' | 'afternoon' | 'evening';
    
    // Calculate average session length
    if (messages.length > 1) {
      const sessionStart = messages[0].timestamp;
      const sessionEnd = messages[messages.length - 1].timestamp;
      this.profile.timePatterns.averageSessionLength = (sessionEnd - sessionStart) / (1000 * 60); // minutes
    }
    
    // Calculate batch editing tendency
    const rapidEdits = edits.filter((edit, index) => {
      if (index === 0) return false;
      return edit.timestamp - edits[index - 1].timestamp < 5 * 60 * 1000; // Within 5 minutes
    }).length;
    
    this.profile.timePatterns.batchEditingTendency = edits.length > 0 ? rapidEdits / edits.length : 0;
  }

  private updateComplexityPreference(messages: ConversationMessage[], edits: ConversationEdit[]): void {
    if (messages.length < 3) return;
    
    const complexMessages = messages.filter(m => 
      m.role === 'user' && (m.content.length > 100 || m.content.split(' ').length > 20)
    ).length;
    
    const complexEdits = edits.filter(e => 
      e.targetFiles.length > 2 || e.editType === 'REFACTOR' || e.editType === 'ADD_FEATURE'
    ).length;
    
    const totalInteractions = messages.filter(m => m.role === 'user').length + edits.length;
    const complexityRatio = (complexMessages + complexEdits) / totalInteractions;
    
    if (complexityRatio > 0.6) this.profile.complexityPreference = 'complex';
    else if (complexityRatio > 0.3) this.profile.complexityPreference = 'moderate';
    else this.profile.complexityPreference = 'simple';
  }

  private updateCommunicationStyle(messages: ConversationMessage[]): void {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length < 3) return;
    
    const avgLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
    const technicalTerms = userMessages.reduce((sum, m) => {
      const content = m.content.toLowerCase();
      const techWords = ['component', 'function', 'variable', 'api', 'database', 'responsive', 'css', 'javascript'];
      return sum + techWords.filter(word => content.includes(word)).length;
    }, 0);
    
    if (avgLength < 50) this.profile.communicationStyle = 'brief';
    else if (technicalTerms > userMessages.length * 2) this.profile.communicationStyle = 'technical';
    else this.profile.communicationStyle = 'detailed';
  }

  private updateStylePreferences(messages: ConversationMessage[]): void {
    const userText = messages
      .filter(m => m.role === 'user')
      .map(m => m.content.toLowerCase())
      .join(' ');
    
    // Color scheme patterns
    const colorMentions = ['dark', 'light', 'blue', 'red', 'green', 'purple', 'orange', 'pink'];
    const mentionedColors = colorMentions.filter(color => userText.includes(color));
    this.profile.stylePreferences.colorSchemes = mentionedColors;
    
    // Layout patterns
    const layoutMentions = ['grid', 'flex', 'responsive', 'mobile', 'desktop', 'tablet'];
    const mentionedLayouts = layoutMentions.filter(layout => userText.includes(layout));
    this.profile.stylePreferences.layoutStyles = mentionedLayouts;
    
    // Component style patterns
    const styleMentions = ['modern', 'clean', 'minimal', 'bold', 'elegant', 'simple'];
    const mentionedStyles = styleMentions.filter(style => userText.includes(style));
    this.profile.stylePreferences.componentStyles = mentionedStyles;
  }
}

// Export default analyzer instance
export const userPreferenceAnalyzer = new UserPreferenceAnalyzer();