import { Types } from 'mongoose';
import { z } from 'zod';
import { ValidationError } from './errors';

export const paginationQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
};

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

interface CursorValue {
  at: string;
  id: string;
}

export function encodeCursor(at: Date, id: Types.ObjectId): string {
  const value: CursorValue = { at: at.toISOString(), id: id.toHexString() };
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: Types.ObjectId } {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorValue;
    const at = new Date(value.at);
    if (Number.isNaN(at.getTime()) || !Types.ObjectId.isValid(value.id)) throw new Error('bad');
    return { at, id: new Types.ObjectId(value.id) };
  } catch {
    throw new ValidationError({ fields: { cursor: 'Invalid cursor' } });
  }
}

/** Keyset filter for lists sorted by `{ [field]: -1, _id: -1 }`. */
export function keysetFilter(field: string, cursor?: string): Record<string, unknown> {
  if (!cursor) return {};
  const { at, id } = decodeCursor(cursor);
  return { $or: [{ [field]: { $lt: at } }, { [field]: at, _id: { $lt: id } }] };
}

/** Builds a page from `limit + 1` fetched rows. */
export function toPage<T extends { _id: Types.ObjectId }>(
  rows: T[],
  limit: number,
  sortValue: (row: T) => Date,
): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    data,
    nextCursor: hasMore && last ? encodeCursor(sortValue(last), last._id) : null,
  };
}
