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

// Mock Cookies for Next.js edge runtime
global.Headers = global.Headers || Map
if (typeof global.Headers === 'undefined') {
  global.Headers = class MockHeaders extends Map {
    get(key) {
      return super.get(key?.toLowerCase?.())
    }
    set(key, value) {
      return super.set(key?.toLowerCase?.(), value)
    }
    has(key) {
      return super.has(key?.toLowerCase?.())
    }
  }
}

// Polyfill for Node.js environment tests
if (typeof global.ReadableStream === 'undefined') {
  const { ReadableStream } = require('node:stream/web')
  global.ReadableStream = ReadableStream
}

if (typeof global.WritableStream === 'undefined') {
  const { WritableStream } = require('node:stream/web')
  global.WritableStream = WritableStream
}

if (typeof global.TransformStream === 'undefined') {
  const { TransformStream } = require('node:stream/web')
  global.TransformStream = TransformStream
}

// Add Response polyfill for Node.js tests
if (typeof global.Response === 'undefined' || process.env.JEST_WORKER_ID !== undefined) {
  class MockResponse {
    constructor(body, init) {
      this.body = body
      this.status = init?.status || 200
      this.statusText = init?.statusText || 'OK'
      
      const headers = new Map()
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => headers.set(key, value))
        } else if (typeof init.headers === 'object') {
          Object.entries(init.headers).forEach(([key, value]) => headers.set(key, value))
        }
      }
      
      this.headers = {
        get: (key) => headers.get(key),
        set: (key, value) => headers.set(key, value),
        has: (key) => headers.has(key),
        forEach: (callback) => headers.forEach(callback)
      }
    }
    
    async json() {
      return Promise.resolve(this.body)
    }
    
    async text() {
      if (typeof this.body === 'string') {
        return Promise.resolve(this.body)
      }
      return Promise.resolve(JSON.stringify(this.body))
    }
  }
  
  global.Response = MockResponse
}

// Mock Next.js server web APIs
global.Request = jest.fn().mockImplementation((url, options) => ({
  url,
  ...options,
  json: jest.fn().mockResolvedValue({}),
}))

// Mock RequestCookies for NextRequest
jest.mock('next/dist/compiled/@edge-runtime/cookies/index.js', () => ({
  RequestCookies: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    getAll: jest.fn(() => []),
    has: jest.fn(() => false),
    set: jest.fn(),
    delete: jest.fn()
  })),
  ResponseCookies: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    getAll: jest.fn(() => []),
    has: jest.fn(() => false),
    set: jest.fn(),
    delete: jest.fn()
  }))
}))

// Add Response.json static method
if (global.Response) {
  global.Response.json = jest.fn().mockImplementation((data, init) => {
    return new global.Response(JSON.stringify(data), {
      status: init?.status || 200,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers
      }
    })
  })
}

// Fix EventEmitter memory leak warnings during parallel test execution
require('events').EventEmitter.defaultMaxListeners = 20;

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

// Mock NextResponse for API route tests - this is applied globally but may be overridden by individual tests
if (process.env.JEST_WORKER_ID !== undefined) {
  jest.doMock('next/server', () => {
    const originalModule = jest.requireActual('next/server');
    
    // Create a mock NextResponse object that behaves like the real one
    const mockNextResponse = {
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      json: jest.fn().mockImplementation(function() {
        return Promise.resolve(this._data);
      }),
      text: jest.fn().mockImplementation(function() {
        return Promise.resolve(JSON.stringify(this._data));
      })
    };
    
    return {
      ...originalModule,
      NextResponse: {
        ...originalModule.NextResponse,
        json: jest.fn().mockImplementation((data, init) => {
          // Return a proper mock NextResponse object
          const response = Object.create(mockNextResponse);
          response._data = data;
          response.status = init?.status || 200;
          return response;
        })
      }
    };
  });
}

// Mock LocalFileCacheAdapter after other mocks
jest.mock('./lib/local-file-cache', () => ({
  LocalFileCacheAdapter: {
    getFiles: jest.fn().mockResolvedValue({}),
    updateFile: jest.fn().mockResolvedValue(undefined),
    getManifest: jest.fn().mockResolvedValue(undefined),
    setManifest: jest.fn().mockResolvedValue(undefined),
  }
}))