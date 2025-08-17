# AI-Powered Code Generation Flow

## Overview
The core workflow where users enter natural language prompts and receive fully functional React applications with live preview.

## User Journey

### Step 1: User Input
**User Action**: Types a prompt in the chat interface
**Examples**:
- "Create a todo app with React and Tailwind"
- "Build a dashboard with charts and user management"
- "Make a landing page for a SaaS product"

### Step 2: Prompt Processing
**System Action**: Format prompt for Claude Code consumption
- **Implementation**: `lib/claude-code-prompt-formatter.ts` (Task 4.2 ✅)
- **Process**:
  1. User prompt is wrapped with system instructions
  2. Context from previous conversation is included
  3. Current file state and scraped websites added
  4. Formatted as Claude Code-compatible markdown

**Example Formatted Prompt**:
```markdown
## User Request
Create a todo app with React and Tailwind

## Context
- No existing files
- Local sandbox ready at localhost:5173
- React + Vite + Tailwind template available

## Instructions
Generate a complete React application with components, styles, and functionality.
```

### Step 3: AI Processing
**System Action**: Claude Code processes the request
- **Implementation**: `lib/claude-code-bridge.ts` (Task 4.4 ✅)
- **Process**:
  1. Bidirectional communication established
  2. Request sent to Claude Code
  3. Response correlation maintained
  4. Streaming responses handled

### Step 4: Response Parsing
**System Action**: Extract code blocks and file information
- **Implementation**: `lib/claude-code-block-parser.ts` (Task 4.3 ✅)
- **Process**:
  1. Parse markdown response with triple backticks
  2. Extract language identifiers (jsx, css, json)
  3. Map code to file paths
  4. Validate file operations (create, update, delete)

**Example Parsed Response**:
```json
{
  "files": [
    {
      "path": "src/App.jsx",
      "content": "import React, { useState } from 'react'...",
      "operation": "create"
    },
    {
      "path": "src/components/TodoItem.jsx", 
      "content": "export default function TodoItem({ todo, onToggle })...",
      "operation": "create"
    }
  ]
}
```

### Step 5: File Operations
**System Action**: Write code to local sandbox
- **Implementation**: `lib/file-manager.ts` (Task 2.2 ✅)
- **Process**:
  1. Validate file paths for security
  2. Create directory structure as needed
  3. Write files using Node.js fs operations
  4. Update file cache with timestamps

### Step 6: Live Preview
**System Action**: Display running application
- **Implementation**: Vite dev server (Task 1.2 ✅)
- **Process**:
  1. Vite detects file changes
  2. Hot module replacement updates browser
  3. User sees live preview at `localhost:5173`

## Technical Implementation

### Key Components
1. **Claude Code Integration** (Task 4 ✅)
   - `lib/claude-code-prompt-formatter.ts` - Prompt formatting
   - `lib/claude-code-bridge.ts` - Communication bridge
   - `lib/claude-code-block-parser.ts` - Response parsing
   - `lib/custom-stream-handler.ts` - Response streaming

2. **Local File Operations** (Task 2.1 ✅)
   - Direct Node.js fs operations replacing Python calls
   - Path validation and security checks
   - Transaction-like operations with rollback

3. **Sandbox Management** (Task 1 ✅)
   - UUID-based directory isolation
   - Vite dev server lifecycle
   - Port management and allocation

### API Endpoints
- **Primary**: `/api/generate-ai-code-stream`
  - Formats prompts for Claude Code
  - Handles streaming responses
  - Integrates with context management
  
- **Supporting**: `/api/apply-ai-code-stream`
  - Applies generated code to sandbox
  - Manages file operations
  - Updates cache and triggers reload

## Expected Inputs/Outputs

### Input Examples
```javascript
// Simple component request
"Create a button component with hover effects"

// Complex application request  
"Build a expense tracker with categories, charts, and data export"

// Specific styling request
"Make a dark mode toggle component using Tailwind"
```

### Output Examples
```javascript
// Generated App.jsx
import React, { useState } from 'react'
import TodoList from './components/TodoList'
import AddTodo from './components/AddTodo'

function App() {
  const [todos, setTodos] = useState([])
  
  const addTodo = (text) => {
    const newTodo = {
      id: Date.now(),
      text,
      completed: false
    }
    setTodos([...todos, newTodo])
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Todo App</h1>
      <AddTodo onAdd={addTodo} />
      <TodoList todos={todos} onToggle={toggleTodo} />
    </div>
  )
}

export default App
```

## Error Scenarios

### 1. Malformed AI Response
**Issue**: Claude Code returns invalid markdown or malformed code
**Recovery**: 
- Parser validation catches errors
- User notified with helpful message
- Option to retry with modified prompt

### 2. File Write Failures
**Issue**: Permission denied or disk full
**Recovery**:
- Transaction rollback restores previous state
- Error message explains the issue
- Retry mechanism for transient failures

### 3. Sandbox Not Ready
**Issue**: Vite server not running or port conflicts
**Recovery**:
- Port manager allocates new port
- Process manager restarts Vite server
- User notified when ready

## Validation Criteria

### ✅ Success Indicators
1. **Prompt Accepted**: User can enter and submit prompts
2. **Code Generated**: AI returns structured code blocks
3. **Files Created**: Code written to sandbox directory
4. **Preview Working**: Application loads at localhost URL
5. **Hot Reload Active**: Changes trigger immediate updates

### 🔧 Performance Expectations
- **Response Time**: < 10 seconds for simple components
- **File Operations**: < 1 second for writing generated files
- **Preview Load**: < 3 seconds for initial Vite compilation
- **Hot Reload**: < 500ms for subsequent changes

### 🛡️ Security Validations
1. **Path Traversal**: Cannot write files outside sandbox
2. **Code Injection**: Generated code is sanitized
3. **Resource Limits**: Process and memory usage controlled

## Testing Scenarios

### Basic Functionality
1. **Simple Component**: "Create a button component"
2. **Multi-file Project**: "Build a todo app"
3. **Styling Focus**: "Make a responsive navbar with Tailwind"

### Edge Cases
1. **Empty Prompt**: Handle gracefully with helpful message
2. **Very Long Prompt**: Truncate or paginate as needed
3. **Special Characters**: Handle Unicode and escape sequences

### Integration Tests
1. **End-to-End**: Full flow from prompt to preview
2. **Error Recovery**: Simulate failures and test recovery
3. **Concurrent Users**: Multiple simultaneous code generation

## Dependencies

### Completed Tasks
- ✅ Task 1.1: Local Sandbox Directory Management
- ✅ Task 1.2: Node.js Child Process for Vite Server  
- ✅ Task 1.3: React + Vite + Tailwind Template Generation
- ✅ Task 2.1: Node.js fs operations
- ✅ Task 2.2: Direct file writing to sandbox
- ✅ Task 4.1: Remove AI SDK Dependencies
- ✅ Task 4.2: Claude Code Prompt Format
- ✅ Task 4.3: Code Block Parser
- ✅ Task 4.4: Bidirectional Communication System
- ✅ Task 4.5: Response Streaming

### Required Infrastructure
- Local sandbox environment ready
- Vite dev server configured
- Claude Code integration active
- File watching and hot reload enabled

This workflow represents the primary value proposition of the application - transforming natural language into functional React applications with immediate visual feedback.