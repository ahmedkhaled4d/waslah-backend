import { ADMIN_ONLY, ANY_ROLE, MANAGERS } from '../../lib/auth';
import { created, createHttpHandler, noContent, ok, type RouteTable } from '../../lib/http';
import { parse } from '../../lib/validation';
import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  updateUserSchema,
} from '../../modules/users/users.schemas';
import { usersService } from '../../modules/users/users.service';
import { idParam } from './params';

export const routes: RouteTable = {
  'POST /v1/auth/login': {
    public: true,
    handler: async (ctx) => ok(await usersService.login(parse(loginSchema, ctx.body))),
  },
  'GET /v1/auth/me': {
    roles: ANY_ROLE,
    handler: async ({ user }) => ok(await usersService.me(user)),
  },
  'POST /v1/auth/change-password': {
    roles: ANY_ROLE,
    handler: async (ctx) => {
      await usersService.changePassword(ctx.user, parse(changePasswordSchema, ctx.body));
      return noContent();
    },
  },
  'GET /v1/users': {
    roles: MANAGERS,
    handler: async () => ok({ data: await usersService.list() }),
  },
  'GET /v1/users/{id}': {
    roles: MANAGERS,
    handler: async (ctx) => ok(await usersService.getById(idParam(ctx))),
  },
  'POST /v1/users': {
    roles: ADMIN_ONLY,
    handler: async (ctx) => created(await usersService.create(parse(createUserSchema, ctx.body))),
  },
  'PATCH /v1/users/{id}': {
    roles: ADMIN_ONLY,
    handler: async (ctx) =>
      ok(await usersService.update(ctx.user, idParam(ctx), parse(updateUserSchema, ctx.body))),
  },
};

export const handler = createHttpHandler(routes);
