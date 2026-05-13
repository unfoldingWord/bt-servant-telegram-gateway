import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '../../src/core/models.js';

describe('handleIncomingMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends typing and kicks off async engine call', async () => {
    const telegramClient = {
      sendChatAction: vi.fn().mockResolvedValue(true),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessageAsync: vi
        .fn()
        .mockResolvedValue({ status: 'accepted', message_key: 'mk-123' }),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: 'hello',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
        progressCallbackUrl: 'https://gateway.example.com/progress-callback',
      }
    );

    expect(telegramClient.sendChatAction).toHaveBeenCalledWith('2002', 'typing');
    expect(engineClient.sendTextMessageAsync).toHaveBeenCalledWith(
      '1001',
      'hello',
      expect.any(String),
      'https://gateway.example.com/progress-callback',
      {
        chatType: 'private',
        chatId: '2002',
        speaker: 'Alex',
        threadId: undefined,
        responseLanguageHint: undefined,
        addressedToBot: true,
      }
    );
    expect(result.handled).toBe(true);
    expect(result.reason).toBe('accepted');
    expect(typeof result.messageKey).toBe('string');
    expect(telegramClient.sendTextMessage).not.toHaveBeenCalled();
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
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.UNKNOWN,
        timestamp: Math.floor(Date.now() / 1000),
        text: '',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
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

  it('ignores group messages that are not addressed to the bot', async () => {
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
        chat_id: '-5121603836',
        chat_type: 'group',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: 'hello everyone',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: false,
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

  it('passes thread_id to the engine for topic-scoped requests', async () => {
    const telegramClient = {
      sendChatAction: vi.fn().mockResolvedValue(true),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessageAsync: vi
        .fn()
        .mockResolvedValue({ status: 'accepted', message_key: 'mk-thread' }),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '-5121603836',
        chat_type: 'supergroup',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: 'hello bot',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        thread_id: '7',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
        progressCallbackUrl: 'https://gateway.example.com/progress-callback',
      }
    );

    expect(telegramClient.sendChatAction).toHaveBeenCalledWith('-5121603836', 'typing', '7');
    expect(engineClient.sendTextMessageAsync).toHaveBeenCalledWith(
      '1001',
      'hello bot',
      expect.any(String),
      'https://gateway.example.com/progress-callback',
      expect.objectContaining({
        chatType: 'supergroup',
        chatId: '-5121603836',
        threadId: '7',
      })
    );
    expect(result.handled).toBe(true);
    expect(result.reason).toBe('accepted');
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
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: 'hello',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
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

  it('resets private conversations via engine and confirms to the user', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      resetConversation: vi.fn().mockResolvedValue(undefined),
      sendTextMessage: vi.fn(),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/reset',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(engineClient.resetConversation).toHaveBeenCalledWith('1001', {
      chatType: 'private',
      chatId: '2002',
      threadId: undefined,
    });
    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      'Conversation has been reset.'
    );
    expect(result).toEqual({ handled: true, reason: 'reset', sentChunks: 1 });
    expect(engineClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it('answers /start without calling engine', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      resetConversation: vi.fn(),
      sendTextMessage: vi.fn(),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/start',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      expect.stringContaining('Welcome!')
    );
    expect(engineClient.sendTextMessage).not.toHaveBeenCalled();
    expect(engineClient.updateUserPreferences).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, sentChunks: 1 });
  });

  it('answers /help without calling engine', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      resetConversation: vi.fn(),
      sendTextMessage: vi.fn(),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/help',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      expect.stringContaining('Here is what I can do:')
    );
    expect(engineClient.sendTextMessage).not.toHaveBeenCalled();
    expect(engineClient.updateUserPreferences).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true, sentChunks: 1 });
  });

  it('lists available published modes when /mode has no argument', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn(),
      listModes: vi
        .fn()
        .mockResolvedValue([
          { name: 'spoken-mode', label: 'Spoken Servant', published: true },
          { name: 'translation-coach', published: true },
          { name: 'draft-mode', published: false },
          { name: 'no-flag-mode' },
        ]),
      setMode: vi.fn(),
      clearMode: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/mode',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(engineClient.listModes).toHaveBeenCalledTimes(1);
    expect(engineClient.setMode).not.toHaveBeenCalled();
    const [, body] = telegramClient.sendTextMessage.mock.calls[0] ?? [];
    expect(body).toContain('Available modes:');
    expect(body).toContain('- spoken-mode — Spoken Servant');
    expect(body).toContain('- translation-coach');
    expect(body).not.toContain('draft-mode');
    expect(body).not.toContain('no-flag-mode');
    expect(result).toEqual({ handled: true, reason: 'mode', sentChunks: 1 });
  });

  it('sets the mode on the user scope in private chats', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn(),
      listModes: vi.fn().mockResolvedValue([{ name: 'spoken-mode', published: true }]),
      setMode: vi.fn().mockResolvedValue(undefined),
      clearMode: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/mode spoken-mode',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(engineClient.setMode).toHaveBeenCalledWith(
      { kind: 'user', userId: '1001' },
      'spoken-mode'
    );
    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith('2002', 'Mode set to spoken-mode.');
    expect(result).toEqual({ handled: true, reason: 'mode', sentChunks: 1 });
  });

  it('sets the mode on the group scope in group chats and tolerates @botname', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn(),
      listModes: vi.fn().mockResolvedValue([{ name: 'spoken-mode', published: true }]),
      setMode: vi.fn().mockResolvedValue(undefined),
      clearMode: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '-5286198901',
        chat_type: 'supergroup',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/mode@bt_servant_qa_bot spoken-mode',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(engineClient.setMode).toHaveBeenCalledWith(
      { kind: 'group', chatId: '-5286198901' },
      'spoken-mode'
    );
    expect(result).toEqual({ handled: true, reason: 'mode', sentChunks: 1 });
  });

  it('rejects an unknown mode without writing to the engine', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn(),
      listModes: vi.fn().mockResolvedValue([
        { name: 'spoken-mode', published: true },
        { name: 'translation-coach', published: true },
      ]),
      setMode: vi.fn(),
      clearMode: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/mode bogus',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(engineClient.setMode).not.toHaveBeenCalled();
    const [, body] = telegramClient.sendTextMessage.mock.calls[0] ?? [];
    expect(body).toContain("Unknown mode 'bogus'");
    expect(body).toContain('spoken-mode');
    expect(body).toContain('translation-coach');
    expect(result).toEqual({ handled: true, reason: 'mode', sentChunks: 1 });
  });

  it('clears the mode on /mode default', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn(),
      listModes: vi.fn(),
      setMode: vi.fn(),
      clearMode: vi.fn().mockResolvedValue(undefined),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/mode default',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(engineClient.clearMode).toHaveBeenCalledWith({ kind: 'user', userId: '1001' });
    expect(engineClient.listModes).not.toHaveBeenCalled();
    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith('2002', 'Mode cleared.');
    expect(result).toEqual({ handled: true, reason: 'mode', sentChunks: 1 });
  });

  it('falls back gracefully when the engine errors during /mode set', async () => {
    const telegramClient = {
      sendChatAction: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn(),
      listModes: vi.fn().mockRejectedValue(new Error('Engine API error: 500')),
      setMode: vi.fn(),
      clearMode: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    const result = await handleIncomingMessage(
      {
        user_id: '1001',
        chat_id: '2002',
        chat_type: 'private',
        message_id: '42',
        message_type: MessageType.TEXT,
        timestamp: Math.floor(Date.now() / 1000),
        text: '/mode spoken-mode',
        file_id: null,
        message_age_cutoff: 3600,
        speaker: 'Alex',
        addressed_to_bot: true,
      },
      {
        telegramClient: telegramClient as never,
        engineClient: engineClient as never,
      }
    );

    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      'Sorry, I could not update the mode.'
    );
    expect(result).toEqual({ handled: false, reason: 'engine_error' });
  });
});
