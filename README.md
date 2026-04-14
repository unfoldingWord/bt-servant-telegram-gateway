# bt-servant-telegram-gateway

Telegram gateway for `bt-servant-engine`, built with TypeScript and deployed as Netlify Functions.

## Architecture

Telegram Bot API webhook -> Netlify Function -> `handleIncomingMessage()` -> Engine API -> Telegram reply.

Telegram gateway treats the engine as a final-only reply source. Intermediate progress/status events are not delivered to the user chat.

The gateway supports:

- private chats
- groups and supergroups
- `/reset` for clearing conversation history
- Markdown-like formatting rendered as Telegram HTML

In groups and supergroups, the bot responds when you:

- mention the bot by username, for example `@bt24_test_bot ...`
- reply to one of the bot's messages
- use supported slash commands such as `/help`, `/start`, and `/reset`

If the bot is used in a topic thread, replies stay in the same topic by reusing Telegram's `message_thread_id`.

### End-to-end flow

1. Telegram sends an update to `/api/telegram-webhook`.
2. The webhook validates `WEBHOOK_SECRET_TOKEN` when it is configured.
3. The webhook parses the update and passes text messages to `handleIncomingMessage()`.
4. `handleIncomingMessage()` sends a `typing` action, calls `engine-client`, and waits for the engine response.
5. `engine-client` calls `/api/v1/chat` with `client_id: "telegram-gateway"`, `Authorization: Bearer ENGINE_API_KEY`, optional `org`, and chat context metadata.
6. Long engine replies are split into chunks of up to 4000 characters before they are sent back to Telegram.
7. Unsupported message types are ignored or returned as unsupported; they never reach the engine flow.
8. `/reset` is translated into the appropriate engine history reset endpoint for private chats, groups, and supergroups.

## Requirements

- Node.js 20+
- `yarn`
- Netlify account
- Telegram bot token
- bt-servant-engine endpoint and API key

## Environment variables

Required:

- `TELEGRAM_BOT_TOKEN`
- `ENGINE_BASE_URL`
- `ENGINE_API_KEY`

Optional:

- `WEBHOOK_SECRET_TOKEN`
- `ENGINE_ORG`
- `ENGINE_TIMEOUT_MS`
- `TELEGRAM_TIMEOUT_MS`
- `GATEWAY_PUBLIC_URL`
- `PROGRESS_THROTTLE_SECONDS`
- `MESSAGE_AGE_CUTOFF_IN_SECONDS`
- `LOG_LEVEL`

Use [`.env.example`](/home/user/ADV/SD/GC/bt-servant-telegram-gateway/.env.example) as the local template.

## Group and supergroup support

Telegram updates include chat context metadata and are forwarded to the engine:

- `chat_type`
- `chat_id`
- `speaker`
- `thread_id` for supergroup topics
- `response_language_hint` from the sender's Telegram language code

Routing rules:

- `private` chats map to a per-user conversation
- `group` chats map to a per-chat conversation
- `supergroup` chats map to a per-chat or per-thread conversation when a topic is present

`/reset` clears the current conversation context using the matching engine admin endpoint.

The engine now owns chat-level history and preferences. The gateway remains stateless.

## Local development

1. Copy `.env.example` to `.env` and fill in the values.
2. Use Node 20:

```bash
source ~/.nvm/nvm.sh
nvm use 20
```

3. Install dependencies:

```bash
yarn install
```

4. Start Netlify locally:

```bash
yarn dev
```

5. Run checks:

```bash
yarn test
yarn build
yarn lint
```

## Webhook setup

The gateway expects Telegram updates at the Netlify function endpoint exposed under `/api/*`.

For Telegram webhook registration, point Telegram to:

`https://<your-site>.netlify.app/api/telegram-webhook`

If `WEBHOOK_SECRET_TOKEN` is set, Telegram requests must include the matching `X-Telegram-Bot-Api-Secret-Token` header.

To enable group mentions, set `TELEGRAM_BOT_USERNAME` in `.env` to the bot username without the leading `@`.

To recover or rotate the webhook:

1. Update the Telegram webhook URL with the new Netlify site URL, if needed.
2. Keep the secret token unchanged unless you rotate it deliberately.
3. Re-run webhook registration after deploy.

## Deployment

1. Push changes to the connected git branch.
2. Netlify runs `yarn build`.
3. Netlify deploys functions from `netlify/functions`.

The project is configured with:

