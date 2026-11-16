import type { Types } from 'mongoose';
import { InboxModel, type Inbox } from './inboxes.model';

export const inboxesRepository = {
  list(): Promise<Inbox[]> {
    return InboxModel.find().sort({ name: 1 }).lean<Inbox[]>();
  },

  listForMember(memberId: string): Promise<Inbox[]> {
    return InboxModel.find({ memberIds: memberId }).sort({ name: 1 }).lean<Inbox[]>();
  },

  async idsForMember(memberId: string): Promise<Types.ObjectId[]> {
    const rows = await InboxModel.find({ memberIds: memberId }, { _id: 1 }).lean<
      { _id: Types.ObjectId }[]
    >();
    return rows.map((r) => r._id);
  },

  findById(id: Types.ObjectId | string): Promise<Inbox | null> {
    return InboxModel.findById(id).lean<Inbox>();
  },

  findDefault(): Promise<Inbox | null> {
    return InboxModel.findOne({ isDefault: true }).lean<Inbox>();
  },

  /** Atomically creates the default inbox if none exists. */
  ensureDefault(): Promise<Inbox> {
    return InboxModel.findOneAndUpdate(
      { isDefault: true },
      { $setOnInsert: { name: 'General', isDefault: true, memberIds: [], color: '#3b82f6' } },
      { upsert: true, returnDocument: 'after' },
    )
      .lean<Inbox>()
      .orFail();
  },

  async create(data: Pick<Inbox, 'name' | 'memberIds'> & Partial<Inbox>): Promise<Inbox> {
    const doc = await InboxModel.create(data);
    return doc.toObject();
  },

  update(id: string, data: Partial<Omit<Inbox, '_id'>>): Promise<Inbox | null> {
    return InboxModel.findByIdAndUpdate(
      id,
      { $set: data },
      { returnDocument: 'after' },
    ).lean<Inbox>();
  },

  async clearDefaultExcept(id: string): Promise<void> {
    await InboxModel.updateMany(
      { isDefault: true, _id: { $ne: id } },
      { $set: { isDefault: false } },
    );
  },

  addMembers(id: string, memberIds: string[]): Promise<Inbox | null> {
    return InboxModel.findByIdAndUpdate(
      id,
      { $addToSet: { memberIds: { $each: memberIds } } },
      { returnDocument: 'after' },
    ).lean<Inbox>();
  },

  removeMember(id: string, memberId: string): Promise<Inbox | null> {
    return InboxModel.findByIdAndUpdate(
      id,
      { $pull: { memberIds: memberId } },
      { returnDocument: 'after' },
    ).lean<Inbox>();
  },

  async delete(id: string): Promise<boolean> {
    const res = await InboxModel.deleteOne({ _id: id });
    return res.deletedCount === 1;
  },
};
