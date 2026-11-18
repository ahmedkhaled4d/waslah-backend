import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'aws-lambda';
import { getSecret } from '../../lib/config';
import { connectDb } from '../../lib/db';
import { json, rawBody, toErrorResponse, type HttpEvent, type HttpResult } from '../../lib/http';
import { logger } from '../../lib/logger';
import { isValidSignature } from '../../lib/whatsapp/signature';
import { webhookPayloadSchema } from '../../lib/whatsapp/webhook.types';
import { messagesService } from '../../modules/messages/messages.service';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** GET /webhooks/whatsapp — Meta's verification handshake. */
function verify(event: HttpEvent): HttpResult {
  const q = event.queryStringParameters ?? {};
  const expected = getSecret('WA_VERIFY_TOKEN');
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

/**
 * POST /webhooks/whatsapp — verify the signature, then save messages and statuses directly.
 * Processing is idempotent, so a failure may return 5xx and let Meta redeliver the payload.
 */
async function receive(event: HttpEvent): Promise<HttpResult> {
  const body = rawBody(event);
  const appSecret = getSecret('WA_APP_SECRET');
  if (!isValidSignature(body, event.headers['x-hub-signature-256'], appSecret)) {
    logger.warn('Rejected webhook with invalid signature');
    return json(401, {
      error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature', details: {} },
    });
  }

  const parsed = webhookPayloadSchema.safeParse(JSON.parse(body.toString('utf8')));
  if (!parsed.success) {
    // Not a payload we understand (e.g. another webhook field). Acknowledge so Meta stops retrying.
    logger.warn('Skipping unrecognized webhook payload');
    return json(200, { received: true });
  }

  await connectDb();
  await messagesService.handleWebhook(parsed.data);
  return json(200, { received: true });
}

export const handler = async (event: HttpEvent, _context: Context): Promise<HttpResult> => {
  try {
    return event.requestContext.http.method === 'GET' ? verify(event) : await receive(event);
  } catch (err) {
    return toErrorResponse(err);
  }
};
