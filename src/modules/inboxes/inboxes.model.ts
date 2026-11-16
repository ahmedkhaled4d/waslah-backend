import { model, Schema, type Types } from 'mongoose';

export interface Inbox {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  color: string;
  /** User ids (JWT `sub`) of agents who work this inbox. */
  memberIds: string[];
  /** New conversations land in the default inbox. Exactly one inbox is default. */
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const inboxSchema = new Schema<Inbox>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String },
    color: { type: String, default: '#3b82f6' },
    memberIds: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

inboxSchema.index({ memberIds: 1 });
inboxSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export const InboxModel = model<Inbox>('Inbox', inboxSchema);
