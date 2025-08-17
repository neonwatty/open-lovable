import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { processCleanupManager } from '../../../lib/process-cleanup-manager';

declare global {
  var activeSandbox: any;
}

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
  duration: number;
}

// Command whitelist for security
const ALLOWED_COMMANDS = new Set([
  'npm',
  'node',
  'yarn',
  'pnpm',
  'git',
  'ls',
  'cat',
  'grep',
  'find',
  'echo',
  'pwd',
  'whoami',
  'which',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'cut',
  'awk',
  'sed',
  'tree',
  'curl',
  'wget',
  'ping',
  'test',
  'mkdir',
  'touch',
  'cp',
  'mv',
  'chmod',
  'diff',
  'ps',
  'top',
  'du',
  'df',
  'free',
  'uptime',
  'date',
  'tsc',
  'eslint',
  'prettier',
  'jest',
  'vitest',
  'playwright',
  'vite',
  'webpack',
  'rollup',
  'esbuild',
  'turbo',
  'nx'
]);

// Dangerous command patterns to block
const BLOCKED_PATTERNS = [
  /rm\s+-rf/,
  /sudo/,
  /su\s/,
  /passwd/,
  /\/etc\//,
  /\/proc\//,
  /\/sys\//,
  /\/dev\//,
  />/,  // File redirection
  /\|/,  // Piping
  /&&/,  // Command chaining
  /\|\|/, // Command chaining
  /;/,   // Command separation
  /`/,   // Command substitution
  /\$\(/,  // Command substitution
  />/,   // Output redirection
  /<</,  // Input redirection
  /\*/,  // Globbing (can be dangerous)
  /\{/,  // Brace expansion
  /\[/   // Character classes
];

function validateCommand(command: string): { valid: boolean; reason?: string } {
  if (!command || typeof command !== 'string') {
    return { valid: false, reason: 'Command must be a non-empty string' };
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Command cannot be empty' };
  }

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Command contains blocked pattern: ${pattern.source}` };
    }
  }

  // Extract the main command (first word)
  const args = trimmed.split(/\s+/);
  const mainCommand = args[0];

  // Check if command is in whitelist
  if (!ALLOWED_COMMANDS.has(mainCommand)) {
    return { valid: false, reason: `Command '${mainCommand}' is not in the allowlist` };
  }

  // Additional validation for specific commands
  if (mainCommand === 'npm' || mainCommand === 'yarn' || mainCommand === 'pnpm') {
    // Allow common package manager commands
    const subCommand = args[1];
    const allowedNpmCommands = ['install', 'run', 'start', 'build', 'test', 'lint', 'dev', 'list', 'audit', 'outdated', 'version', 'info'];
    if (subCommand && !allowedNpmCommands.includes(subCommand)) {
      return { valid: false, reason: `Package manager subcommand '${subCommand}' is not allowed` };
    }
  }

  if (mainCommand === 'git') {
    // Allow safe git commands
    const subCommand = args[1];
    const allowedGitCommands = ['status', 'log', 'diff', 'show', 'branch', 'remote', 'config', 'ls-files', 'rev-parse'];
    if (subCommand && !allowedGitCommands.includes(subCommand)) {
      return { valid: false, reason: `Git subcommand '${subCommand}' is not allowed` };
    }
  }

  return { valid: true };
}

function createSafeEnvironment(): NodeJS.ProcessEnv {
  // Start with minimal environment
  const safeEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.SANDBOX_DIR || '/tmp/sandbox-workspace',
    USER: 'sandbox',
    SHELL: '/bin/bash',
    TERM: 'xterm-256color',
    LANG: 'en_US.UTF-8',
    NODE_ENV: 'development'
  };

  // Add necessary Node.js environment variables
  if (process.env.NODE_VERSION) {
    safeEnv.NODE_VERSION = process.env.NODE_VERSION;
  }

  // Add npm configuration
  if (process.env.NPM_CONFIG_CACHE) {
    safeEnv.NPM_CONFIG_CACHE = process.env.NPM_CONFIG_CACHE;
  }

  return safeEnv;
}

