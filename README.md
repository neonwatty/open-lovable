<div align="center">

# Open Lovable

Chat with AI to build React apps instantly - Optimized for Claude Code.

<img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZtaHFleGRsMTNlaWNydGdianI4NGQ4dHhyZjB0d2VkcjRyeXBucCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZFVLWMa6dVskQX0qu1/giphy.gif" alt="Open Lovable Demo" width="100%"/>

</div>

## Features

✨ **Claude Code Integration** - Optimized for Claude Code with intelligent context management  
🏗️ **Local Sandbox System** - Secure local development environment with automatic cleanup  
⚡ **Advanced Testing Suite** - Modular test configurations with performance optimizations  
📦 **Smart Package Management** - Automatic package detection and installation  
🔒 **Built-in Security** - Path traversal protection and sandbox middleware  
🎨 **Live Preview** - Real-time React app preview with hot module replacement  

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/mendableai/open-lovable.git
cd open-lovable
npm install
```

### 2. Environment Setup

Copy the example environment file:
```bash
cp .env.example .env.local
```

**For Claude Code users (Recommended):**
```env
# Enable local mode optimizations
LOCAL_MODE=true

# Required - At least one AI provider key
ANTHROPIC_API_KEY=your_anthropic_api_key  # Get from https://console.anthropic.com
```

**For other setups:**
```env
# Optional AI provider keys
OPENAI_API_KEY=your_openai_api_key  # Get from https://platform.openai.com
GROQ_API_KEY=your_groq_api_key  # Get from https://console.groq.com
```

### 3. Development

**Standard development:**
```bash
npm run dev
```

**Local optimized development (Recommended for Claude Code):**
```bash
npm run local:dev
```

**Quick setup and run:**
```bash
npm run local:setup  # Install, typecheck, and lint
npm run dev:local     # Start with local optimizations
```

Open [http://localhost:3000](http://localhost:3000)

## Development Commands

### Testing
```bash
# Quick testing
npm run test:fast        # Fast unit tests only
npm run test:core        # Unit + integration tests
npm run test:all         # Full test suite including E2E

# Individual test suites
npm run test:unit        # Unit tests (fast, parallelized)
npm run test:integration # Integration tests (resource-aware)
npm run test:api         # API endpoint tests
npm run test:performance # Performance benchmarking
npm run test:e2e         # End-to-end tests

# Development helpers
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage reports
npm run test:debug       # Verbose debugging
```

### Maintenance
```bash
# Dependency management
npm run audit:deps       # Security audit
npm run audit:fix        # Fix security issues

# Cleanup
npm run cleanup:sandboxes # Clean sandbox directories
npm run cleanup:cache    # Clean .next and sandboxes

# Code quality
npm run lint             # ESLint
npm run lint:fix         # Fix linting issues
npm run typecheck        # TypeScript validation
```  

## License

MIT