import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'aws-lambda';
import { getConfig } from '../../lib/config';
import { json, rawBody, toErrorResponse, type HttpEvent, type HttpResult } from '../../lib/http';
import { logger } from '../../lib/logger';
import { enqueue } from '../../lib/queue';
import { getSecretValue } from '../../lib/secrets';
import { isValidSignature } from '../../lib/whatsapp/signature';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** GET /webhooks/whatsapp — Meta's verification handshake. */
async function verify(event: HttpEvent): Promise<HttpResult> {
  const q = event.queryStringParameters ?? {};
  const expected = await getSecretValue(getConfig().WA_VERIFY_TOKEN_SECRET_ARN);
  if (
    q['hub.mode'] === 'subscribe' &&
    q['hub.verify_token'] &&
    safeEqual(q['hub.verify_token'], expected)
  ) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: q['hub.challenge'] ?? '',
    };
  }
  return json(403, { error: { code: 'FORBIDDEN', message: 'Verification failed', details: {} } });
}

/** POST /webhooks/whatsapp — verify the signature, enqueue, return 200 fast. No DB work here. */
async function receive(event: HttpEvent): Promise<HttpResult> {
  const config = getConfig();
  const body = rawBody(event);
  const appSecret = await getSecretValue(config.WA_APP_SECRET_ARN);
  if (!isValidSignature(body, event.headers['x-hub-signature-256'], appSecret)) {
    logger.warn('Rejected webhook with invalid signature');
    return json(401, {
      error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature', details: {} },
    });
  }
  await enqueue(config.WA_INBOUND_QUEUE_URL, body.toString('utf8'));
  return json(200, { received: true });
}

export const handler = async (event: HttpEvent, _context: Context): Promise<HttpResult> => {
  try {
    return event.requestContext.http.method === 'GET' ? await verify(event) : await receive(event);
  } catch (err) {
    return toErrorResponse(err);
  }
};
