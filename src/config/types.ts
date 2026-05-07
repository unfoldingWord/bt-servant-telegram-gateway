/**
 * Cloudflare Worker environment bindings.
 *
 * All values are strings — numeric parsing happens at usage site.
 * Required fields have no `?`; optional fields are marked with `?`.
 *
 * Secrets are set via `wrangler secret put`.
 * Variables are set in `wrangler.toml` under `[vars]`.
 */
export interface Env {
  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  ENGINE_API_KEY: string;
  WEBHOOK_SECRET_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  GATEWAY_PUBLIC_URL?: string;

  // Variables (from wrangler.toml [vars])
  ENVIRONMENT?: string;
  ENGINE_BASE_URL: string;
  ENGINE_ORG?: string;
  ENGINE_TIMEOUT_MS?: string;
  TELEGRAM_TIMEOUT_MS?: string;
  PROGRESS_THROTTLE_SECONDS?: string;
  MESSAGE_AGE_CUTOFF_IN_SECONDS?: string;
  LOG_LEVEL?: string;
}

/** Parse a numeric env var with a fallback default. */
export function parseEnvNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
