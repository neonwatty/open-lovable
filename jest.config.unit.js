import { createJestConfig, baseJestConfig, getWorkerConfig } from './jest.config.base.js'

// Configuration optimized for unit tests - fast, parallel execution
const unitJestConfig = {
  ...baseJestConfig,
  displayName: {
    name: 'UNIT',
    color: 'green',
  },
  
  // Aggressive parallelization for unit tests
  maxWorkers: getWorkerConfig('unit'),
  
  // Fast execution with short timeout
  testTimeout: 5000,
  
  // jsdom environment for React component testing
  testEnvironment: 'jest-environment-jsdom',
  
  // Target unit test files - components, libs, hooks, validation
  testMatch: [
    '**/__tests__/lib/*.test.*',
    '**/__tests__/components/**/*.test.*',
    '**/__tests__/hooks/**/*.test.*',
    '**/__tests__/config/**/*.test.*',
    '**/__tests__/unit/**/*.test.*',
    // Include pure validation security tests
    '**/__tests__/security/command-security.test.*',
    '**/__tests__/security/path-traversal-protection.test.*',
    // Include React component integration tests that need jsdom
    '**/__tests__/integration/local-development-workflow.test.tsx',
  ],
  
  // Exclude integration, API, and performance tests
  testPathIgnorePatterns: [
    ...baseJestConfig.testPathIgnorePatterns,
    '/__tests__/integration/',
    '/__tests__/api/',
    '/__tests__/app/',
    '/__tests__/performance/',
    '/__tests__/security/sandbox-middleware.test',
    '/__tests__/middleware/',
  ],
  
  // Enable coverage collection for unit tests
  collectCoverage: process.env.COVERAGE === 'true',
  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Fail fast for unit tests - stop on first failure in CI
  bail: process.env.CI === 'true' ? 1 : 0,
  
  // Verbose output only when explicitly requested
  verbose: process.env.JEST_VERBOSE === 'true',
  
  // Reduce console noise during tests
  silent: process.env.JEST_SILENT === 'true',
}

export default createJestConfig(unitJestConfig)