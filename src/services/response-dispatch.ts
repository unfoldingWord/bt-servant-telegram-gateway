import { chunkMessage } from './chunking.js';
import { type ChatAttachment } from './engine-client.js';
import { EngineGateway } from './engine-adapter.js';
import { formatEngineResponse } from './engine-response-format.js';
import { formatTelegramHtml } from './telegram-format.js';
import { TelegramClient } from '../telegram/client.js';

export interface DispatchInput {
  chatId: string;
  threadId?: string | undefined;
  text?: string | undefined;
  voiceAudioUrl?: string | undefined;
  attachments?: ChatAttachment[] | undefined;
  telegramClient: TelegramClient;
  engineGateway: EngineGateway;
  logContext?: Record<string, unknown>;
}

export interface DispatchResult {
  expectedChunks: number;
  sentChunks: number;
  voiceExpected: boolean;
  voiceSent: boolean;
  attachmentsExpected: number;
  attachmentsSent: number;
  empty: boolean;
}

export async function dispatchEngineResponse(input: DispatchInput): Promise<DispatchResult> {
  const { chatId, threadId, telegramClient, engineGateway, logContext } = input;
  const text = (input.text ?? '').trim();
  const voiceAudioUrl = input.voiceAudioUrl;
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];

  const hasText = text.length > 0;
  const hasVoice = !!voiceAudioUrl;
  const hasAttachments = attachments.length > 0;

  console.info('Dispatching engine response', {
    ...logContext,
    chatId,
    hasText,
    hasVoice,
    attachmentCount: attachments.length,
    textPreview: previewText(text),
  });

  if (!hasText && !hasVoice && !hasAttachments) {
    console.info('Engine response is empty, sending nothing', { ...logContext, chatId });
    return {
      expectedChunks: 0,
      sentChunks: 0,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: true,
    };
  }

  let expectedChunks = 0;
  let sentChunks = 0;
  if (hasText) {
    const result = await sendTextChunks(input.text!, chatId, threadId, telegramClient);
    expectedChunks = result.expected;
    sentChunks = result.sent;
  }

  let voiceSent = false;
  if (hasVoice) {
    voiceSent = await sendVoiceResponse(
      voiceAudioUrl!,
      chatId,
      threadId,
      telegramClient,
      engineGateway,
      logContext
    );
  }

  let attachmentsSent = 0;
  for (let i = 0; i < attachments.length; i++) {
    const ok = await sendAudioAttachment(
      attachments[i]!,
      i,
      chatId,
      threadId,
      telegramClient,
      engineGateway
    );
    if (ok) attachmentsSent += 1;
  }

  console.info('Engine response dispatched', {
    ...logContext,
    chatId,
    expectedChunks,
    sentChunks,
    voiceExpected: hasVoice,
    voiceSent,
    attachmentsExpected: attachments.length,
    attachmentsSent,
  });

  return {
    expectedChunks,
    sentChunks,
    voiceExpected: hasVoice,
    voiceSent,
    attachmentsExpected: attachments.length,
    attachmentsSent,
    empty: false,
  };
}

async function sendTextChunks(
  text: string,
  chatId: string,
  threadId: string | undefined,
  telegramClient: TelegramClient
): Promise<{ expected: number; sent: number }> {
  const formatted = formatEngineResponse(text);
  const chunks = chunkMessage(formatted);
  let sent = 0;
  for (const chunk of chunks) {
    const rendered = formatTelegramHtml(chunk);
    const ok = await sendTextMessage(telegramClient, chatId, rendered, threadId, 'HTML');
    if (ok) sent += 1;
  }
  return { expected: chunks.length, sent };
}

async function sendVoiceResponse(
  voiceAudioUrl: string,
  chatId: string,
  threadId: string | undefined,
  telegramClient: TelegramClient,
  engineGateway: EngineGateway,
  logContext?: Record<string, unknown>
): Promise<boolean> {
  void sendChatAction(telegramClient, chatId, 'upload_voice', threadId);

  const audioData = await engineGateway.downloadVoiceAudio(voiceAudioUrl);
  if (!audioData) {
    console.error('Failed to download voice audio from engine', {
      ...logContext,
      chatId,
      voiceAudioUrl,
    });
    return false;
  }

  const sent = await telegramClient.sendVoice(chatId, audioData, {
    messageThreadId: threadId,
  });
  console.info('Voice message sent', {
    ...logContext,
    chatId,
    sent,
    sizeBytes: audioData.length,
  });
  return sent;
}

async function sendAudioAttachment(
  attachment: ChatAttachment,
  index: number,
  chatId: string,
  threadId: string | undefined,
  telegramClient: TelegramClient,
  engineGateway: EngineGateway
): Promise<boolean> {
  if (attachment.type !== 'audio') {
    console.info('Skipping non-audio attachment', { index, type: attachment.type });
    return false;
  }
  if (attachment.mime_type !== 'audio/ogg') {
    console.warn('Audio attachment mime_type is not audio/ogg; attempting sendVoice anyway', {
      index,
      mimeType: attachment.mime_type,
      url: attachment.url,
    });
  }

  void sendChatAction(telegramClient, chatId, 'upload_voice', threadId);

  const audioData = await engineGateway.downloadVoiceAudio(attachment.url);
  if (!audioData) {
    console.error('Attachment fetch failed', {
      index,
      url: attachment.url,
      mimeType: attachment.mime_type,
    });
    return false;
  }

  const sent = await telegramClient.sendVoice(chatId, audioData, {
    messageThreadId: threadId,
  });
  console.info('Audio attachment sent', {
    index,
    url: attachment.url,
    mimeType: attachment.mime_type,
    sent,
    sizeBytes: audioData.length,
  });
  return sent;
}

export async function sendTextMessage(
  telegramClient: TelegramClient,
  chatId: string,
  text: string,
  threadId?: string,
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
): Promise<boolean> {
  if (threadId) {
    if (parseMode) {
      return telegramClient.sendTextMessage(chatId, text, parseMode, threadId);
    }
    return telegramClient.sendTextMessage(chatId, text, undefined, threadId);
  }
  if (parseMode) {
    return telegramClient.sendTextMessage(chatId, text, parseMode);
  }
  return telegramClient.sendTextMessage(chatId, text);
}

type ChatAction =
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

export async function sendChatAction(
  telegramClient: TelegramClient,
  chatId: string,
  action: ChatAction,
  threadId?: string
): Promise<boolean> {
  if (threadId) {
    return telegramClient.sendChatAction(chatId, action, threadId);
  }
  return telegramClient.sendChatAction(chatId, action);
}

export async function sendTypingIndicator(
  telegramClient: TelegramClient,
  chatId: string,
  threadId?: string
): Promise<void> {
  try {
    const typingSent = await sendChatAction(telegramClient, chatId, 'typing', threadId);
    console.info('Typing indicator sent', { chatId, typingSent });
  } catch (error) {
    console.info('Typing indicator skipped', {
      chatId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function previewText(text: string, maxLength = 240): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
