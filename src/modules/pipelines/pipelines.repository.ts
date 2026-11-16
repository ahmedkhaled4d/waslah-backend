import { Types } from 'mongoose';
import { PipelineModel, type Pipeline, type Stage } from './pipelines.model';

const after = { returnDocument: 'after' } as const;

export const pipelinesRepository = {
  list(): Promise<Pipeline[]> {
    return PipelineModel.find().sort({ createdAt: 1 }).lean<Pipeline[]>();
  },

  findById(id: Types.ObjectId | string): Promise<Pipeline | null> {
    return PipelineModel.findById(id).lean<Pipeline>();
  },

  async create(name: string, stages: Omit<Stage, '_id'>[]): Promise<Pipeline> {
    const doc = await PipelineModel.create({ name, stages });
    return doc.toObject();
  },

  rename(id: string, name: string): Promise<Pipeline | null> {
    return PipelineModel.findByIdAndUpdate(id, { $set: { name } }, after).lean<Pipeline>();
  },

  addStage(id: string, stage: Omit<Stage, '_id'>): Promise<Pipeline | null> {
    return PipelineModel.findByIdAndUpdate(
      id,
      { $push: { stages: stage } },
      after,
    ).lean<Pipeline>();
  },

  updateStage(
    id: string,
    stageId: string,
    set: Partial<Omit<Stage, '_id'>>,
  ): Promise<Pipeline | null> {
    const prefixed = Object.fromEntries(Object.entries(set).map(([k, v]) => [`stages.$.${k}`, v]));
    return PipelineModel.findOneAndUpdate(
      { _id: id, 'stages._id': new Types.ObjectId(stageId) },
      { $set: prefixed },
      after,
    ).lean<Pipeline>();
  },

  removeStage(id: string, stageId: string): Promise<Pipeline | null> {
    return PipelineModel.findByIdAndUpdate(
      id,
      { $pull: { stages: { _id: new Types.ObjectId(stageId) } } },
      after,
    ).lean<Pipeline>();
  },

  /** Replaces the stage array only if the pipeline hasn't changed since it was read. */
  replaceStages(id: string, expectedUpdatedAt: Date, stages: Stage[]): Promise<Pipeline | null> {
    return PipelineModel.findOneAndUpdate(
      { _id: id, updatedAt: expectedUpdatedAt },
      { $set: { stages } },
      after,
    ).lean<Pipeline>();
  },

  async delete(id: string): Promise<boolean> {
    const res = await PipelineModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },
};
