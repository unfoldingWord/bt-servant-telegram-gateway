import type { ChatAttachment } from './engine-client.js';

export interface CallbackCompletePayload {
  type: 'complete';
  user_id: string;
  message_key: string;
  chat_id?: string;
  thread_id?: string;
  text?: string;
  voice_audio_url?: string;
  attachments?: ChatAttachment[];
  timestamp?: string;
}

export interface CallbackErrorPayload {
  type: 'error';
  user_id: string;
  message_key: string;
  chat_id?: string;
  thread_id?: string;
  error: string;
  timestamp?: string;
}

export interface CallbackStatusPayload {
  type: 'status';
  user_id: string;
  message_key: string;
  message?: string;
  timestamp?: string;
}

export interface CallbackProgressPayload {
  type: 'progress';
  user_id: string;
  message_key: string;
  chat_id?: string;
  thread_id?: string;
  text: string;
  timestamp?: string;
}

export type CallbackPayload =
  | CallbackCompletePayload
  | CallbackErrorPayload
  | CallbackStatusPayload
  | CallbackProgressPayload;

export function parseCallbackPayload(payload: unknown): CallbackPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const type = candidate.type;
  const userId = candidate.user_id;
  const messageKey = candidate.message_key;

  if (typeof userId !== 'string' || !userId) return null;
  if (typeof messageKey !== 'string' || !messageKey) return null;

  if (type === 'complete') {
    return {
      type: 'complete',
      user_id: userId,
      message_key: messageKey,
      ...(typeof candidate.chat_id === 'string' ? { chat_id: candidate.chat_id } : {}),
      ...(typeof candidate.thread_id === 'string' ? { thread_id: candidate.thread_id } : {}),
      ...(typeof candidate.text === 'string' ? { text: candidate.text } : {}),
      ...(typeof candidate.voice_audio_url === 'string'
        ? { voice_audio_url: candidate.voice_audio_url }
        : {}),
      ...(Array.isArray(candidate.attachments)
        ? { attachments: candidate.attachments as ChatAttachment[] }
        : {}),
      ...(typeof candidate.timestamp === 'string' ? { timestamp: candidate.timestamp } : {}),
    };
  }

  if (type === 'error') {
    const error = typeof candidate.error === 'string' ? candidate.error : 'Unknown engine error';
    return {
      type: 'error',
      user_id: userId,
      message_key: messageKey,
      ...(typeof candidate.chat_id === 'string' ? { chat_id: candidate.chat_id } : {}),
      ...(typeof candidate.thread_id === 'string' ? { thread_id: candidate.thread_id } : {}),
      error,
      ...(typeof candidate.timestamp === 'string' ? { timestamp: candidate.timestamp } : {}),
    };
  }

  if (type === 'status') {
    return {
      type: 'status',
      user_id: userId,
      message_key: messageKey,
      ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
      ...(typeof candidate.timestamp === 'string' ? { timestamp: candidate.timestamp } : {}),
    };
  }

  if (type === 'progress') {
    if (typeof candidate.text !== 'string' || !candidate.text) return null;
    return {
      type: 'progress',
      user_id: userId,
      message_key: messageKey,
      text: candidate.text,
      ...(typeof candidate.chat_id === 'string' ? { chat_id: candidate.chat_id } : {}),
      ...(typeof candidate.thread_id === 'string' ? { thread_id: candidate.thread_id } : {}),
      ...(typeof candidate.timestamp === 'string' ? { timestamp: candidate.timestamp } : {}),
    };
  }

  return null;
}
