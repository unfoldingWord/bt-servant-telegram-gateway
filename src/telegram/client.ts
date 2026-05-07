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

export class TelegramClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(botToken: string, timeoutMs: number, baseUrl?: string) {
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
