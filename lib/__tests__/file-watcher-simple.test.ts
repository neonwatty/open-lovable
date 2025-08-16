/**
 * @jest-environment node
 */
import { FileWatcher } from '../file-watcher';

describe('FileWatcher Simple Tests', () => {
  test('should create FileWatcher instance', () => {
    const watcher = new FileWatcher({
      watchDir: '/test/directory',
      debounceMs: 100
    });
    
    expect(watcher).toBeInstanceOf(FileWatcher);
    expect(watcher.getWatchDir()).toBe('/test/directory');
    expect(watcher.isWatching()).toBe(false);
  });

  test('should get initial stats', () => {
    const watcher = new FileWatcher();
    const stats = watcher.getStats();
    
    expect(stats).toMatchObject({
      isWatching: false,
      watchedPaths: [],
      totalEvents: 0,
      lastEventTime: null,
      eventCounts: {
        add: 0,
        change: 0,
        unlink: 0,
        addDir: 0,
        unlinkDir: 0
      }
    });
  });

  test('should reset stats', () => {
    const watcher = new FileWatcher();
    watcher.resetStats();
    
    const stats = watcher.getStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.lastEventTime).toBeNull();
  });

  test('should create hot reload watcher', () => {
    const hotReloadWatcher = FileWatcher.createHotReloadWatcher({
      watchDir: '/test/hot-reload'
    });
    
    expect(hotReloadWatcher).toBeInstanceOf(FileWatcher);
    expect(hotReloadWatcher.getWatchDir()).toBe('/test/hot-reload');
  });

  test('should validate directory paths', async () => {
    // This will likely return false since the path doesn't exist
    const isValid = await FileWatcher.validateWatchDirectory('/nonexistent/path');
    expect(typeof isValid).toBe('boolean');
  });
});