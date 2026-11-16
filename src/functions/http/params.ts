import { z } from 'zod';
import type { RouteContext } from '../../lib/http';
import { objectId, parse, userId } from '../../lib/validation';

/** Validates an ObjectId path parameter. */
export function idParam(ctx: RouteContext, name = 'id'): string {
  return parse(z.object({ [name]: objectId }), ctx.params)[name] as string;
}

export function userIdParam(ctx: RouteContext, name = 'userId'): string {
  return parse(z.object({ [name]: userId }), ctx.params)[name] as string;
}
