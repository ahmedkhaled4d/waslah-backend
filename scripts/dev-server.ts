/**
 * Local HTTP server that mounts every Lambda route table so the API can be exercised
 * without deploying. Run with `npm run dev` (loads `.env`; see `.env.example`).
 *
 * Secrets are plain values in `.env`. AWS credentials are only needed if you exercise the
 * webhook, which enqueues to the SQS queue in `WA_INBOUND_QUEUE_URL`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Context } from 'aws-lambda';
import { routes as conversationRoutes } from '../src/functions/http/conversations';
import { routes as dealRoutes } from '../src/functions/http/deals';
import { routes as inboxRoutes } from '../src/functions/http/inboxes';
import { routes as labelRoutes } from '../src/functions/http/labels';
import { routes as pipelineRoutes } from '../src/functions/http/pipelines';
import { routes as userRoutes } from '../src/functions/http/users';
import { handler as webhookHandler } from '../src/functions/http/whatsapp-webhook';
import { getConfig } from '../src/lib/config';
import {
  createHttpHandler,
  json,
  type HttpEvent,
  type HttpResult,
  type RouteTable,
} from '../src/lib/http';

const WEBHOOK_PATH = '/webhooks/whatsapp';

const tables: RouteTable[] = [
  userRoutes,
  inboxRoutes,
  conversationRoutes,
  labelRoutes,
  pipelineRoutes,
  dealRoutes,
];

const routes: RouteTable = {};
for (const table of tables) {
  for (const [key, route] of Object.entries(table)) {
    if (routes[key]) throw new Error(`Duplicate route key: ${key}`);
    routes[key] = route;
  }
}
const apiHandler = createHttpHandler(routes);

interface CompiledRoute {
  routeKey: string;
  method: string;
  segments: string[];
}

/** Literal segments win over `{param}` segments, so `/users/me` beats `/users/{id}`. */
const compiled: CompiledRoute[] = Object.keys(routes)
  .map((routeKey) => {
    const [method, path] = routeKey.split(' ') as [string, string];
    return { routeKey, method, segments: path.split('/').filter(Boolean) };
  })
  .sort((a, b) => paramCount(a) - paramCount(b));

function paramCount(r: CompiledRoute): number {
  return r.segments.filter((s) => s.startsWith('{')).length;
}

function matchRoute(
  method: string,
  pathname: string,
): { routeKey: string; params: Record<string, string> } | undefined {
  const parts = pathname.split('/').filter(Boolean);
  for (const r of compiled) {
    if (r.method !== method || r.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = r.segments[i] ?? '';
      const part = parts[i] ?? '';
      if (seg.startsWith('{') && seg.endsWith('}')) {
        params[seg.slice(1, -1)] = decodeURIComponent(part);
      } else if (seg !== part) {
        ok = false;
        break;
      }
    }
    if (ok) return { routeKey: r.routeKey, params };
  }
  return undefined;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function toEvent(
  req: IncomingMessage,
  url: URL,
  routeKey: string,
  params: Record<string, string>,
  body: Buffer,
): HttpEvent {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
  }
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) query[k] = v;
  const method = req.method ?? 'GET';
  const event = {
    version: '2.0',
    routeKey,
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    queryStringParameters: Object.keys(query).length ? query : undefined,
    pathParameters: Object.keys(params).length ? params : undefined,
    body: body.length ? body.toString('utf8') : undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: url.hostname,
      domainPrefix: 'local',
      http: {
        method,
        path: url.pathname,
        protocol: 'HTTP/1.1',
        sourceIp: req.socket.remoteAddress ?? '127.0.0.1',
        userAgent: headers['user-agent'] ?? '',
      },
      requestId: crypto.randomUUID(),
      routeKey,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };
  return event;
}

const lambdaContext = { callbackWaitsForEmptyEventLoop: true } as Context;

function send(res: ServerResponse, result: HttpResult): void {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(result.headers ?? {})) headers[k] = String(v);
  res.writeHead(result.statusCode ?? 200, headers);
  res.end(result.body ?? '');
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const method = req.method ?? 'GET';
  const body = await readBody(req);

  if (url.pathname === WEBHOOK_PATH && (method === 'GET' || method === 'POST')) {
    const event = toEvent(req, url, `${method} ${WEBHOOK_PATH}`, {}, body);
    send(res, await webhookHandler(event, lambdaContext));
    return;
  }

  const match = matchRoute(method, url.pathname);
  if (!match) {
    send(res, json(404, { error: { code: 'NOT_FOUND', message: 'Route not found', details: {} } }));
    return;
  }
  const event = toEvent(req, url, match.routeKey, match.params, body);
  send(res, await apiHandler(event, lambdaContext));
}

try {
  getConfig();
} catch (err) {
  console.error('Invalid environment. Copy .env.example to .env and fill it in.\n', err);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
createServer((req, res) => {
  const started = Date.now();
  handle(req, res)
    .catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent)
        send(
          res,
          json(500, { error: { code: 'INTERNAL', message: 'Internal server error', details: {} } }),
        );
    })
    .finally(() => {
      console.log(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`);
    });
}).listen(port, () => {
  console.log(`waslah-backend dev server listening on http://localhost:${port}`);
  console.log(`  ${Object.keys(routes).length} API routes + GET/POST ${WEBHOOK_PATH}`);
});
