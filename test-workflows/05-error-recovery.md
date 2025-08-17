# Error Recovery and Debugging Flow

## Overview
The comprehensive workflow that handles errors, provides helpful feedback to users, and ensures system stability through robust recovery mechanisms. This workflow ensures that failures don't leave the system in an inconsistent state and users receive actionable guidance.

## User Journey

### Step 1: Error Detection
**Trigger**: System encounters an error during any operation
**Error Categories**:
- **Sandbox Creation Failures**: Directory permissions, disk space
- **Process Management Issues**: Port conflicts, Vite server crashes
- **File Operation Errors**: Write permissions, invalid paths
- **AI Integration Problems**: Network issues, malformed responses
- **Web Scraping Failures**: Unreachable URLs, timeout issues

### Step 2: Error Classification and Logging
**System Action**: Categorize error and log details
- **Implementation**: Comprehensive error handling (Task 1.6 ✅)
- **Process**:
  1. Capture full error context and stack trace
  2. Classify error type and severity level
  3. Log error with timestamp and affected components
  4. Determine if error is recoverable or requires user action

```javascript
// Error classification example
class ErrorManager {
  classifyError(error, context) {
    const errorInfo = {
      id: generateErrorId(),
      timestamp: Date.now(),
      type: this.getErrorType(error),
      severity: this.getSeverity(error),
      context: context,
      recoverable: this.isRecoverable(error),
      userAction: this.getUserAction(error)
    }
    
    this.logError(errorInfo)
    return errorInfo
  }
  
  getErrorType(error) {
    if (error.code === 'ENOENT') return 'FILE_NOT_FOUND'
    if (error.code === 'EACCES') return 'PERMISSION_DENIED'
    if (error.code === 'ENOSPC') return 'DISK_FULL'
    if (error.code === 'EADDRINUSE') return 'PORT_CONFLICT'
    if (error.name === 'TimeoutError') return 'TIMEOUT'
    return 'UNKNOWN'
  }
}
```

### Step 3: Immediate Safety Measures
**System Action**: Prevent further damage and stabilize system
- **Implementation**: Cleanup service (Task 1.6 ✅)
- **Process**:
  1. Stop any running operations that might be affected
  2. Release resources (ports, file handles, processes)
  3. Prevent cascade failures to other components
  4. Secure the sandbox environment

```javascript
// Emergency cleanup example
class EmergencyCleanup {
  async executeEmergencyCleanup(errorContext) {
    try {
      // Stop all processes related to the failed operation
      if (errorContext.sandboxId) {
        await this.processManager.killSandboxProcesses(errorContext.sandboxId)
        await this.portManager.releaseAllPorts(errorContext.sandboxId)
      }
      
      // Clean up any partial file operations
      if (errorContext.transactionId) {
        await this.fileOperations.rollbackTransaction(errorContext.transactionId)
      }
      
      // Release any locked resources
      await this.releaseResourceLocks(errorContext)
      
    } catch (cleanupError) {
      this.logger.error('Emergency cleanup failed', cleanupError)
      // Continue with other cleanup steps
    }
  }
}
```

### Step 4: Recovery Strategy Selection
**System Action**: Choose appropriate recovery approach
- **Automatic Recovery**: For transient issues (network, ports)
- **Rollback Recovery**: For failed operations with backups
- **User-Guided Recovery**: For issues requiring user input
- **Manual Intervention**: For severe system-level problems

### Step 5: Automatic Recovery Attempts
**System Action**: Try to resolve issues automatically
- **Implementation**: Multiple recovery strategies
- **Common Recovery Patterns**:

