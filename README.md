<div align="center">

# Open Lovable

Chat with Claude Code to build React apps instantly - Local-only version with no external dependencies.

<img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZtaHFleGRsMTNlaWNydGdianI4NGQ4dHhyZjB0d2VkcjRyeXBucCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZFVLWMa6dVskQX0qu1/giphy.gif" alt="Open Lovable Demo" width="100%"/>

</div>

## Setup

1. **Clone & Install**
```bash
git clone https://github.com/mendableai/open-lovable.git
cd open-lovable
npm install
```

2. **Add `.env.local` (Optional)**
```env
# Local Development Configuration for Claude Code-only Operation

# Local sandbox directory for file operations
LOCAL_SANDBOX_PATH=./sandbox

# Vite development server port
VITE_PORT=5173

# Optional - Development settings
NODE_ENV=development
```

> **Note:** This version operates locally with Claude Code integration. External API keys for E2B, Firecrawl, or AI providers are no longer required.

3. **Run**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)  

## License

MIT