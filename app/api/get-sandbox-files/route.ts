import { NextResponse } from 'next/server';
import { parseJavaScriptFile, buildComponentTree } from '@/lib/file-parser';
import { FileManifest, FileInfo, RouteInfo } from '@/types/file-manifest';
import { 
  initializeLocalFileCache, 
  syncCacheWithFilesystem,
  LocalFileCacheAdapter,
  scanProjectFiles 
} from '@/lib/local-file-cache';

declare global {
  var activeSandbox: any;
}

export async function GET() {
  try {
    console.log('[get-sandbox-files] Fetching and analyzing local file structure...');
    
    // Initialize local file cache if not already done
    if (!global.localSandboxState?.fileCache) {
      const projectRoot = process.cwd();
      await initializeLocalFileCache(projectRoot);
    }
    
    // Sync with filesystem to get latest files
    await syncCacheWithFilesystem();
    
    // Get all files from local filesystem
    const projectRoot = process.cwd();
    const localFiles = await scanProjectFiles(projectRoot, ['.jsx', '.js', '.tsx', '.ts', '.css', '.json']);
    
    // Convert to the expected format
    const files: Record<string, string> = {};
    for (const [relativePath, file] of Object.entries(localFiles)) {
      // Only include files under 10KB to avoid huge responses
      if (file.content.length < 10000) {
        files[relativePath] = file.content;
      }
    }
    
    // Build directory structure string
    const structure = Object.keys(localFiles)
      .sort()
      .slice(0, 50) // Limit to 50 files
      .map(path => {
        const depth = path.split('/').length - 1;
        const indent = '  '.repeat(depth);
        const fileName = path.split('/').pop();
        return `${indent}${fileName}`;
      })
      .join('\n');
    
    const parsedResult = { files, structure };
    
    // Build enhanced file manifest
    const fileManifest: FileManifest = {
      files: {},
      routes: [],
      componentTree: {},
      entryPoint: '',
      styleFiles: [],
      timestamp: Date.now(),
    };
    
    // Process each file
    for (const [relativePath, content] of Object.entries(parsedResult.files)) {
      const fullPath = `${projectRoot}/${relativePath}`;
      const stats = localFiles[relativePath];
      
      // Create base file info
      const fileInfo: FileInfo = {
        content: content as string,
        type: 'utility',
        path: fullPath,
        relativePath,
        lastModified: stats?.lastModified || Date.now(),
      };
      
      // Parse JavaScript/JSX files
      if (relativePath.match(/\.(jsx?|tsx?)$/)) {
        const parseResult = parseJavaScriptFile(content as string, fullPath);
        Object.assign(fileInfo, parseResult);
        
        // Identify entry point
        if (relativePath === 'src/main.jsx' || relativePath === 'src/index.jsx') {
          fileManifest.entryPoint = fullPath;
        }
        
        // Identify App.jsx
        if (relativePath === 'src/App.jsx' || relativePath === 'App.jsx') {
          fileManifest.entryPoint = fileManifest.entryPoint || fullPath;
        }
      }
      
      // Track style files
      if (relativePath.endsWith('.css')) {
        fileManifest.styleFiles.push(fullPath);
        fileInfo.type = 'style';
      }
      
      fileManifest.files[fullPath] = fileInfo;
    }
    
    // Build component tree
    fileManifest.componentTree = buildComponentTree(fileManifest.files);
    
    // Extract routes (simplified - looks for Route components or page pattern)
    fileManifest.routes = extractRoutes(fileManifest.files);
    
    // Update local file cache with manifest
    await LocalFileCacheAdapter.setManifest(fileManifest);

    return NextResponse.json({
      success: true,
      files: parsedResult.files,
      structure: parsedResult.structure,
      fileCount: Object.keys(parsedResult.files).length,
      manifest: fileManifest,
    });

  } catch (error) {
    console.error('[get-sandbox-files] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

function extractRoutes(files: Record<string, FileInfo>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  // Look for React Router usage
  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.content.includes('<Route') || fileInfo.content.includes('createBrowserRouter')) {
      // Extract route definitions (simplified)
      const routeMatches = fileInfo.content.matchAll(/path=["']([^"']+)["'].*(?:element|component)={([^}]+)}/g);
      
      for (const match of routeMatches) {
        const [, routePath, componentRef] = match;
        routes.push({
          path: routePath,
          component: path,
        });
      }
    }
    
    // Check for Next.js style pages
    if (fileInfo.relativePath.startsWith('pages/') || fileInfo.relativePath.startsWith('src/pages/')) {
      const routePath = '/' + fileInfo.relativePath
        .replace(/^(src\/)?pages\//, '')
        .replace(/\.(jsx?|tsx?)$/, '')
        .replace(/index$/, '');
        
      routes.push({
        path: routePath,
        component: path,
      });
    }
  }
  
  return routes;
}