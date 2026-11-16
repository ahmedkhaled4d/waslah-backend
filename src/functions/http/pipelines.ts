import { ANY_ROLE, MANAGERS } from '../../lib/auth';
import { created, createHttpHandler, noContent, ok, type RouteTable } from '../../lib/http';
import { parse } from '../../lib/validation';
import { pipelineBoardService } from '../../modules/pipelines/pipeline-board.service';
import {
  addStageSchema,
  createPipelineSchema,
  reorderStagesSchema,
  updatePipelineSchema,
  updateStageSchema,
} from '../../modules/pipelines/pipelines.schemas';
import { pipelinesService } from '../../modules/pipelines/pipelines.service';
import { idParam } from './params';

export const routes: RouteTable = {
  'GET /v1/pipelines': {
    roles: ANY_ROLE,
    handler: async () => ok({ data: await pipelinesService.list() }),
  },
  'GET /v1/pipelines/{id}': {
    roles: ANY_ROLE,
    handler: async (ctx) => ok(await pipelinesService.getById(idParam(ctx))),
  },
  'GET /v1/pipelines/{id}/board': {
    roles: ANY_ROLE,
    handler: async (ctx) => ok(await pipelineBoardService.board(idParam(ctx))),
  },
  'POST /v1/pipelines': {
    roles: MANAGERS,
    handler: async (ctx) =>
      created(await pipelinesService.create(parse(createPipelineSchema, ctx.body))),
  },
  'PATCH /v1/pipelines/{id}': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(await pipelinesService.rename(idParam(ctx), parse(updatePipelineSchema, ctx.body).name)),
  },
  'DELETE /v1/pipelines/{id}': {
    roles: MANAGERS,
    handler: async (ctx) => {
      await pipelineBoardService.deletePipeline(idParam(ctx));
      return noContent();
    },
  },
  'POST /v1/pipelines/{id}/stages': {
    roles: MANAGERS,
    handler: async (ctx) =>
      created(await pipelinesService.addStage(idParam(ctx), parse(addStageSchema, ctx.body))),
  },
  'PUT /v1/pipelines/{id}/stages/order': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(
        await pipelinesService.reorderStages(
          idParam(ctx),
          parse(reorderStagesSchema, ctx.body).stageIds,
        ),
      ),
  },
  'PATCH /v1/pipelines/{id}/stages/{stageId}': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(
        await pipelinesService.updateStage(
          idParam(ctx),
          idParam(ctx, 'stageId'),
          parse(updateStageSchema, ctx.body),
        ),
      ),
  },
  'DELETE /v1/pipelines/{id}/stages/{stageId}': {
    roles: MANAGERS,
    handler: async (ctx) =>
      ok(await pipelineBoardService.removeStage(idParam(ctx), idParam(ctx, 'stageId'))),
  },
};

export const handler = createHttpHandler(routes);
