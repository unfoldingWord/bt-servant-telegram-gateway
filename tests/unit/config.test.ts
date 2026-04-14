import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
}));

async function loadConfig() {
  vi.resetModules();
  return import('../../src/config/index.js');
}

describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.WEBHOOK_SECRET_TOKEN;
    delete process.env.ENGINE_BASE_URL;
    delete process.env.ENGINE_API_KEY;
    delete process.env.ENGINE_ORG;
    delete process.env.GATEWAY_PUBLIC_URL;
    delete process.env.PROGRESS_THROTTLE_SECONDS;
    delete process.env.MESSAGE_AGE_CUTOFF_IN_SECONDS;
    delete process.env.LOG_LEVEL;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('loads required and optional env vars', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'telegram-token');
    vi.stubEnv('ENGINE_BASE_URL', 'https://engine.example.com');
    vi.stubEnv('ENGINE_API_KEY', 'engine-key');
    vi.stubEnv('GATEWAY_PUBLIC_URL', 'https://gateway.example.com');
    vi.stubEnv('PROGRESS_THROTTLE_SECONDS', '5');
    vi.stubEnv('MESSAGE_AGE_CUTOFF_IN_SECONDS', '600');
    vi.stubEnv('TELEGRAM_TIMEOUT_MS', '18000');
    vi.stubEnv('ENGINE_TIMEOUT_MS', '30000');
    vi.stubEnv('LOG_LEVEL', 'DEBUG');
    vi.stubEnv('WEBHOOK_SECRET_TOKEN', 'secret');
    vi.stubEnv('ENGINE_ORG', 'org-123');

    const { config } = await loadConfig();

    expect(config).toMatchObject({
      telegramBotToken: 'telegram-token',
      webhookSecretToken: 'secret',
      engineBaseUrl: 'https://engine.example.com',
      engineApiKey: 'engine-key',
      engineOrg: 'org-123',
      gatewayPublicUrl: 'https://gateway.example.com',
      telegramTimeoutMs: 18000,
      engineTimeoutMs: 30000,
      progressThrottleSeconds: 5,
      messageAgeCutoffInSeconds: 600,
      logLevel: 'DEBUG',
    });
  });

  it('uses defaults for optional values', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'telegram-token');
    vi.stubEnv('ENGINE_BASE_URL', 'https://engine.example.com');
    vi.stubEnv('ENGINE_API_KEY', 'engine-key');
    vi.stubEnv('GATEWAY_PUBLIC_URL', 'https://gateway.example.com');
    vi.stubEnv('PROGRESS_THROTTLE_SECONDS', '5');
    vi.stubEnv('MESSAGE_AGE_CUTOFF_IN_SECONDS', '600');
    vi.stubEnv('TELEGRAM_TIMEOUT_MS', '18000');
    vi.stubEnv('ENGINE_TIMEOUT_MS', '30000');
    vi.stubEnv('LOG_LEVEL', 'DEBUG');

    const { config } = await loadConfig();

    expect(config.webhookSecretToken).toBeUndefined();
    expect(config.engineOrg).toBeUndefined();
    expect(config.telegramTimeoutMs).toBe(18000);
    expect(config.engineTimeoutMs).toBe(30000);
    expect(config.progressThrottleSeconds).toBe(5);
    expect(config.messageAgeCutoffInSeconds).toBe(600);
    expect(config.logLevel).toBe('DEBUG');
  });

  it('throws on missing required env vars', async () => {
    vi.stubEnv('ENGINE_BASE_URL', 'https://engine.example.com');
    vi.stubEnv('ENGINE_API_KEY', 'engine-key');

    await expect(loadConfig()).rejects.toThrow('Missing required environment variable: TELEGRAM_BOT_TOKEN');
  });
});
