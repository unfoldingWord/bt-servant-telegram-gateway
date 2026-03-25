import type { Handler } from '@netlify/functions';

export const handler: Handler = (event) => {
  if (event.httpMethod !== 'GET') {
    return Promise.resolve({ statusCode: 405, body: 'Method Not Allowed' });
  }

  return Promise.resolve({
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      service: 'bt-servant-telegram-gateway',
    }),
  });
};
