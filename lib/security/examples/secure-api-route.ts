import { NextRequest, NextResponse } from 'next/server';
import { createSandboxMiddleware, withSandboxSecurity } from '../sandbox-middleware';
import { createSecureFileOps } from '../secure-file-ops';
import path from 'path';

// Example of how to integrate security into existing API routes

// Create middleware instance (typically done once per application)
const sandboxMiddleware = createSandboxMiddleware(
  path.join(process.cwd(), 'sandbox'),
  {
    enableLogging: true,
    rateLimitViolations: 5, // Lower limit for API routes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes
    maxFileSize: 5 * 1024 * 1024 // 5MB for API uploads
  }
);

// Create secure file operations instance
const secureFileOps = createSecureFileOps(
  path.join(process.cwd(), 'sandbox'),
  {
    enableLogging: true,
    atomicWrites: true,
    backupOnUpdate: true
  }
);

// Example 1: File upload endpoint with security
async function handleFileUpload(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { filePath, content } = body;

    if (!filePath || !content) {
      return NextResponse.json(
        { error: 'Missing filePath or content' },
        { status: 400 }
      );
    }

    // Write file using secure operations
    const result = await secureFileOps.writeFile(
      filePath, 
      content,
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown' // Pass client IP for security logging
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      path: result.path,
      operation: result.operation,
      backupPath: result.backupPath
    });

  } catch (error) {
    console.error('[API] File upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Example 2: File read endpoint with security
async function handleFileRead(req: NextRequest): Promise<NextResponse> {
  try {
    const filePath = req.nextUrl.searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    // Read file using secure operations
    const result = await secureFileOps.readFile(filePath, req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown');

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'File not found' ? 404 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      content: result.content,
      size: result.size
    });

  } catch (error) {
    console.error('[API] File read error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Example 3: Directory listing with security
async function handleDirectoryList(req: NextRequest): Promise<NextResponse> {
  try {
    const dirPath = req.nextUrl.searchParams.get('dir') || '';

    // List files using secure operations
    const result = await secureFileOps.listFiles(dirPath, req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown');

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      files: result.files,
      directories: result.directories
    });

  } catch (error) {
    console.error('[API] Directory list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Example 4: Using withSandboxSecurity wrapper
const secureFileUpload = withSandboxSecurity(
  handleFileUpload,
  sandboxMiddleware,
  {
    bodyPathFields: ['filePath'], // Validate filePath from request body
    skipPathValidation: false
  }
);

const secureFileRead = withSandboxSecurity(
  handleFileRead,
  sandboxMiddleware,
  {
    pathParam: 'path', // Validate path from URL parameter
    skipPathValidation: false
  }
);

const secureDirectoryList = withSandboxSecurity(
  handleDirectoryList,
  sandboxMiddleware,
  {
    pathParam: 'dir', // Validate dir from URL parameter
    skipPathValidation: false
  }
);

// Example 5: Complete API route with security
export async function POST(req: NextRequest) {
  return secureFileUpload(req);
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');
  
  switch (action) {
    case 'read':
      return secureFileRead(req);
    case 'list':
      return secureDirectoryList(req);
    default:
      return NextResponse.json(
        { error: 'Invalid action parameter' },
        { status: 400 }
      );
  }
}

// Example 6: Security status endpoint
export async function PATCH(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action');
    
    if (action === 'security-stats') {
      const stats = sandboxMiddleware.getSecurityStats();
      const opsStats = secureFileOps.getOperationStats();
      
      return NextResponse.json({
        middleware: stats,
        operations: opsStats
      });
    }
    
    if (action === 'cleanup-backups') {
      const cleaned = await secureFileOps.cleanupBackups();
      return NextResponse.json({
        message: `Cleaned up ${cleaned} backup files`
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action parameter' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[API] Security status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}