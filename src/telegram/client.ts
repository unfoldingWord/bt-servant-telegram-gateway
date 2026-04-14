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
    try {
      await this.http.post<TelegramApiResponse<TelegramSendMessageResult>>('/sendMessage', {
        chat_id: chatId,
        text,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(messageThreadId ? { message_thread_id: Number.parseInt(messageThreadId, 10) } : {}),
      });
      return true;
    } catch (error) {
      this.logHttpError('sendTextMessage', error, { chatId });
      return false;
    }
  }

  async sendChatAction(
    chatId: string,
    action: TelegramChatAction,
    messageThreadId?: string
  ): Promise<boolean> {
    try {
      await this.http.post<TelegramApiResponse<boolean>>('/sendChatAction', {
        chat_id: chatId,
        action,
        ...(messageThreadId ? { message_thread_id: Number.parseInt(messageThreadId, 10) } : {}),
      });
      return true;
    } catch (error) {
      this.logHttpError('sendChatAction', error, { chatId, action });
      return false;
    }
  }

  async setWebhook(url: string, secretToken: string = config.webhookSecretToken || ''): Promise<boolean> {
    try {
      await this.http.post<TelegramApiResponse<TelegramWebhookInfo>>('/setWebhook', {
        url,
        ...(secretToken ? { secret_token: secretToken } : {}),
      });
      return true;
    } catch (error) {
      this.logHttpError('setWebhook', error, { url });
      return false;
    }
  }

  private logHttpError(operation: string, error: unknown, context: Record<string, string>): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      console.error(`Telegram ${operation} failed`, {
        ...context,
        status,
        data,
        message: axiosError.message,
      });
      return;
    }

    console.error(`Telegram ${operation} failed`, {
      ...context,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
