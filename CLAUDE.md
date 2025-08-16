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
npm run test:integration  # E2B integration tests
npm run test:api         # API endpoint tests  
npm run test:code        # Code execution tests
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
- Default AI model: moonshotai/kimi-k2-instruct
- Package installation uses --legacy-peer-deps flag
- Auto-restart Vite after package installation

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

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
