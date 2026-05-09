export enum MessageType {
  TEXT = 'text',
  VOICE = 'voice',
  AUDIO = 'audio',
  UNKNOWN = 'unknown',
}

export interface IncomingMessage {
  user_id: string;
  chat_id: string;
  chat_type: 'private' | 'group' | 'supergroup' | 'channel';
  message_id: string;
  message_type: MessageType;
  timestamp: number;
  text: string;
  file_id: string | null;
  duration?: number | undefined;
  mime_type?: string | undefined;
  message_age_cutoff: number;
  speaker: string;
  speaker_language_code?: string | undefined;
  thread_id?: string | undefined;
  addressed_to_bot: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  message_thread_id?: number;
  text?: string;
  entities?: TelegramMessageEntity[];
  reply_to_message?: TelegramMessage;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  photo?: TelegramPhoto[];
  document?: TelegramDocument;
  caption?: string;
}

export interface TelegramMessageEntity {
  offset: number;
  length: number;
  type:
    | 'mention'
    | 'bot_command'
    | 'hashtag'
    | 'cashtag'
    | 'url'
    | 'email'
    | 'phone_number'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'spoiler'
    | 'blockquote'
    | 'expandable_blockquote'
    | 'code'
    | 'pre'
    | 'text_link'
    | 'text_mention'
    | 'custom_emoji';
  user?: TelegramUser;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

type TelegramMessageContent =
  | {
      messageType: MessageType.TEXT;
      text: string;
      fileId: null;
      duration?: undefined;
      mimeType?: undefined;
    }
  | {
      messageType: MessageType.VOICE;
      text: string;
      fileId: string;
      duration: number;
      mimeType: string;
    }
  | {
      messageType: MessageType.AUDIO;
      text: string;
      fileId: string;
      duration: number;
      mimeType: string;
    }
  | {
      messageType: MessageType.UNKNOWN;
      text: string;
      fileId: null;
      duration?: undefined;
      mimeType?: undefined;
    };

/**
 * Parse a Telegram Update object into an IncomingMessage.
 */
export function parseTelegramUpdate(
  update: TelegramUpdate,
  messageAgeCutoff: number,
  botUsername?: string
): IncomingMessage | null {
  const message = update.message || update.edited_message;
  if (!message) {
    return null;
  }

  const from = message.from;
  if (!from || from.is_bot) {
    return null; // Ignore bot messages
  }

  const user_id = String(from.id);
  const chat_id = String(message.chat.id);
  const chat_type = message.chat.type;
  const message_id = String(message.message_id);
  const timestamp = message.date;
  const speaker = buildSpeakerLabel(from);
  const addressedToBot = isAddressedToBot(message, botUsername);

  let content: TelegramMessageContent = {
    messageType: MessageType.UNKNOWN,
    text: '',
    fileId: null,
  };
  if (message.text) {
    content = {
      messageType: MessageType.TEXT,
      text: message.text,
      fileId: null,
    };
  } else if (message.voice) {
    content = {
      messageType: MessageType.VOICE,
      text: message.caption ?? '',
      fileId: message.voice.file_id,
      duration: message.voice.duration,
      mimeType: message.voice.mime_type ?? 'audio/ogg',
    };
  } else if (message.audio) {
    content = {
      messageType: MessageType.AUDIO,
      text: message.caption ?? '',
      fileId: message.audio.file_id,
      duration: message.audio.duration,
      mimeType: message.audio.mime_type ?? 'audio/mpeg',
    };
  }

  return {
    user_id,
    chat_id,
    chat_type,
    message_id,
    message_type: content.messageType,
    timestamp,
    text: content.text,
    file_id: content.fileId,
    duration: content.duration,
    mime_type: content.mimeType,
    message_age_cutoff: messageAgeCutoff,
    speaker,
    speaker_language_code: from.language_code,
    thread_id: message.message_thread_id ? String(message.message_thread_id) : undefined,
    addressed_to_bot: addressedToBot,
  };
}

/**
 * Check if message type is supported for processing.
 */
export function isSupportedMessageType(messageType: MessageType): boolean {
  return (
    messageType === MessageType.TEXT ||
    messageType === MessageType.VOICE ||
    messageType === MessageType.AUDIO
  );
}

/**
 * Check if message is too old to process.
 */
export function isMessageTooOld(message: IncomingMessage): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  const age = currentTime - message.timestamp;
  return age > message.message_age_cutoff;
}

/**
 * Get message age in seconds.
 */
export function getMessageAge(message: IncomingMessage): number {
  const currentTime = Math.floor(Date.now() / 1000);
  return currentTime - message.timestamp;
}

function buildSpeakerLabel(user: TelegramUser): string {
  const parts = [user.first_name, user.last_name].filter((part): part is string =>
    Boolean(part && part.trim())
  );
  if (parts.length > 0) {
    return parts.join(' ').trim();
  }

  if (user.username && user.username.trim()) {
    return user.username.trim();
  }

  return String(user.id);
}

function isAddressedToBot(message: TelegramMessage, botUsername?: string): boolean {
  if (message.chat.type === 'private') {
    return true;
  }

  const text = message.text ?? message.caption ?? '';
  const normalizedText = text.trim();

  if (!normalizedText) {
    return false;
  }

  if (normalizedText.startsWith('/')) {
    return true;
  }

  if (isReplyToBot(message, botUsername)) {
    return true;
  }

  if (!botUsername) {
    return false;
  }

  const mention = `@${botUsername.replace(/^@/u, '').toLowerCase()}`;
  const textLower = normalizedText.toLowerCase();
  const entityMention = message.entities?.some((entity) => {
    if (entity.type !== 'mention' && entity.type !== 'bot_command') {
      return false;
    }

    const slice = normalizedText.slice(entity.offset, entity.offset + entity.length).toLowerCase();
    return slice.includes(mention);
  });

  if (entityMention) {
    return true;
  }

  return textLower.includes(mention);
}

function isReplyToBot(message: TelegramMessage, botUsername?: string): boolean {
  const repliedMessage = message.reply_to_message;
  if (!repliedMessage) {
    return false;
  }

  const repliedFrom = repliedMessage.from;
  if (repliedFrom?.is_bot) {
    return true;
  }

  const repliedUsername = repliedFrom?.username?.trim().toLowerCase();
  const normalizedBotUsername = botUsername?.replace(/^@/u, '').trim().toLowerCase();
  if (!repliedUsername || !normalizedBotUsername) {
    return false;
  }

  return repliedUsername === normalizedBotUsername;
}
