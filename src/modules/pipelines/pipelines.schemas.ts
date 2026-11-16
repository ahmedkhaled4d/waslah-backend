import { z } from 'zod';
import { hexColor, objectId } from '../../lib/validation';

const stageInput = z.object({
  name: z.string().trim().min(1).max(60),
  color: hexColor.optional(),
  probability: z.number().int().min(0).max(100).optional(),
});

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Omit to get the default stages. */
  stages: z.array(stageInput).min(1).max(30).optional(),
});

export const updatePipelineSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const addStageSchema = stageInput;
export const updateStageSchema = stageInput.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Provide at least one field',
});
export const reorderStagesSchema = z.object({ stageIds: z.array(objectId).min(1) });

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type StageInput = z.infer<typeof stageInput>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
