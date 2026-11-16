import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';

export const listMessagesQuery = z.object({ ...paginationQuery });

export const sendTextSchema = z.object({
  text: z.string().trim().min(1).max(4096),
  replyToWaMessageId: z.string().min(1).optional(),
});

export type SendTextInput = z.infer<typeof sendTextSchema>;
