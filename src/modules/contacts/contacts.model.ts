import { model, Schema, type Types } from 'mongoose';

export interface Contact {
  _id: Types.ObjectId;
  waId: string;
  profileName?: string;
  name?: string;
  optIn: boolean;
  lastInboundAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<Contact>(
  {
    waId: { type: String, required: true, unique: true },
    profileName: { type: String },
    name: { type: String },
    optIn: { type: Boolean, default: false },
    lastInboundAt: { type: Date },
  },
  { timestamps: true },
);

export const ContactModel = model<Contact>('Contact', contactSchema);
