// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock next/headers
jest.mock('next/headers', () => ({
  headers: jest.fn(() => new Map()),
  cookies: jest.fn(() => new Map()),
}))

// Mock Next.js server web APIs
global.Request = jest.fn().mockImplementation((url, options) => ({
  url,
  ...options,
  json: jest.fn().mockResolvedValue({}),
}))

global.Response = {
  json: jest.fn().mockImplementation((data, init) => ({
    json: () => Promise.resolve(data),
    status: init?.status || 200,
    ...init,
  })),
}

// Global test configuration
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks()
})

// Cleanup after tests
afterEach(() => {
  // Cleanup any test artifacts
  jest.restoreAllMocks()
})