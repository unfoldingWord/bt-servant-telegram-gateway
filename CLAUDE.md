# Claude Instructions - bt-servant-telegram-gateway

## System Context

**BT Servant** is an AI-powered Bible translation assistant developed by unfoldingWord. The system helps Bible translators by providing AI-assisted drafting, checking, and guidance in multiple languages.

The system consists of two main components:

1. **bt-servant-worker** (`../bt-servant-worker`) - The core AI worker that handles:
   - Language model interactions (Claude)
   - User preferences and session management
   - MCP tool orchestration
   - All the "brains" of the system

2. **bt-servant-telegram-gateway** (this repo) - A thin relay/bridge that:
   - Receives Telegram webhook updates from the Bot API
   - Forwards them to the worker for processing
   - Sends responses back through Telegram

The gateway is intentionally "dumb" - it does NO AI processing itself. This separation allows:

- The worker to serve multiple channels (web, WhatsApp, Telegram, future platforms)
- Each gateway to focus purely on protocol translation
- Clear security boundaries (gateway handles Telegram auth, worker handles AI)

## Project Overview

Telegram Gateway is a Cloudflare Worker that handles Telegram Bot API webhook integration for the BT Servant Worker. It:

- Receives webhook updates from Telegram (text and voice/audio messages in private chats, groups, supergroups, topics)
- Validates the webhook secret token
- Forwards messages to the BT Servant Worker API (text as-is, voice/audio as base64-encoded bytes)
- Sends responses back to users via Telegram (text and/or voice via `sendVoice`)
- Uses `waitUntil()` pattern to return 200 immediately and process in background
- Handles `/start`, `/help`, and `/reset` slash commands locally
- Supports full group conversation awareness via `FORWARD_ALL_GROUP_MESSAGES` flag

**Important**: This gateway has ZERO AI dependency. All AI processing happens in the worker.

## Architecture

```
src/
├── index.ts              # Main Hono app with routes
├── config/
│   └── types.ts          # Env interface + parseEnvNumber
├── core/
│   └── models.ts         # Telegram types, update parsing, message validation
├── services/
│   ├── engine-client.ts  # HTTP client for worker API (text + audio, with 429 retry)
│   ├── engine-adapter.ts # Thin facade over engine-client
│   ├── message-handler.ts # Message processing orchestration (text + voice dispatch)
│   ├── encoding.ts       # Base64 encoding for Cloudflare Workers
│   ├── chunking.ts       # Message splitting for Telegram limits
│   ├── telegram-format.ts # Markdown -> Telegram HTML conversion
│   ├── engine-response-format.ts # Response normalization
│   └── progress-message.ts # Progress callback parsing
└── telegram/
    └── client.ts         # Telegram API wrapper (fetch-based, text + voice + file download)
```

**Dependency Rules (ESLint enforced):**

- **types/**: No internal dependencies (onion architecture)
- **services/**: Can import from types and core
- **index.ts**: Can import from all

## Quick Start

```bash
# Install dependencies
pnpm install

# Create local secrets file
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your settings

# Run development server
pnpm dev
```

## Coding Standards

### Style & Naming

- **TypeScript**, 2-space indentation, UTF-8 encoding
- `camelCase` for functions/variables
- `PascalCase` for types/interfaces
- `UPPER_SNAKE_CASE` for constants
- Keep functions small (≤50 lines, ESLint enforced)

### Linting & Type Checking

Run before committing:

```bash
pnpm lint                 # ESLint
pnpm format               # Prettier
pnpm check                # TypeScript type checking
```

### Testing

```bash
pnpm test                 # Run all unit tests
pnpm test:integration     # Run integration tests
```

## Pre-commit Hooks

Hooks are installed automatically via husky when you run `pnpm install`.

### CRITICAL: Linting is Mandatory

**NEVER commit code unless ALL lint checks pass.** This is non-negotiable.

Before ANY commit, you MUST run:

```bash
pnpm lint && pnpm check && pnpm test
```

If any check fails:

1. Fix the issue
2. Re-run until all checks pass
3. Only then commit

**NEVER use `--no-verify` or any flag to bypass hooks.** If a check is failing, the code is not ready to commit. Period.

## Environment Variables

Secrets (set via `wrangler secret put`):

```
TELEGRAM_BOT_TOKEN        # Telegram bot API token (from @BotFather)
TELEGRAM_BOT_USERNAME     # Bot username for group mention detection
WEBHOOK_SECRET_TOKEN      # Secret token for webhook validation
ENGINE_API_KEY            # API key for worker
GATEWAY_PUBLIC_URL        # (optional) For progress callbacks
```

Variables (in wrangler.toml):

```
ENGINE_BASE_URL           # URL to BT Servant Worker
ENGINE_ORG                # Organization for user scoping
ENGINE_TIMEOUT_MS         # Engine request timeout (default: 45000)
TELEGRAM_TIMEOUT_MS       # Telegram API timeout (default: 15000)
PROGRESS_THROTTLE_SECONDS # Progress callback throttle (default: 3)
MESSAGE_AGE_CUTOFF_IN_SECONDS # Max message age (default: 3600)
FORWARD_ALL_GROUP_MESSAGES # Forward all group messages to worker (default: false)
LOG_LEVEL                 # Logging level (default: INFO)
```

## Code Review

Code reviews are handled by **Codex**, initiated by the user. Do not proactively run code reviews. Wait for the user to initiate the Codex review. After Codex review passes clean, the PR can be merged.

## Deployment

All deployments go through CI/CD (GitHub Actions):

- **Staging**: Automatically deploys after CI passes on `main`
- **Production**: Manual trigger via `workflow_dispatch`

**NEVER run `wrangler deploy` directly.** Always go through CI/CD.

## Key Files

- `src/index.ts` - Hono app with all routes
- `src/config/types.ts` - Env interface
- `src/core/models.ts` - Telegram update parsing, bot addressing logic, message validation
- `src/telegram/client.ts` - Telegram API wrapper (text, voice, file download)
- `src/services/engine-client.ts` - Engine API client (text + audio, with 429 retry)
- `src/services/engine-adapter.ts` - Thin facade over engine-client
- `src/services/message-handler.ts` - Message processing orchestration (text + voice dispatch)
- `src/services/encoding.ts` - Base64 encoding utility (CF Workers compatible)
- `src/services/chunking.ts` - Message chunking for Telegram's 4000 char limit
- `wrangler.toml` - Cloudflare Workers configuration
