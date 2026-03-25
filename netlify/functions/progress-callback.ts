import type { Handler } from '@netlify/functions';

import { config } from '../../src/config/index.js';
import { TelegramClient } from '../../src/telegram/client.js';
import { parseProgressMessage } from '../../src/services/progress-message.js';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const engineToken = event.headers['x-engine-token'] || event.headers['X-Engine-Token'];
  if (engineToken !== config.engineApiKey) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const payload = parseProgressMessage(JSON.parse(event.body || '{}'));
    if (!payload) {
      return { statusCode: 400, body: 'Bad Request' };
    }

    const telegramClient = new TelegramClient();
    const sent = await telegramClient.sendTextMessage(payload.chat_id, payload.text);
    if (!sent) {
      return { statusCode: 502, body: 'Failed to deliver progress update' };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, message_key: payload.message_key }) };
  } catch (error) {
    console.error('Progress callback failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { statusCode: 400, body: 'Bad Request' };
  }
};
