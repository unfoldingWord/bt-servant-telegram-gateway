import { afterEach, describe, expect, it, vi } from 'vitest';

import { EngineGateway } from '../../src/services/engine-adapter.js';
import { dispatchEngineResponse } from '../../src/services/response-dispatch.js';
import { formatTelegramHtml } from '../../src/services/telegram-format.js';

function makeGateway(downloadResult: Uint8Array | null = null) {
  const client = {
    downloadAudio: vi.fn().mockResolvedValue(downloadResult),
  } as never;
  return new EngineGateway(client);
}

function makeTelegram() {
  return {
    sendChatAction: vi.fn().mockResolvedValue(true),
    sendTextMessage: vi.fn().mockResolvedValue(true),
    sendVoice: vi.fn().mockResolvedValue(true),
    setWebhook: vi.fn(),
  };
}

describe('dispatchEngineResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty when text, voice, and attachments are all absent', async () => {
    const telegramClient = makeTelegram();
    const engineGateway = makeGateway();

    const result = await dispatchEngineResponse({
      chatId: '2002',
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(result).toEqual({
      expectedChunks: 0,
      sentChunks: 0,
      voiceExpected: false,
      voiceSent: false,
      attachmentsExpected: 0,
      attachmentsSent: 0,
      empty: true,
    });
    expect(telegramClient.sendTextMessage).not.toHaveBeenCalled();
    expect(telegramClient.sendVoice).not.toHaveBeenCalled();
  });

  it('reports per-category expected/sent counts so the caller can detect partial delivery', async () => {
    const audioBytes = new Uint8Array([1]);
    const telegramClient = makeTelegram();
    // sendTextMessage fails for the second chunk
    telegramClient.sendTextMessage = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const engineGateway = makeGateway(audioBytes);

    const result = await dispatchEngineResponse({
      chatId: '2002',
      // Long enough to chunk into multiple messages (chunkMessage splits ~4000 char limit)
      text: 'first.\n\n' + 'x'.repeat(4500),
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(result.expectedChunks).toBeGreaterThan(1);
    expect(result.sentChunks).toBeLessThan(result.expectedChunks);
  });

  it('formats engine text as Telegram HTML before sending', async () => {
    const telegramClient = makeTelegram();
    const engineGateway = makeGateway();

    await dispatchEngineResponse({
      chatId: '2002',
      text: 'Hello **Bold** and _italic_.',
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      formatTelegramHtml('Hello **Bold** and _italic_.'),
      'HTML'
    );
  });

  it('normalizes engine section separators before chunking', async () => {
    const telegramClient = makeTelegram();
    const engineGateway = makeGateway();

    await dispatchEngineResponse({
      chatId: '2002',
      text: 'Intro\n\n---\n\nSection one\n\n---\n\nSection two',
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(telegramClient.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      expect.stringContaining('Intro\n\nSection one\n\nSection two'),
      'HTML'
    );
  });

  it('sends audio attachments via sendVoice when only attachments are returned', async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]);
    const telegramClient = makeTelegram();
    const engineGateway = makeGateway(audioBytes);

    const result = await dispatchEngineResponse({
      chatId: '2002',
      attachments: [
        {
          type: 'audio',
          url: 'https://engine.example.com/api/v1/voice-submissions/foo.ogg',
          mime_type: 'audio/ogg',
        },
      ],
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(telegramClient.sendVoice).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendVoice).toHaveBeenCalledWith('2002', audioBytes, {
      messageThreadId: undefined,
    });
    expect(telegramClient.sendTextMessage).not.toHaveBeenCalled();
    expect(result.attachmentsSent).toBe(1);
  });

  it('sends TTS voice_audio_url before attachments when both are present', async () => {
    const ttsBytes = new Uint8Array([9, 9]);
    const attachmentBytes = new Uint8Array([1, 1]);
    const telegramClient = makeTelegram();
    const downloadAudio = vi
      .fn()
      .mockResolvedValueOnce(ttsBytes)
      .mockResolvedValueOnce(attachmentBytes);
    const engineGateway = new EngineGateway({ downloadAudio } as never);

    await dispatchEngineResponse({
      chatId: '2002',
      text: 'here it is',
      voiceAudioUrl: '/api/v1/audio/tts.ogg',
      attachments: [
        {
          type: 'audio',
          url: 'https://engine.example.com/api/v1/voice-submissions/story.ogg',
          mime_type: 'audio/ogg',
        },
      ],
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(telegramClient.sendVoice).toHaveBeenCalledTimes(2);
    expect(telegramClient.sendVoice).toHaveBeenNthCalledWith(1, '2002', ttsBytes, {
      messageThreadId: undefined,
    });
    expect(telegramClient.sendVoice).toHaveBeenNthCalledWith(2, '2002', attachmentBytes, {
      messageThreadId: undefined,
    });
  });

  it('sends text then audio attachment when both are present', async () => {
    const audioBytes = new Uint8Array([1, 2, 3]);
    const telegramClient = makeTelegram();
    const engineGateway = makeGateway(audioBytes);

    await dispatchEngineResponse({
      chatId: '2002',
      text: "Here's your story.",
      attachments: [
        {
          type: 'audio',
          url: 'https://engine.example.com/api/v1/voice-submissions/story.ogg',
          mime_type: 'audio/ogg',
        },
      ],
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(telegramClient.sendTextMessage).toHaveBeenCalledWith(
      '2002',
      expect.stringContaining("Here's your story."),
      'HTML'
    );
    expect(telegramClient.sendVoice).toHaveBeenCalledTimes(1);
  });

  it('treats an empty attachments array as no attachments', async () => {
    const telegramClient = makeTelegram();
    const downloadAudio = vi.fn();
    const engineGateway = new EngineGateway({ downloadAudio } as never);

    const result = await dispatchEngineResponse({
      chatId: '2002',
      text: 'hi',
      attachments: [],
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(telegramClient.sendVoice).not.toHaveBeenCalled();
    expect(downloadAudio).not.toHaveBeenCalled();
    expect(result.sentChunks).toBe(1);
    expect(result.attachmentsSent).toBe(0);
  });

  it('skips non-audio attachments, isolates fetch failures, and continues with later attachments', async () => {
    const audioBytes = new Uint8Array([7, 7, 7]);
    const telegramClient = makeTelegram();
    const downloadAudio = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(audioBytes);
    const engineGateway = new EngineGateway({ downloadAudio } as never);

    const result = await dispatchEngineResponse({
      chatId: '2002',
      attachments: [
        // Non-audio: skipped
        { type: 'image', url: 'https://engine.example.com/img.png' } as unknown as {
          type: 'audio';
          url: string;
          mime_type: string;
        },
        {
          type: 'audio',
          url: 'https://engine.example.com/api/v1/voice-submissions/missing.ogg',
          mime_type: 'audio/ogg',
        },
        {
          type: 'audio',
          url: 'https://engine.example.com/api/v1/voice-submissions/good.ogg',
          mime_type: 'audio/ogg',
        },
      ],
      telegramClient: telegramClient as never,
      engineGateway,
    });

    expect(downloadAudio).toHaveBeenCalledTimes(2);
    expect(telegramClient.sendVoice).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendVoice).toHaveBeenCalledWith('2002', audioBytes, {
      messageThreadId: undefined,
    });
    expect(result.attachmentsSent).toBe(1);
  });
});
