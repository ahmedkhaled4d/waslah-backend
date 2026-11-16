import type { Types } from 'mongoose';
import { isDuplicateKeyError } from '../../lib/db';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { DEFAULT_STAGES, type Pipeline, type Stage } from './pipelines.model';
import { pipelinesRepository } from './pipelines.repository';
import type { CreatePipelineInput, StageInput, UpdateStageInput } from './pipelines.schemas';

function found(pipeline: Pipeline | null, what = 'Pipeline'): Pipeline {
  if (!pipeline) throw new NotFoundError(what);
  return pipeline;
}

function rethrowDuplicate(err: unknown): never {
  if (isDuplicateKeyError(err))
    throw new ConflictError('PIPELINE_EXISTS', 'A pipeline with this name already exists');
  throw err;
}

const withDefaults = (s: StageInput): Omit<Stage, '_id'> => ({
  name: s.name,
  color: s.color ?? '#94a3b8',
  probability: s.probability ?? 0,
});

/** Returns true if `ids` is exactly the set of the pipeline's stage ids (any order, no duplicates). */
export function isSameStageSet(stages: Pick<Stage, '_id'>[], ids: string[]): boolean {
  if (stages.length !== ids.length || new Set(ids).size !== ids.length) return false;
  const existing = new Set(stages.map((s) => s._id.toHexString()));
  return ids.every((id) => existing.has(id));
}

export const pipelinesService = {
  list(): Promise<Pipeline[]> {
    return pipelinesRepository.list();
  },

  async getById(id: Types.ObjectId | string): Promise<Pipeline> {
    return found(await pipelinesRepository.findById(id));
  },

  findStage(pipeline: Pipeline, stageId: Types.ObjectId | string): Stage | undefined {
    return pipeline.stages.find((s) => s._id.equals(stageId));
  },

  async create(input: CreatePipelineInput): Promise<Pipeline> {
    const stages = input.stages ? input.stages.map(withDefaults) : DEFAULT_STAGES;
    try {
      return await pipelinesRepository.create(input.name, stages);
    } catch (err) {
      rethrowDuplicate(err);
    }
  },

  async rename(id: string, name: string): Promise<Pipeline> {
    try {
      return found(await pipelinesRepository.rename(id, name));
    } catch (err) {
      rethrowDuplicate(err);
    }
  },

  async addStage(id: string, input: StageInput): Promise<Pipeline> {
    return found(await pipelinesRepository.addStage(id, withDefaults(input)));
  },

  async updateStage(id: string, stageId: string, input: UpdateStageInput): Promise<Pipeline> {
    await this.getById(id);
    return found(await pipelinesRepository.updateStage(id, stageId, input), 'Stage');
  },

  async reorderStages(id: string, stageIds: string[]): Promise<Pipeline> {
    const pipeline = await this.getById(id);
    if (!isSameStageSet(pipeline.stages, stageIds)) {
      throw new ValidationError({
        fields: { stageIds: 'Must list every stage of the pipeline exactly once' },
      });
    }
    const byId = new Map(pipeline.stages.map((s) => [s._id.toHexString(), s]));
    const ordered = stageIds.map((sid) => byId.get(sid)).filter((s): s is Stage => s !== undefined);
    const updated = await pipelinesRepository.replaceStages(id, pipeline.updatedAt, ordered);
    if (!updated)
      throw new ConflictError(
        'PIPELINE_CHANGED',
        'The pipeline changed while reordering. Reload and try again.',
      );
    return updated;
  },

  /** Document-only removal. Use pipelineBoardService.removeStage, which checks for deals first. */
  async removeStageDocument(id: string, stageId: string): Promise<Pipeline> {
    const pipeline = await this.getById(id);
    if (!this.findStage(pipeline, stageId)) throw new NotFoundError('Stage');
    if (pipeline.stages.length === 1) {
      throw new ConflictError('LAST_STAGE', 'A pipeline must have at least one stage');
    }
    return found(await pipelinesRepository.removeStage(id, stageId));
  },

  async deletePipelineDocument(id: string): Promise<void> {
    if (!(await pipelinesRepository.delete(id))) throw new NotFoundError('Pipeline');
  },
};
