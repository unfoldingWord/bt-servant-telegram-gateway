# bt-servant-telegram-gateway

Telegram gateway for `bt-servant-worker`, built with TypeScript and deployed as a Cloudflare Worker.

## Architecture

The gateway uses the engine's async callback transport:

1. Telegram Bot API webhook -> `POST /telegram-webhook` on the Cloudflare Worker (Hono)
2. `handleIncomingMessage()` sends the message to the engine via `POST /api/v1/chat/callback` with a generated `message_key` and a `progress_callback_url` pointing back at the gateway (engine replies `202 Accepted`)
3. The engine POSTs `status`/`progress`/`complete`/`error` events to `POST /progress-callback` on the gateway
4. The gateway delivers each event to Telegram (text chunks, voice audio, attachments)

The gateway runs in `progress_mode: "iteration"`, so users see intermediate progress replies in the chat while the engine works, followed by the final reply. `complete` events are deduplicated by `message_key` (in-memory, 1 hour TTL) so engine retries do not double-post.

The gateway supports:

- private chats
- groups and supergroups
- topics (message threads)
- text messages and voice/audio messages (downloaded from Telegram, forwarded to the engine as base64 audio)
- voice replies: engine TTS audio (`voice_audio_url`) and audio attachments are delivered via Telegram `sendVoice`
- `/start`, `/help`, `/reset`, and `/mode` slash commands handled locally
- Markdown-like formatting rendered as Telegram HTML, with long replies chunked at 4000 characters
- typing / upload-voice chat actions while a request is in flight

In groups and supergroups, the bot treats a message as addressed to it when you:

- mention the bot by username, for example `@bt24_test_bot ...`
- reply to one of the bot's messages (matched against `TELEGRAM_BOT_USERNAME` when set; captionless voice replies count too)
- use supported slash commands

By default, group messages that are not addressed to the bot are ignored. When `FORWARD_ALL_GROUP_MESSAGES=true` (the current production and staging setting), _all_ group messages are forwarded to the engine with `addressed_to_bot: false` so the engine has full conversation awareness (ambient messages are archived without triggering a reply).

If the bot is used in a topic thread, replies stay in the same topic by reusing Telegram's `message_thread_id`.

## Gateway HTTP endpoints

| Route                | Method | Purpose                                                                     |
| -------------------- | ------ | --------------------------------------------------------------------------- |
| `/`                  | GET    | Service banner (`{ service, status }`)                                      |
| `/health`            | GET    | Health check                                                                |
| `/telegram-webhook`  | POST   | Telegram Bot API webhook; validated via `x-telegram-bot-api-secret-token`   |
| `/progress-callback` | POST   | Engine callback receiver; validated via `x-engine-token` = `ENGINE_API_KEY` |

## Requirements

- Node.js 20+
- pnpm 9+
- Cloudflare account
- Telegram bot token (from @BotFather)
- bt-servant-worker endpoint and API key

## Environment variables

Secrets (set via `wrangler secret put`):

- `TELEGRAM_BOT_TOKEN` - Telegram bot API token
- `ENGINE_API_KEY` - API key for bt-servant-worker (also used to authenticate incoming `/progress-callback` requests)
- `WEBHOOK_SECRET_TOKEN` - (optional) Secret token for webhook validation
- `TELEGRAM_BOT_USERNAME` - (optional) Bot username for group mention / reply detection

Variables (in `wrangler.toml`):

- `ENGINE_BASE_URL` - URL to BT Servant Worker
- `ENGINE_ORG` - Organization for user scoping
- `GATEWAY_PUBLIC_URL` - Public URL of this gateway; required for the callback transport (`<url>/progress-callback` is sent to the engine). Without it, chat messages fail with a fallback error.
- `FORWARD_ALL_GROUP_MESSAGES` - Forward non-addressed group messages to the engine as ambient context (default: false)
- `ENGINE_TIMEOUT_MS` - Engine request timeout (default: 45000)
- `TELEGRAM_TIMEOUT_MS` - Telegram API timeout (default: 15000)
- `PROGRESS_THROTTLE_SECONDS` - Progress throttle passed to the engine (default: 3)
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
pnpm check              # TypeScript type checking
pnpm lint               # ESLint
pnpm test               # Unit tests
pnpm test:integration   # Integration tests (live tests skip unless LIVE_E2E_CHAT_ID etc. are set)
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

## Slash commands

The gateway handles these slash commands locally (no LLM round-trip):

| Command         | Behavior                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| `/start`        | Sends a short welcome message.                                                 |
| `/help`         | Lists what the bot can do.                                                     |
| `/reset`        | Clears the current conversation history (per chat, or per thread in a topic).  |
| `/mode <name>`  | Switches the active mode for this chat. Pre-validated against published modes. |
| `/mode`         | Lists available (published) modes.                                             |
| `/mode default` | Clears the persisted mode for this chat.                                       |

`/mode` is scoped per user in private chats and per group in group/supergroup chats.

All commands accept the `@botname` suffix used in group chats (e.g. `/mode@bt_servant_qa_bot spoken-mode`).

Register the command list with Telegram once after deploy so they autocomplete in clients:

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command": "start", "description": "Welcome message"},
      {"command": "help", "description": "List capabilities"},
      {"command": "reset", "description": "Reset the current conversation"},
      {"command": "mode", "description": "Switch modes (no arg lists; default clears)"}
    ]
  }'
```

Re-run this curl whenever the command list changes.

## Deployment

All deployments go through GitHub Actions CI/CD:

- **Staging**: Automatically deploys after CI passes on `main` (`--env staging`)
- **Production**: Manual trigger via GitHub Actions `workflow_dispatch`

CI runs format check, lint, typecheck, and unit tests on every push/PR to `main`.

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

The gateway expects the engine (bt-servant-worker) to support:

- `POST /api/v1/chat/callback` — async chat transport. The gateway sends `client_id: "telegram-gateway"`, `user_id`, `message_key`, `progress_callback_url`, `progress_mode: "iteration"`, `progress_throttle_seconds`, and either `message_type: "text"` with `message` or `message_type: "audio"` with `audio_base64`/`audio_format` (voice caption forwarded as `message`). Chat context metadata is included: `chat_type`, `chat_id`, `speaker`, `thread_id`, `response_language_hint`, `addressed_to_bot`, and `org`. The engine must reply `202 Accepted` and deliver events to the callback URL.
- Callback events POSTed to `<GATEWAY_PUBLIC_URL>/progress-callback` with an `X-Engine-Token` header equal to `ENGINE_API_KEY`. Event handling: `status` is acknowledged but not shown to users; `progress` text is sent to the chat as an intermediate reply; `complete` delivers final text, `voice_audio_url` TTS audio, and audio `attachments`; `error` sends a fallback message to the chat.
- `GET /api/v1/audio/...` (or any engine-origin URL from `voice_audio_url`/attachments) for downloading response audio. The gateway only fetches audio from the configured engine origin, using the API key as a bearer token.
- `DELETE /api/v1/orgs/:org/users/:userId/history` for private resets
- `DELETE /api/v1/admin/orgs/:org/groups/:chatId/history` for group resets
- `DELETE /api/v1/admin/orgs/:org/groups/:chatId/threads/:threadId/history` for thread resets
- `GET /api/v1/admin/orgs/:org/modes` for listing modes (`/mode` command)
- `PUT`/`DELETE /api/v1/admin/orgs/:org/users/:userId/mode` and `.../groups/:chatId/mode` for setting/clearing modes
