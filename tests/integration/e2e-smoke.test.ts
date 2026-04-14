import http from 'node:http';
import { describe, expect, it } from 'vitest';

process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
process.env.ENGINE_BASE_URL = 'http://127.0.0.1:0';
process.env.ENGINE_API_KEY = 'engine-key';
process.env.GATEWAY_PUBLIC_URL = 'https://gateway.example.com';

import { MessageType } from '../../src/core/models.js';
import { EngineClient } from '../../src/services/engine-client.js';
import { handleIncomingMessage } from '../../src/services/message-handler.js';
import { TelegramClient } from '../../src/telegram/client.js';

describe('gateway integration smoke', () => {
  it('routes a message through engine and telegram over real HTTP clients', async () => {
    const telegramRequests: Array<{ path: string; body: string }> = [];
    const engineRequests: Array<{ path: string; body: string }> = [];

    const telegramServer = await createServer((req, body) => {
      telegramRequests.push({ path: req.url ?? '', body });
      return JSON.stringify({ ok: true, result: { message_id: 1 } });
    });

    const engineServer = await createServer((req, body) => {
      engineRequests.push({ path: req.url ?? '', body });
      return JSON.stringify({
        responses: ['Hello **world**', '1. First choice\n2. Second choice'],
        message_key: 'server-key',
      });
    });

    const telegramClient = new TelegramClient('bot-token', telegramServer.baseUrl);
    const engineClient = new EngineClient(engineServer.baseUrl, 'engine-key', 'org-1');

    try {
      const result = await handleIncomingMessage(
        {
          user_id: 'user-1',
          chat_id: 'chat-1',
          chat_type: 'group',
          message_id: '42',
          message_type: MessageType.TEXT,
          timestamp: Math.floor(Date.now() / 1000),
          text: 'hello',
          file_id: null,
          message_age_cutoff: 3600,
          speaker: 'Alice',
          speaker_language_code: 'en',
          thread_id: 'thread-1',
        },
        {
          telegramClient,
          engineClient,
          progressThrottleSeconds: 3,
        }
      );

      expect(result).toEqual({ handled: true, sentChunks: 1 });
      expect(engineRequests).toHaveLength(1);
      expect(engineRequests[0]?.path).toBe('/api/v1/chat');
      expect(JSON.parse(engineRequests[0]?.body ?? '{}')).toMatchObject({
        client_id: 'telegram-gateway',
        user_id: 'user-1',
        message_type: 'text',
        message: 'hello',
        chat_type: 'group',
        chat_id: 'chat-1',
        speaker: 'Alice',
        thread_id: 'thread-1',
        response_language_hint: 'en',
        org: 'org-1',
      });

      expect(telegramRequests).toHaveLength(2);
      expect(telegramRequests[0]?.path).toBe('/sendChatAction');
      expect(telegramRequests[1]?.path).toBe('/sendMessage');
      const sendMessageBody = JSON.parse(telegramRequests[1]?.body ?? '{}') as {
        chat_id?: string;
        text?: string;
        parse_mode?: string;
      };

      expect(sendMessageBody).toMatchObject({
        chat_id: 'chat-1',
        parse_mode: 'HTML',
      });
      expect(sendMessageBody.text).toContain('Hello <b>world</b>');
      expect(sendMessageBody.text).toContain('First choice');
    } finally {
      await telegramServer.close();
      await engineServer.close();
    }
  });
});

async function createServer(
  responder: (req: http.IncomingMessage, body: string) => string
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const payload = responder(req, body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start test server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
