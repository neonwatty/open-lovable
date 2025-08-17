/**
 * Security module exports for path traversal protection and sandbox isolation
 */

// Core security classes
export { PathSecurity, validateSafePath, createPathSecurity } from './path-security';
export { SandboxMiddleware, withSandboxSecurity, createSandboxMiddleware } from './sandbox-middleware';
export { SecureFileOperations, createSecureFileOps, defaultSecureFileOps } from './secure-file-ops';

// Import functions for internal use
import { createPathSecurity } from './path-security';
import { createSandboxMiddleware } from './sandbox-middleware';
import { createSecureFileOps } from './secure-file-ops';

// Types and interfaces
export type {
  SecurityConfig,
  SecurityViolation,
  PathValidationResult
} from './path-security';

export type {
  SandboxMiddlewareConfig,
  BlockedIP
} from './sandbox-middleware';

export type {
  SecureFileOpsConfig,
  FileWriteResult,
  FileReadResult,
  FileDeleteResult,
  FileListResult
} from './secure-file-ops';

/**
 * Quick setup function for common security configuration
 */
export function setupSecurity(sandboxDir: string, options: {
  enableLogging?: boolean;
  maxFileSize?: number;
  allowedExtensions?: string[];
  rateLimitViolations?: number;
} = {}) {
  const config = {
    sandboxDir,
    enableLogging: options.enableLogging ?? true,
    maxFileSize: options.maxFileSize || 10 * 1024 * 1024,
    allowedExtensions: options.allowedExtensions || [
      '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.html', '.md', 
      '.txt', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'
    ],
    rateLimitViolations: options.rateLimitViolations || 10
  };

  return {
    pathSecurity: createPathSecurity(config.sandboxDir, config),
    middleware: createSandboxMiddleware(config.sandboxDir, config),
    fileOps: createSecureFileOps(config.sandboxDir, config)
  };
}