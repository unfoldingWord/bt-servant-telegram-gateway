import {
  MessageType,
  isMessageTooOld,
  isSupportedMessageType,
  type IncomingMessage,
} from '../core/models.js';
import { EngineClient, type ModeScope, type ModeSummary } from './engine-client.js';
import { EngineGateway } from './engine-adapter.js';
import { uint8ArrayToBase64 } from './encoding.js';
import { sendChatAction, sendTextMessage, sendTypingIndicator } from './response-dispatch.js';
import { TelegramClient } from '../telegram/client.js';

export interface MessageHandlerDependencies {
  telegramClient: TelegramClient;
  engineClient: EngineClient;
  engineGateway?: EngineGateway;
  fallbackMessage?: string;
  forwardAllGroupMessages?: boolean;
  progressCallbackUrl?: string | undefined;
}

export interface MessageHandlerResult {
  handled: boolean;
  reason?: 'unsupported_message' | 'too_old' | 'engine_error' | 'reset' | 'mode' | 'accepted';
  sentChunks?: number;
  messageKey?: string;
}

const DEFAULT_FALLBACK_MESSAGE = 'Sorry, something went wrong. Please try again.';

export async function handleIncomingMessage(
  message: IncomingMessage,
  dependencies: MessageHandlerDependencies
): Promise<MessageHandlerResult> {
  const { telegramClient, engineClient } = dependencies;
  const engineGateway = dependencies.engineGateway ?? new EngineGateway(engineClient);
  const fallbackMessage = dependencies.fallbackMessage ?? DEFAULT_FALLBACK_MESSAGE;
  const progressCallbackUrl = dependencies.progressCallbackUrl;

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

  if (isGroupChat(message.chat_type) && !message.addressed_to_bot) {
    if (!dependencies.forwardAllGroupMessages) {
      console.info('Ignoring group message without direct bot address', {
        userId: message.user_id,
        chatId: message.chat_id,
        chatType: message.chat_type,
        speaker: message.speaker,
        threadId: message.thread_id,
        text: previewText(message.text),
      });
      return { handled: false, reason: 'unsupported_message' };
    }
    console.info('Forwarding non-addressed group message', {
      userId: message.user_id,
      chatId: message.chat_id,
      chatType: message.chat_type,
      speaker: message.speaker,
    });
  }

  if (isResetCommand(message.text)) {
    try {
      await engineGateway.resetConversation(
        message.user_id,
        normalizeChatType(message.chat_type),
        message.chat_id,
        message.thread_id
      );

      console.info('Conversation reset', {
        userId: message.user_id,
        chatId: message.chat_id,
        chatType: message.chat_type,
        threadId: message.thread_id,
      });

      await sendTextMessage(
        telegramClient,
        message.chat_id,
        'Conversation has been reset.',
        message.thread_id
      );
      return { handled: true, reason: 'reset', sentChunks: 1 };
    } catch (error) {
      console.error('Conversation reset failed', {
        userId: message.user_id,
        chatId: message.chat_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await sendTextMessage(
        telegramClient,
        message.chat_id,
        'Sorry, I could not reset the conversation.',
        message.thread_id
      );
      return { handled: false, reason: 'engine_error' };
    }
  }

  if (isModeCommand(message.text)) {
    return handleModeCommand(message, engineGateway, telegramClient);
  }

  if (isStartCommand(message.text)) {
    await sendTextMessage(
      telegramClient,
      message.chat_id,
      buildStartMessage(message),
      message.thread_id
    );
    return { handled: true, sentChunks: 1 };
  }

  if (isHelpCommand(message.text)) {
    await sendTextMessage(telegramClient, message.chat_id, buildHelpMessage(), message.thread_id);
    return { handled: true, sentChunks: 1 };
  }

  const isVoice =
    message.message_type === MessageType.VOICE || message.message_type === MessageType.AUDIO;

  if (isVoice) {
    return handleVoiceMessage(
      message,
      engineGateway,
      telegramClient,
      fallbackMessage,
      progressCallbackUrl
    );
  }

  return handleTextEngineRequest(
    message,
    engineGateway,
    telegramClient,
    fallbackMessage,
    progressCallbackUrl
  );
}

function buildEngineContext(message: IncomingMessage) {
  return {
    chatType: normalizeChatType(message.chat_type),
    chatId: message.chat_id,
    speaker: message.speaker,
    threadId: message.thread_id,
    responseLanguageHint: message.speaker_language_code,
    addressedToBot: message.addressed_to_bot,
  };
}

async function handleTextEngineRequest(
  message: IncomingMessage,
  engineGateway: EngineGateway,
  telegramClient: TelegramClient,
  fallbackMessage: string,
  progressCallbackUrl: string | undefined
): Promise<MessageHandlerResult> {
  void sendTypingIndicator(telegramClient, message.chat_id, message.thread_id);

  if (!progressCallbackUrl) {
    console.error('progressCallbackUrl is required for async chat transport', {
      userId: message.user_id,
      chatId: message.chat_id,
    });
    await sendTextMessage(telegramClient, message.chat_id, fallbackMessage, message.thread_id);
    return { handled: false, reason: 'engine_error' };
  }

  const messageKey = crypto.randomUUID();
  try {
    await engineGateway.requestFinalReplyAsync({
      userId: message.user_id,
      message: message.text,
      messageKey,
      progressCallbackUrl,
      context: buildEngineContext(message),
    });
    return { handled: true, reason: 'accepted', messageKey };
  } catch (error) {
    console.error('Text message handler failed', {
      userId: message.user_id,
      chatId: message.chat_id,
      messageId: message.message_id,
      messageKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await sendTextMessage(telegramClient, message.chat_id, fallbackMessage, message.thread_id);
    return { handled: false, reason: 'engine_error' };
  }
}

async function handleVoiceMessage(
  message: IncomingMessage,
  engineGateway: EngineGateway,
  telegramClient: TelegramClient,
  fallbackMessage: string,
  progressCallbackUrl: string | undefined
): Promise<MessageHandlerResult> {
  void sendChatAction(telegramClient, message.chat_id, 'upload_voice', message.thread_id);

  if (!progressCallbackUrl) {
    console.error('progressCallbackUrl is required for async chat transport', {
      userId: message.user_id,
      chatId: message.chat_id,
    });
    await sendTextMessage(telegramClient, message.chat_id, fallbackMessage, message.thread_id);
    return { handled: false, reason: 'engine_error' };
  }

  const messageKey = crypto.randomUUID();
  try {
    if (!message.file_id) {
      console.error('Voice message missing file_id', { messageId: message.message_id });
      await sendTextMessage(telegramClient, message.chat_id, fallbackMessage, message.thread_id);
      return { handled: false, reason: 'engine_error' };
    }

    const audioBytes = await downloadVoiceFile(telegramClient, message.file_id);
    if (!audioBytes) {
      await sendTextMessage(telegramClient, message.chat_id, fallbackMessage, message.thread_id);
      return { handled: false, reason: 'engine_error' };
    }

    const audioBase64 = uint8ArrayToBase64(audioBytes);
    const audioFormat = message.mime_type ?? 'audio/ogg';

    await engineGateway.requestAudioReplyAsync({
      userId: message.user_id,
      audioBase64,
      audioFormat,
      messageKey,
      progressCallbackUrl,
      captionText: message.text || undefined,
      context: buildEngineContext(message),
    });

    return { handled: true, reason: 'accepted', messageKey };
  } catch (error) {
    console.error('Voice message handler failed', {
      userId: message.user_id,
      chatId: message.chat_id,
      messageId: message.message_id,
      messageKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await sendTextMessage(telegramClient, message.chat_id, fallbackMessage, message.thread_id);
    return { handled: false, reason: 'engine_error' };
  }
}

async function downloadVoiceFile(
  telegramClient: TelegramClient,
  fileId: string
): Promise<Uint8Array | null> {
  const file = await telegramClient.getFile(fileId);
  if (!file?.file_path) {
    console.error('Failed to get file path for voice message', { fileId });
    return null;
  }
  return telegramClient.downloadFile(file.file_path);
}

function previewText(text: string, maxLength = 240): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeChatType(
  chatType: IncomingMessage['chat_type']
): 'private' | 'group' | 'supergroup' {
  if (chatType === 'group' || chatType === 'supergroup') {
    return chatType;
  }

  return 'private';
}

function isGroupChat(chatType: IncomingMessage['chat_type']): chatType is 'group' | 'supergroup' {
  return chatType === 'group' || chatType === 'supergroup';
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

const MODE_COMMAND_REGEX = /^\/mode(?:@\w+)?(?:\s+(\S+))?\s*$/iu;

function isModeCommand(text: string): boolean {
  return MODE_COMMAND_REGEX.test(text.trim());
}

function parseModeArgument(text: string): string | undefined {
  const match = text.trim().match(MODE_COMMAND_REGEX);
  return match?.[1];
}

function modeScopeFor(message: IncomingMessage): ModeScope {
  if (isGroupChat(message.chat_type)) {
    return { kind: 'group', chatId: message.chat_id };
  }
  return { kind: 'user', userId: message.user_id };
}

function formatModeList(modes: ModeSummary[]): string {
  if (modes.length === 0) {
    return 'No modes are currently published for this organization.';
  }

  const lines = modes.map((mode) => {
    const label = mode.label && mode.label.trim() ? mode.label.trim() : mode.name;
    return label === mode.name ? `- ${mode.name}` : `- ${mode.name} — ${label}`;
  });

  return [
    'Available modes:',
    ...lines,
    '',
    'Use /mode <name> to switch, or /mode default to clear.',
  ].join('\n');
}

async function handleModeCommand(
  message: IncomingMessage,
  engineGateway: EngineGateway,
  telegramClient: TelegramClient
): Promise<MessageHandlerResult> {
  const argument = parseModeArgument(message.text);
  const scope = modeScopeFor(message);

  if (argument === undefined) {
    return handleModeList(message, engineGateway, telegramClient);
  }

  if (argument.toLowerCase() === 'default') {
    return handleModeClear(message, engineGateway, telegramClient, scope);
  }

  return handleModeSet(message, engineGateway, telegramClient, scope, argument);
}

async function handleModeList(
  message: IncomingMessage,
  engineGateway: EngineGateway,
  telegramClient: TelegramClient
): Promise<MessageHandlerResult> {
  try {
    const modes = await engineGateway.listModes();
    const published = modes.filter((mode) => mode.published === true);
    await sendTextMessage(
      telegramClient,
      message.chat_id,
      formatModeList(published),
      message.thread_id
    );
    return { handled: true, reason: 'mode', sentChunks: 1 };
  } catch (error) {
    console.error('Mode list failed', {
      userId: message.user_id,
      chatId: message.chat_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await sendTextMessage(
      telegramClient,
      message.chat_id,
      'Sorry, I could not load the available modes.',
      message.thread_id
    );
    return { handled: false, reason: 'engine_error' };
  }
}

async function handleModeClear(
  message: IncomingMessage,
  engineGateway: EngineGateway,
  telegramClient: TelegramClient,
  scope: ModeScope
): Promise<MessageHandlerResult> {
  try {
    await engineGateway.clearMode(scope);
    console.info('Mode cleared', {
      userId: message.user_id,
      chatId: message.chat_id,
      scope: scope.kind,
    });
    await sendTextMessage(telegramClient, message.chat_id, 'Mode cleared.', message.thread_id);
    return { handled: true, reason: 'mode', sentChunks: 1 };
  } catch (error) {
    console.error('Mode clear failed', {
      userId: message.user_id,
      chatId: message.chat_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await sendTextMessage(
      telegramClient,
      message.chat_id,
      'Sorry, I could not clear the mode.',
      message.thread_id
    );
    return { handled: false, reason: 'engine_error' };
  }
}

function formatUnknownModeMessage(requestedName: string, published: ModeSummary[]): string {
  const available =
    published.length > 0 ? published.map((mode) => mode.name).join(', ') : '(no published modes)';
  return `Unknown mode '${requestedName}'. Available modes: ${available}.`;
}

async function handleModeSet(
  message: IncomingMessage,
  engineGateway: EngineGateway,
  telegramClient: TelegramClient,
  scope: ModeScope,
  requestedName: string
): Promise<MessageHandlerResult> {
  try {
    const published = (await engineGateway.listModes()).filter((mode) => mode.published === true);
    const match = published.find((mode) => mode.name === requestedName);

    if (!match) {
      await sendTextMessage(
        telegramClient,
        message.chat_id,
        formatUnknownModeMessage(requestedName, published),
        message.thread_id
      );
      return { handled: true, reason: 'mode', sentChunks: 1 };
    }

    await engineGateway.setMode(scope, match.name);
    console.info('Mode set', {
      userId: message.user_id,
      chatId: message.chat_id,
      scope: scope.kind,
      mode: match.name,
    });
    await sendTextMessage(
      telegramClient,
      message.chat_id,
      `Mode set to ${match.name}.`,
      message.thread_id
    );
    return { handled: true, reason: 'mode', sentChunks: 1 };
  } catch (error) {
    console.error('Mode set failed', {
      userId: message.user_id,
      chatId: message.chat_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await sendTextMessage(
      telegramClient,
      message.chat_id,
      'Sorry, I could not update the mode.',
      message.thread_id
    );
    return { handled: false, reason: 'engine_error' };
  }
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
    '- Switch modes with /mode <name> (or /mode to list, /mode default to clear)',
  ].join('\n');
}
