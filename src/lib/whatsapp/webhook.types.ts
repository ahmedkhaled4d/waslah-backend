import { z } from 'zod';

const mediaSchema = z.looseObject({
  id: z.string(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

export const inboundMessageSchema = z.looseObject({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  context: z.looseObject({ id: z.string().optional() }).optional(),
  text: z.looseObject({ body: z.string() }).optional(),
  image: mediaSchema.optional(),
  video: mediaSchema.optional(),
  audio: mediaSchema.optional(),
  document: mediaSchema.optional(),
  sticker: mediaSchema.optional(),
  location: z
    .looseObject({
      latitude: z.number(),
      longitude: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  button: z.looseObject({ text: z.string().optional(), payload: z.string().optional() }).optional(),
  interactive: z
    .looseObject({
      type: z.string(),
      button_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  reaction: z.looseObject({ message_id: z.string(), emoji: z.string().optional() }).optional(),
});

export const statusSchema = z.looseObject({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string(),
  recipient_id: z.string(),
  errors: z
    .array(
      z.looseObject({
        code: z.number(),
        title: z.string().optional(),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

export const webhookPayloadSchema = z.looseObject({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.looseObject({
      id: z.string(),
      changes: z.array(
        z.looseObject({
          field: z.string(),
          value: z.looseObject({
            metadata: z
              .looseObject({ phone_number_id: z.string(), display_phone_number: z.string() })
              .optional(),
            contacts: z
              .array(
                z.looseObject({
                  wa_id: z.string(),
                  profile: z.looseObject({ name: z.string().optional() }).optional(),
                }),
              )
              .optional(),
            messages: z.array(inboundMessageSchema).optional(),
            statuses: z.array(statusSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type InboundMessage = z.infer<typeof inboundMessageSchema>;
export type WebhookStatus = z.infer<typeof statusSchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/** WhatsApp timestamps are unix seconds as strings. */
export function waTimestampToDate(ts: string): Date {
  return new Date(Number(ts) * 1000);
}
