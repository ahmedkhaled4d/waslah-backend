import { z } from 'zod';
import { ROLES } from '../../lib/auth';
import { USER_STATUSES } from './users.model';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(8).max(200);

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  email,
  name: z.string().trim().min(1).max(100),
  password,
  role: z.enum(ROLES).default('agent'),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: z.enum(ROLES),
    status: z.enum(USER_STATUSES),
    /** Setting a new password here is an admin reset; it doesn't need the old one. */
    password,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
