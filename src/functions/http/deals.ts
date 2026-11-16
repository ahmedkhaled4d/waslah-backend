import { ANY_ROLE, MANAGERS } from '../../lib/auth';
import { created, createHttpHandler, noContent, ok, type RouteTable } from '../../lib/http';
import { parse } from '../../lib/validation';
import {
  createDealSchema,
  dealLabelSchema,
  dealStatusSchema,
  listDealsQuery,
  moveDealSchema,
  updateDealSchema,
} from '../../modules/deals/deals.schemas';
import { dealsService } from '../../modules/deals/deals.service';
import { idParam } from './params';

export const routes: RouteTable = {
  'GET /v1/deals': {
    roles: ANY_ROLE,
    handler: async (ctx) => ok(await dealsService.list(parse(listDealsQuery, ctx.query))),
  },
  'GET /v1/deals/{id}': {
    roles: ANY_ROLE,
    handler: async (ctx) => ok(await dealsService.getById(idParam(ctx))),
  },
  'POST /v1/deals': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      created(await dealsService.create(ctx.user, parse(createDealSchema, ctx.body))),
  },
  'PATCH /v1/deals/{id}': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(await dealsService.update(idParam(ctx), parse(updateDealSchema, ctx.body))),
  },
  'POST /v1/deals/{id}/move': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(await dealsService.move(idParam(ctx), parse(moveDealSchema, ctx.body))),
  },
  'POST /v1/deals/{id}/status': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(await dealsService.setStatus(idParam(ctx), parse(dealStatusSchema, ctx.body))),
  },
  'POST /v1/deals/{id}/labels': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(await dealsService.addLabel(idParam(ctx), parse(dealLabelSchema, ctx.body).labelId)),
  },
  'DELETE /v1/deals/{id}/labels/{labelId}': {
    roles: ANY_ROLE,
    handler: async (ctx) =>
      ok(await dealsService.removeLabel(idParam(ctx), idParam(ctx, 'labelId'))),
  },
  'DELETE /v1/deals/{id}': {
    roles: MANAGERS,
    handler: async (ctx) => {
      await dealsService.delete(idParam(ctx));
      return noContent();
    },
  },
};

export const handler = createHttpHandler(routes);
