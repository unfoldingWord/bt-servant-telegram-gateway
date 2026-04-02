import axios, { AxiosError, type AxiosInstance } from 'axios';

import { config } from '../config/index.js';

export interface ChatResponse {
  message: string;
  message_key?: string;
  [key: string]: unknown;
}

export interface UserPreferences {
  [key: string]: unknown;
}

export interface ResetConversationOptions {
  chatType: 'private' | 'group' | 'supergroup';
  chatId?: string;
  threadId?: string;
}

export interface EngineChatRequest {
  client_id: 'telegram';
  user_id: string;
  message: string;
  message_key: string;
  chat_type?: 'private' | 'group' | 'supergroup';
  chat_id?: string;
  speaker?: string;
  thread_id?: string;
  response_language_hint?: string;
  progress_mode?: 'initially_allow';
  progress_throttle_seconds?: number;
  org?: string;
  progress_callback_url?: string;
}

export interface EngineMessageContext {
  chatType?: 'private' | 'group' | 'supergroup';
  chatId?: string;
  speaker?: string;
  threadId?: string;
  responseLanguageHint?: string;
}

interface EngineChatApiResponse {
  response?: string;
  message?: string;
  text?: string;
  reply?: string;
  output?: string;
  result?: string;
  responses?: unknown;
  message_key?: string;
  data?: EngineChatApiResponse;
  [key: string]: unknown;
}

interface EnginePreferencesApiResponse {
  prefs?: UserPreferences;
  preferences?: UserPreferences;
  [key: string]: unknown;
}

interface RequestContext {
  operation: string;
  path: string;
  userId?: string;
}

export class EngineClient {
  private readonly http: AxiosInstance;

  constructor(
    baseUrl: string = config.engineBaseUrl,
    apiKey: string = config.engineApiKey,
    private readonly org: string | undefined = config.engineOrg
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 120000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  async sendTextMessage(
    userId: string,
    message: string,
    progressCallbackUrl?: string,
    progressThrottleSeconds?: number
  ): Promise<ChatResponse>;
  async sendTextMessage(
    userId: string,
    message: string,
    context: EngineMessageContext,
    progressCallbackUrl?: string,
    progressThrottleSeconds?: number
  ): Promise<ChatResponse>;
  async sendTextMessage(
    userId: string,
    message: string,
    contextOrProgressCallbackUrl?: string | EngineMessageContext,
    progressCallbackUrlOrThrottleSeconds?: string | number,
    progressThrottleSeconds: number = config.progressThrottleSeconds
  ): Promise<ChatResponse> {
    const context = typeof contextOrProgressCallbackUrl === 'string' || contextOrProgressCallbackUrl === undefined
      ? {}
      : contextOrProgressCallbackUrl;
    const progressCallbackUrl =
      typeof contextOrProgressCallbackUrl === 'string'
        ? contextOrProgressCallbackUrl
        : typeof progressCallbackUrlOrThrottleSeconds === 'string'
          ? progressCallbackUrlOrThrottleSeconds
          : undefined;
    const resolvedThrottleSeconds =
      typeof progressCallbackUrlOrThrottleSeconds === 'number'
        ? progressCallbackUrlOrThrottleSeconds
        : progressThrottleSeconds;

    const messageKey = this.buildMessageKey(userId, message);
    const payload: EngineChatRequest = {
      client_id: 'telegram',
      user_id: userId,
      message,
      message_key: messageKey,
      ...(context.chatType ? { chat_type: context.chatType } : {}),
      ...(context.chatId ? { chat_id: context.chatId } : {}),
      ...(context.speaker ? { speaker: context.speaker } : {}),
      ...(context.threadId ? { thread_id: context.threadId } : {}),
      ...(context.responseLanguageHint ? { response_language_hint: context.responseLanguageHint } : {}),
      progress_mode: 'initially_allow',
      progress_throttle_seconds: resolvedThrottleSeconds,
      ...(this.org ? { org: this.org } : {}),
      ...(progressCallbackUrl ? { progress_callback_url: progressCallbackUrl } : {}),
    };

    try {
      const response = await this.http.post<EngineChatApiResponse>('/api/v1/chat', payload);
      console.info('Engine chat response received', {
        userId,
        messageKey,
        keys: Object.keys(response.data ?? {}),
      });
      return this.mapChatResponse(response.data, messageKey);
    } catch (error) {
      const retryDelay = this.getRetryDelayMs(error);
      if (retryDelay !== null) {
        await this.sleep(retryDelay);
        const response = await this.http.post<EngineChatApiResponse>('/api/v1/chat', payload);
        console.info('Engine chat response received after retry', {
          userId,
          messageKey,
          keys: Object.keys(response.data ?? {}),
        });
        return this.mapChatResponse(response.data, messageKey);
      }

      this.logHttpError({ operation: 'sendTextMessage', path: '/api/v1/chat', userId }, error);
      throw error;
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const path = this.preferencesPath(userId);
    try {
      const response = await this.http.get<EnginePreferencesApiResponse>(path);
      return this.mapPreferencesResponse(response.data);
    } catch (error) {
      if (this.isNotFound(error)) {
        return {};
      }

      this.logHttpError({ operation: 'getUserPreferences', path, userId }, error);
      throw error;
    }
  }

  async updateUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    const path = this.preferencesPath(userId);
    try {
      const response = await this.http.put<EnginePreferencesApiResponse>(path, {
        preferences,
        ...(this.org ? { org: this.org } : {}),
      });
      return this.mapPreferencesResponse(response.data);
    } catch (error) {
      this.logHttpError({ operation: 'updateUserPreferences', path, userId }, error);
      throw error;
    }
  }

  async resetConversation(userId: string, options: ResetConversationOptions): Promise<void> {
    const path = this.resetPath(userId, options);
    try {
      await this.http.delete(path, {
        data: {
          ...(this.org ? { org: this.org } : {}),
        },
      });
    } catch (error) {
      this.logHttpError({ operation: 'resetConversation', path, userId }, error);
      throw error;
    }
  }

  private preferencesPath(userId: string): string {
    return `/api/v1/orgs/${encodeURIComponent(this.org ?? 'DEFAULT_ORG')}/users/${encodeURIComponent(userId)}/preferences`;
  }

  private resetPath(userId: string, options: ResetConversationOptions): string {
    const org = encodeURIComponent(this.org ?? 'DEFAULT_ORG');
    if (options.chatType === 'private') {
      return `/api/v1/orgs/${org}/users/${encodeURIComponent(userId)}/history`;
    }

    const chatId = encodeURIComponent(options.chatId ?? userId);
    if (options.threadId && options.threadId.trim()) {
      return `/api/v1/admin/orgs/${org}/groups/${chatId}/threads/${encodeURIComponent(options.threadId)}/history`;
    }

    return `/api/v1/admin/orgs/${org}/groups/${chatId}/history`;
  }

  private mapChatResponse(data: EngineChatApiResponse, messageKey: string): ChatResponse {
    const message = this.extractMessage(data);
    return {
      message,
      message_key: String(data.message_key ?? messageKey),
      ...data,
    };
  }

  private extractMessage(data: EngineChatApiResponse | undefined): string {
    if (!data) {
      return '';
    }

    const responseText = this.extractResponsesText(data.responses);
    if (responseText) {
      return responseText;
    }

    const directMessage =
      data.response ??
      data.message ??
      data.text ??
      data.reply ??
      data.output ??
      data.result;

    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage;
    }

    if (data.data && typeof data.data === 'object') {
      return this.extractMessage(data.data);
    }

    return '';
  }

