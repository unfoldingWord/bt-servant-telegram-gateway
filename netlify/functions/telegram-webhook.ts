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

export const handler: Handler = (event) => {
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
    const update = JSON.parse(event.body || '{}') as Parameters<typeof parseTelegramUpdate>[0];
    const message = parseTelegramUpdate(update, config.messageAgeCutoffInSeconds);

    if (!message) {
      return Promise.resolve({ statusCode: 200, body: JSON.stringify({ ok: true, ignored: true }) });
    }

    void handleIncomingMessage(message, {
      progressThrottleSeconds: config.progressThrottleSeconds,
    }).catch((error) => {
      console.error('Webhook background handler failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        updateId: update.update_id,
      });
    });

    return Promise.resolve({ statusCode: 200, body: JSON.stringify({ ok: true }) });
  } catch (error) {
    console.error('Telegram webhook failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return Promise.resolve({ statusCode: 400, body: 'Bad Request' });
  }
};
