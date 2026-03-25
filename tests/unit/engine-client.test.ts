import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
process.env.ENGINE_BASE_URL = 'https://engine.example.com';
process.env.ENGINE_API_KEY = 'engine-key';
process.env.GATEWAY_PUBLIC_URL = 'https://gateway.example.com';

const post = vi.fn();
const get = vi.fn();
const put = vi.fn();
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

describe('EngineClient', () => {
  afterEach(() => {
    post.mockReset();
    get.mockReset();
    put.mockReset();
    create.mockReset();
    vi.resetModules();
  });

  it('sends chat requests with engine metadata', async () => {
    create.mockReturnValue({ post, get, put });
    post.mockResolvedValue({ data: { response: 'ok', message_key: 'server-key' } });

    const { EngineClient } = await import('../../src/services/engine-client.js');
    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1');

    const result = await client.sendTextMessage('user-1', 'hello', 'https://gateway/progress', 7);

    expect(post).toHaveBeenCalledWith('/api/v1/chat', expect.objectContaining({
      client_id: 'telegram',
      user_id: 'user-1',
      message: 'hello',
      progress_mode: 'initially_allow',
      progress_throttle_seconds: 7,
      org: 'org-1',
      progress_callback_url: 'https://gateway/progress',
    }));
    expect(result.message).toBe('ok');
    expect(result.message_key).toBe('server-key');
  });

  it('returns empty preferences for missing user prefs', async () => {
    create.mockReturnValue({ post, get, put });
    get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });

    const { EngineClient } = await import('../../src/services/engine-client.js');
    const client = new EngineClient('https://engine.example.com', 'engine-key');

    await expect(client.getUserPreferences('user-1')).resolves.toEqual({});
  });

  it('maps preferences response payloads', async () => {
    create.mockReturnValue({ post, get, put });
    get.mockResolvedValue({ data: { prefs: { language: 'en' } } });
    put.mockResolvedValue({ data: { preferences: { timezone: 'UTC' } } });

    const { EngineClient } = await import('../../src/services/engine-client.js');
    const client = new EngineClient('https://engine.example.com', 'engine-key');

    await expect(client.getUserPreferences('user-1')).resolves.toEqual({ language: 'en' });
    await expect(client.updateUserPreferences('user-1', { timezone: 'UTC' })).resolves.toEqual({ timezone: 'UTC' });
  });

  it('retries on concurrent request rejection using retry_after_ms', async () => {
    create.mockReturnValue({ post, get, put });
    post
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 429,
          data: { retry_after_ms: 1 },
          headers: {},
        },
      })
      .mockResolvedValueOnce({ data: { response: 'ok' } });

    const { EngineClient } = await import('../../src/services/engine-client.js');
    const client = new EngineClient('https://engine.example.com', 'engine-key');

    await expect(client.sendTextMessage('user-1', 'hello')).resolves.toMatchObject({ message: 'ok' });
    expect(post).toHaveBeenCalledTimes(2);
  });
});
