# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Lovable is a Next.js-based application that allows users to chat with AI to build React apps instantly. It integrates E2B sandboxes for code execution, built-in web scraping using Puppeteer and Cheerio, and supports multiple AI providers (OpenAI GPT-5, Anthropic Claude, Groq with Kimi K2).

## Development Commands

```bash
# Install dependencies
npm install

# Run development server with Turbopack
npm run dev

# Build production
npm run build

# Run linting
npm run lint

# Run all tests
npm run test:all

# Run individual test suites
npm run test:unit        # Unit tests for components, lib, and app
npm run test:integration # E2B integration tests
npm run test:e2e         # Playwright end-to-end tests
npm run test:e2e:ui      # Playwright tests with UI
npm run test:sandbox     # Specific sandbox manager tests

# Additional test commands
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test:debug       # Run tests with verbose output
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 15.4 with React 19, TypeScript, Tailwind CSS
- **AI Integration**: Vercel AI SDK with support for Anthropic, OpenAI, and Groq
- **Sandbox Environment**: E2B for isolated code execution
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
- `create-ai-sandbox` - Creates E2B sandbox environment
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
- E2B sandbox timeout: 15 minutes
- Vite dev server port: 5173
- Default AI model: claude-code
- Package installation uses --legacy-peer-deps flag
- Auto-restart Vite after package installation
- Max file size for processing: 1MB
- Code analysis timeout: 10 seconds

## Environment Variables

Required in `.env.local`:
- `E2B_API_KEY` - E2B sandbox API key
- At least one AI provider key:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GROQ_API_KEY`

## TypeScript Configuration

- Target: ES2017
- Module: ESNext with bundler resolution
- Strict mode enabled
- Path alias: `@/*` maps to root directory

## Testing Framework

### Jest Configuration
- Test environment: jsdom
- Single worker for stability
- 30-second timeout for integration tests
- Coverage includes lib/, app/, and components/ directories
- Test patterns: `**/__tests__/**/*.(test|spec).(js|jsx|ts|tsx)`

### Playwright Configuration
- E2E tests in `/e2e` directory
- Base URL: http://localhost:3000
- Supports Chromium, Firefox, and WebKit
- Auto-starts dev server before tests

