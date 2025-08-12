/**
 * Performance Benchmarks for File Operations
 * 
 * Benchmarks comparing the old E2B Python-based system 
 * with the new Node.js local filesystem operations.
 * 
 * Tests measure:
 * - File creation speed
 * - Directory creation performance  
 * - Content processing throughput
 * - Memory usage characteristics
 * - Error handling overhead
 * - Concurrent operation performance
 */

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';
import { NextRequest } from 'next/server';
import { POST as applyAiCodeStream } from '../app/api/apply-ai-code-stream/route';

// Mock global variables
declare global {
  var existingFiles: Set<string>;
  var sandboxState: any;
  var sandboxWatcher: any;
}

const testDir = path.join(tmpdir(), 'performance-benchmark-test');
const sandboxDir = path.join(testDir, 'sandbox');

// Performance measurement utilities
class PerformanceMeasurement {
  private startTime: number = 0;
  private measurements: Record<string, number[]> = {};

  start() {
    this.startTime = performance.now();
  }

  end(label: string) {
    const duration = performance.now() - this.startTime;
    if (!this.measurements[label]) {
      this.measurements[label] = [];
    }
    this.measurements[label].push(duration);
    return duration;
  }

  getStats(label: string) {
    const measurements = this.measurements[label] || [];
    if (measurements.length === 0) return null;

    const sorted = [...measurements].sort((a, b) => a - b);
    return {
      count: measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
      p99: sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1]
    };
  }

  getAllStats() {
    const results: Record<string, any> = {};
    for (const label in this.measurements) {
      results[label] = this.getStats(label);
    }
    return results;
  }
}

const perf = new PerformanceMeasurement();

beforeEach(async () => {
  // Clean up any existing test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    // Directory might not exist, ignore
  }
  
  // Create fresh test directory structure
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(sandboxDir, { recursive: true });
  
  // Mock process.cwd() to return our test directory
  const originalCwd = process.cwd;
  process.cwd = () => testDir;
  
  // Initialize global variables
  global.existingFiles = new Set<string>();
  global.sandboxState = {
    fileCache: {
      files: {}
    }
  };
  global.sandboxWatcher = null;
  
  return () => {
    process.cwd = originalCwd;
  };
});

