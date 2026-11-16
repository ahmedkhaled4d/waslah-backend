import { Types } from 'mongoose';
import { keysetFilter } from '../../lib/pagination';
import { DealModel, type Deal } from './deals.model';

export interface DealFilter {
  pipelineId?: string;
  stageId?: string;
  status?: Deal['status'];
  ownerId?: string;
  contactId?: string;
  labelId?: string;
}

export interface StageTotals {
  stageId: Types.ObjectId;
  count: number;
  value: number;
}

const oid = (id: string) => new Types.ObjectId(id);
const after = { returnDocument: 'after' } as const;

export const dealsRepository = {
  list(filter: DealFilter, limit: number, cursor?: string): Promise<Deal[]> {
    const query: Record<string, unknown> = { ...keysetFilter('updatedAt', cursor) };
    if (filter.pipelineId) query.pipelineId = oid(filter.pipelineId);
    if (filter.stageId) query.stageId = oid(filter.stageId);
    if (filter.status) query.status = filter.status;
    if (filter.ownerId) query.ownerId = filter.ownerId;
    if (filter.contactId) query.contactId = oid(filter.contactId);
    if (filter.labelId) query.labelIds = oid(filter.labelId);
    return DealModel.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<Deal[]>();
  },

  findById(id: string): Promise<Deal | null> {
    return DealModel.findById(id).lean<Deal>();
  },

  async create(
    data: Omit<Deal, '_id' | 'createdAt' | 'updatedAt' | 'labelIds' | 'status'>,
  ): Promise<Deal> {
    const doc = await DealModel.create(data);
    return doc.toObject();
  },

  update(id: string, set: Record<string, unknown>, unset: string[] = []): Promise<Deal | null> {
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, 1]));
    return DealModel.findByIdAndUpdate(id, update, after).lean<Deal>();
  },

  addLabel(id: string, labelId: string): Promise<Deal | null> {
    return DealModel.findByIdAndUpdate(
      id,
      { $addToSet: { labelIds: oid(labelId) } },
      after,
    ).lean<Deal>();
  },

  removeLabel(id: string, labelId: string): Promise<Deal | null> {
    return DealModel.findByIdAndUpdate(
      id,
      { $pull: { labelIds: oid(labelId) } },
      after,
    ).lean<Deal>();
  },

  async removeLabelEverywhere(labelId: string): Promise<void> {
    await DealModel.updateMany({ labelIds: oid(labelId) }, { $pull: { labelIds: oid(labelId) } });
  },

  async delete(id: string): Promise<boolean> {
    const res = await DealModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },

  countInStage(pipelineId: string, stageId: string): Promise<number> {
    return DealModel.countDocuments({ pipelineId: oid(pipelineId), stageId: oid(stageId) });
  },

  countInPipeline(pipelineId: string): Promise<number> {
    return DealModel.countDocuments({ pipelineId: oid(pipelineId) });
  },

  /** Open-deal count and total value per stage, for the pipeline board. */
  totalsByStage(pipelineId: Types.ObjectId): Promise<StageTotals[]> {
    return DealModel.aggregate<StageTotals>([
      { $match: { pipelineId, status: 'open' } },
      { $group: { _id: '$stageId', count: { $sum: 1 }, value: { $sum: '$value' } } },
      { $project: { _id: 0, stageId: '$_id', count: 1, value: 1 } },
    ]);
  },
};
