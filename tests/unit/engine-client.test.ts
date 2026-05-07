import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from '../../src/services/engine-client.js';

describe('EngineClient', () => {
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

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('sends chat requests with engine metadata', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ response: 'ok', message_key: 'server-key' }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    const result = await client.sendTextMessage('user-1', 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"client_id":"telegram-gateway"'),
      })
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      client_id: 'telegram-gateway',
      user_id: 'user-1',
      message_type: 'text',
      message: 'hello',
      org: 'org-1',
    });
    expect(result.message).toBe('ok');
  });

  it('sends extended chat context when provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ response: 'ok' }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.sendTextMessage('user-1', 'hello', {
      chatType: 'group',
      chatId: 'group-42',
      speaker: 'Alice',
      threadId: 'thread-7',
      responseLanguageHint: 'ru',
    });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      client_id: 'telegram-gateway',
      user_id: 'user-1',
      message_type: 'text',
      message: 'hello',
      chat_type: 'group',
      chat_id: 'group-42',
      speaker: 'Alice',
      thread_id: 'thread-7',
      response_language_hint: 'ru',
      org: 'org-1',
    });
  });

  it('returns empty preferences for missing user prefs', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));

    const client = new EngineClient('https://engine.example.com', 'engine-key', undefined, 45000);

    await expect(client.getUserPreferences('user-1')).resolves.toEqual({});
  });

  it('maps preferences response payloads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ prefs: { language: 'en' } }))
      .mockResolvedValueOnce(jsonResponse({ preferences: { timezone: 'UTC' } }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', undefined, 45000);

    await expect(client.getUserPreferences('user-1')).resolves.toEqual({ language: 'en' });
    await expect(client.updateUserPreferences('user-1', { timezone: 'UTC' })).resolves.toEqual({
      timezone: 'UTC',
    });
  });

  it('extracts text from alternate engine response fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'hello from text field' }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', undefined, 45000);

    await expect(client.sendTextMessage('user-1', 'hello')).resolves.toMatchObject({
      message: 'hello from text field',
    });
  });

  it('extracts text from responses arrays', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        responses: [{ text: 'first part' }, { message: 'second part' }],
      })
    );

    const client = new EngineClient('https://engine.example.com', 'engine-key', undefined, 45000);

    await expect(client.sendTextMessage('user-1', 'hello')).resolves.toMatchObject({
      message: 'first part\nsecond part',
    });
  });

  it('extracts text from top-level array responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ text: 'first part' }, { message: 'second part' }]));

    const client = new EngineClient('https://engine.example.com', 'engine-key', undefined, 45000);

    await expect(client.sendTextMessage('user-1', 'hello')).resolves.toMatchObject({
      message: 'first part\nsecond part',
    });
  });

  it('retries on concurrent request rejection using retry_after_ms', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ retry_after_ms: 1 }, 429))
      .mockResolvedValueOnce(jsonResponse({ response: 'ok' }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', undefined, 45000);

    await expect(client.sendTextMessage('user-1', 'hello')).resolves.toMatchObject({
      message: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resets private conversation history', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.resetConversation('user-1', { chatType: 'private' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/orgs/org-1/users/user-1/history',
      expect.objectContaining({ method: 'DELETE' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ org: 'org-1' });
  });

  it('resets group conversation history', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.resetConversation('user-1', { chatType: 'group', chatId: 'chat-99' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/admin/orgs/org-1/groups/chat-99/history',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
