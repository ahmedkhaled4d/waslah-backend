import { model, Schema, type Types } from 'mongoose';

export interface Label {
  _id: Types.ObjectId;
  name: string;
  /** Lower-cased name, unique, so "VIP" and "vip" can't both exist. */
  nameKey: string;
  color: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const labelSchema = new Schema<Label>(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, unique: true },
    color: { type: String, required: true },
    description: { type: String },
  },
  { timestamps: true },
);

export const LabelModel = model<Label>('Label', labelSchema);