- `command = "npm run build"`
- `functions = "netlify/functions"`
- `node_bundler = "esbuild"`

### Netlify env vars

Set these values in the Netlify dashboard or via CLI before production rollout:

- `TELEGRAM_BOT_TOKEN`
- `ENGINE_BASE_URL`
- `ENGINE_API_KEY`
- `TELEGRAM_BOT_USERNAME` for mention detection in group chats
- `WEBHOOK_SECRET_TOKEN` if webhook secret validation is enabled
- `ENGINE_ORG` if the deployment should target a specific org
- `GATEWAY_PUBLIC_URL` for live smoke tests and webhook reachability
- `PROGRESS_THROTTLE_SECONDS`
- `MESSAGE_AGE_CUTOFF_IN_SECONDS`
- `LOG_LEVEL`

For live deployment, the engine should be available at the current production backend URL and should support the group chat contract introduced in `bt-servant-engine v2.12.0`.

### Deploy and webhook checklist

1. Deploy to your staging branch or production branch in Netlify.
2. Copy the deployed public URL.
3. Register the webhook with Telegram:

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-site>.netlify.app/api/telegram-webhook",
    "secret_token": "'"${WEBHOOK_SECRET_TOKEN}"'"
  }'
```

4. If `WEBHOOK_SECRET_TOKEN` is not used, omit the `secret_token` field.
5. Verify:
   - text messages are answered
   - only the final reply is shown in Telegram
   - unsupported message types are ignored or rejected consistently
6. Inspect Netlify logs for webhook and engine errors after the first live request.

## Troubleshooting

- Netlify timeout:
  - The webhook function responds quickly and hands off the actual work to the message handler.
  - If engine calls take too long, check the engine endpoint and retry logic.
- Telegram errors:
  - Confirm `TELEGRAM_BOT_TOKEN` and webhook secret token.
  - Check Telegram API responses in the function logs.
- Engine errors:
  - Confirm `ENGINE_BASE_URL`, `ENGINE_API_KEY`, and optional `ENGINE_ORG`.
  - If requests are timing out, lower `ENGINE_TIMEOUT_MS` in the deployment environment.
  - Inspect the engine logs for `429` or auth failures.
- Progress callbacks:
  - If you re-enable callback transport in the engine, ensure `GATEWAY_PUBLIC_URL` is set correctly.
  - Make sure any callback auth matches `ENGINE_API_KEY`.

## Useful commands

```bash
yarn test
yarn build
yarn lint
yarn dev
```

## Live integration smoke

This repository also includes an opt-in live smoke test that hits a real gateway URL and real downstream services.

Set these environment variables before running it:

- `GATEWAY_PUBLIC_URL` - public base URL for the deployed or ngrok-exposed gateway
- `TELEGRAM_BOT_TOKEN` - token for the live Telegram bot
- `LIVE_E2E_CHAT_ID` - numeric Telegram chat ID that the bot can message
- `WEBHOOK_SECRET_TOKEN` - optional, included when your webhook is protected
- `ENGINE_TIMEOUT_MS` - optional timeout cap for engine requests in milliseconds
- `TELEGRAM_TIMEOUT_MS` - optional timeout cap for Telegram API requests in milliseconds

Run it with:

```bash
yarn test:integration
```

What it checks:

- the live gateway accepts a Telegram-shaped update payload
- the live gateway reaches `bt-servant-engine`
- the live gateway sends a message back through the live Telegram API

If the live env vars are missing, the smoke test is skipped automatically.

## Engine contract notes

The gateway expects the engine to support:

- `POST /api/v1/chat`
  - `client_id: "telegram-gateway"`
  - `message_type: "text"`
  - `chat_type`
  - `chat_id`
  - `speaker`
  - `thread_id`
  - `response_language_hint`
- `ENGINE_TIMEOUT_MS` to cap how long the gateway waits for engine replies
- final-only JSON replies for Telegram
- `DELETE /api/v1/orgs/:org/users/:userId/history` for private resets
- `DELETE /api/v1/admin/orgs/:org/groups/:chatId/history` for group resets
- `DELETE /api/v1/admin/orgs/:org/groups/:chatId/threads/:threadId/history` for thread resets

The engine response can be read from multiple fields. The gateway currently prefers:

- `responses`
- `response`
- `message`
- `text`
- `reply`
- `output`
- `result`

The gateway intentionally ignores intermediate progress/status chunks for Telegram and only renders the final reply text.
