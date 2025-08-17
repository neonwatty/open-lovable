# Iterative Development Flow

## Overview
The workflow that enables users to continuously refine and improve their generated applications through multi-turn conversations, building upon previous generations while maintaining context and code history.

## User Journey

### Step 1: Initial Code Generation
**Starting Point**: User has generated initial application
**Context**: Base React app exists in sandbox with working preview

**Example Initial State**:
```javascript
// Existing App.jsx
function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Todo App</h1>
      <TodoList />
    </div>
  )
}
```

### Step 2: Refinement Request
**User Action**: Requests specific improvements or additions
**Examples**:
- "Add a dark mode toggle to the header"
- "Make the todo items draggable for reordering"
- "Add a sidebar with categories and filters"
- "Fix the responsive layout on mobile"

### Step 3: Context Assembly
**System Action**: Build comprehensive prompt context
- **Implementation**: `lib/claude-code-context-manager.ts` (Task 4.6 ✅)
- **Process**:
  1. Gather current conversation history
  2. Include all existing files and their current state
  3. Add any scraped website context
  4. Include component library references
  5. Maintain edit history and file modifications

```javascript
// Context assembly example
const contextWindow = {
  conversationHistory: [
    { role: "user", content: "Create a todo app" },
    { role: "assistant", content: "I'll create a todo app with React..." },
    { role: "user", content: "Add dark mode toggle" }
  ],
  currentFiles: [
    { path: "src/App.jsx", content: "...", lastModified: "2025-01-15T10:30:00Z" },
    { path: "src/components/TodoList.jsx", content: "...", lastModified: "2025-01-15T10:25:00Z" }
  ],
  scrapedWebsites: [
    { url: "https://example.com", content: "...", timestamp: "2025-01-15T10:20:00Z" }
  ],
  editHistory: [
    { timestamp: "2025-01-15T10:30:00Z", operation: "create", files: ["src/App.jsx"] }
  ]
}
```

### Step 4: Intelligent Code Generation
**System Action**: Generate modifications aware of existing codebase
- **Implementation**: Enhanced AI prompting with full context
- **Process**:
  1. Analyze existing code structure and patterns
  2. Determine which files need modification
  3. Generate code that integrates with existing components
  4. Maintain consistent coding style and patterns
  5. Preserve existing functionality while adding new features

**Context-Aware Prompt Example**:
```markdown
## Edit Request
Add a dark mode toggle to the header

## Current Application Structure
- App.jsx: Main component with todo list
- TodoList.jsx: Renders list of todos
- TodoItem.jsx: Individual todo component

## Existing Styling
- Using Tailwind CSS utility classes
- Light color scheme with gray-100 background
- Blue accent colors for buttons

## Instructions
1. Add dark mode state management to App.jsx
2. Create a DarkModeToggle component
3. Update existing components to support dark/light themes
4. Use Tailwind's dark: prefix for dark mode styles
5. Maintain existing functionality and layout
```

### Step 5: Incremental File Updates
**System Action**: Apply changes with surgical precision
- **Implementation**: `lib/transactional-file-operations.ts` (Task 2.5 ✅)
- **Process**:
  1. Identify files that need modification vs. creation
  2. Create backups before making changes
  3. Apply changes incrementally with rollback capability
  4. Update file cache with new timestamps
  5. Trigger hot reload for immediate preview

```javascript
// Incremental update example
const fileOperations = [
  {
    operation: "update",
    path: "src/App.jsx",
    changes: [
      { type: "add", location: "import", content: "import DarkModeToggle from './components/DarkModeToggle'" },
      { type: "add", location: "state", content: "const [darkMode, setDarkMode] = useState(false)" },
      { type: "modify", location: "className", from: "p-8", to: "p-8 dark:bg-gray-900 dark:text-white" }
    ]
  },
  {
    operation: "create", 
    path: "src/components/DarkModeToggle.jsx",
    content: "export default function DarkModeToggle({ darkMode, setDarkMode }) { ... }"
  }
]
```

### Step 6: Cache Management
**System Action**: Maintain accurate file state tracking
- **Implementation**: `lib/local-file-cache.ts` (Task 2.4 ✅)
- **Process**:
  1. Update cache entries for modified files
  2. Track modification timestamps
  3. Invalidate cache for changed files
  4. Maintain consistency between cache and filesystem
  5. Enable fast file retrieval for next iteration

### Step 7: Hot Reload and Preview
**User Experience**: See changes immediately
- **Implementation**: File watching system (Task 2.3 ✅)
- **Process**:
  1. File watcher detects changes
  2. Vite dev server rebuilds affected modules
  3. Browser automatically updates
  4. User sees incremental improvements instantly

### Step 8: Conversation Continuation
**User Experience**: Continue iterating
- User can immediately request further changes
- System maintains full context of all modifications
- Edit history preserved for rollback if needed
- Conversation flow remains natural and intuitive

## Technical Implementation

### Context Management System

