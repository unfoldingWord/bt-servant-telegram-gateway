import axios, { AxiosError, type AxiosInstance } from 'axios';

import { config } from '../config/index.js';

type TelegramParseMode = 'Markdown' | 'MarkdownV2' | 'HTML';
type TelegramChatAction = 'typing' | 'upload_photo' | 'record_video' | 'upload_video' | 'record_voice' | 'upload_voice' | 'upload_document' | 'find_location' | 'record_video_note' | 'upload_video_note';

interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
}

interface TelegramSendMessageResult {
  message_id: number;
}

interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
}

export class TelegramClient {
  private readonly http: AxiosInstance;

  constructor(botToken: string = config.telegramBotToken, baseUrl: string = `https://api.telegram.org/bot${botToken}`) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: config.telegramTimeoutMs,
    });
  }

  async sendTextMessage(
    chatId: string,
    text: string,
    parseMode?: TelegramParseMode,
    messageThreadId?: string
  ): Promise<boolean> {
    const startedAt = Date.now();
    const payload = {
      chatId,
      threadId: messageThreadId,
      parseMode,
      textLength: text.length,
      textPreview: previewText(text),
      timeoutMs: config.telegramTimeoutMs,
    };
    console.info('Telegram sendTextMessage start', payload);
    try {
      const response = await this.http.post<TelegramApiResponse<TelegramSendMessageResult>>('/sendMessage', {
        chat_id: chatId,
        text,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(messageThreadId ? { message_thread_id: Number.parseInt(messageThreadId, 10) } : {}),
      });
      console.info('Telegram sendTextMessage success', {
        ...payload,
        durationMs: Date.now() - startedAt,
        responseKeys: Object.keys(response.data ?? {}),
        resultKeys: summarizeObjectKeys(response.data?.result),
        ok: response.data?.ok,
      });
      return true;
    } catch (error) {
      this.logHttpError('sendTextMessage', error, {
        chatId,
        threadId: messageThreadId ?? '',
        parseMode: parseMode ?? '',
        textLength: String(text.length),
        textPreview: previewText(text),
        timeoutMs: String(config.telegramTimeoutMs),
        durationMs: String(Date.now() - startedAt),
      });
      return false;
    }
  }

  async sendChatAction(
    chatId: string,
    action: TelegramChatAction,
    messageThreadId?: string
  ): Promise<boolean> {
    const startedAt = Date.now();
    const payload = {
      chatId,
      threadId: messageThreadId,
      action,
      timeoutMs: config.telegramTimeoutMs,
    };
    console.info('Telegram sendChatAction start', payload);
    try {
      const response = await this.http.post<TelegramApiResponse<boolean>>('/sendChatAction', {
        chat_id: chatId,
        action,
        ...(messageThreadId ? { message_thread_id: Number.parseInt(messageThreadId, 10) } : {}),
      });
      console.info('Telegram sendChatAction success', {
        ...payload,
        durationMs: Date.now() - startedAt,
        responseKeys: Object.keys(response.data ?? {}),
        ok: response.data?.ok,
      });
      return true;
    } catch (error) {
      this.logHttpError('sendChatAction', error, {
        chatId,
        threadId: messageThreadId ?? '',
        action,
        timeoutMs: String(config.telegramTimeoutMs),
        durationMs: String(Date.now() - startedAt),
      });
      return false;
    }
  }

  async setWebhook(url: string, secretToken: string = config.webhookSecretToken || ''): Promise<boolean> {
    const startedAt = Date.now();
    const payload = {
      url,
      hasSecretToken: Boolean(secretToken),
    };
    console.info('Telegram setWebhook start', payload);
    try {
      const response = await this.http.post<TelegramApiResponse<TelegramWebhookInfo>>('/setWebhook', {
        url,
        ...(secretToken ? { secret_token: secretToken } : {}),
      });
      console.info('Telegram setWebhook success', {
        ...payload,
        durationMs: Date.now() - startedAt,
        responseKeys: Object.keys(response.data ?? {}),
        ok: response.data?.ok,
        resultKeys: response.data && typeof response.data === 'object' ? Object.keys(response.data.result ?? {}) : [],
      });
      return true;
    } catch (error) {
      this.logHttpError('setWebhook', error, {
        url,
        hasSecretToken: String(Boolean(secretToken)),
        durationMs: String(Date.now() - startedAt),
      });
      return false;
    }
  }

  private logHttpError(operation: string, error: unknown, context: Record<string, string>): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const data = summarizeResponseData(axiosError.response?.data);
      console.error(`Telegram ${operation} failed`, {
        ...context,
        status,
        data,
        message: axiosError.message,
        code: axiosError.code,
        configTimeout: axiosError.config?.timeout,
        url: axiosError.config?.url,
      });
      return;
    }

    console.error(`Telegram ${operation} failed`, {
      ...context,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function previewText(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function summarizeResponseData(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return {
      type: 'array',
      length: data.length,
      firstKeys: data[0] && typeof data[0] === 'object' ? Object.keys(data[0] as Record<string, unknown>) : [],
    };
  }

  return {
    keys: Object.keys(data as Record<string, unknown>),
  };
}

function summarizeObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.keys(value as Record<string, unknown>);
}
