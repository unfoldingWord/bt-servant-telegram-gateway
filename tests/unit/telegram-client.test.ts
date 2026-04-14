import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
process.env.ENGINE_BASE_URL = 'https://engine.example.com';
process.env.ENGINE_API_KEY = 'engine-key';
process.env.GATEWAY_PUBLIC_URL = 'https://gateway.example.com';

const post = vi.fn();
const create = vi.fn();

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    default: {
      create,
      isAxiosError: actual.isAxiosError,
    },
  };
});

describe('TelegramClient', () => {
  afterEach(() => {
    post.mockReset();
    create.mockReset();
    vi.resetModules();
  });

  it('sends a text message', async () => {
    create.mockReturnValue({ post });
    post.mockResolvedValue({ data: { ok: true, result: { message_id: 1 } } });

    const { TelegramClient } = await import('../../src/telegram/client.js');
    const client = new TelegramClient('bot-token');

    await expect(client.sendTextMessage('123', 'hello')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/sendMessage', {
      chat_id: '123',
      text: 'hello',
    });
  });

  it('sends a text message to a topic thread when provided', async () => {
    create.mockReturnValue({ post });
    post.mockResolvedValue({ data: { ok: true, result: { message_id: 1 } } });

    const { TelegramClient } = await import('../../src/telegram/client.js');
    const client = new TelegramClient('bot-token');

    await expect(client.sendTextMessage('123', 'hello', 'HTML', '7')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/sendMessage', {
      chat_id: '123',
      text: 'hello',
      parse_mode: 'HTML',
      message_thread_id: 7,
    });
  });

  it('sends chat actions', async () => {
    create.mockReturnValue({ post });
    post.mockResolvedValue({ data: { ok: true, result: true } });

    const { TelegramClient } = await import('../../src/telegram/client.js');
    const client = new TelegramClient('bot-token');

    await expect(client.sendChatAction('123', 'typing')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/sendChatAction', {
      chat_id: '123',
      action: 'typing',
    });
  });

  it('sends chat actions to a topic thread when provided', async () => {
    create.mockReturnValue({ post });
    post.mockResolvedValue({ data: { ok: true, result: true } });

    const { TelegramClient } = await import('../../src/telegram/client.js');
    const client = new TelegramClient('bot-token');

    await expect(client.sendChatAction('123', 'typing', '7')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/sendChatAction', {
      chat_id: '123',
      action: 'typing',
      message_thread_id: 7,
    });
  });

  it('sets webhook with secret token when provided', async () => {
    create.mockReturnValue({ post });
    post.mockResolvedValue({ data: { ok: true, result: { url: 'https://example.com' } } });

    const { TelegramClient } = await import('../../src/telegram/client.js');
    const client = new TelegramClient('bot-token');

    await expect(client.setWebhook('https://example.com', 'secret')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/setWebhook', {
      url: 'https://example.com',
      secret_token: 'secret',
    });
  });

  it('returns false on HTTP errors', async () => {
    create.mockReturnValue({ post });
    post.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { TelegramClient } = await import('../../src/telegram/client.js');
    const client = new TelegramClient('bot-token');

    await expect(client.sendTextMessage('123', 'hello')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