#### Port Conflict Resolution
```javascript
// Automatic port reallocation
async function recoverFromPortConflict(sandboxId, failedPort) {
  try {
    // Find alternative port
    const newPort = await this.portManager.allocatePort(failedPort + 1)
    
    // Update sandbox configuration
    await this.sandboxState.updateSandboxPort(sandboxId, newPort)
    
    // Restart Vite server with new port
    await this.processManager.startViteServer({
      sandboxId,
      port: newPort,
      cwd: this.sandboxManager.getSandboxPath(sandboxId)
    })
    
    // Update user notification
    this.notifyUser(`Sandbox moved to http://localhost:${newPort} due to port conflict`)
    
    return { success: true, newPort }
  } catch (error) {
    return { success: false, error }
  }
}
```

#### File Operation Rollback
```javascript
// Transaction rollback on file operation failure
async function rollbackFileOperations(transactionId) {
  const transaction = this.transactionStore.get(transactionId)
  
  if (!transaction) {
    throw new Error(`Transaction ${transactionId} not found`)
  }
  
  try {
    // Restore files from backups
    for (const backup of transaction.backups) {
      await fs.copyFile(backup.backupPath, backup.originalPath)
    }
    
    // Remove any newly created files
    for (const newFile of transaction.newFiles) {
      await fs.unlink(newFile.path)
    }
    
    // Update file cache
    await this.fileCache.invalidateTransaction(transactionId)
    
    this.logger.info(`Transaction ${transactionId} rolled back successfully`)
    return { success: true }
    
  } catch (rollbackError) {
    this.logger.error(`Rollback failed for transaction ${transactionId}`, rollbackError)
    throw rollbackError
  }
}
```

#### Process Recovery
```javascript
// Restart crashed Vite server
async function recoverViteServer(sandboxId) {
  try {
    const sandboxState = await this.sandboxState.getSandboxState(sandboxId)
    
    if (!sandboxState) {
      throw new Error(`Sandbox ${sandboxId} not found`)
    }
    
    // Check if process is actually dead
    const isRunning = await this.processManager.isProcessRunning(sandboxState.pid)
    
    if (!isRunning) {
      // Clean up old process reference
      await this.processManager.cleanupProcess(sandboxState.pid)
      
      // Start new Vite server
      const newProcess = await this.processManager.startViteServer({
        sandboxId,
        port: sandboxState.port,
        cwd: sandboxState.path
      })
      
      // Update state with new PID
      await this.sandboxState.updateSandboxPid(sandboxId, newProcess.pid)
      
      this.notifyUser(`Development server restarted for sandbox ${sandboxId}`)
      return { success: true }
    }
    
    return { success: true, message: 'Process already running' }
    
  } catch (error) {
    this.logger.error(`Failed to recover Vite server for ${sandboxId}`, error)
    return { success: false, error }
  }
}
```

### Step 6: User Notification and Guidance
**System Action**: Inform user of issue and next steps
- **Implementation**: Context-aware error messages
- **Process**:
  1. Translate technical errors to user-friendly language
  2. Provide specific action steps when possible
  3. Include relevant context and affected operations
  4. Offer alternative approaches when available

```javascript
// User-friendly error messaging
class UserErrorNotification {
  formatErrorForUser(errorInfo, recoveryResult) {
    const baseMessage = this.getBaseMessage(errorInfo.type)
    const contextMessage = this.addContext(errorInfo.context)
    const actionMessage = this.getActionMessage(errorInfo, recoveryResult)
    
    return {
      title: this.getErrorTitle(errorInfo.type),
      message: `${baseMessage} ${contextMessage}`,
      actions: actionMessage,
      severity: errorInfo.severity,
      canRetry: errorInfo.recoverable
    }
  }
  
  getBaseMessage(errorType) {
    const messages = {
      PORT_CONFLICT: "The development server couldn't start because the port is already in use.",
      PERMISSION_DENIED: "Unable to create or modify files due to permission restrictions.",
      DISK_FULL: "Not enough disk space to complete the operation.",
      TIMEOUT: "The operation took too long and was cancelled.",
      FILE_NOT_FOUND: "A required file was not found.",
      NETWORK_ERROR: "Unable to connect to the required service."
    }
    return messages[errorType] || "An unexpected error occurred."
  }
  
