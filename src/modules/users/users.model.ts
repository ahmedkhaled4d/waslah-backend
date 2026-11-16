import { model, Schema, type Types } from 'mongoose';
import { ROLES, type Role } from '../../lib/auth';

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  _id: Types.ObjectId;
  /** Lower-cased, unique. */
  email: string;
  name: string;
  /** scrypt hash from `lib/password.ts`. Never returned by the API. */
  passwordHash: string;
  role: Role;
  /** Disabled users can't log in. Their existing tokens expire naturally. */
  status: UserStatus;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** What the API returns for a user: everything except the password hash. */
export type PublicUser = Omit<User, 'passwordHash'>;

const userSchema = new Schema<User>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export const UserModel = model<User>('User', userSchema);
