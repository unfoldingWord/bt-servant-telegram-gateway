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
