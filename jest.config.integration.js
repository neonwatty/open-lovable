import { createJestConfig, baseJestConfig, getWorkerConfig } from './jest.config.base.js'

// Configuration optimized for integration tests - controlled parallelization
const integrationJestConfig = {
  ...baseJestConfig,
  displayName: {
    name: 'INTEGRATION',
    color: 'yellow',
  },
  
  // Limited workers to prevent resource conflicts
  maxWorkers: getWorkerConfig('integration'),
  
  // Extended timeout for file operations and process management
  testTimeout: 30000,
  
  // Node environment for integration tests
  testEnvironment: 'node',
  
  // Target integration test files
  testMatch: [
    '**/__tests__/integration/**/*.test.*',
    // Include middleware and complex security tests  
    '**/__tests__/security/sandbox-middleware.test.*',
    '**/__tests__/middleware/**/*.test.*',
  ],
  
  // Exclude unit, API, and performance tests
  testPathIgnorePatterns: [
    ...baseJestConfig.testPathIgnorePatterns,
    '/__tests__/lib/.*\\.test\\.',
    '/__tests__/components/',
    '/__tests__/hooks/',
    '/__tests__/config/',
    '/__tests__/unit/',
    '/__tests__/api/',
    '/__tests__/app/',
    '/__tests__/performance/',
    '/__tests__/security/command-security.test',
    '/__tests__/security/path-traversal-protection.test',
    // Exclude React component tests that need jsdom
    '/__tests__/integration/local-development-workflow.test.tsx',
  ],
  
  // Sequential test execution within each worker for resource safety (only when needed)
  ...(process.env.FORCE_SEQUENTIAL === 'true' && { runInBand: true }),
  
  // Don't collect coverage for integration tests by default
  collectCoverage: false,
  
  // More verbose output for debugging integration issues
  verbose: true,
  
  // Setup files specific to integration tests if needed
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    // Add integration-specific setup if needed
    // '<rootDir>/jest.setup.integration.js'
  ],
  
  // Longer detection timeouts for file operations
  detectLeaks: false, // Disable for integration tests as they may intentionally hold resources
  
  // Force exit after tests complete (useful for integration tests that may hang)
  forceExit: true,
  
  // Clear mocks between tests to prevent integration test interference
  clearMocks: true,
}

export default createJestConfig(integrationJestConfig)