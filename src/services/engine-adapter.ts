import { EngineClient, type EngineMessageContext, type ChatResponse } from './engine-client.js';

export interface FinalReplyRequest {
  userId: string;
  message: string;
  context?: EngineMessageContext | undefined;
  progressCallbackUrl?: string | undefined;
  progressThrottleSeconds?: number | undefined;
}

export class EngineGateway {
  constructor(private readonly client: EngineClient) {}

  async requestFinalReply(request: FinalReplyRequest): Promise<ChatResponse> {
    return this.client.sendTextMessage(
      request.userId,
      request.message,
      request.context ?? {},
      request.progressCallbackUrl,
      request.progressThrottleSeconds
    );
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
