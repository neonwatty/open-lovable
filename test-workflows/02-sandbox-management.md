# Local Sandbox Management Flow

## Overview
The infrastructure workflow that automatically creates, manages, and maintains isolated local development environments for each user session or project.

## User Journey

### Step 1: Sandbox Initialization
**Trigger**: User starts new session or requests new project
**System Action**: Create isolated sandbox environment

**Process**:
1. **UUID Generation**: Creates unique identifier for sandbox
2. **Directory Creation**: Sets up isolated folder structure
3. **Template Application**: Copies React + Vite + Tailwind template
4. **Permission Setup**: Configures file system permissions

**Implementation**: `lib/sandbox-manager.ts` (Task 1.1 ✅)

```javascript
// Example sandbox creation
const sandboxId = generateUUID() // e.g., "abc123-def456-ghi789"
const sandboxPath = `/sandboxes/${sandboxId}`
await createSandbox(sandboxId)
```

### Step 2: Project Template Setup
**System Action**: Initialize React project structure
- **Implementation**: `lib/template-generator.ts` (Task 1.3 ✅)
- **Process**:
  1. Copy base template files to sandbox directory
  2. Generate dynamic package.json with latest versions
  3. Set up Vite configuration for development
  4. Configure Tailwind CSS with base styles
  5. Create initial React component structure

**Generated Structure**:
```
sandboxes/abc123-def456-ghi789/
├── package.json          # Generated with current dependencies
├── vite.config.js        # Vite configuration
├── tailwind.config.js    # Tailwind CSS setup
├── postcss.config.js     # PostCSS configuration
├── index.html            # HTML entry point
└── src/
    ├── main.jsx          # React app entry
    ├── App.jsx           # Main app component
    └── index.css         # Base styles with Tailwind imports
```

### Step 3: Port Allocation
**System Action**: Find available port for development server
- **Implementation**: `lib/port-manager.ts` (Task 1.5 ✅)
- **Process**:
  1. Start from default port 5173
  2. Check port availability using net module
  3. Increment port number if occupied
  4. Reserve port for this sandbox
  5. Handle port conflicts gracefully

```javascript
// Port allocation example
const port = await allocatePort(5173) // Returns first available port
const previewUrl = `http://localhost:${port}`
```

### Step 4: Development Server Launch
**System Action**: Start Vite development server
- **Implementation**: `lib/process-manager.ts` (Task 1.2 ✅)
- **Process**:
  1. Spawn child process for Vite server
  2. Set working directory to sandbox path
  3. Configure environment variables
  4. Track process PID for management
  5. Monitor stdout/stderr for errors

```javascript
// Process management example
const viteProcess = await startViteServer({
  cwd: sandboxPath,
  port: allocatedPort,
  env: { NODE_ENV: 'development' }
})
```

### Step 5: State Registration
**System Action**: Track sandbox in global state
- **Implementation**: `lib/sandbox-state.ts` (Task 1.4 ✅)
- **Process**:
  1. Register sandbox metadata
  2. Store process information
  3. Track port assignment
  4. Set creation timestamp
  5. Enable lifecycle events

```javascript
// State registration example
await registerSandbox({
  id: sandboxId,
  path: sandboxPath,
  port: allocatedPort,
  pid: viteProcess.pid,
  status: 'running',
  createdAt: Date.now()
})
```

### Step 6: File Watching Setup
**System Action**: Enable hot reload capability
- **Implementation**: `lib/file-watcher.ts` (Task 2.3 ✅)
- **Process**:
  1. Initialize chokidar file watcher
  2. Set up ignore patterns (node_modules, .git)
  3. Configure debouncing for change events
  4. Emit events for UI updates
  5. Handle watcher lifecycle

### Step 7: Preview Ready
**User Experience**: Application becomes accessible
- **URL Available**: `http://localhost:${port}`
- **Hot Reload Active**: File changes trigger updates
- **Development Tools**: Source maps and debugging enabled

## Technical Implementation

### Core Components

#### 1. Sandbox Manager (Task 1.1 ✅)
```javascript
class SandboxManager {
  async createSandbox(id) {
    const sandboxPath = path.join(this.sandboxesDir, id)
    await fs.mkdir(sandboxPath, { recursive: true })
    await this.validateSandboxIntegrity(sandboxPath)
    return sandboxPath
  }
  
  async deleteSandbox(id) {
    const sandboxPath = this.getSandboxPath(id)
    await fs.rm(sandboxPath, { recursive: true, force: true })
  }
}
```

#### 2. Process Manager (Task 1.2 ✅)
```javascript
class ProcessManager {
  async startViteServer(config) {
    const process = spawn('npm', ['run', 'dev'], {
      cwd: config.cwd,
      env: { ...process.env, PORT: config.port }
    })
    
    this.processes.set(config.id, process)
    return process
  }
  
  async stopViteServer(id) {
    const process = this.processes.get(id)
    if (process) {
      process.kill('SIGTERM')
    }
  }
}
```

#### 3. Template Generator (Task 1.3 ✅)
```javascript
class TemplateGenerator {
  async generateReactViteProject(targetDir) {
    await this.copyTemplate(this.templateDir, targetDir)
    await this.updatePackageJson(targetDir)
    await this.validateTemplate(targetDir)
  }
}
```

#### 4. Port Manager (Task 1.5 ✅)
```javascript
class PortManager {
  async allocatePort(preferredPort = 5173) {
    let port = preferredPort
    while (await this.isPortInUse(port)) {
      port++
    }
    this.reservedPorts.add(port)
    return port
  }
  
  releasePort(port) {
    this.reservedPorts.delete(port)
  }
}
```

