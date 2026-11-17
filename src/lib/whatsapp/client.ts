import { getConfig, getSecret } from '../config';
import { WhatsAppApiError } from '../errors';

/** Graph API error codes worth retrying (rate limits / throughput). */
const RETRYABLE_CODES = new Set([4, 80007, 130429, 131056]);

export type OutboundPayload =
  | { type: 'text'; text: { body: string; preview_url?: boolean } }
  | {
      type: 'template';
      template: { name: string; language: { code: string }; components?: unknown[] };
    };

interface GraphError {
  error?: { message?: string; code?: number };
}

interface SendResponse {
  messages?: { id: string }[];
}

/** The only code in the repo that calls graph.facebook.com. */
export async function sendWhatsAppMessage(
  to: string,
  payload: OutboundPayload,
  replyToWaMessageId?: string,
): Promise<{ waMessageId: string }> {
  const config = getConfig();
  const token = getSecret('WA_ACCESS_TOKEN');
  const url = `https://graph.facebook.com/${config.WA_GRAPH_API_VERSION}/${config.WA_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...(replyToWaMessageId ? { context: { message_id: replyToWaMessageId } } : {}),
      ...payload,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const body = (await res.json().catch(() => ({}))) as GraphError & SendResponse;

  if (!res.ok) {
    const code = body.error?.code;
    const retryable =
      res.status === 429 || res.status >= 500 || (code !== undefined && RETRYABLE_CODES.has(code));
    throw new WhatsAppApiError(
      body.error?.message ?? `Graph API HTTP ${res.status}`,
      code,
      retryable,
    );
  }

  const waMessageId = body.messages?.[0]?.id;
  if (!waMessageId)
    throw new WhatsAppApiError('Graph API returned no message id', undefined, false);
  return { waMessageId };
}
