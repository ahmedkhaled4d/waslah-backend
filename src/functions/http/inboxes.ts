import { ANY_ROLE, MANAGERS } from '../../lib/auth';
import { created, createHttpHandler, noContent, ok, type RouteTable } from '../../lib/http';
import { parse } from '../../lib/validation';
import { inboxDeletionService } from '../../modules/inboxes/inbox-deletion.service';
import {
  addMembersSchema,
  createInboxSchema,
  updateInboxSchema,
} from '../../modules/inboxes/inboxes.schemas';
import { inboxesService } from '../../modules/inboxes/inboxes.service';
import { idParam, userIdParam } from './params';

export const routes: RouteTable = {
  'GET /v1/inboxes': {
    roles: ANY_ROLE,
    handler: async ({ user }) => ok({ data: await inboxesService.listForUser(user) }),
  },
  'GET /v1/inboxes/{id}': {
    roles: ANY_ROLE,
    handler: async (ctx) => ok(await inboxesService.getForUser(ctx.user, idParam(ctx))),
  },
  'POST /v1/inboxes': {
    roles: MANAGERS,
    handler: async (ctx) =>
      created(await inboxesService.create(parse(createInboxSchema, ctx.body))),
  },
  'PATCH /v1/inboxes/{id}': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(await inboxesService.update(idParam(ctx), parse(updateInboxSchema, ctx.body))),
  },
  'DELETE /v1/inboxes/{id}': {
    roles: MANAGERS,
    handler: async (ctx) => {
      await inboxDeletionService.delete(idParam(ctx));
      return noContent();
    },
  },
  'POST /v1/inboxes/{id}/members': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(
        await inboxesService.addMembers(idParam(ctx), parse(addMembersSchema, ctx.body).memberIds),
      ),
  },
  'DELETE /v1/inboxes/{id}/members/{userId}': {
    roles: MANAGERS,
    handler: async (ctx) => ok(await inboxesService.removeMember(idParam(ctx), userIdParam(ctx))),
  },
};

export const handler = createHttpHandler(routes);
