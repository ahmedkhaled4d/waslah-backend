import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { connectDb } from '../../lib/db';
import { logger } from '../../lib/logger';
import { webhookPayloadSchema } from '../../lib/whatsapp/webhook.types';
import { messagesService } from '../../modules/messages/messages.service';

/**
 * Consumes verified webhook payloads. Failed records are reported individually so SQS retries
 * only those; after maxReceiveCount they land in the DLQ.
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  await connectDb();
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const parsed = webhookPayloadSchema.safeParse(JSON.parse(record.body));
      if (!parsed.success) {
        // Not a payload we understand (e.g. another webhook field). Retrying won't help.
        logger.warn('Skipping unrecognized webhook payload', { messageId: record.messageId });
        continue;
      }
      await messagesService.handleWebhook(parsed.data);
    } catch (err) {
      logger.error('Failed to process webhook record', {
        messageId: record.messageId,
        error: err as Error,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