  getActionMessage(errorInfo, recoveryResult) {
    if (recoveryResult.success) {
      return {
        type: 'success',
        message: 'The issue has been resolved automatically.',
        details: recoveryResult.details
      }
    } else if (errorInfo.recoverable) {
      return {
        type: 'retry',
        message: 'Please try your request again.',
        button: 'Retry'
      }
    } else {
      return {
        type: 'manual',
        message: this.getManualRecoverySteps(errorInfo.type),
        steps: this.getRecoverySteps(errorInfo.type)
      }
    }
  }
}
```

### Step 7: Manual Recovery Guidance
**User Experience**: Step-by-step recovery instructions
**Examples of Manual Recovery**:

#### Disk Space Issues
```
❌ Error: Not enough disk space to create the application

🔧 How to fix this:
1. Free up disk space by deleting unnecessary files
2. Move some files to an external drive
3. Empty your trash/recycle bin
4. Try creating a smaller application first

💡 Need at least 100MB free space for a basic React app
```

#### Permission Issues
```
❌ Error: Permission denied when creating sandbox

🔧 How to fix this:
1. Make sure you have write permissions to the project directory
2. Try running the application as administrator (not recommended for security)
3. Change the sandbox location to a directory you own
4. Check if antivirus software is blocking file operations

⚙️ You can change the sandbox location in Settings > Local Development
```

#### Port Conflicts (when auto-recovery fails)
```
❌ Error: All ports 5173-5200 are in use

🔧 How to fix this:
1. Close other development servers that might be running
2. Restart your computer to free up stuck processes
3. Check for applications using these ports:
   - Run `lsof -i :5173` (Mac/Linux) or `netstat -ano | findstr :5173` (Windows)
4. Kill processes using these ports if safe to do so

🔄 Alternative: Use a different port range in Settings
```

### Step 8: Retry and Recovery Verification
**System Action**: Validate recovery and enable retry
- **Implementation**: Health checks and validation
- **Process**:
  1. Run health checks on recovered components
  2. Verify system is in consistent state
  3. Enable retry button for user
  4. Monitor for recurring issues

```javascript
// Recovery verification
class RecoveryVerification {
  async verifyRecovery(sandboxId, recoveryType) {
    const checks = []
    
    switch (recoveryType) {
      case 'port_reallocation':
        checks.push(this.verifyPortAccessibility(sandboxId))
        checks.push(this.verifyViteServerHealth(sandboxId))
        break
        
      case 'file_rollback':
        checks.push(this.verifyFileSystemConsistency(sandboxId))
        checks.push(this.verifyCacheConsistency(sandboxId))
        break
        
      case 'process_restart':
        checks.push(this.verifyProcessHealth(sandboxId))
        checks.push(this.verifyHotReloadWorking(sandboxId))
        break
    }
    
    const results = await Promise.allSettled(checks)
    const failedChecks = results.filter(r => r.status === 'rejected')
    
    return {
      success: failedChecks.length === 0,
      failedChecks: failedChecks.map(f => f.reason),
      passedChecks: results.length - failedChecks.length
    }
  }
  
  async verifyViteServerHealth(sandboxId) {
    const sandboxState = await this.sandboxState.getSandboxState(sandboxId)
    const response = await fetch(`http://localhost:${sandboxState.port}`)
    
    if (!response.ok) {
      throw new Error(`Vite server not responding (${response.status})`)
    }
    
    return true
  }
}
```

## Technical Implementation

### Error Detection and Monitoring

#### 1. Process Monitoring (Task 1.6 ✅)
```javascript
class ProcessMonitor {
  startMonitoring() {
    // Monitor all child processes
    setInterval(async () => {
      for (const [sandboxId, process] of this.activeProcesses) {
        const isHealthy = await this.checkProcessHealth(process)
        if (!isHealthy) {
          await this.handleProcessFailure(sandboxId, process)
        }
      }
    }, 30000) // Check every 30 seconds
  }
  
  async checkProcessHealth(process) {
    try {
      // Check if process is still running
      const isRunning = !process.killed && process.pid && process.exitCode === null
      
      if (!isRunning) return false
      
      // Check if port is still responsive
      const port = this.getProcessPort(process)
      const response = await fetch(`http://localhost:${port}`, { 
        timeout: 5000,
        signal: AbortSignal.timeout(5000)
      })
      
      return response.ok
    } catch (error) {
      return false
    }
  }
}
```

#### 2. File System Monitoring
```javascript
class FileSystemMonitor {
  watchForErrors(sandboxPath) {
    const watcher = chokidar.watch(sandboxPath)
    
    watcher.on('error', (error) => {
      this.handleFileSystemError(error, sandboxPath)
    })
    
    watcher.on('unlinkDir', (dirPath) => {
      // Detect if sandbox directory was accidentally deleted
      if (dirPath === sandboxPath) {
        this.handleSandboxDeletion(sandboxPath)
      }
    })
  }
  
