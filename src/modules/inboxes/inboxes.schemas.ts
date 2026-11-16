import { z } from 'zod';
import { hexColor, userId } from '../../lib/validation';

export const createInboxSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(300).optional(),
  color: hexColor.optional(),
  memberIds: z.array(userId).max(500).default([]),
});

export const updateInboxSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(300),
    color: hexColor,
    isDefault: z.literal(true),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const addMembersSchema = z.object({ memberIds: z.array(userId).min(1).max(500) });

export type CreateInboxInput = z.infer<typeof createInboxSchema>;
export type UpdateInboxInput = z.infer<typeof updateInboxSchema>;
