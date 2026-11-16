import { ConflictError } from '../../lib/errors';
import { dealsService } from '../deals/deals.service';
import type { Pipeline, Stage } from './pipelines.model';
import { pipelinesService } from './pipelines.service';

export interface BoardColumn extends Stage {
  dealCount: number;
  totalValue: number;
  weightedValue: number;
}

export interface Board {
  pipeline: Pick<Pipeline, '_id' | 'name'>;
  columns: BoardColumn[];
  totals: { dealCount: number; totalValue: number; weightedValue: number };
}

/** Operations that need both pipelines and deals. Kept separate to avoid a circular import. */
export const pipelineBoardService = {
  /** Stages in order with open-deal counts, total and probability-weighted value. */
  async board(id: string): Promise<Board> {
    const pipeline = await pipelinesService.getById(id);
    const totals = await dealsService.totalsByStage(pipeline._id);
    const byStage = new Map(totals.map((t) => [t.stageId.toHexString(), t]));

    const columns = pipeline.stages.map((stage) => {
      const t = byStage.get(stage._id.toHexString());
      const totalValue = t?.value ?? 0;
      return {
        ...stage,
        dealCount: t?.count ?? 0,
        totalValue,
        weightedValue: Math.round(totalValue * stage.probability) / 100,
      };
    });

    return {
      pipeline: { _id: pipeline._id, name: pipeline.name },
      columns,
      totals: {
        dealCount: columns.reduce((n, c) => n + c.dealCount, 0),
        totalValue: columns.reduce((n, c) => n + c.totalValue, 0),
        weightedValue: columns.reduce((n, c) => n + c.weightedValue, 0),
      },
    };
  },

  async removeStage(id: string, stageId: string): Promise<Pipeline> {
    if ((await dealsService.countInStage(id, stageId)) > 0) {
      throw new ConflictError(
        'STAGE_HAS_DEALS',
        'Move the deals in this stage to another stage first',
      );
    }
    return pipelinesService.removeStageDocument(id, stageId);
  },

  async deletePipeline(id: string): Promise<void> {
    await pipelinesService.getById(id);
    if ((await dealsService.countInPipeline(id)) > 0) {
      throw new ConflictError(
        'PIPELINE_HAS_DEALS',
        'Delete or move the deals in this pipeline first',
      );
    }
    await pipelinesService.deletePipelineDocument(id);
  },
};
