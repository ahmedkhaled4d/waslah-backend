import type { Types } from 'mongoose';
import { keysetFilter } from '../../lib/pagination';
import { MessageModel, type Message, type MessageStatus } from './messages.model';

export type NewMessage = Omit<Message, '_id' | 'createdAt' | 'updatedAt'>;

export const messagesRepository = {
  async insert(data: NewMessage): Promise<Message> {
    const doc = await MessageModel.create(data);
    return doc.toObject();
  },

  listByConversation(
    conversationId: Types.ObjectId,
    limit: number,
    cursor?: string,
  ): Promise<Message[]> {
    return MessageModel.find({ conversationId, ...keysetFilter('sentAt', cursor) })
      .sort({ sentAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<Message[]>();
  },

  findByWaMessageId(waMessageId: string): Promise<Message | null> {
    return MessageModel.findOne({ waMessageId }).lean<Message>();
  },

  /** Moves the status forward only if the current status is one of `from`. */
  async advanceStatus(
    waMessageId: string,
    from: readonly MessageStatus[],
    to: MessageStatus,
    at: Date,
    error?: Message['error'],
  ): Promise<boolean> {
    const res = await MessageModel.updateOne(
      { waMessageId, status: { $in: from } },
      { $set: { status: to, statusAt: at, ...(error ? { error } : {}) } },
    );
    return res.modifiedCount === 1;
  },

  update(id: Types.ObjectId, set: Partial<Message>): Promise<Message | null> {
    return MessageModel.findByIdAndUpdate(
      id,
      { $set: set },
      { returnDocument: 'after' },
    ).lean<Message>();
  },
};
