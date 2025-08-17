import { NextRequest, NextResponse } from 'next/server';
import { PathSecurity, SecurityViolation } from './path-security';
import path from 'path';

export interface SandboxMiddlewareConfig {
  sandboxDir: string;
  allowedExtensions?: string[];
  maxFileSize?: number;
  enableLogging?: boolean;
  rateLimitViolations?: number; // Max violations per IP before blocking
  blockDurationMs?: number; // How long to block IPs
}

export interface BlockedIP {
  ip: string;
  blockedUntil: Date;
  violationCount: number;
  lastViolation: Date;
}

/**
 * Middleware to enforce sandbox isolation for API routes
 */
export class SandboxMiddleware {
  private pathSecurity: PathSecurity;
  private config: Required<SandboxMiddlewareConfig>;
  private blockedIPs: Map<string, BlockedIP> = new Map();
  private instanceId: string;

  constructor(config: SandboxMiddlewareConfig) {
    this.instanceId = Math.random().toString(36).substr(2, 9);
    this.config = {
      sandboxDir: config.sandboxDir,
      allowedExtensions: config.allowedExtensions || [
        '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.html', '.md', 
        '.txt', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2'
      ],
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024,
      enableLogging: config.enableLogging ?? true,
      rateLimitViolations: config.rateLimitViolations || 10,
      blockDurationMs: config.blockDurationMs || 60 * 60 * 1000 // 1 hour
    };

    this.pathSecurity = new PathSecurity({
      sandboxDir: this.config.sandboxDir,
      allowedExtensions: this.config.allowedExtensions,
      maxFileSize: this.config.maxFileSize,
      enableLogging: this.config.enableLogging
    });

    // Clean up blocked IPs periodically
    setInterval(() => this.cleanupBlockedIPs(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Main middleware function for Next.js API routes
   */
  async validateRequest(req: NextRequest, options: {
    pathParam?: string;
    bodyPathFields?: string[];
    skipPathValidation?: boolean;
  } = {}): Promise<NextResponse | null> {
    const clientIP = this.getClientIP(req);

    // Check if IP is blocked
    const blocked = this.isIPBlocked(clientIP);
    if (blocked) {
      const blockedInfo = this.blockedIPs.get(clientIP);
      console.warn(`[SECURITY] Blocked IP ${clientIP} attempted access`);
      
      return NextResponse.json(
        { 
          error: 'Access denied due to security violations',
          blockedUntil: blockedInfo?.blockedUntil?.toISOString(),
          violationCount: blockedInfo?.violationCount
        },
        { status: 429 }
      );
    }

    // Skip path validation if requested
    if (options.skipPathValidation) {
      return null;
    }

    try {
      // Validate paths from URL parameters
      if (options.pathParam) {
        let searchParams: URLSearchParams | null = null;
        
        // Try to get search params from nextUrl first, then fallback to parsing URL
        if (req.nextUrl?.searchParams) {
          searchParams = req.nextUrl.searchParams;
        } else {
          // Fallback for test environments where nextUrl might not be populated
          try {
            const url = new URL(req.url);
            searchParams = url.searchParams;
          } catch (error) {
            console.warn('[SECURITY] Failed to parse request URL for parameter validation');
          }
        }
        
        if (searchParams) {
          const pathValue = searchParams.get(options.pathParam);
          if (pathValue) {
            const result = await this.pathSecurity.validatePath(pathValue, clientIP);
            if (!result.isValid) {
              this.handleViolation(clientIP, result.violation!);
              return this.createViolationResponse(result.violation!);
            }
          }
        }
      }

      // Validate paths from request body
      if (options.bodyPathFields && req.method !== 'GET') {
        let body: any;
        try {
          body = await req.json();
        } catch (error) {
          // Invalid JSON body
          console.warn(`[SECURITY] Invalid JSON body from IP ${clientIP}:`, error);
          return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
          );
        }
        
        for (const field of options.bodyPathFields) {
          const pathValue = this.getNestedValue(body, field);
          if (pathValue && typeof pathValue === 'string') {
            const result = await this.pathSecurity.validatePath(pathValue, clientIP);
            if (!result.isValid) {
              this.handleViolation(clientIP, result.violation!);
              return this.createViolationResponse(result.violation!);
            }
          }
        }
      }

      return null; // Request is valid, proceed
      
    } catch (error) {
      console.error('[SECURITY] Middleware error:', error);
      return NextResponse.json(
        { error: 'Security validation failed' },
        { status: 500 }
      );
    }
  }

  /**
   * Validate file content size
   */
  validateFileContent(content: string | Buffer): { isValid: boolean; error?: string } {
    return this.pathSecurity.validateFileSize(content);
  }

  /**
   * Get client IP address from request
   */
  private getClientIP(req: NextRequest): string {
    // Check various headers for real IP
    const forwarded = req.headers.get('x-forwarded-for');
    const realIP = req.headers.get('x-real-ip');
    const cfConnectingIP = req.headers.get('cf-connecting-ip');
    
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    if (realIP) {
      return realIP;
    }
    
    if (cfConnectingIP) {
      return cfConnectingIP;
    }
    
    // Fallback to connection IP (might be proxy)
    return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  }

  /**
   * Check if IP is currently blocked
   */
  private isIPBlocked(ip: string): boolean {
    const blocked = this.blockedIPs.get(ip);
    
    if (!blocked) {
      return false;
    }
    
    // If blockedUntil is Date(0), this is just a violation tracking entry, not an active block
    if (blocked.blockedUntil.getTime() === 0) {
      return false;
    }
    
    if (Date.now() > blocked.blockedUntil.getTime()) {
      // Block has expired, but keep the entry for violation tracking
      // Reset to Date(0) instead of deleting
      blocked.blockedUntil = new Date(0);
      this.blockedIPs.set(ip, blocked);
      return false;
    }
    
    return true;
  }

  /**
   * Handle security violation
   */
  private handleViolation(ip: string, violation: SecurityViolation): void {
    let blockedInfo = this.blockedIPs.get(ip);
    
    if (!blockedInfo) {
      blockedInfo = {
        ip,
        blockedUntil: new Date(0), // Not blocked initially
        violationCount: 0,
        lastViolation: new Date()
      };
    }
    
    blockedInfo.violationCount++;
    blockedInfo.lastViolation = new Date();
    
    // Block IP if violation count exceeds threshold
    if (blockedInfo.violationCount >= this.config.rateLimitViolations) {
      blockedInfo.blockedUntil = new Date(Date.now() + this.config.blockDurationMs);
      console.warn(`[SECURITY] Blocking IP ${ip} for ${this.config.blockDurationMs}ms due to ${blockedInfo.violationCount} violations`);
    }
    
    this.blockedIPs.set(ip, blockedInfo);
  }

  /**
   * Create response for security violations
   */
  private createViolationResponse(violation: SecurityViolation): NextResponse {
    return NextResponse.json(
      {
        error: 'Security violation detected',
        type: violation.type,
        message: this.getPublicErrorMessage(violation.type)
      },
      { status: 403 }
    );
  }

  /**
   * Get public-safe error message (don't leak internal details)
   */
  private getPublicErrorMessage(violationType: SecurityViolation['type']): string {
    switch (violationType) {
      case 'path_traversal':
        return 'Invalid file path provided';
      case 'extension_blocked':
        return 'File type not supported';
      case 'size_exceeded':
        return 'File size too large';
      case 'symlink_escape':
        return 'Invalid file reference';
      case 'invalid_path':
        return 'Invalid file path format';
      default:
        return 'Invalid request';
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  /**
   * Clean up expired blocked IPs
   */
  private cleanupBlockedIPs(): void {
    const now = Date.now();
    for (const [ip, blocked] of this.blockedIPs.entries()) {
      if (now > blocked.blockedUntil.getTime()) {
        this.blockedIPs.delete(ip);
      }
    }
  }

  /**
   * Get blocked IP statistics
   */
  getBlockedIPs(): BlockedIP[] {
    return Array.from(this.blockedIPs.values());
  }

  /**
   * Manually unblock an IP
   */
  unblockIP(ip: string): boolean {
    return this.blockedIPs.delete(ip);
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    blockedIPs: number;
    activeBlocks: number;
    violations: any;
    config: SandboxMiddlewareConfig;
  } {
    const now = Date.now();
    const activeBlocks = Array.from(this.blockedIPs.values())
      .filter(blocked => now <= blocked.blockedUntil.getTime()).length;

    return {
      blockedIPs: this.blockedIPs.size,
      activeBlocks,
      violations: this.pathSecurity.generateAuditReport(),
      config: this.config
    };
  }

  /**
   * Create a Next.js middleware wrapper
   */
  createNextMiddleware(options: {
    pathParam?: string;
    bodyPathFields?: string[];
    skipPathValidation?: boolean;
  } = {}) {
    return async (req: NextRequest) => {
      const result = await this.validateRequest(req, options);
      return result; // Returns NextResponse if violation, null if valid
    };
  }
}

/**
 * Higher-order function to wrap API route handlers with security middleware
 */
export function withSandboxSecurity(
  handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse>,
  middleware: SandboxMiddleware,
  options: {
    pathParam?: string;
    bodyPathFields?: string[];
    skipPathValidation?: boolean;
  } = {}
) {
  return async (req: NextRequest, ...args: any[]): Promise<NextResponse> => {
    try {
      // Validate request with middleware first
      const securityResult = await middleware.validateRequest(req, options);
      
      if (securityResult) {
        // Security violation, return error response
        return securityResult;
      }
      
      // Security check passed, proceed with original handler
      return handler(req, ...args);
      
    } catch (error) {
      console.error('[SECURITY] Wrapper error:', error);
      return NextResponse.json(
        { error: 'Security validation failed' },
        { status: 500 }
      );
    }
  };
}

/**
 * Utility to create sandbox middleware with common configuration
 */
export function createSandboxMiddleware(sandboxDir: string, options: Partial<SandboxMiddlewareConfig> = {}): SandboxMiddleware {
  return new SandboxMiddleware({
    sandboxDir: path.resolve(sandboxDir),
    ...options
  });
}