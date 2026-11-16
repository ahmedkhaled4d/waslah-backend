import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../pipelines.repository', () => ({
  pipelinesRepository: { findById: vi.fn(), replaceStages: vi.fn() },
}));
vi.mock('../../deals/deals.service', () => ({
  dealsService: { totalsByStage: vi.fn(), countInStage: vi.fn(), countInPipeline: vi.fn() },
}));

const { pipelinesRepository } = await import('../pipelines.repository');
const { dealsService } = await import('../../deals/deals.service');
const { isSameStageSet, pipelinesService } = await import('../pipelines.service');
const { pipelineBoardService } = await import('../pipeline-board.service');

const stages = ['New', 'Qualified', 'Won'].map((name, i) => ({
  _id: new Types.ObjectId(),
  name,
  color: '#000000',
  probability: [10, 50, 100][i] ?? 0,
}));
const ids = stages.map((s) => s._id.toHexString());
const pipeline = {
  _id: new Types.ObjectId(),
  name: 'Sales',
  stages,
  updatedAt: new Date(),
  createdAt: new Date(),
};
const pid = pipeline._id.toHexString();

describe('isSameStageSet', () => {
  it('accepts a permutation', () => {
    expect(isSameStageSet(stages, [ids[2]!, ids[0]!, ids[1]!])).toBe(true);
  });
  it('rejects missing, extra, or duplicated ids', () => {
    expect(isSameStageSet(stages, ids.slice(0, 2))).toBe(false);
    expect(isSameStageSet(stages, [...ids.slice(0, 2), ids[0]!])).toBe(false);
    expect(isSameStageSet(stages, [...ids.slice(0, 2), new Types.ObjectId().toHexString()])).toBe(
      false,
    );
  });
});

describe('reorderStages', () => {
  it('saves stages in the requested order', async () => {
    vi.mocked(pipelinesRepository.findById).mockResolvedValue(pipeline);
    vi.mocked(pipelinesRepository.replaceStages).mockResolvedValue(pipeline);
    await pipelinesService.reorderStages(pid, [ids[2]!, ids[1]!, ids[0]!]);
    expect(
      vi.mocked(pipelinesRepository.replaceStages).mock.calls[0]?.[2].map((s) => s.name),
    ).toEqual(['Won', 'Qualified', 'New']);
  });

  it('reports a conflict if the pipeline changed meanwhile', async () => {
    vi.mocked(pipelinesRepository.findById).mockResolvedValue(pipeline);
    vi.mocked(pipelinesRepository.replaceStages).mockResolvedValue(null);
    await expect(pipelinesService.reorderStages(pid, ids)).rejects.toMatchObject({
      code: 'PIPELINE_CHANGED',
    });
  });
});

describe('board', () => {
  it('computes counts, totals and weighted value per stage', async () => {
    vi.mocked(pipelinesRepository.findById).mockResolvedValue(pipeline);
    vi.mocked(dealsService.totalsByStage).mockResolvedValue([
      { stageId: stages[0]!._id, count: 2, value: 1000 },
      { stageId: stages[1]!._id, count: 1, value: 500 },
    ]);
    const board = await pipelineBoardService.board(pid);
    expect(board.columns.map((c) => [c.dealCount, c.totalValue, c.weightedValue])).toEqual([
      [2, 1000, 100],
      [1, 500, 250],
      [0, 0, 0],
    ]);
    expect(board.totals).toEqual({ dealCount: 3, totalValue: 1500, weightedValue: 350 });
  });

  it('refuses to remove a stage that still has deals', async () => {
    vi.mocked(dealsService.countInStage).mockResolvedValue(3);
    await expect(pipelineBoardService.removeStage(pid, ids[0]!)).rejects.toMatchObject({
      code: 'STAGE_HAS_DEALS',
    });
  });
});
