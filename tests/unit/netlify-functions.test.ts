import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
process.env.ENGINE_BASE_URL = 'https://engine.example.com';
process.env.ENGINE_API_KEY = 'engine-key';
process.env.GATEWAY_PUBLIC_URL = 'https://gateway.example.com';
process.env.WEBHOOK_SECRET_TOKEN = 'webhook-secret';

const handleIncomingMessage = vi.fn();
const sendTextMessage = vi.fn();

vi.mock('../../src/services/message-handler.js', () => ({
  handleIncomingMessage,
}));

vi.mock('../../src/telegram/client.js', () => ({
  TelegramClient: vi.fn().mockImplementation(() => ({
    sendTextMessage,
  })),
}));

describe('netlify functions', () => {
  afterEach(() => {
    handleIncomingMessage.mockReset();
    sendTextMessage.mockReset();
    vi.resetModules();
  });

  it('accepts telegram webhook posts and calls message handler', async () => {
    handleIncomingMessage.mockResolvedValue({ handled: true });

    const { handler } = await import('../../netlify/functions/telegram-webhook.js');

    const response = (await handler({
      httpMethod: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'webhook-secret',
      },
      body: JSON.stringify({
        update_id: 1,
        message: {
          message_id: 42,
          from: { id: 1001, is_bot: false, first_name: 'Alex' },
          chat: { id: 2002, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: 'hello',
        },
      }),
    } as never, {} as never)) as { statusCode: number };

    expect(response.statusCode).toBe(200);
    expect(handleIncomingMessage).toHaveBeenCalled();
  });

  it('rejects telegram webhook with wrong secret', async () => {
    const { handler } = await import('../../netlify/functions/telegram-webhook.js');

    const response = (await handler({
      httpMethod: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'wrong',
      },
      body: '{}',
    } as never, {} as never)) as { statusCode: number };

    expect(response.statusCode).toBe(401);
  });

  it('skips intermediate progress callbacks', async () => {
    sendTextMessage.mockResolvedValue(true);

    const { handler } = await import('../../netlify/functions/progress-callback.js');

    const response = (await handler({
      httpMethod: 'POST',
      headers: {
        'x-engine-token': 'engine-key',
      },
      body: JSON.stringify({
        type: 'progress',
        message_key: 'telegram:abc',
        chat_id: '2002',
        text: 'progress update',
      }),
    } as never, {} as never)) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(400);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('rejects progress payloads without complete type', async () => {
    const { handler } = await import('../../netlify/functions/progress-callback.js');

    const response = (await handler({
      httpMethod: 'POST',
      headers: {
        'x-engine-token': 'engine-key',
      },
      body: JSON.stringify({
        message_key: 'telegram:abc',
        chat_id: '2002',
        text: 'progress update',
      }),
    } as never, {} as never)) as { statusCode: number };

    expect(response.statusCode).toBe(400);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('extracts complete progress callback responses', async () => {
    sendTextMessage.mockResolvedValue(true);

    const { handler } = await import('../../netlify/functions/progress-callback.js');

    const response = (await handler({
      httpMethod: 'POST',
      headers: {
        'x-engine-token': 'engine-key',
      },
      body: JSON.stringify({
        type: 'complete',
        message_key: 'telegram:abc',
        chat_id: '2002',
        response: {
          responses: ['final response'],
        },
      }),
    } as never, {} as never)) as { statusCode: number };

    expect(response.statusCode).toBe(200);
    expect(sendTextMessage).toHaveBeenCalledWith('2002', 'final response');
  });

  it('rejects health on non-get and accepts get', async () => {
    const { handler } = await import('../../netlify/functions/health.js');

    expect((await handler({ httpMethod: 'POST' } as never, {} as never)) as { statusCode: number }).toMatchObject({ statusCode: 405 });
    expect((await handler({ httpMethod: 'GET' } as never, {} as never)) as { statusCode: number }).toMatchObject({ statusCode: 200 });
  });
});
