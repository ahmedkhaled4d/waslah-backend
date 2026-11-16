import { z } from 'zod';
import { ValidationError } from './errors';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a hex color like #22c55e');
export const userId = z.string().min(1).max(128);

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      fields[issue.path.join('.') || '_'] = issue.message;
    }
    throw new ValidationError({ fields });
  }
  return result.data;
}
