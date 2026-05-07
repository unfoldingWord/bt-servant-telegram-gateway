import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleIncomingMessage = vi.fn();

vi.mock('../../src/services/message-handler.js', () => ({
  handleIncomingMessage,
}));

vi.mock('../../src/services/progress-message.js', async () => {
  const actual = await vi.importActual('../../src/services/progress-message.js');
  return actual;
});

describe('Hono routes', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    handleIncomingMessage.mockReset();
    vi.restoreAllMocks();
  });

  async function importApp() {
    vi.resetModules();
    const mod = await import('../../src/index.js');
    return mod.default;
  }

  function makeEnv() {
    return {
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
      ENGINE_API_KEY: 'test-engine-key',
      ENGINE_BASE_URL: 'http://localhost:8787',
      WEBHOOK_SECRET_TOKEN: 'webhook-secret',
      TELEGRAM_BOT_USERNAME: 'test_bot',
      TELEGRAM_TIMEOUT_MS: '15000',
      ENGINE_TIMEOUT_MS: '45000',
      MESSAGE_AGE_CUTOFF_IN_SECONDS: '3600',
      PROGRESS_THROTTLE_SECONDS: '3',
    };
  }

  it('GET / returns service info', async () => {
    const app = await importApp();
    const res = await app.request('/', undefined, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.service).toBe('bt-servant-telegram-gateway');
    expect(body.status).toBe('running');
  });

  it('GET /health returns ok', async () => {
    const app = await importApp();
    const res = await app.request('/health', undefined, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it('POST /telegram-webhook rejects wrong secret', async () => {
    const app = await importApp();
    const res = await app.request(
      '/telegram-webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong-secret',
        },
        body: '{}',
      },
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it('POST /telegram-webhook accepts valid webhook', async () => {
    handleIncomingMessage.mockResolvedValue({ handled: true });

    const app = await importApp();
    const env = makeEnv();
    const executionCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const req = new Request('http://localhost/telegram-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    });

    const res = await app.fetch(req, env, executionCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(executionCtx.waitUntil).toHaveBeenCalled();
  });

  it('POST /progress-callback rejects wrong token', async () => {
    const app = await importApp();
    const res = await app.request(
      '/progress-callback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-engine-token': 'wrong-key',
        },
        body: '{}',
      },
      makeEnv()
    );
    expect(res.status).toBe(401);
  });

  it('POST /progress-callback rejects invalid payload', async () => {
    const app = await importApp();
    const res = await app.request(
      '/progress-callback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-engine-token': 'test-engine-key',
        },
        body: JSON.stringify({ type: 'progress', message_key: 'k', chat_id: '1', text: 'hi' }),
      },
      makeEnv()
    );
    expect(res.status).toBe(400);
  });

  it('POST /progress-callback delivers complete messages', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const app = await importApp();
    const res = await app.request(
      '/progress-callback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-engine-token': 'test-engine-key',
        },
        body: JSON.stringify({
          type: 'complete',
          message_key: 'telegram:abc',
          chat_id: '2002',
          text: 'final response',
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });
});
