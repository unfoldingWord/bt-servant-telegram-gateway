import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramClient } from '../../src/telegram/client.js';

describe('TelegramClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends a text message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))
    );

    const client = new TelegramClient('bot-token', 15000);

    await expect(client.sendTextMessage('123', 'hello')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '123', text: 'hello' }),
      })
    );
  });

  it('sends a text message to a topic thread when provided', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))
    );

    const client = new TelegramClient('bot-token', 15000);

    await expect(client.sendTextMessage('123', 'hello', 'HTML', '7')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: '123',
          text: 'hello',
          parse_mode: 'HTML',
          message_thread_id: 7,
        }),
      })
    );
  });

  it('sends chat actions', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true })));

    const client = new TelegramClient('bot-token', 15000);

    await expect(client.sendChatAction('123', 'typing')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendChatAction',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '123', action: 'typing' }),
      })
    );
  });

  it('sends chat actions to a topic thread when provided', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true })));

    const client = new TelegramClient('bot-token', 15000);

    await expect(client.sendChatAction('123', 'typing', '7')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendChatAction',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '123', action: 'typing', message_thread_id: 7 }),
      })
    );
  });

  it('sets webhook with secret token when provided', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { url: 'https://example.com' } }))
    );

    const client = new TelegramClient('bot-token', 15000);

    await expect(client.setWebhook('https://example.com', 'secret')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/setWebhook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com', secret_token: 'secret' }),
      })
    );
  });

  it('returns false on HTTP errors', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const client = new TelegramClient('bot-token', 15000);

    await expect(client.sendTextMessage('123', 'hello')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