  async handleFileSystemError(error, sandboxPath) {
    if (error.code === 'ENOSPC') {
      await this.handleDiskFull(sandboxPath)
    } else if (error.code === 'EACCES') {
      await this.handlePermissionError(sandboxPath)
    }
  }
}
```

#### 3. Resource Monitoring
```javascript
class ResourceMonitor {
  async checkSystemResources() {
    const checks = await Promise.allSettled([
      this.checkDiskSpace(),
      this.checkMemoryUsage(),
      this.checkPortAvailability(),
      this.checkProcessCount()
    ])
    
    const warnings = []
    const errors = []
    
    for (const [index, result] of checks.entries()) {
      if (result.status === 'rejected') {
        errors.push(result.reason)
      } else if (result.value.warning) {
        warnings.push(result.value)
      }
    }
    
    return { warnings, errors, healthy: errors.length === 0 }
  }
  
  async checkDiskSpace() {
    const stats = await fs.statfs(process.cwd())
    const freeSpaceGB = (stats.free * stats.bsize) / (1024 ** 3)
    
    if (freeSpaceGB < 0.1) {
      throw new Error('Critically low disk space (< 100MB)')
    } else if (freeSpaceGB < 1) {
      return { warning: true, message: 'Low disk space (< 1GB)' }
    }
    
    return { healthy: true, freeSpaceGB }
  }
}
```

### Recovery Strategies

#### 1. Graceful Degradation
```javascript
class GracefulDegradation {
  async handleComponentFailure(componentName, error) {
    switch (componentName) {
      case 'vite-server':
        // Fall back to static file serving
        return await this.startStaticServer()
        
      case 'file-watcher':
        // Disable hot reload, enable manual refresh
        return this.enableManualRefresh()
        
      case 'port-manager':
        // Use fixed port instead of dynamic allocation
        return this.useFixedPort()
        
      case 'ai-integration':
        // Show cached responses or offline mode
        return this.enableOfflineMode()
    }
  }
  
  async startStaticServer() {
    // Simple HTTP server as fallback
    const server = http.createServer((req, res) => {
      const filePath = path.join(sandboxPath, req.url)
      fs.createReadStream(filePath).pipe(res)
    })
    
    server.listen(8080)
    return { 
      success: true, 
      message: 'Static server started on port 8080',
      limitations: ['No hot reload', 'No build processing']
    }
  }
}
```

#### 2. State Recovery
```javascript
class StateRecovery {
  async recoverApplicationState() {
    try {
      // Load persisted state
      const persistedState = await this.loadPersistedState()
      
      // Validate state consistency
      const validatedState = await this.validateState(persistedState)
      
      // Restore sandbox environments
      await this.restoreSandboxes(validatedState.sandboxes)
      
      // Restart required processes
      await this.restartProcesses(validatedState.processes)
      
      return { success: true, recoveredState: validatedState }
      
    } catch (error) {
      // Fall back to clean state
      await this.initializeCleanState()
      return { 
        success: false, 
        error, 
        fallback: 'Initialized with clean state' 
      }
    }
  }
}
```

## Error Scenarios and Responses

### 1. Sandbox Creation Failures

#### Disk Space Exhaustion
```javascript
Error: ENOSPC: no space left on device

Recovery Actions:
✅ Automatic: Check available space, suggest cleanup
🔧 User Action: Free disk space, reduce project size
💡 Prevention: Monitor disk usage, warn at 90% full
```

#### Permission Issues
```javascript
Error: EACCES: permission denied, mkdir '/sandboxes/abc123'

