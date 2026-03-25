export enum MessageType {
  TEXT = 'text',
  VOICE = 'voice',
  AUDIO = 'audio',
  PHOTO = 'photo',
  DOCUMENT = 'document',
  VIDEO = 'video',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT = 'contact',
  UNKNOWN = 'unknown',
}

export interface IncomingMessage {
  user_id: string;
  chat_id: string;
  message_id: string;
  message_type: MessageType;
  timestamp: number;
  text: string;
  file_id: string | null;
  message_age_cutoff: number;
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
  const message_id = String(message.message_id);
  const timestamp = message.date;

  // Determine message type and extract content
  let message_type = MessageType.UNKNOWN;
  let text = '';
  let file_id: string | null = null;

  if (message.text) {
    message_type = MessageType.TEXT;
    text = message.text;
  } else if (message.voice) {
    message_type = MessageType.VOICE;
    file_id = message.voice.file_id;
    text = message.caption || '';
  } else if (message.audio) {
    message_type = MessageType.AUDIO;
    file_id = message.audio.file_id;
    text = message.caption || '';
  } else if (message.photo && message.photo.length > 0) {
    message_type = MessageType.PHOTO;
    // Get largest photo
    file_id = message.photo[message.photo.length - 1].file_id;
    text = message.caption || '';
  } else if (message.document) {
    message_type = MessageType.DOCUMENT;
    file_id = message.document.file_id;
    text = message.caption || '';
  }

  return {
    user_id,
    chat_id,
    message_id,
    message_type,
    timestamp,
    text,
    file_id,
    message_age_cutoff: messageAgeCutoff,
  };
}

/**
 * Check if message type is supported for processing.
 */
export function isSupportedMessageType(messageType: MessageType): boolean {
  return messageType === MessageType.TEXT || 
         messageType === MessageType.VOICE || 
         messageType === MessageType.AUDIO;
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

