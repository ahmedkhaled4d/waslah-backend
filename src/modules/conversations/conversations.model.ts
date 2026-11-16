import { model, Schema, type Types } from 'mongoose';

export const CONVERSATION_STATUSES = ['open', 'pending', 'resolved'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export interface Conversation {
  _id: Types.ObjectId;
  contactId: Types.ObjectId;
  inboxId: Types.ObjectId;
  status: ConversationStatus;
  /**
   * true while open or pending. A partial unique index on { contactId } where active=true
   * guarantees one active conversation per contact, even under concurrent webhooks.
   */
  active: boolean;
  assigneeId: string | null;
  labelIds: Types.ObjectId[];
  lastMessageAt: Date;
  lastMessagePreview?: string;
  lastInboundAt?: Date;
  unreadCount: number;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<Conversation>(
  {
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    inboxId: { type: Schema.Types.ObjectId, ref: 'Inbox', required: true },
    status: { type: String, enum: CONVERSATION_STATUSES, default: 'open' },
    active: { type: Boolean, default: true },
    assigneeId: { type: String, default: null },
    labelIds: { type: [Schema.Types.ObjectId], ref: 'Label', default: [] },
    lastMessageAt: { type: Date, required: true },
    lastMessagePreview: { type: String },
    lastInboundAt: { type: Date },
    unreadCount: { type: Number, default: 0 },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

conversationSchema.index(
  { contactId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_per_contact' },
);
conversationSchema.index({ contactId: 1, status: 1 });
conversationSchema.index({ inboxId: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ assigneeId: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ labelIds: 1, lastMessageAt: -1 });

export const ConversationModel = model<Conversation>('Conversation', conversationSchema);
