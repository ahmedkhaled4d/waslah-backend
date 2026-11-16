import { model, Schema, type Types } from 'mongoose';

export interface Stage {
  _id: Types.ObjectId;
  name: string;
  color: string;
  /** Win probability 0-100, used for weighted pipeline value. */
  probability: number;
}

export interface Pipeline {
  _id: Types.ObjectId;
  name: string;
  /** Array order is board order. */
  stages: Stage[];
  createdAt: Date;
  updatedAt: Date;
}

const stageSchema = new Schema<Stage>({
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#94a3b8' },
  probability: { type: Number, min: 0, max: 100, default: 0 },
});

const pipelineSchema = new Schema<Pipeline>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    stages: { type: [stageSchema], default: [] },
  },
  { timestamps: true },
);

export const PipelineModel = model<Pipeline>('Pipeline', pipelineSchema);

export const DEFAULT_STAGES: Omit<Stage, '_id'>[] = [
  { name: 'New lead', color: '#94a3b8', probability: 10 },
  { name: 'Qualified', color: '#3b82f6', probability: 30 },
  { name: 'Proposal sent', color: '#a855f7', probability: 60 },
  { name: 'Negotiation', color: '#f59e0b', probability: 80 },
];
