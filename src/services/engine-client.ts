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
  client_id: 'telegram-gateway';
  user_id: string;
  message_type: 'text';
  message: string;
  chat_type?: 'private' | 'group' | 'supergroup';
  chat_id?: string;
  speaker?: string;
  thread_id?: string;
  response_language_hint?: string;
  org?: string;
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
    private readonly org: string | undefined = config.engineOrg,
    timeoutMs: number = config.engineTimeoutMs
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
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
    const startedAt = Date.now();
    const context = typeof contextOrProgressCallbackUrl === 'string' || contextOrProgressCallbackUrl === undefined
      ? {}
      : contextOrProgressCallbackUrl;
    void progressCallbackUrlOrThrottleSeconds;
    void progressThrottleSeconds;

    const payload: EngineChatRequest = {
      client_id: 'telegram-gateway',
      user_id: userId,
      message_type: 'text',
      message,
      ...(context.chatType ? { chat_type: context.chatType } : {}),
      ...(context.chatId ? { chat_id: context.chatId } : {}),
      ...(context.speaker ? { speaker: context.speaker } : {}),
      ...(context.threadId ? { thread_id: context.threadId } : {}),
      ...(context.responseLanguageHint ? { response_language_hint: context.responseLanguageHint } : {}),
      ...(this.org ? { org: this.org } : {}),
    };

    console.info('Engine sendTextMessage start', {
      userId,
      chatType: context.chatType ?? 'private',
      chatId: context.chatId,
      threadId: context.threadId,
      speaker: context.speaker,
      responseLanguageHint: context.responseLanguageHint,
      org: this.org,
      messageLength: message.length,
      timeoutMs: config.engineTimeoutMs,
    });

    try {
      const response = await this.http.post<EngineChatApiResponse>('/api/v1/chat', payload);
      console.info('Engine chat response received', {
        userId,
        durationMs: Date.now() - startedAt,
        responseKeys: summarizeResponseKeys(response.data),
      });
      return this.mapChatResponse(response.data);
    } catch (error) {
      const retryDelay = this.getRetryDelayMs(error);
      if (retryDelay !== null) {
        console.info('Engine sendTextMessage retry scheduled', {
          userId,
          retryDelayMs: retryDelay,
          durationMs: Date.now() - startedAt,
        });
        await this.sleep(retryDelay);
        const response = await this.http.post<EngineChatApiResponse>('/api/v1/chat', payload);
        console.info('Engine chat response received after retry', {
          userId,
          durationMs: Date.now() - startedAt,
          responseKeys: summarizeResponseKeys(response.data),
        });
        return this.mapChatResponse(response.data);
      }

      this.logHttpError({ operation: 'sendTextMessage', path: '/api/v1/chat', userId }, error);
      throw error;
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const path = this.preferencesPath(userId);
    const startedAt = Date.now();
    console.info('Engine getUserPreferences start', {
      userId,
      path,
      org: this.org,
      timeoutMs: config.engineTimeoutMs,
    });
    try {
      const response = await this.http.get<EnginePreferencesApiResponse>(path);
      console.info('Engine getUserPreferences success', {
        userId,
        path,
        durationMs: Date.now() - startedAt,
        preferenceKeys: summarizeResponseKeys(response.data),
      });
      return this.mapPreferencesResponse(response.data);
    } catch (error) {
      if (this.isNotFound(error)) {
        console.info('Engine getUserPreferences not found', {
          userId,
          path,
          durationMs: Date.now() - startedAt,
        });
        return {};
      }

      this.logHttpError({ operation: 'getUserPreferences', path, userId }, error);
      throw error;
    }
  }

  async updateUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    const path = this.preferencesPath(userId);
    const startedAt = Date.now();
    console.info('Engine updateUserPreferences start', {
      userId,
      path,
      org: this.org,
      timeoutMs: config.engineTimeoutMs,
      preferenceKeys: Object.keys(preferences ?? {}),
    });
    try {
      const response = await this.http.put<EnginePreferencesApiResponse>(path, {
        preferences,
        ...(this.org ? { org: this.org } : {}),
      });
      console.info('Engine updateUserPreferences success', {
        userId,
        path,
        durationMs: Date.now() - startedAt,
        preferenceKeys: summarizeResponseKeys(response.data),
      });
      return this.mapPreferencesResponse(response.data);
    } catch (error) {
      this.logHttpError({ operation: 'updateUserPreferences', path, userId }, error);
      throw error;
    }
  }

  async resetConversation(userId: string, options: ResetConversationOptions): Promise<void> {
    const path = this.resetPath(userId, options);
    const startedAt = Date.now();
    console.info('Engine resetConversation start', {
      userId,
      path,
      org: this.org,
      chatType: options.chatType,
      chatId: options.chatId,
      threadId: options.threadId,
      timeoutMs: config.engineTimeoutMs,
    });
    try {
      const response = await this.http.delete(path, {
        data: {
          ...(this.org ? { org: this.org } : {}),
        },
      });
      console.info('Engine resetConversation success', {
        userId,
        path,
        durationMs: Date.now() - startedAt,
        responseKeys: summarizeResponseKeys(response.data),
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

  private mapChatResponse(data: unknown): ChatResponse {
    const message = this.extractMessage(data);

    if (Array.isArray(data)) {
      return {
        message,
        raw_response: data,
      };
    }

    if (!data || typeof data !== 'object') {
      return {
        message,
        raw_response: data,
      };
    }

    const responseData = data as EngineChatApiResponse;
    return {
        message,
      ...responseData,
    };
  }

  private extractMessage(data: unknown): string {
    if (!data) {
      return '';
    }

    if (Array.isArray(data)) {
      return this.extractResponsesText(data);
    }

    if (typeof data !== 'object') {
      return typeof data === 'string' ? data.trim() : '';
    }

    const responseData = data as EngineChatApiResponse;
    const responseText = this.extractResponsesText(responseData.responses);
    if (responseText) {
      return responseText;
    }

    const directMessage =
      responseData.response ??
      responseData.message ??
      responseData.text ??
      responseData.reply ??
      responseData.output ??
      responseData.result;

    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage;
    }

    if (responseData.data && typeof responseData.data === 'object') {
      return this.extractMessage(responseData.data);
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
        data: summarizeResponseData(axiosError.response?.data),
        message: axiosError.message,
        code: axiosError.code,
        timeoutMs: axiosError.config?.timeout,
        url: axiosError.config?.url,
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

function summarizeResponseKeys(data: unknown): string[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  if (Array.isArray(data)) {
    return data.length > 0 && data[0] && typeof data[0] === 'object'
      ? Object.keys(data[0] as Record<string, unknown>)
      : [];
  }

  return Object.keys(data as Record<string, unknown>);
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
