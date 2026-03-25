# bt-servant-telegram-gateway

Telegram gateway for `bt-servant-engine`, built with TypeScript and deployed as Netlify Functions.

## Architecture

Telegram Bot API webhook -> Netlify Function -> `handleIncomingMessage()` -> Engine API -> Telegram reply.

Progress updates from engine are delivered through a separate Netlify Function and forwarded back to Telegram.

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
- `GATEWAY_PUBLIC_URL`
- `PROGRESS_THROTTLE_SECONDS`
- `MESSAGE_AGE_CUTOFF_IN_SECONDS`
- `LOG_LEVEL`

Use [`.env.example`](/home/user/ADV/SD/GC/bt-servant-telegram-gateway/.env.example) as the local template.

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

## Troubleshooting

- Netlify timeout:
  - The webhook function responds quickly and hands off the actual work to the message handler.
  - If engine calls take too long, check the engine endpoint and retry logic.
- Telegram errors:
  - Confirm `TELEGRAM_BOT_TOKEN` and webhook secret token.
  - Check Telegram API responses in the function logs.
- Engine errors:
  - Confirm `ENGINE_BASE_URL`, `ENGINE_API_KEY`, and optional `ENGINE_ORG`.
  - Inspect the engine logs for `429` or auth failures.
- Progress callbacks:
  - Ensure `GATEWAY_PUBLIC_URL` is set correctly.
  - Make sure the engine sends `X-Engine-Token` matching `ENGINE_API_KEY`.

## Useful commands

```bash
yarn test
yarn build
yarn lint
yarn dev
```
