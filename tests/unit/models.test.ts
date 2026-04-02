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

  it('marks non-text updates as unsupported through UNKNOWN type', () => {
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
      message_type: MessageType.UNKNOWN,
      timestamp: 1_700_000_000,
      text: '',
      file_id: null,
      message_age_cutoff: 3600,
      speaker: 'Alex',
      speaker_language_code: undefined,
      thread_id: undefined,
    });
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
    };

    expect(getMessageAge(message)).toBe(600);
    expect(isMessageTooOld(message)).toBe(true);

    vi.useRealTimers();
  });
});
