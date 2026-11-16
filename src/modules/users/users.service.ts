import { signToken, type AuthUser } from '../../lib/auth';
import { isDuplicateKeyError } from '../../lib/db';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { hashPassword, verifyPassword } from '../../lib/password';
import type { PublicUser, User } from './users.model';
import { usersRepository } from './users.repository';
import type {
  ChangePasswordInput,
  CreateUserInput,
  LoginInput,
  UpdateUserInput,
} from './users.schemas';

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  expiresAt: Date;
  user: PublicUser;
}

/**
 * Verified against when the email is unknown so a login attempt takes the same time
 * whether or not the account exists (no user enumeration via timing).
 */
const dummyHash = hashPassword('dummy-password-for-timing');

/** Explicit pick so a new sensitive field can never leak by accident. */
export function toPublicUser(user: User): PublicUser {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function invalidCredentials(): UnauthorizedError {
  return new UnauthorizedError('Invalid email or password');
}

function duplicateEmail(): ConflictError {
  return new ConflictError('USER_EXISTS', 'A user with this email already exists');
}

export const usersService = {
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await usersRepository.findByEmail(input.email);
    const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !valid) {
      logger.info('Login failed', { reason: user ? 'bad_password' : 'unknown_email' });
      throw invalidCredentials();
    }
    if (user.status !== 'active') {
      throw new AppError('USER_DISABLED', 'This account is disabled', 403);
    }
    const now = new Date();
    await usersRepository.touchLastLogin(user._id, now);
    const { token, expiresAt } = await signToken({ id: user._id.toHexString(), role: user.role });
    logger.info('User logged in', { userId: user._id.toHexString(), role: user.role });
    return {
      token,
      tokenType: 'Bearer',
      expiresAt,
      user: toPublicUser({ ...user, lastLoginAt: now }),
    };
  },

  /** The profile behind a token. A token for a deleted or disabled user is rejected. */
  async me(auth: AuthUser): Promise<PublicUser> {
    const user = await usersRepository.findById(auth.id);
    if (!user || user.status !== 'active') throw new UnauthorizedError('Account unavailable');
    return toPublicUser(user);
  },

  async changePassword(auth: AuthUser, input: ChangePasswordInput): Promise<void> {
    const user = await usersRepository.findById(auth.id);
    if (!user) throw new UnauthorizedError('Account unavailable');
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new AppError('INVALID_PASSWORD', 'Current password is incorrect', 400);
    }
    await usersRepository.update(auth.id, { passwordHash: await hashPassword(input.newPassword) });
  },

  async list(): Promise<PublicUser[]> {
    return (await usersRepository.list()).map(toPublicUser);
  },

  async getById(id: string): Promise<PublicUser> {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFoundError('User');
    return toPublicUser(user);
  },

  async create(input: CreateUserInput): Promise<PublicUser> {
    const { password, ...rest } = input;
    try {
      const user = await usersRepository.create({
        ...rest,
        passwordHash: await hashPassword(password),
        status: 'active',
      });
      return toPublicUser(user);
    } catch (err) {
      if (isDuplicateKeyError(err)) throw duplicateEmail();
      throw err;
    }
  },

  /** Admin edit. An admin can't change their own role or disable themselves (avoids lock-out). */
  async update(actor: AuthUser, id: string, input: UpdateUserInput): Promise<PublicUser> {
    const { password, ...rest } = input;
    if (actor.id === id && (rest.role !== undefined || rest.status !== undefined)) {
      throw new AppError('CANNOT_MODIFY_SELF', 'You cannot change your own role or status', 400);
    }
    const user = await usersRepository.update(id, {
      ...rest,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    });
    if (!user) throw new NotFoundError('User');
    return toPublicUser(user);
  },
};
