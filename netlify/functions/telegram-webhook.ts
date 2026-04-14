import type { Handler } from '@netlify/functions';

import { config } from '../../src/config/index.js';
import { parseTelegramUpdate } from '../../src/core/models.js';
import { handleIncomingMessage } from '../../src/services/message-handler.js';

function hasValidSecretToken(headers: Record<string, string | undefined>): boolean {
  if (!config.webhookSecretToken) {
    return true;
  }

  return headers['x-telegram-bot-api-secret-token'] === config.webhookSecretToken;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return Promise.resolve({ statusCode: 405, body: 'Method Not Allowed' });
  }

  const headers = Object.fromEntries(
    Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value])
  ) as Record<string, string | undefined>;

  if (!hasValidSecretToken(headers)) {
    return Promise.resolve({ statusCode: 401, body: 'Unauthorized' });
  }

  try {
    const body = event.body || '';
    console.info('Telegram webhook request received', {
      method: event.httpMethod,
      bodyLength: body.length,
      hasSecretHeader: Boolean(headers['x-telegram-bot-api-secret-token']),
    });

    const update = JSON.parse(event.body || '{}') as Parameters<typeof parseTelegramUpdate>[0];
    console.info('Telegram webhook update received', {
      updateId: update.update_id,
      updateType: summarizeUpdateType(update),
      messageType: update.message?.chat.type,
      chatId: update.message?.chat.id,
      hasText: Boolean(update.message?.text),
      hasEntities: Boolean(update.message?.entities?.length),
    });

    const message = parseTelegramUpdate(
      update,
      config.messageAgeCutoffInSeconds,
      config.telegramBotUsername
    );

    if (!message) {
      return Promise.resolve({ statusCode: 200, body: JSON.stringify({ ok: true, ignored: true }) });
    }

    const startedAt = Date.now();
    const result = await handleIncomingMessage(message, {
      progressThrottleSeconds: config.progressThrottleSeconds,
    }).catch((error) => {
      console.error('Webhook background handler failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        updateId: update.update_id,
      });
      return null;
    });

    console.info('Telegram webhook handled', {
      updateId: update.update_id,
      handled: result?.handled ?? false,
      reason: result?.reason,
      sentChunks: result?.sentChunks ?? 0,
      durationMs: Date.now() - startedAt,
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('Telegram webhook failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return Promise.resolve({ statusCode: 400, body: 'Bad Request' });
  }
};

function summarizeUpdateType(update: Parameters<typeof parseTelegramUpdate>[0]): string {
  const knownTypes = [
    'message',
    'edited_message',
    'channel_post',
    'edited_channel_post',
    'inline_query',
    'chosen_inline_result',
    'callback_query',
    'shipping_query',
    'pre_checkout_query',
    'poll',
    'poll_answer',
    'my_chat_member',
    'chat_member',
    'chat_join_request',
  ] as const;

  const activeTypes = knownTypes.filter((type) => Object.prototype.hasOwnProperty.call(update, type));
  return activeTypes.length > 0 ? activeTypes.join(',') : 'unknown';
}
