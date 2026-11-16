import { model, Schema, type Types } from 'mongoose';

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export interface Deal {
  _id: Types.ObjectId;
  title: string;
  /** Amount in the currency's major unit (e.g. 1500.50 SAR). */
  value: number;
  currency: string;
  pipelineId: Types.ObjectId;
  stageId: Types.ObjectId;
  contactId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  ownerId?: string;
  labelIds: Types.ObjectId[];
  status: DealStatus;
  lostReason?: string;
  expectedCloseDate?: Date;
  closedAt?: Date;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const dealSchema = new Schema<Deal>(
  {
    title: { type: String, required: true, trim: true },
    value: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'SAR', uppercase: true },
    pipelineId: { type: Schema.Types.ObjectId, ref: 'Pipeline', required: true },
    stageId: { type: Schema.Types.ObjectId, required: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    ownerId: { type: String },
    labelIds: { type: [Schema.Types.ObjectId], ref: 'Label', default: [] },
    status: { type: String, enum: DEAL_STATUSES, default: 'open' },
    lostReason: { type: String },
    expectedCloseDate: { type: Date },
    closedAt: { type: Date },
    notes: { type: String },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

dealSchema.index({ pipelineId: 1, stageId: 1, status: 1, updatedAt: -1 });
dealSchema.index({ contactId: 1 });
dealSchema.index({ ownerId: 1, status: 1 });
dealSchema.index({ labelIds: 1 });

export const DealModel = model<Deal>('Deal', dealSchema);
