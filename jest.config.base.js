import nextJest from 'next/jest.js'
import os from 'os'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Shared base configuration for all test types
export const baseJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/test/', // Ignore the E2B test directory
    '<rootDir>/e2e/', // Ignore Playwright E2E tests
    '<rootDir>/sandboxes/', // Ignore dynamic sandbox directories
  ],
  transform: {
    // Use babel-jest to transpile tests with the next/babel preset
    // https://jestjs.io/docs/configuration#transform-string-pathtotransformer--pathtotransformer-object
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}

// Helper function to determine optimal worker count
export const getWorkerConfig = (testType) => {
  const cpuCount = os.cpus().length
  const isCI = process.env.CI === 'true'
  const isLocalMode = process.env.LOCAL_MODE === 'true'
  
  // Optimize for local development
  if (isLocalMode) {
    switch (testType) {
      case 'unit':
        // More aggressive parallelization in local mode
        return Math.floor(cpuCount * 0.9)
      
      case 'integration':
        // Slightly more workers for local development
        return Math.min(3, cpuCount - 1)
      
      case 'api':
      case 'performance':
        // Sequential execution for reliability
        return 1
      
      default:
        return 1
    }
  }
  
  switch (testType) {
    case 'unit':
      // Aggressive parallelization for unit tests
      return isCI ? Math.min(cpuCount - 1, 4) : Math.floor(cpuCount * 0.75)
    
    case 'integration':
      // Limited workers for integration tests to avoid resource conflicts
      return isCI ? 1 : Math.min(2, cpuCount - 2)
    
    case 'api':
    case 'performance':
      // Sequential execution for API and performance tests
      return 1
    
    default:
      return 1
  }
}

// Export configured Jest setup function
export { createJestConfig }