# Test Workflows Documentation

This directory contains comprehensive documentation of the user workflows supported by the Open Lovable application based on the completed infrastructure tasks.

## Overview

Open Lovable has been transformed from using external services (E2B, Firecrawl, AI SDKs) to a fully local development environment with Claude Code integration. This enables users to generate, iterate on, and preview React applications entirely on their local machine.

## Core User Workflows

### 1. [AI-Powered Code Generation Flow](./01-ai-code-generation.md)
**User Journey**: User enters a prompt → AI generates React code → Code appears in local preview

Key components:
- Claude Code integration bridge (Task 4)
- Local file operations (Task 2)
- Code block parsing and extraction
- Real-time preview at `localhost:5173`

### 2. [Local Sandbox Management Flow](./02-sandbox-management.md)
**User Journey**: Automatic sandbox creation → Live preview → Hot reload

Key components:
- UUID-based sandbox directories (Task 1.1)
- React + Vite + Tailwind template generation (Task 1.3)
- Vite dev server process management (Task 1.2)
- Dynamic port allocation (Task 1.5)
- File watching and hot reload (Task 2.3)

### 3. [Web Content Integration Flow](./03-web-content-integration.md)
**User Journey**: User provides URL → App scrapes content → Content used as context for code generation

Key components:
- Built-in web scraping with fetch() + Cheerio (Task 3.1-3.2)
- Puppeteer for JavaScript-heavy sites (Task 3.3)
- Content sanitization and character handling (Task 3.4)
- Context integration for AI prompts

### 4. [Iterative Development Flow](./04-iterative-development.md)
**User Journey**: Generate initial code → Make changes → Refine with additional prompts

Key components:
- Context management and conversation history (Task 4.6)
- Local file cache with timestamp tracking (Task 2.4)
- Streaming response handling (Task 4.5)
- Transaction-like file operations (Task 2.5)

### 5. [Error Recovery and Debugging Flow](./05-error-recovery.md)
**User Journey**: Encounter error → System provides helpful feedback → Retry or fix

Key components:
- Comprehensive error handling and cleanup (Task 1.6)
- Process management and zombie prevention
- Rollback capabilities for failed operations
- User-friendly local development error messages

## Technical Foundation

### Completed Infrastructure
- **Local Sandbox Infrastructure** (Task 1) - Complete local environment management
- **File Operations Migration** (Task 2) - Node.js fs operations replacing Python calls
- **Built-in Web Scraping** (Task 3) - Self-contained scraping without external APIs
- **Claude Code Integration** (Task 4) - Bidirectional communication bridge

### Key Capabilities
- **Security**: Path traversal protection and sandbox isolation
- **Performance**: Direct file operations without external API latency
- **Reliability**: Robust error handling and process cleanup
- **Flexibility**: Dynamic port allocation and multi-sandbox support
- **Offline Capability**: Works without internet except for web scraping

## Testing Guidelines

Each workflow document includes:
- **Step-by-step user journey** - Expected user actions and system responses
- **Technical implementation** - Links to completed tasks and components
- **Expected inputs/outputs** - Sample prompts and resulting code
- **Error scenarios** - Common failure cases and recovery procedures
- **Validation criteria** - How to verify the workflow is functioning correctly

## Usage

These workflows serve as:
1. **Test specifications** for validating completed functionality
2. **User documentation** for understanding application capabilities
3. **Technical reference** for developers working on the system
4. **Quality assurance guidelines** for ensuring all features work as intended

## Status

All documented workflows are based on **completed tasks** from the Task Master system. The underlying infrastructure has been implemented and tested, making these workflows ready for end-to-end validation.