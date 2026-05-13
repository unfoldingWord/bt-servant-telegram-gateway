export interface ChatResponse {
  message: string;
  message_key?: string;
  voice_audio_url?: string;
  [key: string]: unknown;
}

export interface UserPreferences {
  [key: string]: unknown;
}

export interface ResetConversationOptions {
  chatType: 'private' | 'group' | 'supergroup';
  chatId?: string | undefined;
  threadId?: string | undefined;
}

export interface ModeSummary {
  name: string;
  label?: string;
  description?: string;
  published?: boolean;
}

export type ModeScope = { kind: 'user'; userId: string } | { kind: 'group'; chatId: string };

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
  addressed_to_bot?: boolean;
  org?: string;
}

export interface EngineAudioRequest {
  client_id: 'telegram-gateway';
  user_id: string;
  message_type: 'audio';
  audio_base64: string;
  audio_format: string;
  message?: string;
  chat_type?: 'private' | 'group' | 'supergroup';
  chat_id?: string;
  speaker?: string;
  thread_id?: string;
  response_language_hint?: string;
  addressed_to_bot?: boolean;
  org?: string;
}

export interface EngineMessageContext {
  chatType?: 'private' | 'group' | 'supergroup' | undefined;
  chatId?: string | undefined;
  speaker?: string | undefined;
  threadId?: string | undefined;
  responseLanguageHint?: string | undefined;
  addressedToBot?: boolean | undefined;
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

export class EngineClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(
    baseUrl: string,
    apiKey: string,
    private readonly org: string | undefined,
    timeoutMs: number
  ) {
    this.baseUrl = baseUrl;
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    this.timeoutMs = timeoutMs;
  }

  async sendTextMessage(
    userId: string,
    message: string,
    context: EngineMessageContext = {}
  ): Promise<ChatResponse> {
    const payload: EngineChatRequest = {
      client_id: 'telegram-gateway',
      user_id: userId,
      message_type: 'text',
      message,
      ...this.buildContextFields(context),
    };

    console.info('Engine sendTextMessage start', {
      userId,
      ...this.logContext(context),
      messageLength: message.length,
    });

    return this.sendChatRequest(payload, userId);
  }

  async sendAudioMessage(
    userId: string,
    audioBase64: string,
    audioFormat: string,
    captionText?: string,
    context: EngineMessageContext = {}
  ): Promise<ChatResponse> {
    const payload: EngineAudioRequest = {
      client_id: 'telegram-gateway',
      user_id: userId,
      message_type: 'audio',
      audio_base64: audioBase64,
      audio_format: audioFormat,
      ...(captionText ? { message: captionText } : {}),
      ...this.buildContextFields(context),
    };

    console.info('Engine sendAudioMessage start', {
      userId,
      ...this.logContext(context),
      audioFormat,
      audioBase64Length: audioBase64.length,
    });

    return this.sendChatRequest(payload, userId);
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const path = this.preferencesPath(userId);
    const startedAt = Date.now();
    console.info('Engine getUserPreferences start', {
      userId,
      path,
      org: this.org,
      timeoutMs: this.timeoutMs,
    });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.status === 404) {
        console.info('Engine getUserPreferences not found', {
          userId,
          path,
          durationMs: Date.now() - startedAt,
        });
        return {};
      }

      if (!response.ok) {
        throw new Error(`Engine API error: ${response.status}`);
      }

