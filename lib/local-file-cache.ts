import fs from 'fs/promises';
import path from 'path';
import { FileManifest } from '@/types/file-manifest';

export interface LocalSandboxFile {
  content: string;
  lastModified: number;
  size: number;
  path: string;
}

export interface LocalFileCache {
  files: Record<string, LocalSandboxFile>;
  lastSync: number;
  projectRoot: string;
  manifest?: FileManifest;
}

export interface LocalSandboxState {
  fileCache: LocalFileCache | null;
  projectRoot: string;
}

// Global state for local filesystem
declare global {
  var localSandboxState: LocalSandboxState | undefined;
}

/**
 * Initialize local file cache for the current project
 */
export async function initializeLocalFileCache(projectRoot: string): Promise<LocalFileCache> {
  const cache: LocalFileCache = {
    files: {},
    lastSync: Date.now(),
    projectRoot: projectRoot,
    manifest: undefined
  };

  // Initialize global state
  global.localSandboxState = {
    fileCache: cache,
    projectRoot: projectRoot
  };

  return cache;
}

/**
 * Get file stats using fs.stat for cache validation
 */
export async function getFileStats(filePath: string): Promise<{ lastModified: number; size: number } | null> {
  try {
    const stats = await fs.stat(filePath);
    return {
      lastModified: stats.mtime.getTime(),
      size: stats.size
    };
  } catch {
    // File doesn't exist or not accessible
    return null;
  }
}

/**
 * Check if a cached file is still valid based on filesystem timestamps
 */
export async function isCacheValid(cachedFile: LocalSandboxFile, actualPath: string): Promise<boolean> {
  const stats = await getFileStats(actualPath);
  if (!stats) {
    return false; // File no longer exists
  }
  
  return cachedFile.lastModified >= stats.lastModified && cachedFile.size === stats.size;
}

/**
 * Read file content from local filesystem
 */
export async function readLocalFile(filePath: string): Promise<LocalSandboxFile | null> {
  try {
    const stats = await getFileStats(filePath);
    if (!stats) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    
    return {
      content,
      lastModified: stats.lastModified,
      size: stats.size,
      path: filePath
    };
  } catch (error) {
    console.error(`[local-file-cache] Failed to read file ${filePath}:`, error);
    return null;
  }
}

/**
 * Get cached file content with cache validation
 */
export async function getCachedFile(relativePath: string): Promise<LocalSandboxFile | null> {
  const cache = global.localSandboxState?.fileCache;
  if (!cache) {
    return null;
  }

  const cachedFile = cache.files[relativePath];
  if (!cachedFile) {
    return null;
  }

  const actualPath = path.join(cache.projectRoot, relativePath);
  const isValid = await isCacheValid(cachedFile, actualPath);
  
  if (!isValid) {
    // Cache is stale, remove from cache and read fresh
    delete cache.files[relativePath];
    return await readLocalFile(actualPath);
  }

  return cachedFile;
}

/**
 * Update cache with new file content
 */
export async function updateCacheFile(relativePath: string, content: string): Promise<void> {
  const cache = global.localSandboxState?.fileCache;
  if (!cache) {
    return;
  }

  const actualPath = path.join(cache.projectRoot, relativePath);
  
  try {
    // Write to filesystem first
    await fs.writeFile(actualPath, content, 'utf-8');
    
    // Then update cache
    const stats = await getFileStats(actualPath);
    if (stats) {
      cache.files[relativePath] = {
        content,
        lastModified: stats.lastModified,
        size: stats.size,
        path: actualPath
      };
    }
  } catch (error) {
    console.error(`[local-file-cache] Failed to update file ${relativePath}:`, error);
    throw error;
  }
}

/**
 * Scan project directory and build file cache
 */
