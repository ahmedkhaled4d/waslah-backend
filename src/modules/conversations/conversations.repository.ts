import { Types } from 'mongoose';
import { keysetFilter } from '../../lib/pagination';
import { ConversationModel, type Conversation } from './conversations.model';

export interface ConversationFilter {
  inboxIds?: Types.ObjectId[];
  status?: Conversation['status'];
  assigneeId?: string | null;
  labelId?: string;
  /** Agents: restrict to their inboxes OR conversations assigned to them. */
  visibleTo?: { inboxIds: Types.ObjectId[]; userId: string };
}

const toId = (id: Types.ObjectId | string) =>
  typeof id === 'string' ? new Types.ObjectId(id) : id;

export const conversationsRepository = {
  async list(filter: ConversationFilter, limit: number, cursor?: string): Promise<Conversation[]> {
    const and: Record<string, unknown>[] = [keysetFilter('lastMessageAt', cursor)];
    if (filter.inboxIds) and.push({ inboxId: { $in: filter.inboxIds } });
    if (filter.status) and.push({ status: filter.status });
    if (filter.assigneeId !== undefined) and.push({ assigneeId: filter.assigneeId });
    if (filter.labelId) and.push({ labelIds: toId(filter.labelId) });
    if (filter.visibleTo) {
      and.push({
        $or: [
          { inboxId: { $in: filter.visibleTo.inboxIds } },
          { assigneeId: filter.visibleTo.userId },
        ],
      });
    }
    return ConversationModel.find({ $and: and })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<Conversation[]>();
  },

  findById(id: Types.ObjectId | string): Promise<Conversation | null> {
    return ConversationModel.findById(id).lean<Conversation>();
  },

  /** Returns the contact's active conversation, creating one in `inboxId` if none exists. */
  getOrCreateActive(
    contactId: Types.ObjectId,
    inboxId: Types.ObjectId,
    at: Date,
  ): Promise<Conversation> {
    return ConversationModel.findOneAndUpdate(
      { contactId, active: true },
      {
        $setOnInsert: {
          contactId,
          inboxId,
          status: 'open',
          active: true,
          assigneeId: null,
          labelIds: [],
          unreadCount: 0,
          lastMessageAt: at,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )
      .lean<Conversation>()
      .orFail();
  },

  async recordInbound(id: Types.ObjectId, at: Date, preview: string): Promise<void> {
    await ConversationModel.updateOne(
      { _id: id },
      [
        {
          $set: {
            unreadCount: { $add: ['$unreadCount', 1] },
            lastInboundAt: { $max: ['$lastInboundAt', at] },
            lastMessagePreview: {
              $cond: [{ $gte: [at, '$lastMessageAt'] }, preview, '$lastMessagePreview'],
            },
            lastMessageAt: { $max: ['$lastMessageAt', at] },
            // A customer replying to a pending conversation re-opens it.
            status: { $cond: [{ $eq: ['$status', 'pending'] }, 'open', '$status'] },
          },
        },
      ],
      { updatePipeline: true },
    );
  },

  async recordOutbound(
    id: Types.ObjectId,
    at: Date,
    preview: string,
    assignTo?: string,
  ): Promise<void> {
    await ConversationModel.updateOne(
      { _id: id },
      {
        $set: { lastMessagePreview: preview, unreadCount: 0 },
        $max: { lastMessageAt: at },
      },
    );
    if (assignTo) {
      await ConversationModel.updateOne(
        { _id: id, assigneeId: null },
        { $set: { assigneeId: assignTo } },
      );
    }
  },

  update(id: Types.ObjectId | string, set: Partial<Conversation>): Promise<Conversation | null> {
    return ConversationModel.findByIdAndUpdate(
      id,
      { $set: set },
      { returnDocument: 'after' },
    ).lean<Conversation>();
  },

  addLabel(id: string, labelId: string): Promise<Conversation | null> {
    return ConversationModel.findByIdAndUpdate(
      id,
      { $addToSet: { labelIds: toId(labelId) } },
      { returnDocument: 'after' },
    ).lean<Conversation>();
  },

  removeLabel(id: string, labelId: string): Promise<Conversation | null> {
    return ConversationModel.findByIdAndUpdate(
      id,
      { $pull: { labelIds: toId(labelId) } },
      { returnDocument: 'after' },
    ).lean<Conversation>();
  },

  async removeLabelEverywhere(labelId: string): Promise<void> {
    await ConversationModel.updateMany(
      { labelIds: toId(labelId) },
      { $pull: { labelIds: toId(labelId) } },
    );
  },

  async countInInbox(inboxId: string): Promise<number> {
    return ConversationModel.countDocuments({ inboxId: toId(inboxId) });
  },
};
