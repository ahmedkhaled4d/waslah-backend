import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { objectId, userId } from '../../lib/validation';
import { CONVERSATION_STATUSES } from './conversations.model';

export const listConversationsQuery = z.object({
  inboxId: objectId.optional(),
  status: z.enum(CONVERSATION_STATUSES).optional(),
  /** "me", "unassigned", or a user id */
  assignee: z.string().min(1).max(128).optional(),
  labelId: objectId.optional(),
  ...paginationQuery,
});

export const assignSchema = z.object({ assigneeId: userId.nullable() });
export const statusSchema = z.object({ status: z.enum(CONVERSATION_STATUSES) });
export const moveSchema = z.object({ inboxId: objectId });
export const labelSchema = z.object({ labelId: objectId });

export type ListConversationsQuery = z.infer<typeof listConversationsQuery>;
