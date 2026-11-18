import { model, Schema, type Types } from 'mongoose';

export const MESSAGE_STATUSES = [
  'received',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface MessageMedia {
  waMediaId: string;
  mimeType?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  /** Set once the media has been copied to S3. */
  s3Key?: string;
}

export interface Message {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  contactId: Types.ObjectId;
  direction: 'inbound' | 'outbound';
  /** WhatsApp message id (wamid). Absent only while an outbound message is queued. */
  waMessageId?: string;
  type: string;
  text?: string;
  media?: MessageMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  /** Button / list reply or quick-reply button press. */
  reply?: { id?: string; title?: string };
  reaction?: { messageId: string; emoji?: string };
  replyToWaMessageId?: string;
  status: MessageStatus;
  statusAt?: Date;
  error?: { code: number; title?: string; message?: string };
  /** User id of the agent who sent an outbound message. */
  sentBy?: string;
  /** When WhatsApp says the message happened. */
  sentAt: Date;
  /** Original webhook payload for message types we don't model yet. */
  raw?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<Message>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    waMessageId: { type: String },
    type: { type: String, required: true },
    text: { type: String },
    media: {
      type: new Schema<MessageMedia>(
        {
          waMediaId: { type: String, required: true },
          mimeType: String,
          sha256: String,
          caption: String,
          filename: String,
          s3Key: String,
        },
        { _id: false },
      ),
    },
    location: {
      type: new Schema(
        { latitude: Number, longitude: Number, name: String, address: String },
        { _id: false },
      ),
    },
    reply: { type: new Schema({ id: String, title: String }, { _id: false }) },
    reaction: { type: new Schema({ messageId: String, emoji: String }, { _id: false }) },
    replyToWaMessageId: { type: String },
    status: { type: String, enum: MESSAGE_STATUSES, required: true },
    statusAt: { type: Date },
    error: { type: new Schema({ code: Number, title: String, message: String }, { _id: false }) },
    sentBy: { type: String },
    sentAt: { type: Date, required: true },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Idempotency: Meta may deliver the same message more than once.
messageSchema.index(
  { waMessageId: 1 },
  { unique: true, partialFilterExpression: { waMessageId: { $type: 'string' } } },
);
messageSchema.index({ conversationId: 1, sentAt: -1, _id: -1 });

export const MessageModel = model<Message>('Message', messageSchema);
