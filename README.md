# bt-servant-telegram-gateway

Telegram gateway for `bt-servant-engine`, built with TypeScript and deployed as a Cloudflare Worker.

## Architecture

Telegram Bot API webhook -> Cloudflare Worker (Hono) -> `handleIncomingMessage()` -> Engine API -> Telegram reply.

Telegram gateway treats the engine as a final-only reply source. Intermediate progress/status events are not delivered to the user chat.

The gateway supports:

- private chats
- groups and supergroups
- topics (message threads)
- `/start`, `/help`, and `/reset` slash commands
- Markdown-like formatting rendered as Telegram HTML

In groups and supergroups, the bot responds when you:

- mention the bot by username, for example `@bt24_test_bot ...`
- reply to one of the bot's messages
- use supported slash commands

If the bot is used in a topic thread, replies stay in the same topic by reusing Telegram's `message_thread_id`.

## Requirements

- Node.js 20+
- pnpm 9+
- Cloudflare account
- Telegram bot token (from @BotFather)
- bt-servant-engine endpoint and API key

## Environment variables

Secrets (set via `wrangler secret put`):

- `TELEGRAM_BOT_TOKEN` - Telegram bot API token
- `ENGINE_API_KEY` - API key for bt-servant-worker
- `WEBHOOK_SECRET_TOKEN` - (optional) Secret token for webhook validation
- `TELEGRAM_BOT_USERNAME` - (optional) Bot username for group mention detection
- `GATEWAY_PUBLIC_URL` - (optional) Public URL for progress callbacks

Variables (in `wrangler.toml`):

- `ENGINE_BASE_URL` - URL to BT Servant Worker
- `ENGINE_ORG` - Organization for user scoping
- `ENGINE_TIMEOUT_MS` - Engine request timeout (default: 45000)
- `TELEGRAM_TIMEOUT_MS` - Telegram API timeout (default: 15000)
- `PROGRESS_THROTTLE_SECONDS` - Progress callback throttle (default: 3)
- `MESSAGE_AGE_CUTOFF_IN_SECONDS` - Max message age (default: 3600)
- `LOG_LEVEL` - Logging level (default: INFO)

Use [`.dev.vars.example`](.dev.vars.example) as the local secrets template.

## Local development

1. Install dependencies:

```bash
pnpm install
```

2. Copy `.dev.vars.example` to `.dev.vars` and fill in the values.

3. Start the local dev server:

```bash
pnpm dev
```

4. Run checks:

```bash
pnpm check    # TypeScript type checking
pnpm lint     # ESLint
pnpm test     # Unit tests
```

## Webhook setup

Register the webhook with Telegram, pointing to your Cloudflare Worker:

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://bt-servant-telegram-gateway.<your-subdomain>.workers.dev/telegram-webhook",
    "secret_token": "'"${WEBHOOK_SECRET_TOKEN}"'"
  }'
```

If `WEBHOOK_SECRET_TOKEN` is not used, omit the `secret_token` field.

To enable group mentions, set `TELEGRAM_BOT_USERNAME` via `wrangler secret put` to the bot username without the leading `@`.

## Deployment

All deployments go through GitHub Actions CI/CD:

- **Staging**: Automatically deploys after CI passes on `main`
- **Production**: Manual trigger via GitHub Actions `workflow_dispatch`

CI runs lint, typecheck, and tests on every push/PR to `main`.

### Prerequisites

Set these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Set Cloudflare Worker secrets:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put ENGINE_API_KEY
wrangler secret put WEBHOOK_SECRET_TOKEN
wrangler secret put TELEGRAM_BOT_USERNAME
```

## Engine contract

The gateway expects the engine to support:

- `POST /api/v1/chat` with `client_id: "telegram-gateway"`, `message_type: "text"`, and chat context metadata
- `DELETE /api/v1/orgs/:org/users/:userId/history` for private resets
- `DELETE /api/v1/admin/orgs/:org/groups/:chatId/history` for group resets
- `DELETE /api/v1/admin/orgs/:org/groups/:chatId/threads/:threadId/history` for thread resets

The engine response text is extracted from multiple possible fields: `responses`, `response`, `message`, `text`, `reply`, `output`, `result`.
