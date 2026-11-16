import { ANY_ROLE, MANAGERS } from '../../lib/auth';
import { created, createHttpHandler, ok, type RouteTable } from '../../lib/http';
import { parse } from '../../lib/validation';
import {
  assignSchema,
  labelSchema,
  listConversationsQuery,
  moveSchema,
  statusSchema,
} from '../../modules/conversations/conversations.schemas';
import { conversationsService } from '../../modules/conversations/conversations.service';
import { listMessagesQuery, sendTextSchema } from '../../modules/messages/messages.schemas';
import { messagesService } from '../../modules/messages/messages.service';
import { idParam } from './params';

export const routes: RouteTable = {
  'GET /v1/conversations': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(await conversationsService.list(ctx.user, parse(listConversationsQuery, ctx.query))),
  },
  'GET /v1/conversations/{id}': {
    roles: ANY_ROLE,
    handler: async (ctx) => ok(await conversationsService.getForUser(ctx.user, idParam(ctx))),
  },
  'POST /v1/conversations/{id}/assign': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(
        await conversationsService.assign(
          ctx.user,
          idParam(ctx),
          parse(assignSchema, ctx.body).assigneeId,
        ),
      ),
  },
  'POST /v1/conversations/{id}/status': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(
        await conversationsService.setStatus(
          ctx.user,
          idParam(ctx),
          parse(statusSchema, ctx.body).status,
        ),
      ),
  },
  'POST /v1/conversations/{id}/move': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(
        await conversationsService.moveToInbox(
          ctx.user,
          idParam(ctx),
          parse(moveSchema, ctx.body).inboxId,
        ),
      ),
  },
  'POST /v1/conversations/{id}/read': {
    roles: ANY_ROLE,
    handler: async (ctx) => ok(await conversationsService.markRead(ctx.user, idParam(ctx))),
  },
  'POST /v1/conversations/{id}/labels': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(
        await conversationsService.addLabel(
          ctx.user,
          idParam(ctx),
          parse(labelSchema, ctx.body).labelId,
        ),
      ),
  },
  'DELETE /v1/conversations/{id}/labels/{labelId}': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(await conversationsService.removeLabel(ctx.user, idParam(ctx), idParam(ctx, 'labelId'))),
  },
  'GET /v1/conversations/{id}/messages': {
    roles: ANY_ROLE,
    handler: async (ctx) => {
      const { limit, cursor } = parse(listMessagesQuery, ctx.query);
      return ok(await messagesService.list(ctx.user, idParam(ctx), limit, cursor));
    },
  },
  'POST /v1/conversations/{id}/messages': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      created(
        await messagesService.sendText(ctx.user, idParam(ctx), parse(sendTextSchema, ctx.body)),
      ),
  },
};

export const handler = createHttpHandler(routes);
