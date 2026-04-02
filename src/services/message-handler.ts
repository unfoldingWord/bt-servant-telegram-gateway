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
  reason?: 'unsupported_message' | 'too_old' | 'engine_error' | 'reset';
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

  if (isResetCommand(message.text)) {
    try {
      await engineClient.resetConversation(message.user_id, {
        chatType: normalizeChatType(message.chat_type),
        chatId: message.chat_id,
        threadId: message.thread_id,
      });

      console.info('Conversation reset', {
        userId: message.user_id,
        chatId: message.chat_id,
        chatType: message.chat_type,
        threadId: message.thread_id,
      });

      await telegramClient.sendTextMessage(message.chat_id, 'Conversation has been reset.');
      return { handled: true, reason: 'reset', sentChunks: 1 };
    } catch (error) {
      console.error('Conversation reset failed', {
        userId: message.user_id,
        chatId: message.chat_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await telegramClient.sendTextMessage(message.chat_id, 'Sorry, I could not reset the conversation.');
      return { handled: false, reason: 'engine_error' };
    }
  }

  if (isStartCommand(message.text)) {
    await telegramClient.sendTextMessage(message.chat_id, buildStartMessage(message));
    return { handled: true, sentChunks: 1 };
  }

  if (isHelpCommand(message.text)) {
    await telegramClient.sendTextMessage(message.chat_id, buildHelpMessage());
    return { handled: true, sentChunks: 1 };
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
      {
        chatType: normalizeChatType(message.chat_type),
        chatId: message.chat_id,
        speaker: message.speaker,
        threadId: message.thread_id,
        responseLanguageHint: message.speaker_language_code,
      },
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

function normalizeChatType(chatType: IncomingMessage['chat_type']): 'private' | 'group' | 'supergroup' {
  if (chatType === 'group' || chatType === 'supergroup') {
    return chatType;
  }

  return 'private';
}

function isResetCommand(text: string): boolean {
  return /^\/reset(?:@\w+)?(?:\s|$)/iu.test(text.trim());
}

function isStartCommand(text: string): boolean {
  return /^\/start(?:@\w+)?(?:\s|$)/iu.test(text.trim());
}

function isHelpCommand(text: string): boolean {
  return /^\/help(?:@\w+)?(?:\s|$)/iu.test(text.trim());
}

function buildStartMessage(message: IncomingMessage): string {
  const intro = 'Welcome! I can help with Bible translation and study.';

  if (message.chat_type === 'private') {
    return `${intro}\n\nSend me a passage or ask a question.`;
  }

  return `${intro}\n\nI am ready to help in this chat.`;
}

function buildHelpMessage(): string {
  return [
    'Here is what I can do:',
    '- Explain a passage',
    '- Help with translation questions',
    '- Continue the current conversation',
    '- Reset the current conversation with /reset',
  ].join('\n');
}