### Sandbox Lifecycle

#### Creation Phase
1. **Directory Setup**: UUID-based folder creation
2. **Template Application**: Copy and customize base files
3. **Dependency Installation**: Run npm install in sandbox
4. **Server Launch**: Start Vite with allocated port
5. **State Registration**: Track in global state store

#### Runtime Phase
1. **File Watching**: Monitor for changes with chokidar
2. **Hot Reload**: Automatically update browser on changes
3. **Process Monitoring**: Health checks for Vite server
4. **Port Management**: Maintain port reservations

#### Cleanup Phase
1. **Process Termination**: Graceful shutdown of Vite server
2. **Port Release**: Free allocated port for reuse
3. **Directory Cleanup**: Remove sandbox files
4. **State Cleanup**: Remove from global state store

## Expected Behaviors

### Successful Initialization
```javascript
// Expected sequence
1. createSandbox() → sandbox directory created
2. generateTemplate() → React files copied and configured
3. allocatePort() → port 5173 (or next available)
4. startViteServer() → development server running
5. setupFileWatcher() → hot reload active
6. registerSandbox() → state tracked globally

// User sees: "Sandbox ready at http://localhost:5173"
```

### Concurrent Sandboxes
```javascript
// Multiple sandboxes should work simultaneously
Sandbox A: localhost:5173
Sandbox B: localhost:5174  
Sandbox C: localhost:5175

// Each isolated with own process and file system
```

### Hot Reload Example
```javascript
// User modifies src/App.jsx
1. File watcher detects change
2. Vite rebuilds affected modules
3. Browser automatically refreshes
4. Changes visible immediately
```

## Error Scenarios

### 1. Port Already in Use
**Issue**: Preferred port 5173 is occupied
**Recovery**: 
- Port manager automatically finds next available port
- User notified of alternative port assignment
- Sandbox continues initialization normally

### 2. Template Copy Failure
**Issue**: Insufficient permissions or disk space
**Recovery**:
- Error logged with specific failure reason
- Partial files cleaned up
- User notified with actionable error message

### 3. Vite Server Startup Failure
**Issue**: Node.js version incompatible or npm install failed
**Recovery**:
- Process manager captures stderr output
- Specific error message shown to user
- Option to retry with troubleshooting steps

### 4. Zombie Process Detection
**Issue**: Previous Vite server didn't terminate cleanly
**Recovery**:
- Cleanup service detects orphaned processes
- Force kill with SIGKILL if necessary
- Port released for reuse

## Validation Criteria

### ✅ Success Indicators
1. **Sandbox Created**: Directory exists with proper structure
2. **Template Applied**: All required files present and valid
3. **Server Running**: Vite process active and responsive
4. **Port Accessible**: HTTP request to localhost succeeds
5. **Hot Reload Working**: File changes trigger browser updates

### 🔧 Performance Expectations
- **Sandbox Creation**: < 3 seconds for complete setup
- **Server Startup**: < 5 seconds for Vite to be ready
- **Hot Reload**: < 500ms for change detection and update
- **Concurrent Sandboxes**: Support 10+ simultaneous instances

### 🛡️ Security Validations
1. **Directory Isolation**: Sandboxes cannot access each other
2. **Path Traversal Protection**: File operations stay within sandbox
3. **Process Isolation**: Each Vite server runs independently
4. **Port Security**: Only localhost access, no external exposure

## Testing Scenarios

### Basic Functionality
1. **Single Sandbox**: Create, use, destroy lifecycle
2. **Multiple Sandboxes**: Concurrent creation and management
3. **Port Conflicts**: Graceful handling of occupied ports

### Edge Cases
1. **Rapid Creation**: Many sandboxes created quickly
2. **System Restart**: State persistence and recovery
3. **Resource Exhaustion**: Handling disk/memory limits

### Integration Tests
1. **Full Lifecycle**: End-to-end sandbox management
2. **Error Recovery**: Simulate failures and test cleanup
3. **Performance**: Load testing with multiple sandboxes

## Cleanup and Resource Management

### Automatic Cleanup (Task 1.6 ✅)
- **Scheduled Cleanup**: Periodic removal of abandoned sandboxes
- **Graceful Shutdown**: Process termination on app exit
- **Resource Monitoring**: Track CPU, memory, disk usage
- **Port Management**: Automatic release of unused ports

### Manual Cleanup
- **User Initiated**: Delete sandbox through UI
- **Admin Commands**: Bulk cleanup operations
- **Development Tools**: Debug sandbox state

## Dependencies

### Completed Tasks
- ✅ Task 1.1: Local Sandbox Directory Management Utilities
- ✅ Task 1.2: Node.js Child Process Wrapper for Vite Server
- ✅ Task 1.3: React + Vite + Tailwind Project Template Generation
- ✅ Task 1.4: Sandbox State Management for Local Processes
- ✅ Task 1.5: Sandbox URL Generation with Port Management
- ✅ Task 1.6: Error Handling and Cleanup Mechanisms
- ✅ Task 2.3: Chokidar File Watching for Hot Reload

### System Requirements
- Node.js runtime for Vite servers
- File system access for sandbox directories
- Network ports for development servers
- Process management capabilities

This workflow ensures that every user session starts with a clean, isolated development environment that's ready for AI-generated code and provides immediate visual feedback through hot reload.