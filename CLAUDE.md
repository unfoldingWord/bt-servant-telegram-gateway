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

## CRITICAL: Branching Model (develop → main)

Two long-lived branches:

- **`develop`** is the integration branch and the default branch. Every feature branch and every PR targets `develop`. Staging deploys automatically after CI passes on a push to `develop`. Bot review plus CI is enough to merge there.
- **`main`** is the release branch. It only ever receives `develop` (a release PR, "Release vX.Y.Z: develop → main") or a `hotfix/*` branch. Only the repo owner can merge to `main` (branch protection restricts pushes and requires a code-owner review; see `.github/CODEOWNERS`). Production deploys from `main` by tag.
- **Rule: `develop` is always releasable.** Work that is not ready to ship stays on its feature branch, or merges behind a flag that is off in production. Never cherry-pick into `main`; if something on `develop` must not ship, revert it on `develop` or flag it off, then release.
- **Hotfix:** branch from `main` as `hotfix/<name>`, PR into `main`, then open a PR from `main` into `develop` the same day so `develop` stays ahead of `main`.
- **Release:** merge the release PR, tag `v<version>` on the resulting `main` commit, dispatch the production deploy on that tag.
- **Merge methods:** feature PRs into `develop` are **squash**-merged (`develop` requires linear history). Release and hotfix PRs into `main` use a **merge commit**, never squash or rebase; a ruleset on `main` allows only merge commits. A squash would copy `develop`'s work into a new commit that `develop` never contains, so the branches would diverge and every later release PR would re-list already-shipped commits. With merge commits, the next release PR shows only what is new, and `git log --first-parent main` lists one commit per release. Never delete `develop` when merging a release PR.
- **Up to date before merge:** `develop` requires a PR branch to be current with `develop` before it merges (use "Update branch"), so two PRs that pass alone cannot break together. `main` does not, because `develop` never contains `main`'s release merge commits.

CI's `Release Source` job refuses a PR into `main` from any other branch. The production deploy (`deploy.yml`) refuses to run on anything but a `v*` tag that is on `main`. `tests/unit/workflows-branching.test.ts` pins these triggers and guards.

### Ask Before Pushing

**ALWAYS ask the user before pushing changes.** Always create a feature branch and a PR against `develop`. Never push to `develop` or `main` directly.

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

- **Staging** (`deploy-staging.yml`): deploys automatically after CI succeeds on a **push to `develop`** (i.e. after a PR merges into `develop`). It checks out the exact commit CI tested. PR branches never deploy, and CI runs for a release PR (whose head is also `develop`) do not deploy either.
- **Production** (`deploy.yml`): manual `workflow_dispatch`, and only on a `v*` release tag that is on `main`. Any other ref is refused before anything deploys:

  ```bash
  gh workflow run deploy.yml --ref v<version>
  ```

**NEVER run `wrangler deploy` directly.** Always go through CI/CD.

### Version Bumping and Release Tags

Every PR bumps the version in `package.json` on its branch, before the final push:

- **Patch** (`pnpm version patch --no-git-tag-version`): bug fixes, docs, CI, minor tweaks
- **Minor** (`pnpm version minor --no-git-tag-version`): new features, behavioral changes

Use `--no-git-tag-version` on branches; feature PRs into `develop` are not tagged. After a release PR (`develop` → `main`) or hotfix is merged, tag the resulting `main` commit and push the tag, then dispatch the production deploy on it:

```bash
git checkout main && git pull
git tag v<version>
git push origin v<version>
```

Tags are created on `main` only, never on `develop`.

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
