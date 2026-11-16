import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { objectId, userId } from '../../lib/validation';
import { DEAL_STATUSES } from './deals.model';

export const listDealsQuery = z.object({
  pipelineId: objectId.optional(),
  stageId: objectId.optional(),
  status: z.enum(DEAL_STATUSES).optional(),
  ownerId: userId.optional(),
  contactId: objectId.optional(),
  labelId: objectId.optional(),
  ...paginationQuery,
});

const currency = z.string().regex(/^[A-Za-z]{3}$/, 'Expected an ISO 4217 code like SAR');

export const createDealSchema = z.object({
  title: z.string().trim().min(1).max(200),
  value: z.number().min(0).default(0),
  currency: currency.default('SAR'),
  pipelineId: objectId,
  /** Defaults to the pipeline's first stage. */
  stageId: objectId.optional(),
  contactId: objectId,
  conversationId: objectId.optional(),
  ownerId: userId.optional(),
  expectedCloseDate: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
});

export const updateDealSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    value: z.number().min(0),
    currency,
    ownerId: userId.nullable(),
    expectedCloseDate: z.coerce.date().nullable(),
    notes: z.string().max(5000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const moveDealSchema = z.object({
  stageId: objectId,
  /** Set to move the deal to another pipeline. */
  pipelineId: objectId.optional(),
});

export const dealStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('open') }),
  z.object({ status: z.literal('won') }),
  z.object({ status: z.literal('lost'), lostReason: z.string().max(500).optional() }),
]);

export const dealLabelSchema = z.object({ labelId: objectId });

export type ListDealsQuery = z.infer<typeof listDealsQuery>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type MoveDealInput = z.infer<typeof moveDealSchema>;
export type DealStatusInput = z.infer<typeof dealStatusSchema>;
