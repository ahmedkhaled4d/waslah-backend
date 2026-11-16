import { jwtVerify, SignJWT } from 'jose';
import { getConfig } from './config';
import { ForbiddenError, UnauthorizedError } from './errors';
import { getSecretValue } from './secrets';

export const ROLES = ['admin', 'supervisor', 'agent'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  role: Role;
}

export const ANY_ROLE: readonly Role[] = ROLES;
export const MANAGERS: readonly Role[] = ['admin', 'supervisor'];
export const ADMIN_ONLY: readonly Role[] = ['admin'];

/** Access tokens issued by `POST /v1/auth/login` expire after this many seconds. */
export const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export function isManager(user: AuthUser): boolean {
  return MANAGERS.includes(user.role);
}

let key: Promise<Uint8Array> | undefined;

function getKey(): Promise<Uint8Array> {
  key ??= getSecretValue(getConfig().JWT_SECRET_ARN).then((s) => new TextEncoder().encode(s));
  return key;
}

/** Verifies an HS256 bearer token with claims `sub` (user id) and `role`. */
export async function authenticate(authorization: string | undefined): Promise<AuthUser> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) throw new UnauthorizedError();
  try {
    const { payload } = await jwtVerify(token, await getKey(), { algorithms: ['HS256'] });
    const role = payload.role;
    if (!payload.sub || typeof role !== 'string' || !ROLES.includes(role as Role)) {
      throw new UnauthorizedError('Invalid token claims');
    }
    return { id: payload.sub, role: role as Role };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/** Issues an HS256 access token that `authenticate` accepts. */
export async function signToken(user: AuthUser): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(await getKey());
  return { token, expiresAt: new Date(expiresAt * 1000) };
}

export function requireRole(user: AuthUser, roles: readonly Role[]): void {
  if (!roles.includes(user.role)) throw new ForbiddenError();
}
