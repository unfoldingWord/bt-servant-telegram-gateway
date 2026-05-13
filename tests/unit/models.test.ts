import { describe, expect, it, vi } from 'vitest';

import {
  MessageType,
  getMessageAge,
  isMessageTooOld,
  isSupportedMessageType,
  parseTelegramUpdate,
} from '../../src/core/models.js';

describe('core models', () => {
  it('parses a text telegram update', () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 42,
        from: {
          id: 1001,
          is_bot: false,
          first_name: 'Alex',
        },
        chat: {
          id: 2002,
          type: 'private' as const,
        },
        date: 1_700_000_000,
        text: 'hello',
      },
    };

    expect(parseTelegramUpdate(update, 3600)).toEqual({
      user_id: '1001',
      chat_id: '2002',
      chat_type: 'private',
      message_id: '42',
      message_type: MessageType.TEXT,
      timestamp: 1_700_000_000,
      text: 'hello',
      file_id: null,
      message_age_cutoff: 3600,
      speaker: 'Alex',
      speaker_language_code: undefined,
      thread_id: undefined,
      addressed_to_bot: true,
    });
  });

  it('parses a group telegram update with speaker and thread metadata', () => {
    const update = {
      update_id: 2,
      message: {
        message_id: 99,
        message_thread_id: 7,
        from: {
          id: 1002,
          is_bot: false,
          first_name: 'Alice',
          last_name: 'Smith',
          language_code: 'en',
        },
        chat: {
          id: 3003,
          type: 'supergroup' as const,
          title: 'Study Group',
        },
        date: 1_700_000_100,
        text: 'hello group',
      },
    };

    expect(parseTelegramUpdate(update, 3600)).toEqual({
      user_id: '1002',
      chat_id: '3003',
      chat_type: 'supergroup',
      message_id: '99',
      message_type: MessageType.TEXT,
      timestamp: 1_700_000_100,
      text: 'hello group',
      file_id: null,
      message_age_cutoff: 3600,
      speaker: 'Alice Smith',
      speaker_language_code: 'en',
      thread_id: '7',
      addressed_to_bot: false,
    });
  });

  it('detects group mentions when bot username is provided', () => {
    const update = {
      update_id: 3,
      message: {
        message_id: 111,
        from: {
          id: 1003,
          is_bot: false,
          first_name: 'Bob',
        },
        chat: {
          id: -5121603836,
          type: 'group' as const,
          title: 'Study Group',
        },
        date: 1_700_000_200,
        text: '@bt24_test_bot what can you do?',
        entities: [
          {
            offset: 0,
            length: 14,
            type: 'mention' as const,
          },
        ],
      },
    };

    expect(parseTelegramUpdate(update, 3600, 'bt24_test_bot')).toEqual({
      user_id: '1003',
      chat_id: '-5121603836',
      chat_type: 'group',
      message_id: '111',
      message_type: MessageType.TEXT,
      timestamp: 1_700_000_200,
      text: '@bt24_test_bot what can you do?',
      file_id: null,
      message_age_cutoff: 3600,
      speaker: 'Bob',
      speaker_language_code: undefined,
      thread_id: undefined,
      addressed_to_bot: true,
    });
  });

  it('detects replies to bot messages in groups', () => {
    const update = {
      update_id: 4,
      message: {
        message_id: 112,
        from: {
          id: 1004,
          is_bot: false,
          first_name: 'Cara',
        },
        chat: {
          id: -5121603836,
          type: 'group' as const,
          title: 'Study Group',
        },
        date: 1_700_000_300,
        text: 'Рим 1:16',
        reply_to_message: {
          message_id: 111,
          from: {
            id: 9999,
            is_bot: true,
            first_name: 'BT Servant',
            username: 'bt24_test_bot',
          },
          chat: {
            id: -5121603836,
            type: 'group' as const,
            title: 'Study Group',
          },
          date: 1_700_000_200,
          text: 'How can I help?',
        },
      },
    };

    expect(parseTelegramUpdate(update, 3600, 'bt24_test_bot')).toEqual({
      user_id: '1004',
      chat_id: '-5121603836',
      chat_type: 'group',
      message_id: '112',
      message_type: MessageType.TEXT,
      timestamp: 1_700_000_300,
      text: 'Рим 1:16',
      file_id: null,
      message_age_cutoff: 3600,
      speaker: 'Cara',
      speaker_language_code: undefined,
      thread_id: undefined,
      addressed_to_bot: true,
    });
  });

  it('ignores bot messages', () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 42,
        from: {
          id: 1001,
          is_bot: true,
          first_name: 'Bot',
        },
        chat: {
          id: 2002,
          type: 'private' as const,
        },
        date: 1_700_000_000,
        text: 'hello',
      },
    };

    expect(parseTelegramUpdate(update, 3600)).toBeNull();
  });

  it('parses voice messages with file_id, duration, and mime_type', () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 42,
        from: {
          id: 1001,
          is_bot: false,
          first_name: 'Alex',
        },
        chat: {
          id: 2002,
          type: 'private' as const,
        },
        date: 1_700_000_000,
        voice: {
          file_id: 'voice-file',
          file_unique_id: 'voice-unique',
          duration: 12,
        },
      },
    };

    expect(parseTelegramUpdate(update, 3600)).toEqual({
      user_id: '1001',
      chat_id: '2002',
      chat_type: 'private',
      message_id: '42',
      message_type: MessageType.VOICE,
      timestamp: 1_700_000_000,
      text: '',
      file_id: 'voice-file',
      duration: 12,
      mime_type: 'audio/ogg',
      message_age_cutoff: 3600,
      speaker: 'Alex',
      speaker_language_code: undefined,
      thread_id: undefined,
      addressed_to_bot: true,
    });
    expect(isSupportedMessageType(MessageType.VOICE)).toBe(true);
    expect(isSupportedMessageType(MessageType.UNKNOWN)).toBe(false);
  });

  it('detects captionless voice replies to the bot as addressed', () => {
    const update = {
      update_id: 5,
      message: {
        message_id: 200,
        from: {
          id: 1005,
          is_bot: false,
          first_name: 'Ian',
        },
        chat: {
          id: -5121603836,
          type: 'supergroup' as const,
          title: 'Study Group',
        },
        date: 1_700_000_400,
        voice: {
          file_id: 'voice-reply',
          file_unique_id: 'voice-reply-unique',
          duration: 8,
        },
        reply_to_message: {
          message_id: 199,
          from: {
            id: 9999,
            is_bot: true,
            first_name: 'BT Servant',
            username: 'bt24_test_bot',
          },
          chat: {
            id: -5121603836,
            type: 'supergroup' as const,
            title: 'Study Group',
          },
          date: 1_700_000_300,
          text: 'How can I help?',
        },
      },
    };

    const result = parseTelegramUpdate(update, 3600, 'bt24_test_bot');
    expect(result?.message_type).toBe(MessageType.VOICE);
    expect(result?.text).toBe('');
    expect(result?.addressed_to_bot).toBe(true);
  });

  it('keeps captionless voice replies to a non-bot user as un-addressed', () => {
    const update = {
      update_id: 6,
      message: {
        message_id: 201,
        from: {
          id: 1005,
          is_bot: false,
          first_name: 'Ian',
        },
        chat: {
          id: -5121603836,
          type: 'supergroup' as const,
          title: 'Study Group',
        },
        date: 1_700_000_500,
        voice: {
          file_id: 'voice-reply-2',
          file_unique_id: 'voice-reply-unique-2',
          duration: 5,
        },
        reply_to_message: {
          message_id: 198,
          from: {
            id: 1006,
            is_bot: false,
            first_name: 'Kristina',
            username: 'kristina',
          },
          chat: {
            id: -5121603836,
            type: 'supergroup' as const,
            title: 'Study Group',
          },
          date: 1_700_000_250,
          text: 'hey',
        },
      },
    };

    const result = parseTelegramUpdate(update, 3600, 'bt24_test_bot');
    expect(result?.addressed_to_bot).toBe(false);
  });

  it('keeps captionless voice with no reply context as un-addressed in groups', () => {
    const update = {
      update_id: 7,
      message: {
        message_id: 202,
        from: {
          id: 1005,
          is_bot: false,
          first_name: 'Ian',
        },
        chat: {
          id: -5121603836,
          type: 'supergroup' as const,
          title: 'Study Group',
        },
        date: 1_700_000_600,
        voice: {
          file_id: 'voice-ambient',
          file_unique_id: 'voice-ambient-unique',
          duration: 5,
        },
      },
    };

    const result = parseTelegramUpdate(update, 3600, 'bt24_test_bot');
    expect(result?.addressed_to_bot).toBe(false);
  });

  it('detects voice messages addressed via @<bot> caption (regression guard)', () => {
    const update = {
      update_id: 8,
      message: {
        message_id: 203,
        from: {
          id: 1005,
          is_bot: false,
          first_name: 'Ian',
        },
        chat: {
          id: -5121603836,
          type: 'supergroup' as const,
          title: 'Study Group',
        },
        date: 1_700_000_700,
        voice: {
          file_id: 'voice-caption',
          file_unique_id: 'voice-caption-unique',
          duration: 6,
        },
        caption: '@bt24_test_bot here is a story',
      },
    };

    const result = parseTelegramUpdate(update, 3600, 'bt24_test_bot');
    expect(result?.addressed_to_bot).toBe(true);
  });

  it('detects old messages and computes message age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:10:00Z'));

    const message = {
      user_id: '1001',
      chat_id: '2002',
      chat_type: 'private' as const,
      message_id: '42',
      message_type: MessageType.TEXT,
      timestamp: Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000),
      text: 'hello',
      file_id: null,
      message_age_cutoff: 300,
      speaker: 'Alex',
      addressed_to_bot: true,
    };

    expect(getMessageAge(message)).toBe(600);
    expect(isMessageTooOld(message)).toBe(true);

    vi.useRealTimers();
  });
});