  private extractResponsesText(responses: unknown): string {
    if (typeof responses === 'string') {
      return responses.trim();
    }

    if (!Array.isArray(responses)) {
      return '';
    }

    const parts = responses
      .flatMap((item) => this.extractResponseItemText(item))
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    return parts.join('\n').trim();
  }

  private extractResponseItemText(item: unknown): string[] {
    if (typeof item === 'string') {
      return [item];
    }

    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const values: string[] = [];

    for (const key of ['text', 'message', 'response', 'output', 'result']) {
      const value = candidate[key];
      if (typeof value === 'string' && value.trim()) {
        values.push(value);
      }
    }

    if (values.length > 0) {
      return values;
    }

    for (const key of ['responses', 'data']) {
      const value = candidate[key];
      const nested = this.extractResponsesText(value);
      if (nested) {
        return [nested];
      }
    }

    return [];
  }

  private mapPreferencesResponse(data: EnginePreferencesApiResponse): UserPreferences {
    return data.prefs ?? data.preferences ?? {};
  }

  private buildMessageKey(userId: string, message: string): string {
    const timestamp = Date.now().toString(36);
    const hash = Buffer.from(`${userId}:${message}`).toString('base64url').slice(0, 12);
    return `telegram:${timestamp}:${hash}`;
  }

  private getRetryDelayMs(error: unknown): number | null {
    if (!axios.isAxiosError(error)) {
      return null;
    }

    const status = error.response?.status;
    const payload = error.response?.data as { retry_after_ms?: number; retry_after?: number } | undefined;
    if (status !== 429) {
      return null;
    }

    if (typeof payload?.retry_after_ms === 'number') {
      return payload.retry_after_ms;
    }

    if (typeof payload?.retry_after === 'number') {
      return payload.retry_after * 1000;
    }

    const headers = error.response?.headers as Record<string, string | number | string[]> | undefined;
    const retryAfterHeader = headers?.['retry-after'];
    if (typeof retryAfterHeader === 'string') {
      const seconds = Number.parseFloat(retryAfterHeader);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
    }

    return 1000;
  }

  private isNotFound(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 404;
  }

  private logHttpError(context: RequestContext, error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(`Engine ${context.operation} failed`, {
        path: context.path,
        userId: context.userId,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });
      return;
    }

    console.error(`Engine ${context.operation} failed`, {
      path: context.path,
      userId: context.userId,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
