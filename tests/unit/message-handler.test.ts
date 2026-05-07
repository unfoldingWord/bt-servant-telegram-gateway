import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '../../src/core/models.js';
import { formatTelegramHtml } from '../../src/services/telegram-format.js';

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
        progressThrottleSeconds: 3,
      }
    );

    expect(telegramClient.sendChatAction).toHaveBeenCalledWith('2002', 'typing');
    expect(engineClient.sendTextMessage).toHaveBeenCalledWith(
      '1001',
      'hello',
      {
        chatType: 'private',
        chatId: '2002',
        speaker: 'Alex',
        threadId: undefined,
        responseLanguageHint: undefined,
      },
      undefined,
      3
    );
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

  it('keeps thread replies inside the originating topic', async () => {
    const telegramClient = {
      sendChatAction: vi.fn().mockResolvedValue(true),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn().mockResolvedValue({
        message: 'Topic reply',
      }),
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
      }
    );

    expect(telegramClient.sendChatAction).toHaveBeenCalledWith('-5121603836', 'typing', '7');
    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '-5121603836',
      expect.stringContaining('Topic reply'),
      'HTML',
      '7'
    );
    expect(result).toEqual({ handled: true, sentChunks: 1 });
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

  it('formats engine response as HTML before sending', async () => {
    const telegramClient = {
      sendChatAction: vi.fn().mockResolvedValue(true),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn().mockResolvedValue({
        message: 'Hello **Bold** and _italic_.',
      }),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    await handleIncomingMessage(
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
      }
    );

    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      formatTelegramHtml('Hello **Bold** and _italic_.'),
      'HTML'
    );
  });

  it('normalizes engine section separators before chunking', async () => {
    const telegramClient = {
      sendChatAction: vi.fn().mockResolvedValue(true),
      sendTextMessage: vi.fn().mockResolvedValue(true),
      setWebhook: vi.fn(),
    };
    const engineClient = {
      sendTextMessage: vi.fn().mockResolvedValue({
        message: 'Intro\n\n---\n\nSection one\n\n---\n\nSection two',
      }),
      getUserPreferences: vi.fn(),
      updateUserPreferences: vi.fn(),
    };

    const { handleIncomingMessage } = await import('../../src/services/message-handler.js');

    await handleIncomingMessage(
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
      }
    );

    expect(telegramClient.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      expect.stringContaining('Intro\n\nSection one\n\nSection two'),
      'HTML'
    );
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
});
