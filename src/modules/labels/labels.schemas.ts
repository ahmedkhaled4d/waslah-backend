import { z } from 'zod';
import { hexColor } from '../../lib/validation';

export const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: hexColor.default('#64748b'),
  description: z.string().max(200).optional(),
});

export const updateLabelSchema = createLabelSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field',
  });

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
