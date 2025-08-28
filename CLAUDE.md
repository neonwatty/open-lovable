# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Lovable is a Next.js-based application that allows users to chat with AI to build React apps instantly. It integrates local sandboxes for secure code management, built-in web scraping using Puppeteer and Cheerio, and is optimized for Claude Code integration.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server with Turbopack
npm run dev

# Local mode optimizations (Recommended for Claude Code)
npm run dev:local        # LOCAL_MODE=true next dev --turbopack --port 3000
npm run start:local      # LOCAL_MODE=true next start --port 3000
npm run local:setup      # npm install && npm run typecheck && npm run lint
npm run local:dev        # npm run local:setup && npm run dev:local

# Build production
npm run build
npm run build:local      # NODE_ENV=production npm run build

# Code quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues automatically
npm run typecheck        # Run TypeScript type checking

# Testing - Modular Configuration
npm run test:all         # Full test suite (unit + integration + api + performance + e2e)
npm run test:core        # Core tests (unit + integration)
npm run test:fast        # Fast unit tests only
npm run test:full        # Unit + integration + api tests

# Individual test suites
npm run test:unit        # Unit tests for components, lib, and app (fast, parallelized)
npm run test:integration # Local sandbox integration tests (resource-aware)
npm run test:api         # API endpoint tests (sequential)
npm run test:performance # Performance benchmarking tests
npm run test:e2e         # Playwright end-to-end tests
npm run test:e2e:ui      # Playwright tests with UI
npm run test:e2e:headed  # Playwright tests in headed mode

# Development testing
npm run test:watch:unit        # Unit tests in watch mode
npm run test:watch:integration # Integration tests in watch mode
npm run test:coverage          # Unit tests with coverage
npm run test:coverage:full     # Full coverage including integration and API
npm run test:debug:unit        # Verbose unit test output
npm run test:debug:integration # Verbose integration test output
npm run test:debug:api         # Verbose API test output
npm run test:quiet:unit        # Silent unit test mode

# Maintenance commands
npm run audit:deps       # Security audit for production dependencies
npm run audit:fix        # Fix security issues
npm run cleanup:sandboxes # Remove all sandbox directories
npm run cleanup:cache    # Clean .next cache and sandboxes
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 15.4 with React 19, TypeScript, Tailwind CSS
- **AI Integration**: Optimized for Claude Code with Vercel AI SDK
- **Sandbox Environment**: Local sandbox system for secure code management
- **Web Scraping**: Built-in scraping with Puppeteer, Cheerio, and Turndown
- **Styling**: Tailwind CSS with Radix UI components

### Key Directories
- `/app` - Next.js app router pages and API routes
- `/app/api/` - Backend API endpoints for sandbox management, AI code generation, and package management
- `/components` - React components including UI components and specialized components like CodeApplicationProgress
- `/lib` - Core utilities including edit intent analyzer, file parser, and context selector
- `/config` - Application configuration (app.config.ts)
- `/types` - TypeScript type definitions

### Core API Routes
- `create-ai-sandbox` - Creates local sandbox environment
- `generate-ai-code-stream` - Streams AI-generated code with context
- `apply-ai-code-stream` - Applies generated code to sandbox files
- `detect-and-install-packages` - Auto-detects and installs missing npm packages
- `scrape-url-enhanced` - Scrapes websites for context using built-in scraping tools

### Key Features
- **Context-Aware Code Generation**: Maintains conversation context including scraped websites and generated components
- **Smart Package Detection**: Automatically detects and installs missing npm packages
- **Edit Intent Analysis**: Analyzes user prompts to determine edit types (update, add feature, fix issue)
- **Real-time Sandbox Preview**: Live preview of generated React apps
- **File Structure Visualization**: Interactive file tree with syntax highlighting

### Configuration (config/app.config.ts)
- **LOCAL_MODE Support**: Optimized timeouts and settings when `LOCAL_MODE=true`
- Local sandbox cleanup: automatic after 24 hours
- Vite dev server port: 5173 (configurable via environment)
- Default AI model: claude-code
- Package installation uses --legacy-peer-deps flag
- Auto-restart Vite after package installation
- Max file size for processing: 1MB
- Code analysis timeout: 5-10 seconds (optimized for local mode)
- **Enhanced Port Management**: Dynamic port allocation with conflict resolution
- **File Operation Timeouts**: Optimized for local filesystem operations
- **Performance Monitoring**: Enhanced debugging in local mode

