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

  it('lists modes from the admin endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        org: 'org-1',
        modes: [
          { name: 'spoken-mode', published: true },
          { name: 'draft', published: false },
        ],
      })
    );

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    const modes = await client.listModes();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/admin/orgs/org-1/modes',
      expect.objectContaining({ method: 'GET' })
    );
    expect(modes).toEqual([
      { name: 'spoken-mode', published: true },
      { name: 'draft', published: false },
    ]);
  });

  it('returns an empty array when listModes response has no modes field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ org: 'org-1' }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await expect(client.listModes()).resolves.toEqual([]);
  });

  it('throws on listModes HTTP error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, 500));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await expect(client.listModes()).rejects.toThrow('Engine API error: 500');
  });

  it('sets a user-scoped mode via PUT', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ mode: 'spoken-mode' }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.setMode({ kind: 'user', userId: 'user-1' }, 'spoken-mode');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/admin/orgs/org-1/users/user-1/mode',
      expect.objectContaining({ method: 'PUT' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ mode: 'spoken-mode' });
  });

  it('sets a group-scoped mode via PUT', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ mode: 'spoken-mode' }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.setMode({ kind: 'group', chatId: '-100123' }, 'spoken-mode');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/admin/orgs/org-1/groups/-100123/mode',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('clears a user-scoped mode via DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ mode: null }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.clearMode({ kind: 'user', userId: 'user-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/admin/orgs/org-1/users/user-1/mode',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('clears a group-scoped mode via DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ mode: null }));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.clearMode({ kind: 'group', chatId: '-100123' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/admin/orgs/org-1/groups/-100123/mode',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('throws when setMode HTTP fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad' }, 400));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await expect(client.setMode({ kind: 'user', userId: 'user-1' }, 'foo')).rejects.toThrow(
      'Engine API error: 400'
    );
  });

  it('sendTextMessageAsync POSTs /api/v1/chat/callback with callback wiring', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    const ack = await client.sendTextMessageAsync(
      'user-1',
      'hello',
      'msg-123',
      'https://gateway.example.com/progress-callback',
      { chatType: 'group', chatId: 'chat-9', addressedToBot: true }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://engine.example.com/api/v1/chat/callback',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      client_id: 'telegram-gateway',
      user_id: 'user-1',
      message_type: 'text',
      message: 'hello',
      message_key: 'msg-123',
      progress_callback_url: 'https://gateway.example.com/progress-callback',
      progress_mode: 'complete',
      chat_type: 'group',
      chat_id: 'chat-9',
      addressed_to_bot: true,
      org: 'org-1',
    });
    expect(ack).toEqual({ status: 'accepted', message_key: 'msg-123' });
  });

  it('sendAudioMessageAsync POSTs /api/v1/chat/callback with audio fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await client.sendAudioMessageAsync(
      'user-1',
      'BASE64DATA',
      'audio/ogg',
      'msg-456',
      'https://gateway.example.com/progress-callback',
      undefined,
      { chatType: 'private', chatId: '2002' }
    );

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      message_type: 'audio',
      audio_base64: 'BASE64DATA',
      audio_format: 'audio/ogg',
      message_key: 'msg-456',
      progress_callback_url: 'https://gateway.example.com/progress-callback',
      progress_mode: 'complete',
    });
  });

  it('sendTextMessageAsync throws on non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'denied' }, 403));

    const client = new EngineClient('https://engine.example.com', 'engine-key', 'org-1', 45000);

    await expect(
      client.sendTextMessageAsync(
        'user-1',
        'hi',
        'msg-err',
        'https://gateway.example.com/progress-callback'
      )
    ).rejects.toThrow('Engine API error: 403');
  });
});
