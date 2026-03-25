import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
process.env.ENGINE_BASE_URL = 'https://engine.example.com';
process.env.ENGINE_API_KEY = 'engine-key';
process.env.GATEWAY_PUBLIC_URL = 'https://gateway.example.com';

import { MessageType } from '../../src/core/models.js';

describe('handleIncomingMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends typing, calls engine, and chunks responses', async () => {
    const telegramClient = {
      sendChatAction: vi.fn().mockResolvedValue(true),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn().mockResolvedValue({
        message: 'First sentence. Second sentence. ' + 'x'.repeat(5000),
      }),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: 'hello',
        file_id: null,
        message_age_cutoff: 3600,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
        progressThrottleSeconds: 3,
      }
    );

    expect(telegramClient.sendChatAction).toHaveBeenCalledWith('2002', 'typing');
    expect(engineClient.sendTextMessage).toHaveBeenCalledWith('1001', 'hello', undefined, 3);
    expect(telegramClient.sendTextMessage).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ handled: true, sentChunks: 3 });
  });

  it('ignores unsupported messages', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn(),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn(),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        message_id: '42',
        message_type: MessageType.UNKNOWN,
        timestamp: Math.floor(Date.now() / 1000),
        text: '',
        file_id: null,
        message_age_cutoff: 3600,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(result).toEqual({ handled: false, reason: 'unsupported_message' });
    expect(telegramClient.sendChatAction).not.toHaveBeenCalled();
    expect(engineClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it('sends fallback message when engine fails', async () => {
    const telegramClient = {
      sendChatAction: vi.fn().mockResolvedValue(true),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn().mockRejectedValue(new Error('boom')),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: 'hello',
        file_id: null,
        message_age_cutoff: 3600,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
        fallbackMessage: 'fallback',
      }
    );

    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith('2002', 'fallback');
    expect(result).toEqual({ handled: false, reason: 'engine_error' });
  });
});
