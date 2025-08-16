#!/usr/bin/env tsx

/**
 * Demo script to showcase the FileWatcher functionality
 * Run with: npx tsx lib/file-watcher-demo.ts
 */

import { FileWatcher, FileChangeEvent } from './file-watcher';
import { promises as fs } from 'fs';
import path from 'path';

async function demoFileWatcher() {
  console.log('🔍 File Watcher Demo Starting...\n');

  // Create a demo directory
  const demoDir = path.join(process.cwd(), 'demo-sandbox');
  
  try {
    await fs.mkdir(demoDir, { recursive: true });
    console.log(`✅ Created demo directory: ${demoDir}`);
  } catch {
    console.log(`📁 Using existing demo directory: ${demoDir}`);
  }

  // Create file watcher
  const watcher = new FileWatcher({
    watchDir: demoDir,
    debounceMs: 300
  });

  // Set up event listeners
  watcher.on('fileChange', (event: FileChangeEvent) => {
    console.log(`📝 File ${event.type}: ${event.relativePath}`);
  });

  watcher.on('hotReload', (event: FileChangeEvent) => {
    console.log(`🔥 Hot reload triggered for: ${event.relativePath}`);
  });

  watcher.on('error', (error: Error) => {
    console.error(`❌ Watcher error:`, error.message);
  });

  watcher.on('ready', () => {
    console.log('👀 File watcher is ready and watching for changes...\n');
  });

  // Start watching
  try {
    await watcher.start();
    
    console.log('📊 Watcher Stats:');
    console.log(JSON.stringify(watcher.getStats(), null, 2));
    console.log();

    // Demo file operations
    console.log('🧪 Running demo file operations...\n');

    // Create a JavaScript file
    const jsFile = path.join(demoDir, 'example.js');
    await fs.writeFile(jsFile, 'console.log("Hello, world!");', 'utf8');
    console.log('Created example.js');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Modify the file
    await fs.writeFile(jsFile, 'console.log("Hello, updated world!");', 'utf8');
    console.log('Modified example.js');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create a React component
    const reactFile = path.join(demoDir, 'Component.jsx');
    await fs.writeFile(reactFile, `
import React from 'react';

export const Component = () => {
  return <div>Hello from React!</div>;
};
`, 'utf8');
    console.log('Created Component.jsx');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create a CSS file
    const cssFile = path.join(demoDir, 'styles.css');
    await fs.writeFile(cssFile, `
.component {
  background: blue;
  color: white;
}
`, 'utf8');
    console.log('Created styles.css');

    // Wait for events to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Show final stats
    console.log('\n📊 Final Watcher Stats:');
    const finalStats = watcher.getStats();
    console.log(`Total events: ${finalStats.totalEvents}`);
    console.log(`Event counts:`, finalStats.eventCounts);
    console.log(`Watched paths: ${finalStats.watchedPaths.length}`);

    // Create a hot reload watcher for comparison
    console.log('\n🔥 Creating Hot Reload Watcher...');
    const hotReloadWatcher = FileWatcher.createHotReloadWatcher({
      watchDir: demoDir,
      debounceMs: 150
    });

    hotReloadWatcher.on('hotReload', (event: FileChangeEvent) => {
      console.log(`🔥🔥 HOT RELOAD: ${event.relativePath} (${event.type})`);
    });

    await hotReloadWatcher.start();

    // Modify the React component to trigger hot reload
    await fs.writeFile(reactFile, `
import React from 'react';

export const Component = () => {
  return <div>Hello from React! (Hot reloaded)</div>;
};
`, 'utf8');
    console.log('Modified Component.jsx to trigger hot reload');

    // Wait for hot reload event
    await new Promise(resolve => setTimeout(resolve, 500));

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await watcher.stop();
    await hotReloadWatcher.stop();

    // Optional: Remove demo directory
    // await fs.rm(demoDir, { recursive: true, force: true });
    // console.log('Removed demo directory');

    console.log('\n✅ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run the demo if this file is executed directly
// Note: This check doesn't work in ES modules, so we'll just run it
demoFileWatcher().catch(console.error);

export { demoFileWatcher };