export async function scanProjectFiles(
  projectRoot: string, 
  extensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md']
): Promise<Record<string, LocalSandboxFile>> {
  const files: Record<string, LocalSandboxFile> = {};
  
  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);
        
        // Skip node_modules and other common directories
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && 
              entry.name !== 'node_modules' && 
              entry.name !== 'coverage' &&
              entry.name !== 'dist' &&
              entry.name !== 'build') {
            await scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            const file = await readLocalFile(fullPath);
            if (file) {
              files[relativePath] = file;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[local-file-cache] Cannot scan directory ${dirPath}:`, error);
    }
  }
  
  await scanDirectory(projectRoot);
  return files;
}

/**
 * Invalidate cache entries for files that have been modified
 */
export async function invalidateStaleCache(): Promise<void> {
  const cache = global.localSandboxState?.fileCache;
  if (!cache) {
    return;
  }

  const filesToCheck = Object.keys(cache.files);
  
  for (const relativePath of filesToCheck) {
    const cachedFile = cache.files[relativePath];
    const actualPath = path.join(cache.projectRoot, relativePath);
    
    const isValid = await isCacheValid(cachedFile, actualPath);
    if (!isValid) {
      delete cache.files[relativePath];
    }
  }
  
  cache.lastSync = Date.now();
}

/**
 * Get all cached files with fresh validation
 */
export async function getAllCachedFiles(): Promise<Record<string, LocalSandboxFile>> {
  const cache = global.localSandboxState?.fileCache;
  if (!cache) {
    return {};
  }

  // First invalidate stale entries
  await invalidateStaleCache();
  
  return { ...cache.files };
}

/**
 * Synchronize cache with filesystem (add new files, remove deleted files)
 */
export async function syncCacheWithFilesystem(): Promise<void> {
  const cache = global.localSandboxState?.fileCache;
  if (!cache) {
    return;
  }

  // Scan for all current files
  const currentFiles = await scanProjectFiles(cache.projectRoot);
  
  // Update cache with new/modified files
  for (const [relativePath, file] of Object.entries(currentFiles)) {
    const cachedFile = cache.files[relativePath];
    if (!cachedFile || cachedFile.lastModified < file.lastModified) {
      cache.files[relativePath] = file;
    }
  }
  
  // Remove files that no longer exist
  const currentPaths = new Set(Object.keys(currentFiles));
  for (const relativePath of Object.keys(cache.files)) {
    if (!currentPaths.has(relativePath)) {
      delete cache.files[relativePath];
    }
  }
  
  cache.lastSync = Date.now();
}

/**
 * Get local files in the format expected by the existing system
 */
export async function getLocalFilesForContext(fileList: string[]): Promise<Record<string, any>> {
  const files: Record<string, any> = {};
  
  for (const relativePath of fileList) {
    const cachedFile = await getCachedFile(relativePath);
    if (cachedFile) {
      files[relativePath] = {
        content: cachedFile.content,
        lastModified: cachedFile.lastModified
      };
    }
  }
  
  return files;
}

/**
 * Migration helper: Convert remote cache key to local path
 */
export function normalizePathForLocal(remotePath: string): string {
  // Remove E2B sandbox prefix
  return remotePath.replace('/home/user/app/', '').replace(/^\/+/, '');
}

/**
 * Compatibility layer for existing cache interface
 */
export class LocalFileCacheAdapter {
  static async getFiles(): Promise<Record<string, any>> {
    const cache = global.localSandboxState?.fileCache;
    if (!cache) {
      return {};
    }
    
    const files: Record<string, any> = {};
    for (const [path, file] of Object.entries(cache.files)) {
      files[path] = {
        content: file.content,
        lastModified: file.lastModified
      };
    }
    
    return files;
  }
  
  static async updateFile(relativePath: string, content: string): Promise<void> {
    await updateCacheFile(relativePath, content);
  }
  
  static async getManifest(): Promise<FileManifest | undefined> {
    return global.localSandboxState?.fileCache?.manifest;
  }
  
  static async setManifest(manifest: FileManifest): Promise<void> {
    const cache = global.localSandboxState?.fileCache;
    if (cache) {
      cache.manifest = manifest;
    }
  }
}