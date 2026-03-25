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

export interface EngineChatRequest {
  client_id: 'telegram';
  user_id: string;
  message: string;
  message_key: string;
  progress_mode?: 'initially_allow';
  progress_throttle_seconds?: number;
  org?: string;
  progress_callback_url?: string;
}

interface EngineChatApiResponse {
  response?: string;
  message?: string;
  message_key?: string;
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
    progressThrottleSeconds: number = config.progressThrottleSeconds
  ): Promise<ChatResponse> {
    const messageKey = this.buildMessageKey(userId, message);
    const payload: EngineChatRequest = {
      client_id: 'telegram',
      user_id: userId,
      message,
      message_key: messageKey,
      progress_mode: 'initially_allow',
      progress_throttle_seconds: progressThrottleSeconds,
      ...(this.org ? { org: this.org } : {}),
      ...(progressCallbackUrl ? { progress_callback_url: progressCallbackUrl } : {}),
    };

    try {
      const response = await this.http.post<EngineChatApiResponse>('/api/v1/chat', payload);
      return this.mapChatResponse(response.data, messageKey);
    } catch (error) {
      const retryDelay = this.getRetryDelayMs(error);
      if (retryDelay !== null) {
        await this.sleep(retryDelay);
        const response = await this.http.post<EngineChatApiResponse>('/api/v1/chat', payload);
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

  private preferencesPath(userId: string): string {
    return `/api/v1/orgs/${encodeURIComponent(this.org ?? 'DEFAULT_ORG')}/users/${encodeURIComponent(userId)}/preferences`;
  }

  private mapChatResponse(data: EngineChatApiResponse, messageKey: string): ChatResponse {
    return {
      message: String(data.response ?? data.message ?? ''),
      message_key: String(data.message_key ?? messageKey),
      ...data,
    };
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