      const data = (await response.json()) as EnginePreferencesApiResponse;
      console.info('Engine getUserPreferences success', {
        userId,
        path,
        durationMs: Date.now() - startedAt,
        preferenceKeys: summarizeResponseKeys(data),
      });
      return this.mapPreferencesResponse(data);
    } catch (error) {
      this.logError('getUserPreferences', path, userId, error);
      throw error;
    }
  }

  async updateUserPreferences(
    userId: string,
    preferences: UserPreferences
  ): Promise<UserPreferences> {
    const path = this.preferencesPath(userId);
    const startedAt = Date.now();
    console.info('Engine updateUserPreferences start', {
      userId,
      path,
      org: this.org,
      timeoutMs: this.timeoutMs,
      preferenceKeys: Object.keys(preferences ?? {}),
    });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({
          preferences,
          ...(this.org ? { org: this.org } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Engine API error: ${response.status}`);
      }

      const data = (await response.json()) as EnginePreferencesApiResponse;
      console.info('Engine updateUserPreferences success', {
        userId,
        path,
        durationMs: Date.now() - startedAt,
        preferenceKeys: summarizeResponseKeys(data),
      });
      return this.mapPreferencesResponse(data);
    } catch (error) {
      this.logError('updateUserPreferences', path, userId, error);
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
      timeoutMs: this.timeoutMs,
    });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: this.headers,
        body: JSON.stringify({ ...(this.org ? { org: this.org } : {}) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Engine API error: ${response.status}`);
      }

      const data = await response.json();
      console.info('Engine resetConversation success', {
        userId,
        path,
        durationMs: Date.now() - startedAt,
        responseKeys: summarizeResponseKeys(data),
      });
    } catch (error) {
      this.logError('resetConversation', path, userId, error);
      throw error;
    }
  }

  async listModes(): Promise<ModeSummary[]> {
    const path = this.modesPath();
    const startedAt = Date.now();
    console.info('Engine listModes start', { path, org: this.org, timeoutMs: this.timeoutMs });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Engine API error: ${response.status}`);
      }

      const data = (await response.json()) as { modes?: ModeSummary[] };
      const modes = Array.isArray(data.modes) ? data.modes : [];
      console.info('Engine listModes success', {
        path,
        durationMs: Date.now() - startedAt,
        modeCount: modes.length,
      });
      return modes;
    } catch (error) {
      this.logError('listModes', path, '-', error);
      throw error;
    }
  }

  async setMode(scope: ModeScope, name: string): Promise<void> {
    const path = this.modePath(scope);
    const identifier = scope.kind === 'user' ? scope.userId : scope.chatId;
    const startedAt = Date.now();
    console.info('Engine setMode start', {
      path,
      org: this.org,
      scope: scope.kind,
      timeoutMs: this.timeoutMs,
    });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({ mode: name }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Engine API error: ${response.status}`);
      }

      console.info('Engine setMode success', {
        path,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      this.logError('setMode', path, identifier, error);
      throw error;
    }
  }

  async clearMode(scope: ModeScope): Promise<void> {
    const path = this.modePath(scope);
    const identifier = scope.kind === 'user' ? scope.userId : scope.chatId;
    const startedAt = Date.now();
    console.info('Engine clearMode start', {
      path,
      org: this.org,
      scope: scope.kind,
      timeoutMs: this.timeoutMs,
    });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: this.headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Engine API error: ${response.status}`);
      }

      console.info('Engine clearMode success', {
        path,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      this.logError('clearMode', path, identifier, error);
      throw error;
    }
  }

  async downloadAudio(url: string): Promise<Uint8Array | null> {
    const resolvedUrl = this.resolveAudioUrl(url);
    if (!resolvedUrl) {
      console.error('Engine downloadAudio rejected: URL does not match engine origin', {
        url,
        engineBaseUrl: this.baseUrl,
      });
      return null;
    }

    const startedAt = Date.now();
    console.info('Engine downloadAudio start', { url: resolvedUrl, timeoutMs: this.timeoutMs });
    try {
      const response = await fetch(resolvedUrl, {
        headers: { Authorization: this.headers['Authorization'] ?? '' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        console.error('Engine downloadAudio HTTP error', { url, status: response.status });
        return null;
      }
      const buffer = await response.arrayBuffer();
      console.info('Engine downloadAudio success', {
        url,
        sizeBytes: buffer.byteLength,
        durationMs: Date.now() - startedAt,
      });
      return new Uint8Array(buffer);
    } catch (error) {
      console.error('Engine downloadAudio failed', {
        url,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private async sendChatRequest(
    payload: EngineChatRequest | EngineAudioRequest,
    userId: string
  ): Promise<ChatResponse> {
    const startedAt = Date.now();
    const path = '/api/v1/chat';
    const response = await this.fetchWithRetry(path, 'POST', payload, userId, startedAt);
    const data = (await response.json()) as EngineChatApiResponse;

    console.info('Engine chat response received', {
      userId,
      durationMs: Date.now() - startedAt,
      responseKeys: summarizeResponseKeys(data),
    });

    return this.mapChatResponse(data);
  }

  private buildContextFields(context: EngineMessageContext): Record<string, unknown> {
    return {
      ...(context.chatType ? { chat_type: context.chatType } : {}),
      ...(context.chatId ? { chat_id: context.chatId } : {}),
      ...(context.speaker ? { speaker: context.speaker } : {}),
      ...(context.threadId ? { thread_id: context.threadId } : {}),
      ...(context.responseLanguageHint
        ? { response_language_hint: context.responseLanguageHint }
        : {}),
      ...(context.addressedToBot !== undefined ? { addressed_to_bot: context.addressedToBot } : {}),
      ...(this.org ? { org: this.org } : {}),
    };
  }

  private logContext(context: EngineMessageContext): Record<string, unknown> {
    return {
      chatType: context.chatType ?? 'private',
      chatId: context.chatId,
      threadId: context.threadId,
      speaker: context.speaker,
      responseLanguageHint: context.responseLanguageHint,
      org: this.org,
      timeoutMs: this.timeoutMs,
    };
  }

  private async fetchWithRetry(
    path: string,
    method: string,
    payload: unknown,
    userId: string,
    startedAt: number
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 429) {
      const retryDelay = await this.getRetryDelayMs(response);
      console.info('Engine sendTextMessage retry scheduled', {
        userId,
        retryDelayMs: retryDelay,
        durationMs: Date.now() - startedAt,
      });
      await this.sleep(retryDelay);
      const retryResponse = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!retryResponse.ok) {
        throw new Error(`Engine API error after retry: ${retryResponse.status}`);
      }

      const retryData = (await retryResponse.json()) as EngineChatApiResponse;
      console.info('Engine chat response received after retry', {
        userId,
        durationMs: Date.now() - startedAt,
        responseKeys: summarizeResponseKeys(retryData),
      });
      return new Response(JSON.stringify(retryData), {
        status: retryResponse.status,
        headers: retryResponse.headers,
      });
    }

    if (!response.ok) {
      this.logError(
        'sendTextMessage',
        path,
        userId,
        new Error(`Engine API error: ${response.status}`)
      );
      throw new Error(`Engine API error: ${response.status}`);
    }

    return response;
  }

  private async getRetryDelayMs(response: Response): Promise<number> {
    try {
      const data = (await response.clone().json()) as {
        retry_after_ms?: number;
        retry_after?: number;
      };

      if (typeof data.retry_after_ms === 'number') {
        return data.retry_after_ms;
      }

      if (typeof data.retry_after === 'number') {
        return data.retry_after * 1000;
      }
    } catch {
      // body parse failed — fall through to header check
    }

    const retryAfterHeader = response.headers.get('retry-after');
    if (retryAfterHeader) {
      const seconds = Number.parseFloat(retryAfterHeader);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
    }

    return 1000;
  }

  /**
   * Resolve a voice audio URL to an absolute URL rooted at the engine origin.
   * Accepts relative paths (e.g. "/api/v1/audio/...") or absolute URLs that
   * match the configured engine baseUrl origin. Returns null if the URL
   * points to a different host — prevents leaking ENGINE_API_KEY.
   */
  private resolveAudioUrl(url: string): string | null {
    if (url.startsWith('/')) {
      return `${this.baseUrl}${url}`;
    }

    try {
      const parsed = new URL(url);
      const base = new URL(this.baseUrl);
      if (parsed.origin === base.origin) {
        return url;
      }
    } catch {
      // malformed URL
    }

    return null;
  }

  private preferencesPath(userId: string): string {
    const org = encodeURIComponent(this.org ?? 'DEFAULT_ORG');
    return `/api/v1/orgs/${org}/users/${encodeURIComponent(userId)}/preferences`;
  }

  private modesPath(): string {
    const org = encodeURIComponent(this.org ?? 'DEFAULT_ORG');
    return `/api/v1/admin/orgs/${org}/modes`;
  }

  private modePath(scope: ModeScope): string {
    const org = encodeURIComponent(this.org ?? 'DEFAULT_ORG');
    if (scope.kind === 'user') {
      return `/api/v1/admin/orgs/${org}/users/${encodeURIComponent(scope.userId)}/mode`;
    }
    return `/api/v1/admin/orgs/${org}/groups/${encodeURIComponent(scope.chatId)}/mode`;
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

    if (Array.isArray(data) || !data || typeof data !== 'object') {
      return { message, raw_response: data };
    }

    return { message, ...(data as EngineChatApiResponse) };
  }

  private extractMessage(data: unknown): string {
    if (!data) return '';
    if (Array.isArray(data)) return this.extractResponsesText(data);
    if (typeof data !== 'object') return typeof data === 'string' ? data.trim() : '';

    const d = data as EngineChatApiResponse;
    const fromResponses = this.extractResponsesText(d.responses);
    if (fromResponses) return fromResponses;

    const direct = d.response ?? d.message ?? d.text ?? d.reply ?? d.output ?? d.result;
    if (typeof direct === 'string' && direct.trim()) return direct;

    if (d.data && typeof d.data === 'object') return this.extractMessage(d.data);
    return '';
  }

  private extractResponsesText(responses: unknown): string {
    if (typeof responses === 'string') return responses.trim();
    if (!Array.isArray(responses)) return '';

    return responses
      .flatMap((item) => this.extractResponseItemText(item))
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join('\n')
      .trim();
  }

  private extractResponseItemText(item: unknown): string[] {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];

    const candidate = item as Record<string, unknown>;
    const values: string[] = [];

    for (const key of ['text', 'message', 'response', 'output', 'result']) {
      const value = candidate[key];
      if (typeof value === 'string' && value.trim()) values.push(value);
    }

    if (values.length > 0) return values;

    for (const key of ['responses', 'data']) {
      const value = candidate[key];
      const nested = this.extractResponsesText(value);
      if (nested) return [nested];
    }

    return [];
  }

  private mapPreferencesResponse(data: EnginePreferencesApiResponse): UserPreferences {
    return data.prefs ?? data.preferences ?? {};
  }

  private logError(operation: string, path: string, userId: string, error: unknown): void {
    console.error(`Engine ${operation} failed`, {
      path,
      userId,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function summarizeResponseKeys(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) {
    return data.length > 0 && data[0] && typeof data[0] === 'object'
      ? Object.keys(data[0] as Record<string, unknown>)
      : [];
  }
  return Object.keys(data as Record<string, unknown>);
}
