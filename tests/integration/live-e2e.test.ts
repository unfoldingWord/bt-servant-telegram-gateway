import { describe, expect, it } from 'vitest';

const {
  GATEWAY_PUBLIC_URL,
  TELEGRAM_BOT_TOKEN,
  WEBHOOK_SECRET_TOKEN,
  LIVE_E2E_CHAT_ID,
} = process.env;

const liveEnabled =
  Boolean(GATEWAY_PUBLIC_URL?.trim()) &&
  Boolean(TELEGRAM_BOT_TOKEN?.trim()) &&
  Boolean(LIVE_E2E_CHAT_ID?.trim());

const describeLive = liveEnabled ? describe : describe.skip;

describeLive('live e2e gateway smoke', () => {
  it('delivers a telegram update through the live gateway', async () => {
    const response = await fetch(`${GATEWAY_PUBLIC_URL}/api/telegram-webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(WEBHOOK_SECRET_TOKEN ? { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET_TOKEN } : {}),
      },
      body: JSON.stringify({
        update_id: Date.now(),
        message: {
          message_id: Math.floor(Date.now() / 1000),
          from: {
            id: Number(LIVE_E2E_CHAT_ID),
            is_bot: false,
            first_name: 'Live',
          },
          chat: {
            id: Number(LIVE_E2E_CHAT_ID),
            type: 'private',
          },
          date: Math.floor(Date.now() / 1000),
          text: 'Hello from live E2E smoke test',
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
