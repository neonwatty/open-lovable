import { createJestConfig, baseJestConfig, getWorkerConfig } from './jest.config.base.js'

// Configuration optimized for performance tests - separate suite with extended timeouts
const performanceJestConfig = {
  ...baseJestConfig,
  displayName: {
    name: 'PERFORMANCE',
    color: 'magenta',
  },
  
  // Sequential execution for accurate performance measurements
  maxWorkers: getWorkerConfig('performance'),
  
  // Very extended timeout for stress tests and benchmarks
  testTimeout: 120000, // 2 minutes
  
  // Node environment for performance testing
  testEnvironment: 'node',
  
  // Target only performance test files
  testMatch: [
    '**/__tests__/performance/**/*.test.*',
  ],
  
  // Exclude all other test types
  testPathIgnorePatterns: [
    ...baseJestConfig.testPathIgnorePatterns,
    '/__tests__/lib/',
    '/__tests__/components/',
    '/__tests__/hooks/',
    '/__tests__/config/',
    '/__tests__/unit/',
    '/__tests__/integration/',
    '/__tests__/api/',
    '/__tests__/app/',
    '/__tests__/security/',
    '/__tests__/middleware/',
  ],
  
  // Sequential execution for consistent performance measurements (handled by maxWorkers: 1 above)
  
  // Don't collect coverage for performance tests
  collectCoverage: false,
  
  // Verbose output with timing information
  verbose: true,
  
  // Don't bail on performance test failures - run all benchmarks
  bail: false,
  
  // Clear everything between tests for clean performance measurements
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  resetModules: true,
  
  // Force exit after tests
  forceExit: true,
  
  // Disable handles detection for performance tests
  detectOpenHandles: false,
  detectLeaks: false,
  
  // Performance-specific setup
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    // Could add performance-specific setup here
    // '<rootDir>/jest.setup.performance.js'
  ],
  
  // Custom reporters for performance metrics
  reporters: [
    'default',
    // Could add custom performance reporter
    // ['<rootDir>/jest.performance-reporter.js', {}]
  ],
  
  // Global variables for performance testing
  globals: {
    // Enable garbage collection for performance tests if --expose-gc is available
    'process.env.NODE_OPTIONS': '--expose-gc',
  },
  
  // Longer test name pattern timeout for performance tests
  testNamePattern: process.env.PERF_TEST_PATTERN || '.*',
  
  // Silent mode option for automated performance runs
  silent: process.env.PERF_SILENT === 'true',
}

export default createJestConfig(performanceJestConfig)