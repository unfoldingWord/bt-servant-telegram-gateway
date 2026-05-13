import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleIncomingMessage = vi.fn();
const dispatchEngineResponse = vi.fn();

vi.mock('../../src/services/message-handler.js', () => ({
  handleIncomingMessage,
}));

vi.mock('../../src/services/response-dispatch.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/response-dispatch.js')>(
    '../../src/services/response-dispatch.js'
  );
  return {
    ...actual,
    dispatchEngineResponse,
  };
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
    dispatchEngineResponse.mockReset();
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
      GATEWAY_PUBLIC_URL: 'https://gateway.example.com',
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

  it('POST /telegram-webhook passes progressCallbackUrl from env to handler', async () => {
    handleIncomingMessage.mockResolvedValue({ handled: true, reason: 'accepted' });

    const app = await importApp();
    const env = makeEnv();

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

    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: '1001' }),
      expect.objectContaining({
        progressCallbackUrl: 'https://gateway.example.com/progress-callback',
      })
    );
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

  it('POST /progress-callback rejects payload missing user_id', async () => {
    const app = await importApp();
    const res = await app.request(
      '/progress-callback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-engine-token': 'test-engine-key',
        },
        body: JSON.stringify({ type: 'complete', message_key: 'k', chat_id: '1', text: 'hi' }),
      },
      makeEnv()
    );
    expect(res.status).toBe(400);
  });

  it('POST /progress-callback dispatches complete events', async () => {
    dispatchEngineResponse.mockResolvedValue({
      expectedChunks: 1,
      sentChunks: 1,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: false,
    });

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
          user_id: '1001',
          message_key: 'telegram:abc',
          chat_id: '2002',
          text: 'final response',
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(200);
    expect(dispatchEngineResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '2002',
        text: 'final response',
      })
    );
  });

  it('POST /progress-callback dedupes a duplicate complete with the same message_key', async () => {
    dispatchEngineResponse.mockResolvedValue({
      expectedChunks: 1,
      sentChunks: 1,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: false,
    });

    const app = await importApp();
    const env = makeEnv();
    const headers = {
      'Content-Type': 'application/json',
      'x-engine-token': 'test-engine-key',
    };
    const body = JSON.stringify({
      type: 'complete',
      user_id: '1001',
      message_key: 'telegram:dupe',
      chat_id: '2002',
      text: 'final response',
    });

    const res1 = await app.request('/progress-callback', { method: 'POST', headers, body }, env);
    expect(res1.status).toBe(200);
    expect(dispatchEngineResponse).toHaveBeenCalledTimes(1);

    const res2 = await app.request('/progress-callback', { method: 'POST', headers, body }, env);
    expect(res2.status).toBe(200);
    expect(dispatchEngineResponse).toHaveBeenCalledTimes(1);
    const data2 = (await res2.json()) as Record<string, unknown>;
    expect(data2.duplicate).toBe(true);
  });

  it('POST /progress-callback returns 502 and retains retry eligibility when dispatch throws', async () => {
    dispatchEngineResponse.mockRejectedValueOnce(new Error('telegram down')).mockResolvedValueOnce({
      expectedChunks: 1,
      sentChunks: 1,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: false,
    });

    const app = await importApp();
    const env = makeEnv();
    const headers = {
      'Content-Type': 'application/json',
      'x-engine-token': 'test-engine-key',
    };
    const body = JSON.stringify({
      type: 'complete',
      user_id: '1001',
      message_key: 'telegram:retry',
      chat_id: '2002',
      text: 'final response',
    });

    const res1 = await app.request('/progress-callback', { method: 'POST', headers, body }, env);
    expect(res1.status).toBe(502);

    const res2 = await app.request('/progress-callback', { method: 'POST', headers, body }, env);
    expect(res2.status).toBe(200);
    expect(dispatchEngineResponse).toHaveBeenCalledTimes(2);
    const data2 = (await res2.json()) as Record<string, unknown>;
    expect(data2.duplicate).toBeUndefined();
  });

  it('POST /progress-callback returns 502 when dispatch reports nothing delivered though something was expected', async () => {
    dispatchEngineResponse.mockResolvedValue({
      expectedChunks: 1,
      sentChunks: 0,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: false,
    });

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
          user_id: '1001',
          message_key: 'telegram:silent-fail',
          chat_id: '2002',
          text: 'final response',
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(502);
  });

  it('POST /progress-callback returns 502 on partial text delivery (some chunks dropped)', async () => {
    dispatchEngineResponse.mockResolvedValue({
      expectedChunks: 5,
      sentChunks: 3,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: false,
    });

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
          user_id: '1001',
          message_key: 'telegram:partial-text',
          chat_id: '2002',
          text: 'a very long message split into chunks',
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(502);
  });

  it('POST /progress-callback returns 502 on partial attachment delivery', async () => {
    dispatchEngineResponse.mockResolvedValue({
      expectedChunks: 0,
      sentChunks: 0,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 3,
      attachmentsSent: 1,
      empty: false,
    });

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
          user_id: '1001',
          message_key: 'telegram:partial-attachments',
          chat_id: '2002',
          attachments: [
            { type: 'audio', url: 'a.ogg', mime_type: 'audio/ogg' },
            { type: 'audio', url: 'b.ogg', mime_type: 'audio/ogg' },
            { type: 'audio', url: 'c.ogg', mime_type: 'audio/ogg' },
          ],
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(502);
  });

  it('POST /progress-callback succeeds on an empty engine payload without marking failure', async () => {
    dispatchEngineResponse.mockResolvedValue({
      expectedChunks: 0,
      sentChunks: 0,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: true,
    });

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
          user_id: '1001',
          message_key: 'telegram:empty',
          chat_id: '2002',
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(200);
  });

  it('POST /progress-callback delivers fallback text on error events', async () => {
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
          type: 'error',
          user_id: '1001',
          message_key: 'telegram:err',
          chat_id: '2002',
          error: 'engine exploded',
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    const sendCall = fetchMock.mock.calls.find((args) => String(args[0]).includes('/sendMessage'));
    expect(sendCall).toBeDefined();
  });

  it('POST /progress-callback acknowledges status events without dispatching', async () => {
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
          type: 'status',
          user_id: '1001',
          message_key: 'telegram:status',
        }),
      },
      makeEnv()
    );
    expect(res.status).toBe(200);
    expect(dispatchEngineResponse).not.toHaveBeenCalled();
  });
});
