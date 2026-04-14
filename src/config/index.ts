import dotenv from 'dotenv';

dotenv.config();

interface Config {
  telegramBotToken: string;
  telegramBotUsername: string | undefined;
  webhookSecretToken: string | undefined;

  engineBaseUrl: string;
  engineApiKey: string;
  engineOrg: string | undefined;
  engineTimeoutMs: number;

  gatewayPublicUrl: string;
  telegramTimeoutMs: number;
  progressThrottleSeconds: number;

  messageAgeCutoffInSeconds: number;

  logLevel: string;
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || defaultValue || '';
}

function getOptionalEnvVar(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

export const config: Config = {
  telegramBotToken: getEnvVar('TELEGRAM_BOT_TOKEN'),
  telegramBotUsername: getOptionalEnvVar('TELEGRAM_BOT_USERNAME'),
  webhookSecretToken: process.env.WEBHOOK_SECRET_TOKEN,
  engineBaseUrl: getEnvVar('ENGINE_BASE_URL'),
  engineApiKey: getEnvVar('ENGINE_API_KEY'),
  gatewayPublicUrl: getEnvVar('GATEWAY_PUBLIC_URL', ''),
  telegramTimeoutMs: getEnvNumber('TELEGRAM_TIMEOUT_MS', 15000),
  engineTimeoutMs: getEnvNumber('ENGINE_TIMEOUT_MS', 45000),
  progressThrottleSeconds: getEnvNumber('PROGRESS_THROTTLE_SECONDS', 3.0),
  messageAgeCutoffInSeconds: getEnvNumber('MESSAGE_AGE_CUTOFF_IN_SECONDS', 3600),
  logLevel: getEnvVar('LOG_LEVEL', 'INFO'),
  engineOrg: getOptionalEnvVar('ENGINE_ORG'),
};
