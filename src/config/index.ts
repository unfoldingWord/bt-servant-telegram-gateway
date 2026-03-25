import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
  // Telegram Bot API
  telegramBotToken: string;
  webhookSecretToken: string | undefined;

  // Engine Connection
  engineBaseUrl: string;
  engineApiKey: string;

  // Progress Callbacks
  gatewayPublicUrl: string;
  progressThrottleSeconds: number;

  // Message Filtering
  messageAgeCutoffInSeconds: number;

  // Logging
  logLevel: string;
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || defaultValue || '';
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
  webhookSecretToken: process.env.WEBHOOK_SECRET_TOKEN,
  engineBaseUrl: getEnvVar('ENGINE_BASE_URL'),
  engineApiKey: getEnvVar('ENGINE_API_KEY'),
  gatewayPublicUrl: getEnvVar('GATEWAY_PUBLIC_URL', ''),
  progressThrottleSeconds: getEnvNumber('PROGRESS_THROTTLE_SECONDS', 3.0),
  messageAgeCutoffInSeconds: getEnvNumber('MESSAGE_AGE_CUTOFF_IN_SECONDS', 3600),
  logLevel: getEnvVar('LOG_LEVEL', 'INFO'),
};

