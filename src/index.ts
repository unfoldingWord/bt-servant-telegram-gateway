import { Hono } from 'hono';
import type { Env } from './config/types.js';
import { parseEnvNumber } from './config/types.js';
import { parseTelegramUpdate } from './core/models.js';
import { handleIncomingMessage } from './services/message-handler.js';
import { parseCallbackPayload } from './services/callback-payload.js';
import { CompletedKeysMap } from './services/dedup.js';
import {
  dispatchEngineResponse,
  sendTextMessage as sendTelegramTextMessage,
} from './services/response-dispatch.js';
import { EngineGateway } from './services/engine-adapter.js';
import { TelegramClient } from './telegram/client.js';
import { EngineClient } from './services/engine-client.js';

const app = new Hono<{ Bindings: Env }>();

const completedKeys = new CompletedKeysMap({ ttlMs: 3_600_000, sweepIntervalMs: 60_000 });

const DEFAULT_FALLBACK_MESSAGE = 'Sorry, something went wrong. Please try again.';

function buildProgressCallbackUrl(publicUrl: string | undefined): string | undefined {
  if (!publicUrl) return undefined;
  return `${publicUrl.replace(/\/$/u, '')}/progress-callback`;
}

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

    await handleIncomingMessage(message, {
      telegramClient,
      engineClient,
      forwardAllGroupMessages: env.FORWARD_ALL_GROUP_MESSAGES === 'true',
      progressCallbackUrl: buildProgressCallbackUrl(env.GATEWAY_PUBLIC_URL),
    }).catch((error) => {
      console.error('Webhook handler failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

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

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.text('Bad Request', 400);
  }

  const payload = parseCallbackPayload(body);
  if (!payload) {
    console.error('Progress callback rejected: unrecognized payload', {
      bodyKeys:
        body && typeof body === 'object' ? Object.keys(body as Record<string, unknown>) : null,
    });
    return c.text('Bad Request', 400);
  }

  console.info('Progress callback received', {
    type: payload.type,
    userId: payload.user_id,
    messageKey: payload.message_key,
    ...('chat_id' in payload ? { chatId: payload.chat_id } : {}),
    ...('thread_id' in payload ? { threadId: payload.thread_id } : {}),
  });

  const telegramClient = new TelegramClient(
    env.TELEGRAM_BOT_TOKEN,
    parseEnvNumber(env.TELEGRAM_TIMEOUT_MS, 15000)
  );

  if (payload.type === 'status') {
    return c.json({ ok: true, message_key: payload.message_key });
  }

  if (payload.type === 'error') {
    const chatId = payload.chat_id;
    if (!chatId) {
      console.error('Progress callback error event missing chat_id', {
        messageKey: payload.message_key,
        userId: payload.user_id,
      });
      return c.json({ ok: true, message_key: payload.message_key });
    }
    console.error('Engine reported error', {
      messageKey: payload.message_key,
      userId: payload.user_id,
      error: payload.error,
    });
    await sendTelegramTextMessage(
      telegramClient,
      chatId,
      DEFAULT_FALLBACK_MESSAGE,
      payload.thread_id
    );
    return c.json({ ok: true, message_key: payload.message_key });
  }

  // complete
  if (completedKeys.isCompleted(payload.message_key)) {
    console.info('Duplicate complete callback ignored', {
      messageKey: payload.message_key,
      userId: payload.user_id,
    });
    return c.json({ ok: true, message_key: payload.message_key, duplicate: true });
  }

  const chatId = payload.chat_id;
  if (!chatId) {
    console.error('Progress callback complete event missing chat_id', {
      messageKey: payload.message_key,
      userId: payload.user_id,
    });
    return c.text('Bad Request', 400);
  }

  const engineClient = new EngineClient(
    env.ENGINE_BASE_URL,
    env.ENGINE_API_KEY,
    env.ENGINE_ORG,
    parseEnvNumber(env.ENGINE_TIMEOUT_MS, 45000)
  );
  const engineGateway = new EngineGateway(engineClient);

  const expectedText = typeof payload.text === 'string' && payload.text.trim().length > 0;
  const expectedVoice = !!payload.voice_audio_url;
  const expectedAttachments = Array.isArray(payload.attachments) ? payload.attachments.length : 0;
  const expectedSomething = expectedText || expectedVoice || expectedAttachments > 0;

  let dispatch;
  try {
    dispatch = await dispatchEngineResponse({
      chatId,
      threadId: payload.thread_id,
      text: payload.text,
      voiceAudioUrl: payload.voice_audio_url,
      attachments: payload.attachments,
      telegramClient,
      engineGateway,
      logContext: { userId: payload.user_id, messageKey: payload.message_key },
    });
  } catch (error) {
    console.error('Progress callback dispatch failed', {
      messageKey: payload.message_key,
      userId: payload.user_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.text('Failed to deliver response', 502);
  }

  const deliveredAnything =
    dispatch.sentChunks > 0 || dispatch.voiceSent || dispatch.attachmentsSent > 0;

  if (expectedSomething && !deliveredAnything) {
    console.error('Progress callback delivered no messages despite non-empty payload', {
      messageKey: payload.message_key,
      userId: payload.user_id,
      expectedText,
      expectedVoice,
      expectedAttachments,
      dispatch,
    });
    return c.text('Failed to deliver response', 502);
  }

  completedKeys.markCompleted(payload.message_key);
  return c.json({ ok: true, message_key: payload.message_key });
});

export default app;
