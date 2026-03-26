import { isMessageTooOld, isSupportedMessageType, type IncomingMessage } from '../core/models.js';
import { EngineClient } from './engine-client.js';
import { chunkMessage } from './chunking.js';
import { formatTelegramHtml } from './telegram-format.js';
import { TelegramClient } from '../telegram/client.js';

export interface MessageHandlerDependencies {
  telegramClient?: TelegramClient;
  engineClient?: EngineClient;
  progressThrottleSeconds?: number;
  fallbackMessage?: string;
}

export interface MessageHandlerResult {
  handled: boolean;
  reason?: 'unsupported_message' | 'too_old' | 'engine_error';
  sentChunks?: number;
}

const DEFAULT_FALLBACK_MESSAGE = 'Sorry, something went wrong. Please try again.';

export async function handleIncomingMessage(
  message: IncomingMessage,
  dependencies: MessageHandlerDependencies = {}
): Promise<MessageHandlerResult> {
  const telegramClient = dependencies.telegramClient ?? new TelegramClient();
  const engineClient = dependencies.engineClient ?? new EngineClient();
  const fallbackMessage = dependencies.fallbackMessage ?? DEFAULT_FALLBACK_MESSAGE;

  console.info('Handling incoming message', {
    userId: message.user_id,
    chatId: message.chat_id,
    messageId: message.message_id,
    messageType: message.message_type,
  });

  if (!isSupportedMessageType(message.message_type)) {
    console.info('Ignoring unsupported message type', {
      messageType: message.message_type,
    });
    return { handled: false, reason: 'unsupported_message' };
  }

  if (isMessageTooOld(message)) {
    console.info('Ignoring too old message', {
      messageId: message.message_id,
    });
    return { handled: false, reason: 'too_old' };
  }

  const typingSent = await telegramClient.sendChatAction(message.chat_id, 'typing');
  console.info('Typing indicator sent', {
    chatId: message.chat_id,
    typingSent,
  });

  try {
    const response = await engineClient.sendTextMessage(
      message.user_id,
      message.text,
      undefined,
      dependencies.progressThrottleSeconds
    );

    console.info('Engine response text', {
      userId: message.user_id,
      chatId: message.chat_id,
      text: previewText(response.message),
    });

    const chunks = chunkMessage(response.message);
    let sentChunks = 0;

    for (const chunk of chunks) {
      const renderedChunk = formatTelegramHtml(chunk);
      console.info('Sending telegram chunk', {
        userId: message.user_id,
        chatId: message.chat_id,
        text: previewText(chunk),
        html: previewText(renderedChunk),
      });

      const ok = await telegramClient.sendTextMessage(message.chat_id, renderedChunk, 'HTML');
      if (ok) {
        sentChunks += 1;
      }
    }

    console.info('Message handled', {
      userId: message.user_id,
      chatId: message.chat_id,
      sentChunks,
    });

    return { handled: true, sentChunks };
  } catch (error) {
    console.error('Message handler failed', {
      userId: message.user_id,
      chatId: message.chat_id,
      messageId: message.message_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    await telegramClient.sendTextMessage(message.chat_id, fallbackMessage);
    return { handled: false, reason: 'engine_error' };
  }
}

function previewText(text: string, maxLength = 240): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
