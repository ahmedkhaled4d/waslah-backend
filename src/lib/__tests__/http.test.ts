import type { Context } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../errors';

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');
  return {
    ...actual,
    authenticate: vi.fn((header: string | undefined) => {
      if (header === 'Bearer agent') return Promise.resolve({ id: 'u1', role: 'agent' as const });
      return Promise.reject(new UnauthorizedError());
    }),
  };
});
vi.mock('../db', () => ({ connectDb: vi.fn(() => Promise.resolve(undefined)) }));

const { authenticate } = await import('../auth');
const { createHttpHandler, ok } = await import('../http');

const handler = createHttpHandler({
  'POST /v1/auth/login': {
    public: true,
    handler: (ctx) => Promise.resolve(ok({ body: ctx.body })),
  },
  'GET /v1/auth/me': {
    roles: ['agent'],
    handler: (ctx) => Promise.resolve(ok({ id: ctx.user.id })),
  },
  'GET /v1/users': { roles: ['admin'], handler: () => Promise.resolve(ok({})) },
});

const invoke = (routeKey: string, headers: Record<string, string> = {}, body?: string) =>
  handler(
    {
      routeKey,
      headers,
      body,
      isBase64Encoded: false,
      requestContext: { http: { method: routeKey.split(' ')[0] } },
    } as never,
    {} as Context,
  );

describe('createHttpHandler', () => {
  it('serves public routes without a token', async () => {
    const res = await invoke('POST /v1/auth/login', {}, '{"email":"a@b.co"}');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '')).toEqual({ body: { email: 'a@b.co' } });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('requires a token on private routes', async () => {
    const res = await invoke('GET /v1/auth/me');
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body ?? '') as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('passes the authenticated user to the handler', async () => {
    const res = await invoke('GET /v1/auth/me', { authorization: 'Bearer agent' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '')).toEqual({ id: 'u1' });
  });

  it('enforces roles', async () => {
    const res = await invoke('GET /v1/users', { authorization: 'Bearer agent' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for unknown routes', async () => {
    expect((await invoke('GET /nope')).statusCode).toBe(404);
  });
});