Recovery Actions:
✅ Automatic: Try alternative directory location
🔧 User Action: Fix directory permissions or change sandbox path
💡 Prevention: Validate permissions during startup
```

### 2. Process Management Issues

#### Port Conflicts
```javascript
Error: EADDRINUSE: address already in use :::5173

Recovery Actions:
✅ Automatic: Allocate next available port (5174, 5175, etc.)
🔧 User Action: Close conflicting applications
💡 Prevention: Port scanning before allocation
```

#### Process Crashes
```javascript
Error: Vite server process exited with code 1

Recovery Actions:
✅ Automatic: Restart process with same configuration
🔧 User Action: Check for syntax errors in generated code
💡 Prevention: Code validation before writing to files
```

### 3. File Operation Failures

#### Concurrent Access
```javascript
Error: EBUSY: resource busy or locked

Recovery Actions:
✅ Automatic: Retry with exponential backoff
🔧 User Action: Close other applications accessing files
💡 Prevention: File locking and queue management
```

#### Malformed Code Generation
```javascript
Error: SyntaxError in generated code

Recovery Actions:
✅ Automatic: Rollback to previous working state
🔧 User Action: Modify prompt to be more specific
💡 Prevention: Code validation and syntax checking
```

### 4. Network and Integration Issues

#### AI Service Unavailable
```javascript
Error: Failed to connect to Claude Code

Recovery Actions:
✅ Automatic: Retry with exponential backoff
🔧 User Action: Check network connection
💡 Prevention: Offline mode with cached responses
```

#### Web Scraping Failures
```javascript
Error: TimeoutError: Navigation timeout of 30000 ms exceeded

Recovery Actions:
✅ Automatic: Retry with basic fetch instead of Puppeteer
🔧 User Action: Provide alternative URL or manual content
💡 Prevention: Validate URLs before scraping
```

## Validation Criteria

### ✅ Recovery Success Indicators
1. **System Stability**: No cascade failures or resource leaks
2. **Data Integrity**: No corruption of user code or sandbox state
3. **User Experience**: Clear error messages and recovery guidance
4. **Automatic Recovery**: Most issues resolved without user intervention
5. **Graceful Degradation**: Reduced functionality rather than complete failure

### 🔧 Performance Expectations
- **Error Detection**: < 1 second for process monitoring
- **Recovery Initiation**: < 3 seconds from error detection
- **Rollback Operations**: < 5 seconds for file transaction rollback
- **User Notification**: < 2 seconds for error message display

### 🛡️ Reliability Validations
1. **No Data Loss**: User code preserved during errors
2. **Consistent State**: System never left in invalid state
3. **Resource Cleanup**: No leaked processes or file handles
4. **Audit Trail**: All errors and recovery actions logged

## Testing Scenarios

### Simulated Failures
1. **Resource Exhaustion**: Fill disk, exhaust memory, use all ports
2. **Process Failures**: Kill processes, simulate crashes
3. **Network Issues**: Disconnect internet, timeout services
4. **File System Issues**: Lock files, remove permissions

### Recovery Validation
1. **Automatic Recovery**: Verify system self-heals
2. **Manual Recovery**: Test user-guided recovery steps
3. **Edge Cases**: Multiple simultaneous failures
4. **State Consistency**: Verify system state after recovery

### User Experience
1. **Error Clarity**: Test error message comprehension
2. **Recovery Guidance**: Validate recovery step effectiveness
3. **Progress Indication**: Show recovery progress to users
4. **Retry Functionality**: Test retry mechanisms

## Dependencies

### Completed Tasks
- ✅ Task 1.6: Error Handling and Cleanup Mechanisms
- ✅ Task 2.5: Error Handling and Rollback for File Operations
- ✅ All Process Management Tasks (1.2, state monitoring)
- ✅ All File Management Tasks (2.1-2.5, transaction safety)
- ✅ Context Management (4.6, state recovery)

### System Requirements
- Comprehensive logging and monitoring
- Transaction-safe file operations
- Process lifecycle management
- Resource monitoring capabilities
- User notification system

This workflow ensures that the application remains stable and usable even when things go wrong, providing users with confidence that their work is protected and issues can be resolved quickly and effectively.