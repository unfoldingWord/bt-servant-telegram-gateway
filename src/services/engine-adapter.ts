import { EngineClient, type EngineMessageContext, type ChatResponse } from './engine-client.js';

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
}