afterEach(async () => {
  // Close any file watchers
  if (global.sandboxWatcher) {
    global.sandboxWatcher.close();
    global.sandboxWatcher = null;
  }
  
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

function createMockRequest(body: any): NextRequest {
  return {
    json: async () => body,
    headers: new Map([['host', 'localhost:3000']])
  } as any;
}

async function readStreamResponse(response: Response): Promise<any[]> {
  const events: any[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            events.push(JSON.parse(line.slice(6)));
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error) {
    // Stream ended
  }
  
  return events;
}

// Generate test content of various sizes
function generateTestContent(size: 'small' | 'medium' | 'large' | 'xlarge', fileCount: number = 1) {
  const templates = {
    small: (i: number) => `
import React from 'react';

export const Component${i}: React.FC = () => {
  return <div>Hello Component ${i}</div>;
};
`,
    medium: (i: number) => `
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Component${i}Props {
  title: string;
  description: string;
  isActive?: boolean;
}

export const Component${i}: React.FC<Component${i}Props> = ({ 
  title, 
  description, 
  isActive = false 
}) => {
  const [count, setCount] = useState(0);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    // Simulated data loading
    const loadData = async () => {
      const response = await fetch('/api/data');
      const result = await response.json();
      setData(result);
    };
    
    loadData();
  }, []);

  const handleIncrement = () => {
    setCount(prev => prev + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={\`p-6 rounded-lg shadow-lg \${isActive ? 'bg-blue-100' : 'bg-white'}\`}
    >
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-gray-600 mb-4">{description}</p>
      <div className="flex items-center gap-4">
        <span className="text-lg">Count: {count}</span>
        <button
          onClick={handleIncrement}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Increment
        </button>
      </div>
      {data.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Data:</h3>
          <ul className="space-y-1">
            {data.slice(0, 5).map((item, index) => (
              <li key={index} className="text-sm text-gray-500">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
};
`,
    large: (i: number) => `
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlay, FaPause, FaStop, FaRefresh } from 'react-icons/fa';

interface DataItem {
  id: string;
  name: string;
  value: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

interface Component${i}Props {
  title: string;
  description: string;
  isActive?: boolean;
  initialData?: DataItem[];
  onDataChange?: (data: DataItem[]) => void;
  config?: {
    autoRefresh: boolean;
    refreshInterval: number;
    maxItems: number;
  };
}

export const Component${i}: React.FC<Component${i}Props> = ({ 
  title, 
  description, 
  isActive = false,
  initialData = [],
  onDataChange,
  config = {
    autoRefresh: false,
    refreshInterval: 5000,
    maxItems: 100
  }
}) => {
  const [count, setCount] = useState(0);
  const [data, setData] = useState<DataItem[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'timestamp'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Memoized filtered and sorted data
  const processedData = useMemo(() => {
    let filtered = data.filter(item => 
      item.name.toLowerCase().includes(filter.toLowerCase()) ||
      item.id.toLowerCase().includes(filter.toLowerCase())
    );

    filtered.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const modifier = sortOrder === 'asc' ? 1 : -1;
      
      if (sortBy === 'timestamp') {
        return (new Date(aVal).getTime() - new Date(bVal).getTime()) * modifier;
      }
      
      if (typeof aVal === 'string') {
        return aVal.localeCompare(bVal as string) * modifier;
      }
      
      return ((aVal as number) - (bVal as number)) * modifier;
    });

    return filtered.slice(0, config.maxItems);
  }, [data, filter, sortBy, sortOrder, config.maxItems]);

  // Simulated data loading
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
      
      const newData: DataItem[] = Array.from({ length: 20 + Math.floor(Math.random() * 30) }, (_, index) => ({
        id: \`item-\${Date.now()}-\${index}\`,
        name: \`Item \${index + 1}\`,
        value: Math.floor(Math.random() * 1000),
        timestamp: new Date(),
        metadata: {
          category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
          priority: Math.floor(Math.random() * 5) + 1,
          tags: ['tag1', 'tag2', 'tag3'].slice(0, Math.floor(Math.random() * 3) + 1)
        }
      }));
      
      setData(prev => [...newData, ...prev].slice(0, config.maxItems * 2));
      onDataChange?.(newData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [onDataChange, config.maxItems]);

  // Auto-refresh effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (config.autoRefresh && isActive) {
      interval = setInterval(loadData, config.refreshInterval);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [config.autoRefresh, config.refreshInterval, isActive, loadData]);

  // Initial data load
  useEffect(() => {
    if (data.length === 0) {
      loadData();
    }
  }, []);

  const handleIncrement = useCallback(() => {
    setCount(prev => prev + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleSortChange = useCallback((newSortBy: typeof sortBy) => {
    if (newSortBy === sortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
  }, [sortBy]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={\`p-6 rounded-lg shadow-lg \${isActive ? 'bg-blue-50 border-2 border-blue-300' : 'bg-white border border-gray-200'}\`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-gray-600">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Count: {count}</span>
          <button
            onClick={handleIncrement}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <FaPlay className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <input
          type="text"
          placeholder="Filter items..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <FaRefresh className={\`w-4 h-4 \${isLoading ? 'animate-spin' : ''}\`} />
          Refresh
        </button>
      </div>

      <div className="mb-4">
        <div className="flex gap-2">
          {(['name', 'value', 'timestamp'] as const).map(field => (
            <button
              key={field}
              onClick={() => handleSortChange(field)}
              className={\`px-3 py-1 rounded text-sm \${
                sortBy === field
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }\`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortBy === field && (
                <span className="ml-1">
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        <AnimatePresence>
          {processedData.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-3 bg-gray-50 rounded border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{item.name}</h4>
                  <p className="text-sm text-gray-500">ID: {item.id}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{item.value}</div>
                  <div className="text-xs text-gray-500">
                    {item.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                {item.metadata.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Showing {processedData.length} of {data.length} items
      </div>
    </motion.div>
  );
};
`,
    xlarge: (i: number) => templates.large(i) + templates.medium(i) + templates.small(i)
  };

  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push(`<file path="src/components/Perf${size.charAt(0).toUpperCase()}${size.slice(1)}Component${i}.tsx">${templates[size](i)}</file>`);
  }

  return files.join('\n');
}

describe('Performance Benchmarks', () => {
  afterAll(() => {
    // Print all performance stats
    console.log('\n📊 Performance Benchmark Results:');
    console.log('=====================================');
    const stats = perf.getAllStats();
    
    Object.entries(stats).forEach(([label, stat]) => {
      if (stat) {
        console.log(`\n${label}:`);
        console.log(`  Count: ${stat.count}`);
        console.log(`  Average: ${stat.avg.toFixed(2)}ms`);
        console.log(`  Median: ${stat.median.toFixed(2)}ms`);
        console.log(`  Min: ${stat.min.toFixed(2)}ms`);
        console.log(`  Max: ${stat.max.toFixed(2)}ms`);
        console.log(`  P95: ${stat.p95.toFixed(2)}ms`);
        console.log(`  P99: ${stat.p99.toFixed(2)}ms`);
      }
    });
  });

  test('should benchmark single small file creation', async () => {
    const content = generateTestContent('small', 1);
    
    perf.start();
    const request = createMockRequest({
      response: content,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('single_small_file');

    expect(response.status).toBe(200);
    
    // Verify file was created
    const filePath = path.join(sandboxDir, 'src', 'components', 'PerfSmallComponent0.tsx');
    const exists = await fs.access(filePath).then(() => true, () => false);
    expect(exists).toBe(true);
  });

  test('should benchmark multiple small files creation', async () => {
    const content = generateTestContent('small', 10);
    
    perf.start();
    const request = createMockRequest({
      response: content,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('multiple_small_files');

    expect(response.status).toBe(200);
    
    // Verify all files were created
    for (let i = 0; i < 10; i++) {
      const filePath = path.join(sandboxDir, 'src', 'components', `PerfSmallComponent${i}.tsx`);
      const exists = await fs.access(filePath).then(() => true, () => false);
      expect(exists).toBe(true);
    }
  });

  test('should benchmark medium complexity file creation', async () => {
    const content = generateTestContent('medium', 5);
    
    perf.start();
    const request = createMockRequest({
      response: content,
      packages: ['framer-motion']
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('medium_complexity_files');

    expect(response.status).toBe(200);
  });

  test('should benchmark large file creation', async () => {
    const content = generateTestContent('large', 3);
    
    perf.start();
    const request = createMockRequest({
      response: content,
      packages: ['framer-motion', 'react-icons']
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('large_files');

    expect(response.status).toBe(200);
  });

  test('should benchmark concurrent file operations', async () => {
    const requests = Array.from({ length: 5 }, (_, i) => 
      createMockRequest({
        response: generateTestContent('small', 2),
        packages: []
      })
    );

    perf.start();
    const responses = await Promise.all(
      requests.map(request => applyAiCodeStream(request))
    );
    perf.end('concurrent_operations');

    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
  });

  test('should benchmark directory creation performance', async () => {
    const deepPaths = Array.from({ length: 20 }, (_, i) => {
      const depth = Math.floor(i / 4) + 1;
      const pathSegments = Array.from({ length: depth }, (_, j) => `level${j}`);
      return `src/${pathSegments.join('/')}/DeepComponent${i}.tsx`;
    });

    const content = deepPaths.map((filePath, i) => 
      `<file path="${filePath}">export const DeepComponent${i} = () => <div>Deep ${i}</div>;</file>`
    ).join('\n');

    perf.start();
    const request = createMockRequest({
      response: content,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('directory_creation');

    expect(response.status).toBe(200);
  });

  test('should benchmark file update performance', async () => {
    // First create initial files
    const initialContent = generateTestContent('small', 5);
    await applyAiCodeStream(createMockRequest({
      response: initialContent,
      packages: []
    }));

    // Now benchmark updates
    const updateContent = generateTestContent('medium', 5);
    
    perf.start();
    const request = createMockRequest({
      response: updateContent,
      packages: [],
      isEdit: true
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('file_updates');

    expect(response.status).toBe(200);
  });

  test('should benchmark memory usage patterns', async () => {
    const initialMemory = process.memoryUsage();
    
    // Create a large number of files to test memory usage
    const content = generateTestContent('medium', 50);
    
    const request = createMockRequest({
      response: content,
      packages: ['react', 'framer-motion']
    });
    
    perf.start();
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('memory_intensive_operation');

    const finalMemory = process.memoryUsage();
    
    // Calculate memory usage
    const memoryDiff = {
      rss: finalMemory.rss - initialMemory.rss,
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      external: finalMemory.external - initialMemory.external
    };

    console.log('\n🧠 Memory Usage:');
    console.log(`  RSS: ${(memoryDiff.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Used: ${(memoryDiff.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Total: ${(memoryDiff.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  External: ${(memoryDiff.external / 1024 / 1024).toFixed(2)} MB`);

    expect(response.status).toBe(200);
    
    // Memory usage should be reasonable (adjust threshold as needed)
    expect(memoryDiff.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
  });

  test('should benchmark error handling performance', async () => {
    // Create content that will cause various processing scenarios
    const problematicContent = `
    <file path="src/components/BadFile1.tsx">
    // This file has syntax errors and malformed content
    export const BadComponent = () => {
      return (
        <div>
          <p>Unclosed paragraph
          <span>Nested span without closing
        </div>
      );
    </file>
    
    <file path="src/components/GoodFile1.tsx">
    export const GoodComponent = () => <div>This is fine</div>;
    </file>
    
    <file path="">
    // Empty path file
    </file>
    
    <file path="src/components/AnotherGoodFile.tsx">
    export const AnotherGoodComponent = () => <div>Also fine</div>;
    </file>
    `;

    perf.start();
    const request = createMockRequest({
      response: problematicContent,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('error_handling');

    // Should handle errors gracefully and still succeed
    expect(response.status).toBe(200);
  });

  test('should benchmark package detection performance', async () => {
    const packageHeavyContent = `
    <file path="src/components/PackageHeavy.tsx">
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlay, FaPause, FaStop } from 'react-icons/fa';
import { Button, Input, Card, Modal } from '@mui/material';
import { format, addDays, subDays } from 'date-fns';
import _ from 'lodash';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useQuery, useMutation } from 'react-query';
import { Formik, Form, Field } from 'formik';
import * as yup from 'yup';
import { useSpring, animated } from '@react-spring/web';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

export const PackageHeavyComponent = () => {
  return <div>Many packages imported</div>;
};
    </file>
    `;

    perf.start();
    const request = createMockRequest({
      response: packageHeavyContent,
      packages: []
    });
    
    const response = await applyAiCodeStream(request);
    await readStreamResponse(response);
    perf.end('package_detection');

    expect(response.status).toBe(200);
  });
});