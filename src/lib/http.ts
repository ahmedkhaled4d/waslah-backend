import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { authenticate, requireRole, type AuthUser, type Role } from './auth';
import { connectDb } from './db';
import { AppError, NotFoundError, ValidationError } from './errors';
import { logger } from './logger';

export type HttpEvent = APIGatewayProxyEventV2;
export type HttpResult = APIGatewayProxyStructuredResultV2;

export interface RouteContext {
  event: HttpEvent;
  user: AuthUser;
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: unknown;
}

export interface RouteResponse {
  status: number;
  body?: unknown;
}

export interface Route {
  public?: false;
  roles: readonly Role[];
  handler: (ctx: RouteContext) => Promise<RouteResponse>;
}

/** A route that needs no bearer token (e.g. login). Keep these to a minimum. */
export interface PublicRoute {
  public: true;
  handler: (ctx: PublicRouteContext) => Promise<RouteResponse>;
}

export type PublicRouteContext = Omit<RouteContext, 'user'>;

/** Keys are API Gateway route keys, e.g. "GET /v1/inboxes/{id}". */
export type RouteTable = Record<string, Route | PublicRoute>;

export function isPublicRoute(route: Route | PublicRoute): route is PublicRoute {
  return route.public === true;
}

export function json(status: number, body?: unknown): HttpResult {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

export function rawBody(event: HttpEvent): Buffer {
  if (!event.body) return Buffer.alloc(0);
  return Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
}

function parseJsonBody(event: HttpEvent): unknown {
  const buf = rawBody(event);
  if (buf.length === 0) return undefined;
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new ValidationError({ body: 'Body must be valid JSON' });
  }
}

export function toErrorResponse(err: unknown): HttpResult {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('Request failed', { code: err.code, error: err });
    return json(err.status, {
      error: { code: err.code, message: err.message, details: err.details ?? {} },
    });
  }
  logger.error('Unhandled error', { error: err as Error });
  return json(500, { error: { code: 'INTERNAL', message: 'Internal server error', details: {} } });
}

/** One Lambda per module: dispatches on API Gateway's routeKey, authenticates, enforces roles. */
export function createHttpHandler(routes: RouteTable) {
  return async (event: HttpEvent, context: Context): Promise<HttpResult> => {
    context.callbackWaitsForEmptyEventLoop = false;
    try {
      const route = routes[event.routeKey];
      if (!route) throw new NotFoundError('Route');
      const ctx = (): PublicRouteContext => ({
        event,
        params: event.pathParameters ?? {},
        query: event.queryStringParameters ?? {},
        body: parseJsonBody(event),
      });
      if (isPublicRoute(route)) {
        await connectDb();
        const res = await route.handler(ctx());
        return json(res.status, res.body);
      }
      const user = await authenticate(event.headers.authorization);
      requireRole(user, route.roles);
      await connectDb();
      const res = await route.handler({ ...ctx(), user });
      return json(res.status, res.body);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export const ok = (body: unknown): RouteResponse => ({ status: 200, body });
export const created = (body: unknown): RouteResponse => ({ status: 201, body });
export const noContent = (): RouteResponse => ({ status: 204 });
