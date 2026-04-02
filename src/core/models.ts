export enum MessageType {
  TEXT = 'text',
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
  message_age_cutoff: number;
  speaker: string;
  speaker_language_code?: string;
  thread_id?: string;
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
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  photo?: TelegramPhoto[];
  document?: TelegramDocument;
  caption?: string;
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
  | { messageType: MessageType.TEXT; text: string; fileId: null }
  | { messageType: MessageType.UNKNOWN; text: string; fileId: null };

/**
 * Parse a Telegram Update object into an IncomingMessage.
 */
export function parseTelegramUpdate(
  update: TelegramUpdate,
  messageAgeCutoff: number
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
    message_age_cutoff: messageAgeCutoff,
    speaker,
    speaker_language_code: from.language_code,
    thread_id: message.message_thread_id ? String(message.message_thread_id) : undefined,
  };
}

/**
 * Check if message type is supported for processing.
 */
export function isSupportedMessageType(messageType: MessageType): boolean {
  return messageType === MessageType.TEXT;
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
  const parts = [user.first_name, user.last_name].filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length > 0) {
    return parts.join(' ').trim();
  }

  if (user.username && user.username.trim()) {
    return user.username.trim();
  }

  return String(user.id);
}
