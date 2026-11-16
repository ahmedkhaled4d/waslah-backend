import { ANY_ROLE, MANAGERS } from '../../lib/auth';
import { created, createHttpHandler, noContent, ok, type RouteTable } from '../../lib/http';
import { parse } from '../../lib/validation';
import { labelDeletionService } from '../../modules/labels/label-deletion.service';
import { createLabelSchema, updateLabelSchema } from '../../modules/labels/labels.schemas';
import { labelsService } from '../../modules/labels/labels.service';
import { idParam } from './params';

export const routes: RouteTable = {
  'GET /v1/labels': {
    roles: ANY_ROLE,
    handler: async () => ok({ data: await labelsService.list() }),
  },
  'POST /v1/labels': {
    roles: MANAGERS,
    handler: async (ctx) => created(await labelsService.create(parse(createLabelSchema, ctx.body))),
  },
  'PATCH /v1/labels/{id}': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(await labelsService.update(idParam(ctx), parse(updateLabelSchema, ctx.body))),
  },
  'DELETE /v1/labels/{id}': {
    roles: MANAGERS,
    handler: async (ctx) => {
      await labelDeletionService.delete(idParam(ctx));
      return noContent();
    },
  },
};

export const handler = createHttpHandler(routes);
