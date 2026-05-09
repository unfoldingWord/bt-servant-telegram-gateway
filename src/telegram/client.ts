type TelegramParseMode = 'Markdown' | 'MarkdownV2' | 'HTML';
type TelegramChatAction =
  | 'typing'
  | 'upload_photo'
  | 'record_video'
  | 'upload_video'
  | 'record_voice'
  | 'upload_voice'
  | 'upload_document'
  | 'find_location'
  | 'record_video_note'
  | 'upload_video_note';

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export class TelegramClient {
  private readonly botToken: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(botToken: string, timeoutMs: number, baseUrl?: string) {
    this.botToken = botToken;
    this.baseUrl = baseUrl ?? `https://api.telegram.org/bot${botToken}`;
    this.timeoutMs = timeoutMs;
  }

  async sendTextMessage(
    chatId: string,
    text: string,
    parseMode?: TelegramParseMode,
    messageThreadId?: string
  ): Promise<boolean> {
    return this.post('sendTextMessage', '/sendMessage', {
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(messageThreadId ? { message_thread_id: Number.parseInt(messageThreadId, 10) } : {}),
    });
  }

  async sendChatAction(
    chatId: string,
    action: TelegramChatAction,
    messageThreadId?: string
  ): Promise<boolean> {
    return this.post('sendChatAction', '/sendChatAction', {
      chat_id: chatId,
      action,
      ...(messageThreadId ? { message_thread_id: Number.parseInt(messageThreadId, 10) } : {}),
    });
  }

  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    return this.post('setWebhook', '/setWebhook', {
      url,
      ...(secretToken ? { secret_token: secretToken } : {}),
    });
  }

  async getFile(fileId: string): Promise<TelegramFile | null> {
    const startedAt = Date.now();
    console.info('Telegram getFile start', { fileId, timeoutMs: this.timeoutMs });
    try {
      const response = await fetch(`${this.baseUrl}/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const data = (await response.json()) as { ok?: boolean; result?: TelegramFile };
      if (!data.ok || !data.result?.file_path) {
        console.error('Telegram getFile returned no file_path', { fileId });
        return null;
      }
      console.info('Telegram getFile success', {
        fileId,
        filePath: data.result.file_path,
        durationMs: Date.now() - startedAt,
      });
      return data.result;
    } catch (error) {
      console.error('Telegram getFile failed', {
        fileId,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  async downloadFile(filePath: string): Promise<Uint8Array | null> {
    const url = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    const startedAt = Date.now();
    console.info('Telegram downloadFile start', { filePath, timeoutMs: this.timeoutMs });
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        console.error('Telegram downloadFile HTTP error', {
          filePath,
          status: response.status,
        });
        return null;
      }
      const buffer = await response.arrayBuffer();
      console.info('Telegram downloadFile success', {
        filePath,
        sizeBytes: buffer.byteLength,
        durationMs: Date.now() - startedAt,
      });
      return new Uint8Array(buffer);
    } catch (error) {
      console.error('Telegram downloadFile failed', {
        filePath,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  async sendVoice(
    chatId: string,
    audioData: Uint8Array,
    options?: {
      caption?: string | undefined;
      parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | undefined;
      messageThreadId?: string | undefined;
    }
  ): Promise<boolean> {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('voice', new Blob([audioData], { type: 'audio/ogg' }), 'voice.ogg');
    if (options?.caption) formData.append('caption', options.caption);
    if (options?.parseMode) formData.append('parse_mode', options.parseMode);
    if (options?.messageThreadId) formData.append('message_thread_id', options.messageThreadId);
    return this.postFormData('sendVoice', '/sendVoice', formData);
  }

  private async post(
    operation: string,
    path: string,
    body: Record<string, unknown>
  ): Promise<boolean> {
    const startedAt = Date.now();
    console.info(`Telegram ${operation} start`, {
      timeoutMs: this.timeoutMs,
      ...summarizeBody(body),
    });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const data = (await response.json()) as { ok?: boolean };
      console.info(`Telegram ${operation} success`, {
        durationMs: Date.now() - startedAt,
        status: response.status,
        ok: data.ok,
      });
      return response.ok;
    } catch (error) {
      console.error(`Telegram ${operation} failed`, {
        ...summarizeBody(body),
        timeoutMs: this.timeoutMs,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown error',
        isTimeout: error instanceof Error && error.name === 'TimeoutError',
      });
      return false;
    }
  }

  private async postFormData(
    operation: string,
    path: string,
    formData: FormData
  ): Promise<boolean> {
    const startedAt = Date.now();
    console.info(`Telegram ${operation} start`, { timeoutMs: this.timeoutMs });
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const data = (await response.json()) as { ok?: boolean };
      console.info(`Telegram ${operation} success`, {
        durationMs: Date.now() - startedAt,
        status: response.status,
        ok: data.ok,
      });
      return response.ok;
    } catch (error) {
      console.error(`Telegram ${operation} failed`, {
        timeoutMs: this.timeoutMs,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown error',
        isTimeout: error instanceof Error && error.name === 'TimeoutError',
      });
      return false;
    }
  }
}

function summarizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (body.chat_id) summary.chatId = body.chat_id;
  if (body.action) summary.action = body.action;
  if (body.url) summary.url = body.url;
  if (body.message_thread_id) summary.threadId = String(body.message_thread_id);
  if (body.parse_mode) summary.parseMode = body.parse_mode;
  if (typeof body.text === 'string') summary.textLength = body.text.length;
  if (body.secret_token) summary.hasSecretToken = true;
  return summary;
}
