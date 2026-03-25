import { afterEach, describe, expect, it, vi } from 'vitest';

const envKeys = [
  'TELEGRAM_BOT_TOKEN',
  'WEBHOOK_SECRET_TOKEN',
  'ENGINE_BASE_URL',
  'ENGINE_API_KEY',
  'ENGINE_ORG',
  'GATEWAY_PUBLIC_URL',
  'PROGRESS_THROTTLE_SECONDS',
  'MESSAGE_AGE_CUTOFF_IN_SECONDS',
  'LOG_LEVEL',
];

function setBaseEnv(): void {
  process.env.TELEGRAM_BOT_TOKEN = 'telegram-token';
  process.env.ENGINE_BASE_URL = 'https://engine.example.com';
  process.env.ENGINE_API_KEY = 'engine-key';
  process.env.GATEWAY_PUBLIC_URL = 'https://gateway.example.com';
  process.env.PROGRESS_THROTTLE_SECONDS = '5';
  process.env.MESSAGE_AGE_CUTOFF_IN_SECONDS = '600';
  process.env.LOG_LEVEL = 'DEBUG';
}

async function loadConfig() {
  vi.resetModules();
  return import('../../src/config/index.js');
}

describe('config', () => {
  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('loads required and optional env vars', async () => {
    setBaseEnv();
    process.env.WEBHOOK_SECRET_TOKEN = 'secret';
    process.env.ENGINE_ORG = 'org-123';

    const { config } = await loadConfig();

    expect(config).toMatchObject({
      telegramBotToken: 'telegram-token',
      webhookSecretToken: 'secret',
      engineBaseUrl: 'https://engine.example.com',
      engineApiKey: 'engine-key',
      engineOrg: 'org-123',
      gatewayPublicUrl: 'https://gateway.example.com',
      progressThrottleSeconds: 5,
      messageAgeCutoffInSeconds: 600,
      logLevel: 'DEBUG',
    });
  });

  it('uses defaults for optional values', async () => {
    setBaseEnv();

    const { config } = await loadConfig();

    expect(config.webhookSecretToken).toBeUndefined();
    expect(config.engineOrg).toBeUndefined();
    expect(config.progressThrottleSeconds).toBe(5);
    expect(config.messageAgeCutoffInSeconds).toBe(600);
    expect(config.logLevel).toBe('DEBUG');
  });

  it('throws on missing required env vars', async () => {
    process.env.ENGINE_API_KEY = 'engine-key';

    await expect(loadConfig()).rejects.toThrow('Missing required environment variable: TELEGRAM_BOT_TOKEN');
  });
});