#### 1. Conversation State Tracking (Task 4.6 ✅)
```javascript
class ClaudeCodeContextManager {
  buildContextWindow(conversationState) {
    return {
      conversationHistory: this.convertMessages(conversationState.messages),
      currentFiles: this.getCurrentFileState(),
      scrapedWebsites: conversationState.scrapedWebsites || [],
      componentLibraries: conversationState.componentLibraries || [],
      contextMetadata: {
        totalTokens: this.estimateTokens(),
        messagesCount: conversationState.messages.length,
        lastUpdated: Date.now()
      }
    }
  }
  
  updateScrapedWebsiteContext(contextWindow, scrapedData) {
    // Add new scraped data and prune old entries
    contextWindow.scrapedWebsites.push({
      url: scrapedData.url,
      timestamp: Date.now(),
      content: scrapedData.content
    })
    
    // Keep only recent entries (max 5)
    if (contextWindow.scrapedWebsites.length > 5) {
      contextWindow.scrapedWebsites = contextWindow.scrapedWebsites
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5)
    }
    
    return contextWindow
  }
}
```

#### 2. File State Management (Task 2.4 ✅)
```javascript
class LocalFileCache {
  async getCurrentFileState(sandboxPath) {
    const files = await this.scanDirectory(sandboxPath)
    const fileStates = []
    
    for (const file of files) {
      const stats = await fs.stat(file.path)
      const cachedEntry = this.cache.get(file.path)
      
      // Check if file has been modified since last cache
      if (!cachedEntry || stats.mtime > cachedEntry.timestamp) {
        const content = await fs.readFile(file.path, 'utf8')
        this.cache.set(file.path, {
          content,
          timestamp: stats.mtime,
          size: stats.size
        })
        fileStates.push({ path: file.path, content, lastModified: stats.mtime })
      } else {
        fileStates.push({ 
          path: file.path, 
          content: cachedEntry.content, 
          lastModified: cachedEntry.timestamp 
        })
      }
    }
    
    return fileStates
  }
}
```

#### 3. Transactional Updates (Task 2.5 ✅)
```javascript
class TransactionalFileOperations {
  async executeTransaction(operations) {
    const transactionId = this.generateTransactionId()
    const backups = []
    
    try {
      // Create backups before modifying
      for (const operation of operations) {
        if (operation.type === 'update' && await this.fileExists(operation.path)) {
          const backup = await this.createBackup(operation.path, transactionId)
          backups.push(backup)
        }
      }
      
      // Apply all operations
      for (const operation of operations) {
        await this.applyOperation(operation)
      }
      
      // Cleanup backups on success
      await this.cleanupBackups(backups)
      
    } catch (error) {
      // Rollback on failure
      await this.rollbackTransaction(backups)
      throw error
    }
  }
  
  async applyOperation(operation) {
    switch (operation.type) {
      case 'create':
        await this.createFile(operation.path, operation.content)
        break
      case 'update':
        await this.updateFile(operation.path, operation.changes)
        break
      case 'delete':
        await this.deleteFile(operation.path)
        break
    }
  }
}
```

### Edit Intent Analysis

#### Understanding Modification Types
```javascript
// Edit intent patterns
const editPatterns = {
  add_feature: {
    keywords: ["add", "create", "build", "implement"],
    examples: ["Add a search bar", "Create a settings page"]
  },
  modify_styling: {
    keywords: ["change color", "make responsive", "style", "theme"],
    examples: ["Make it dark mode", "Change to blue theme"]
  },
  fix_issue: {
    keywords: ["fix", "bug", "error", "broken", "not working"],
    examples: ["Fix the mobile layout", "The button isn't working"]
  },
  refactor: {
    keywords: ["refactor", "clean up", "organize", "optimize"],
    examples: ["Refactor into components", "Clean up the code"]
  }
}
```

## Expected Behaviors

### Context Continuity
```javascript
// Conversation flow example
1. User: "Create a todo app"
   → AI generates TodoApp with basic functionality

2. User: "Add categories for todos"
   → AI modifies existing TodoApp, adds Category component
   → Preserves existing todo functionality
   → Maintains consistent styling

3. User: "Make it look like Todoist"
   → AI uses previous Todoist scrape from context
   → Applies similar design patterns
   → Maintains new category functionality

4. User: "Fix the mobile responsive issues"
   → AI analyzes current code structure
   → Identifies responsive problems
   → Applies targeted fixes without breaking features
```

### Smart Code Integration
```javascript
// Before: Simple todo list
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  )
}

// After: Adding drag and drop (incremental modification)
function TodoList({ todos, onReorder }) {
  const [draggedIndex, setDraggedIndex] = useState(null)
  
  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
  }
  
  const handleDrop = (e, dropIndex) => {
    if (draggedIndex !== null) {
      onReorder(draggedIndex, dropIndex)
    }
    setDraggedIndex(null)
  }
  
  return (
    <ul>
      {todos.map((todo, index) => (
        <li 
          key={todo.id}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          className={index === draggedIndex ? 'opacity-50' : ''}
        >
          {todo.text}
        </li>
      ))}
    </ul>
  )
}
```