## Environment Variables

### Required Configuration
Create `.env.local` with at least one AI provider key:
```env
# Required - At least one AI provider key
ANTHROPIC_API_KEY=your_anthropic_api_key  # Get from https://console.anthropic.com
OPENAI_API_KEY=your_openai_api_key        # Get from https://platform.openai.com  
GROQ_API_KEY=your_groq_api_key            # Get from https://console.groq.com
```

### Local Mode Optimizations (Recommended for Claude Code)
```env
# Enable local mode optimizations for enhanced performance
LOCAL_MODE=true

# Sandbox configuration
LOCAL_SANDBOX_ROOT=./sandboxes
SANDBOX_CLEANUP_HOURS=24
SANDBOX_MAX_CONCURRENT=10

# Port management
VITE_PORT=5173
SANDBOX_PORT_START=5173
SANDBOX_PORT_END=5200
SANDBOX_PORT_CONFLICT_STRATEGY=increment

# Performance settings
FAST_REFRESH=true
ENABLE_PERFORMANCE_MONITORING=false
DEBUG_LOGGING=false

# Testing configuration
COVERAGE=false
JEST_VERBOSE=false
FORCE_SEQUENTIAL=false
```

### Additional Configuration Options
See `.env.example` for complete configuration options including:
- Security settings
- Testing optimization
- Dependency management
- Development utilities

## TypeScript Configuration

- Target: ES2017
- Module: ESNext with bundler resolution
- Strict mode enabled
- Path alias: `@/*` maps to root directory

## Testing Framework

### Jest Configuration - Modular Architecture
The testing system uses specialized configurations for different test types:

#### Base Configuration (`jest.config.base.js`)
- Shared utilities and worker management
- Environment-aware parallelization 
- LOCAL_MODE optimizations for enhanced performance
- Coverage collection from lib/, app/, and components/

#### Unit Tests (`jest.config.unit.js`)
- **Environment**: jsdom for React component testing
- **Timeout**: 5 seconds for fast execution
- **Workers**: Aggressive parallelization (75-90% of CPU cores)
- **Target**: Components, libraries, hooks, validation, security tests
- **Coverage**: Enabled when `COVERAGE=true`

#### Integration Tests (`jest.config.integration.js`)
- **Environment**: Node.js for system integration
- **Timeout**: 30 seconds for file operations and process management  
- **Workers**: Limited (2-3) to prevent resource conflicts
- **Target**: Sandbox management, middleware, complex workflows
- **Execution**: Sequential when `FORCE_SEQUENTIAL=true`

#### API Tests (`jest.config.api.js`)
- **Environment**: Node.js for API endpoint testing
- **Timeout**: 30 seconds for network operations
- **Workers**: Sequential (1) for resource safety
- **Target**: All API routes and endpoints

#### Performance Tests (`jest.config.performance.js`)
- **Environment**: Node.js for performance benchmarking
- **Timeout**: 60 seconds for comprehensive analysis
- **Workers**: Sequential (1) for accurate measurements
- **Target**: Performance monitoring and optimization validation

### Test Execution Strategies
- **LOCAL_MODE**: Enhanced worker allocation and optimized timeouts
- **Parallel Execution**: Unit tests run with maximum parallelization
- **Resource Management**: Integration and API tests use controlled workers
- **Coverage Collection**: Available for unit tests with detailed reporting
- **Watch Mode**: Available for unit and integration tests during development

### Playwright Configuration  
- E2E tests in `/e2e` directory
- Base URL: http://localhost:3000
- Supports Chromium, Firefox, and WebKit
- Auto-starts dev server before tests
- UI mode available with `npm run test:e2e:ui`

## Local Mode Optimizations

When `LOCAL_MODE=true` is set:
- **Performance**: Reduced timeouts and optimized file operations
- **Testing**: Enhanced worker allocation for faster test execution  
- **Development**: Fast refresh and inline source maps available
- **Debugging**: Verbose logging and performance monitoring enabled
- **Configuration**: All timeouts and delays optimized for local development

## Important Reminders for Claude Code

### Do what has been asked; nothing more, nothing less.
- NEVER create files unless absolutely necessary for achieving your goal.
- ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

### Testing Commands
Always run linting and type checking after making changes:
```bash
npm run lint        # Check for linting issues
npm run typecheck   # Check TypeScript types
```

For comprehensive validation:
```bash
npm run test:core   # Unit and integration tests
npm run local:setup # Install, typecheck, and lint
```

