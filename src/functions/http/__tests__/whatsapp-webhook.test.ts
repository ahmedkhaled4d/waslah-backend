import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpEvent } from '../../../lib/http';

vi.mock('../../../lib/db', () => ({ connectDb: vi.fn() }));
vi.mock('../../../modules/messages/messages.service', () => ({
  messagesService: { handleWebhook: vi.fn() },
}));

const { connectDb } = await import('../../../lib/db');
const { messagesService } = await import('../../../modules/messages/messages.service');
const { handler } = await import('../whatsapp-webhook');

const APP_SECRET = 'test-app-secret';
const fixture = readFileSync(
  new URL('../../../../test/fixtures/whatsapp/text-message.json', import.meta.url),
  'utf8',
);

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
}

function post(body: string, signature = sign(body)): HttpEvent {
  return {
    requestContext: { http: { method: 'POST' } },
    headers: { 'x-hub-signature-256': signature },
    body,
    isBase64Encoded: false,
  } as unknown as HttpEvent;
}

const ctx = {} as Context;

describe('POST /webhooks/whatsapp', () => {
  beforeEach(() => {
    process.env.WA_APP_SECRET = APP_SECRET;
  });

  it('saves a signed payload directly and returns 200', async () => {
    const res = await handler(post(fixture), ctx);

    expect(res.statusCode).toBe(200);
    expect(connectDb).toHaveBeenCalledTimes(1);
    expect(messagesService.handleWebhook).toHaveBeenCalledTimes(1);
    expect(messagesService.handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ object: 'whatsapp_business_account' }),
    );
  });

  it('rejects an invalid signature without touching the database', async () => {
    const res = await handler(post(fixture, 'sha256=00'), ctx);

    expect(res.statusCode).toBe(401);
    expect(connectDb).not.toHaveBeenCalled();
    expect(messagesService.handleWebhook).not.toHaveBeenCalled();
  });

  it('acknowledges unrecognized payloads with 200 without saving', async () => {
    const res = await handler(post(JSON.stringify({ object: 'page', entry: [] })), ctx);

    expect(res.statusCode).toBe(200);
    expect(messagesService.handleWebhook).not.toHaveBeenCalled();
  });

  it('returns 500 when processing fails so Meta redelivers', async () => {
    vi.mocked(messagesService.handleWebhook).mockRejectedValueOnce(new Error('db down'));

    const res = await handler(post(fixture), ctx);

    expect(res.statusCode).toBe(500);
  });
});
