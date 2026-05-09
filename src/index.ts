import { Hono } from 'hono';
import type { Env } from './config/types.js';
import { parseEnvNumber } from './config/types.js';
import { parseTelegramUpdate } from './core/models.js';
import { handleIncomingMessage } from './services/message-handler.js';
import { parseProgressMessage } from './services/progress-message.js';
import { TelegramClient } from './telegram/client.js';
import { EngineClient } from './services/engine-client.js';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return c.json({ service: 'bt-servant-telegram-gateway', status: 'running' });
});

app.get('/health', (c) => {
  return c.json({ ok: true, service: 'bt-servant-telegram-gateway' });
});

app.post('/telegram-webhook', async (c) => {
  const env = c.env;

  if (env.WEBHOOK_SECRET_TOKEN) {
    const header = c.req.header('x-telegram-bot-api-secret-token');
    if (header !== env.WEBHOOK_SECRET_TOKEN) {
      return c.text('Unauthorized', 401);
    }
  }

  try {
    const update = await c.req.json();

    const messageAgeCutoff = parseEnvNumber(env.MESSAGE_AGE_CUTOFF_IN_SECONDS, 3600);
    const message = parseTelegramUpdate(update, messageAgeCutoff, env.TELEGRAM_BOT_USERNAME);

    if (!message) {
      return c.json({ ok: true, ignored: true });
    }

    const telegramClient = new TelegramClient(
      env.TELEGRAM_BOT_TOKEN,
      parseEnvNumber(env.TELEGRAM_TIMEOUT_MS, 15000)
    );
    const engineClient = new EngineClient(
      env.ENGINE_BASE_URL,
      env.ENGINE_API_KEY,
      env.ENGINE_ORG,
      parseEnvNumber(env.ENGINE_TIMEOUT_MS, 45000)
    );

    const work = handleIncomingMessage(message, {
      telegramClient,
      engineClient,
      forwardAllGroupMessages: env.FORWARD_ALL_GROUP_MESSAGES === 'true',
    }).catch((error) => {
      console.error('Webhook background handler failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(work);
    } else {
      await work;
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.text('Bad Request', 400);
  }
});

app.post('/progress-callback', async (c) => {
  const env = c.env;

  const engineToken = c.req.header('x-engine-token');
  if (engineToken !== env.ENGINE_API_KEY) {
    return c.text('Unauthorized', 401);
  }

  try {
    const body = await c.req.json();
    const payload = parseProgressMessage(body);
    if (!payload) {
      return c.text('Bad Request', 400);
    }

    const telegramClient = new TelegramClient(
      env.TELEGRAM_BOT_TOKEN,
      parseEnvNumber(env.TELEGRAM_TIMEOUT_MS, 15000)
    );
    const sent = await telegramClient.sendTextMessage(payload.chat_id, payload.text);
    if (!sent) {
      return c.text('Failed to deliver progress update', 502);
    }

    return c.json({ ok: true, message_key: payload.message_key });
  } catch (error) {
    console.error('Progress callback failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.text('Bad Request', 400);
  }
});

export default app;