async function executeCommand(command: string, workingDir: string, timeout: number = 30000): Promise<CommandResult> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const args = command.trim().split(/\s+/);
    const mainCommand = args[0];
    const commandArgs = args.slice(1);

    console.log(`[run-command] Executing: ${mainCommand} with args:`, commandArgs);
    console.log(`[run-command] Working directory: ${workingDir}`);

    const child = spawn(mainCommand, commandArgs, {
      cwd: workingDir,
      env: createSafeEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false, // Important for security
      timeout,
      killSignal: 'SIGTERM'
    });

    // Register process with cleanup manager
    let processId: string | null = null;
    if (child.pid) {
      processId = `command-${Date.now()}-${child.pid}`;
      try {
        processCleanupManager.registerProcess(
          processId,
          child,
          mainCommand,
          commandArgs,
          workingDir,
          'command'
        );
        console.log(`[run-command] Process registered with cleanup manager: ${processId}`);
      } catch (error) {
        console.warn(`[run-command] Failed to register process with cleanup manager:`, error);
      }
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      // Unregister from cleanup manager
      if (processId) {
        processCleanupManager.unregisterProcess(processId).catch(error => {
          console.warn(`[run-command] Failed to unregister process ${processId}:`, error);
        });
      }
      
      let exitCode = code || 0;
      let error: string | undefined;

      if (timedOut) {
        exitCode = 124; // Timeout exit code
        error = `Command timed out after ${timeout}ms`;
      } else if (signal) {
        error = `Command terminated by signal: ${signal}`;
        exitCode = 128 + (signal === 'SIGTERM' ? 15 : 9);
      }

      const output = stdout + (stderr ? `\n[STDERR]\n${stderr}` : '');

      resolve({
        success: exitCode === 0 && !error,
        output,
        error,
        exitCode,
        stdout,
        stderr,
        command,
        duration
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      // Unregister from cleanup manager
      if (processId) {
        processCleanupManager.unregisterProcess(processId).catch(error => {
          console.warn(`[run-command] Failed to unregister process ${processId}:`, error);
        });
      }
      
      resolve({
        success: false,
        output: '',
        error: `Failed to execute command: ${err.message}`,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        command,
        duration
      });
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const { command, timeout = 30000 } = await request.json();
    
    if (!command) {
      return NextResponse.json({ 
        success: false, 
        error: 'Command is required' 
      }, { status: 400 });
    }

    // Validate command for security
    const validation = validateCommand(command);
    if (!validation.valid) {
      console.warn(`[run-command] Blocked command: ${command}. Reason: ${validation.reason}`);
      return NextResponse.json({ 
        success: false, 
        error: `Command blocked: ${validation.reason}` 
      }, { status: 403 });
    }

    // Set up working directory
    const workingDir = process.env.SANDBOX_DIR || '/tmp/sandbox-workspace';
    
    // Ensure working directory exists
    try {
      const { access } = await import('fs/promises');
      await access(workingDir);
    } catch {
      return NextResponse.json({ 
        success: false, 
        error: `Working directory does not exist: ${workingDir}` 
      }, { status: 400 });
    }

    console.log(`[run-command] Executing validated command: ${command}`);
    
    // Execute command with security constraints
    const result = await executeCommand(command, workingDir, timeout);
    
    // Log execution results
    console.log(`[run-command] Command completed in ${result.duration}ms with exit code ${result.exitCode}`);
    if (result.error) {
      console.error(`[run-command] Command error: ${result.error}`);
    }

    return NextResponse.json({
      success: result.success,
      output: result.output,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration,
      command: result.command,
      error: result.error,
      message: result.success ? 'Command executed successfully' : 'Command execution failed'
    });
    
  } catch (error) {
    console.error('[run-command] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}