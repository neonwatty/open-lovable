import { createJestConfig, baseJestConfig, getWorkerConfig } from './jest.config.base.js'

// Configuration optimized for API tests - sequential execution to avoid port conflicts
const apiJestConfig = {
  ...baseJestConfig,
  displayName: {
    name: 'API',
    color: 'blue',
  },
  
  // Sequential execution to prevent API route conflicts
  maxWorkers: getWorkerConfig('api'),
  
  // Extended timeout for API calls and sandbox operations
  testTimeout: 30000,
  
  // Node environment for API route testing
  testEnvironment: 'node',
  
  // Target API and app test files
  testMatch: [
    '**/__tests__/api/**/*.test.*',
    '**/__tests__/app/**/*.test.*',
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
    '/__tests__/performance/',
    '/__tests__/security/',
    '/__tests__/middleware/',
  ],
  
  // Sequential execution to prevent port conflicts (handled by maxWorkers: 1 above)
  
  // Don't collect coverage for API tests
  collectCoverage: false,
  
  // Verbose output for API debugging
  verbose: true,
  
  // Clear mocks and reset modules between tests for API isolation
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Force exit after tests (API tests may leave hanging connections)
  forceExit: true,
  
  // Disable detection of async operations that prevent Jest from exiting
  detectOpenHandles: false,
  
  // Global setup for API tests if needed
  // globalSetup: '<rootDir>/jest.api.setup.js',
  // globalTeardown: '<rootDir>/jest.api.teardown.js',
  
  // Module directories for API route resolution
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Handle Next.js API route imports
  moduleNameMapper: {
    ...baseJestConfig.moduleNameMapper,
    // Additional mappings for API routes if needed
  },
}

export default createJestConfig(apiJestConfig)