import {
  EngineClient,
  type EngineMessageContext,
  type ChatResponse,
  type AsyncChatAck,
  type ModeScope,
  type ModeSummary,
} from './engine-client.js';

export interface FinalReplyRequest {
  userId: string;
  message: string;
  context?: EngineMessageContext | undefined;
}

export interface AudioReplyRequest {
  userId: string;
  audioBase64: string;
  audioFormat: string;
  captionText?: string | undefined;
  context?: EngineMessageContext | undefined;
}

export interface AsyncFinalReplyRequest extends FinalReplyRequest {
  messageKey: string;
  progressCallbackUrl: string;
}

export interface AsyncAudioReplyRequest extends AudioReplyRequest {
  messageKey: string;
  progressCallbackUrl: string;
}

export class EngineGateway {
  constructor(private readonly client: EngineClient) {}

  async requestFinalReply(request: FinalReplyRequest): Promise<ChatResponse> {
    return this.client.sendTextMessage(request.userId, request.message, request.context ?? {});
  }

  async requestAudioReply(request: AudioReplyRequest): Promise<ChatResponse> {
    return this.client.sendAudioMessage(
      request.userId,
      request.audioBase64,
      request.audioFormat,
      request.captionText,
      request.context ?? {}
    );
  }

  async requestFinalReplyAsync(request: AsyncFinalReplyRequest): Promise<AsyncChatAck> {
    return this.client.sendTextMessageAsync(
      request.userId,
      request.message,
      request.messageKey,
      request.progressCallbackUrl,
      request.context ?? {}
    );
  }

  async requestAudioReplyAsync(request: AsyncAudioReplyRequest): Promise<AsyncChatAck> {
    return this.client.sendAudioMessageAsync(
      request.userId,
      request.audioBase64,
      request.audioFormat,
      request.messageKey,
      request.progressCallbackUrl,
      request.captionText,
      request.context ?? {}
    );
  }

  async downloadVoiceAudio(url: string): Promise<Uint8Array | null> {
    return this.client.downloadAudio(url);
  }

  async resetConversation(
    userId: string,
    chatType: 'private' | 'group' | 'supergroup',
    chatId?: string,
    threadId?: string
  ): Promise<void> {
    await this.client.resetConversation(userId, {
      chatType,
      chatId,
      threadId,
    });
  }

  async listModes(): Promise<ModeSummary[]> {
    return this.client.listModes();
  }

  async setMode(scope: ModeScope, name: string): Promise<void> {
    await this.client.setMode(scope, name);
  }

  async clearMode(scope: ModeScope): Promise<void> {
    await this.client.clearMode(scope);
  }
}
