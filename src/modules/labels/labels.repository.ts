import type { Types } from 'mongoose';
import { LabelModel, type Label } from './labels.model';

export const labelsRepository = {
  list(): Promise<Label[]> {
    return LabelModel.find().sort({ name: 1 }).lean<Label[]>();
  },

  findById(id: Types.ObjectId | string): Promise<Label | null> {
    return LabelModel.findById(id).lean<Label>();
  },

  async create(data: Omit<Label, '_id' | 'createdAt' | 'updatedAt'>): Promise<Label> {
    const doc = await LabelModel.create(data);
    return doc.toObject();
  },

  update(id: string, data: Partial<Omit<Label, '_id'>>): Promise<Label | null> {
    return LabelModel.findByIdAndUpdate(
      id,
      { $set: data },
      { returnDocument: 'after' },
    ).lean<Label>();
  },

  async delete(id: string): Promise<boolean> {
    const res = await LabelModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },
};