### File Modification Patterns
```javascript
// Pattern 1: Adding new component
{
  operation: "create",
  path: "src/components/SearchBar.jsx",
  content: "export default function SearchBar() { ... }"
}

// Pattern 2: Modifying existing component
{
  operation: "update",
  path: "src/App.jsx",
  modifications: [
    { line: 1, action: "add", content: "import SearchBar from './components/SearchBar'" },
    { line: 15, action: "add", content: "<SearchBar onSearch={handleSearch} />" },
    { line: 8, action: "add", content: "const [searchTerm, setSearchTerm] = useState('')" }
  ]
}

// Pattern 3: Styling updates
{
  operation: "update", 
  path: "src/App.jsx",
  modifications: [
    { selector: "className", action: "replace", from: "bg-white", to: "bg-gray-900 dark:bg-white" }
  ]
}
```

## Error Scenarios

### 1. Context Window Overflow
**Issue**: Conversation history and files exceed token limits
**Recovery**:
- Intelligent context pruning (Task 4.6 ✅)
- Keep recent messages and current file state
- Summarize older conversation parts
- Maintain essential context for coherent modifications

### 2. Conflicting Modifications
**Issue**: User requests contradict existing functionality
**Recovery**:
- Analyze conflict and explain to user
- Suggest alternatives that preserve existing features
- Offer to refactor if significant changes needed

### 3. File Cache Inconsistency
**Issue**: Cache doesn't match actual file state
**Recovery**:
- Automatic cache invalidation on timestamp mismatch
- Rescan filesystem when inconsistency detected
- Rebuild context with current file state

### 4. Transaction Rollback
**Issue**: File operation fails partway through
**Recovery**:
- Restore from transaction backups
- Return to previous working state
- Inform user of failure and suggest retry

## Validation Criteria

### ✅ Success Indicators
1. **Context Preservation**: Previous conversation and files remembered
2. **Incremental Changes**: Only necessary files modified
3. **Feature Integration**: New features work with existing code
4. **Style Consistency**: Maintains existing patterns and conventions
5. **Hot Reload Active**: Changes visible immediately in preview

### 🔧 Performance Expectations
- **Context Assembly**: < 2 seconds for large conversations
- **File Analysis**: < 1 second for scanning current state
- **Incremental Updates**: < 3 seconds for targeted modifications
- **Cache Operations**: < 100ms for file state retrieval

### 🛡️ Continuity Validations
1. **No Regression**: Existing functionality preserved
2. **Style Coherence**: New code matches existing patterns
3. **State Management**: Application state remains valid
4. **Component Integration**: New components integrate properly

## Testing Scenarios

### Multi-Turn Conversations
1. **Feature Addition Chain**: Todo → Categories → Drag & Drop → Search
2. **Style Evolution**: Basic → Dark Mode → Custom Theme → Animations
3. **Architecture Changes**: Simple → Component Split → State Management

### Context Management
1. **Large Conversations**: 20+ messages with full context
2. **File History**: Multiple generations of same file
3. **Mixed Content**: Code + scraped websites + libraries

### Error Recovery
1. **Failed Updates**: Partial file modifications
2. **Context Overflow**: Very large conversation history
3. **Cache Inconsistency**: Manual file modifications outside app

### Integration Patterns
1. **Component Composition**: Building complex UIs incrementally
2. **State Evolution**: Simple state → Complex state management
3. **API Integration**: Adding external data sources

## Use Case Examples

### Progressive Enhancement
```
1. User: "Create a simple blog"
   → Basic blog with posts list

2. User: "Add comments to posts"
   → Comments component integrated with existing posts

3. User: "Add user authentication"
   → Auth system added, integrated with comments

4. User: "Add admin dashboard"
   → Admin UI added, reuses existing components
```

### Design Iteration
```
1. User: "Make a portfolio website"
   → Basic portfolio with projects section

2. User: "Make it look more modern like https://bruno.to"
   → Scrapes reference site, applies modern design patterns

3. User: "Add smooth animations between sections"
   → Adds animations while preserving layout and content

4. User: "Make it mobile-friendly"
   → Responsive design improvements without losing animations
```

### Feature Building
```
1. User: "Create an expense tracker"
   → Basic expense entry and list

2. User: "Add categories and filters"
   → Category system integrated with existing expenses

3. User: "Add charts to visualize spending"
   → Chart components added, integrated with category data

4. User: "Add data export functionality"
   → Export features added, uses existing data structures
```

## Dependencies

### Completed Tasks
- ✅ Task 2.3: Chokidar File Watching for Hot Reload
- ✅ Task 2.4: Local File Cache Management
- ✅ Task 2.5: Error Handling and Rollback Mechanisms
- ✅ Task 4.5: Response Streaming Implementation
- ✅ Task 4.6: Context Management System
- ✅ All Claude Code Integration Tasks (4.1-4.7)

### System Requirements
- Context management with conversation history
- File state tracking and caching
- Transactional file operations
- Hot reload capability
- Streaming response handling

### Integration Points
- AI prompt formatting includes full context
- File operations maintain cache consistency  
- Preview updates automatically with changes
- Error recovery preserves application state

This workflow enables users to build complex applications through natural conversation, with each iteration building intelligently upon the previous state while maintaining code quality and functionality.