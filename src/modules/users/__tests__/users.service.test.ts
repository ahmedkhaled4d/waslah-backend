import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../../../lib/password';

vi.mock('../users.repository', () => ({
  usersRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    touchLastLogin: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  },
}));
vi.mock('../../../lib/auth', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/auth')>('../../../lib/auth');
  return {
    ...actual,
    signToken: vi.fn(async () => ({ token: 'jwt', expiresAt: new Date('2030-01-01') })),
  };
});

const { usersRepository } = await import('../users.repository');
const { signToken } = await import('../../../lib/auth');
const { usersService, toPublicUser } = await import('../users.service');

const passwordHash = await hashPassword('s3cret-pass');
const admin = {
  _id: new Types.ObjectId(),
  email: 'admin@example.com',
  name: 'Admin',
  passwordHash,
  role: 'admin' as const,
  status: 'active' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const adminId = admin._id.toHexString();

beforeEach(() => {
  vi.mocked(usersRepository.touchLastLogin).mockResolvedValue(undefined);
});

describe('login', () => {
  it('returns a token and the user without the password hash', async () => {
    vi.mocked(usersRepository.findByEmail).mockResolvedValue(admin);
    const result = await usersService.login({ email: 'admin@example.com', password: 's3cret-pass' });
    expect(result.token).toBe('jwt');
    expect(result.tokenType).toBe('Bearer');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.lastLoginAt).toBeInstanceOf(Date);
    expect(signToken).toHaveBeenCalledWith({ id: adminId, role: 'admin' });
    expect(usersRepository.touchLastLogin).toHaveBeenCalledWith(admin._id, expect.any(Date));
  });

  it('rejects a wrong password with the same error as an unknown email', async () => {
    vi.mocked(usersRepository.findByEmail).mockResolvedValue(admin);
    await expect(
      usersService.login({ email: 'admin@example.com', password: 'nope-nope' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });

    vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
    await expect(
      usersService.login({ email: 'ghost@example.com', password: 's3cret-pass' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(signToken).not.toHaveBeenCalled();
  });

  it('refuses disabled users even with the right password', async () => {
    vi.mocked(usersRepository.findByEmail).mockResolvedValue({ ...admin, status: 'disabled' });
    await expect(
      usersService.login({ email: 'admin@example.com', password: 's3cret-pass' }),
    ).rejects.toMatchObject({ code: 'USER_DISABLED', status: 403 });
  });
});

describe('me', () => {
  it('returns the profile for an active user', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue(admin);
    await expect(usersService.me({ id: adminId, role: 'admin' })).resolves.toEqual(
      toPublicUser(admin),
    );
  });

  it('rejects tokens for disabled or missing users', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue({ ...admin, status: 'disabled' });
    await expect(usersService.me({ id: adminId, role: 'admin' })).rejects.toMatchObject({
      status: 401,
    });
    vi.mocked(usersRepository.findById).mockResolvedValue(null);
    await expect(usersService.me({ id: adminId, role: 'admin' })).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('changePassword', () => {
  it('requires the current password', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue(admin);
    await expect(
      usersService.changePassword(
        { id: adminId, role: 'admin' },
        { currentPassword: 'wrong-one', newPassword: 'new-password' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(usersRepository.update).not.toHaveBeenCalled();
  });

  it('stores a new hash, never the plain password', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue(admin);
    vi.mocked(usersRepository.update).mockResolvedValue(admin);
    await usersService.changePassword(
      { id: adminId, role: 'admin' },
      { currentPassword: 's3cret-pass', newPassword: 'new-password' },
    );
    const data = vi.mocked(usersRepository.update).mock.calls[0]?.[1];
    expect(data?.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(data)).not.toContain('new-password');
  });
});

describe('create', () => {
  it('hashes the password and maps duplicate emails to a conflict', async () => {
    vi.mocked(usersRepository.create).mockResolvedValue(admin);
    await usersService.create({
      email: 'admin@example.com',
      name: 'Admin',
      password: 's3cret-pass',
      role: 'admin',
    });
    const data = vi.mocked(usersRepository.create).mock.calls[0]?.[0];
    expect(data?.passwordHash).toMatch(/^scrypt\$/);
    expect(data).not.toHaveProperty('password');
    expect(data?.status).toBe('active');

    vi.mocked(usersRepository.create).mockRejectedValue({ code: 11000 });
    await expect(
      usersService.create({ email: 'admin@example.com', name: 'A', password: 's3cret-pass', role: 'agent' }),
    ).rejects.toMatchObject({ code: 'USER_EXISTS', status: 409 });
  });
});

describe('update', () => {
  it('stops an admin from changing their own role or status', async () => {
    const actor = { id: adminId, role: 'admin' as const };
    await expect(usersService.update(actor, adminId, { role: 'agent' })).rejects.toMatchObject({
      code: 'CANNOT_MODIFY_SELF',
    });
    await expect(usersService.update(actor, adminId, { status: 'disabled' })).rejects.toMatchObject(
      { code: 'CANNOT_MODIFY_SELF' },
    );
    vi.mocked(usersRepository.update).mockResolvedValue(admin);
    await expect(usersService.update(actor, adminId, { name: 'New' })).resolves.toBeDefined();
  });

  it('returns 404 for unknown users', async () => {
    vi.mocked(usersRepository.update).mockResolvedValue(null);
    await expect(
      usersService.update({ id: 'other', role: 'admin' }, adminId, { name: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
