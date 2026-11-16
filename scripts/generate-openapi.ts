/**
 * Generates `openapi.json` from the real route tables and zod schemas:
 *   npm run openapi
 * Fails if any route lacks documentation in `scripts/openapi/operations.ts` (or vice versa).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { routes as conversationRoutes } from '../src/functions/http/conversations';
import { routes as dealRoutes } from '../src/functions/http/deals';
import { routes as inboxRoutes } from '../src/functions/http/inboxes';
import { routes as labelRoutes } from '../src/functions/http/labels';
import { routes as pipelineRoutes } from '../src/functions/http/pipelines';
import { routes as userRoutes } from '../src/functions/http/users';
import { ANY_ROLE, type Role } from '../src/lib/auth';
import { isPublicRoute, type RouteTable } from '../src/lib/http';
import { components } from './openapi/components';
import { operations, type OperationDoc, type ResponseShape } from './openapi/operations';

type Json = Record<string, unknown>;

const routeTables: RouteTable[] = [
  userRoutes,
  inboxRoutes,
  conversationRoutes,
  labelRoutes,
  pipelineRoutes,
  dealRoutes,
];

// ---- zod → JSON Schema (OpenAPI 3.1 uses JSON Schema 2020-12 natively)

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (typeof schema !== 'object' || schema === null) return schema;
  const out: Json = {};
  for (const [k, v] of Object.entries(schema as Json)) {
    if (k === '$schema') continue;
    // zod emits ±2^53 bounds for every integer; they are noise in docs.
    if ((k === 'minimum' && v === -MAX_SAFE) || (k === 'maximum' && v === MAX_SAFE)) continue;
    // `format: email` says enough; the regex only clutters the document.
    if (k === 'pattern' && (schema as Json).format === 'email') continue;
    out[k] = clean(v);
  }
  return out;
}

function toSchema(schema: z.ZodType, io: 'input' | 'output'): Json {
  return clean(
    z.toJSONSchema(schema, {
      io,
      target: 'draft-2020-12',
      unrepresentable: ({ zodSchema }) =>
        zodSchema._zod.def.type === 'date' ? { type: 'string', format: 'date-time' } : 'throw',
    }),
  ) as Json;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });

function responseSchema(shape: ResponseShape): Json | undefined {
  switch (shape.kind) {
    case 'one':
      return ref(shape.of);
    case 'list':
      return {
        type: 'object',
        properties: { data: { type: 'array', items: ref(shape.of) } },
        required: ['data'],
      };
    case 'page':
      return {
        type: 'object',
        properties: {
          data: { type: 'array', items: ref(shape.of) },
          nextCursor: {
            type: ['string', 'null'],
            description: 'Pass as `?cursor=` to get the next page; null on the last page',
          },
        },
        required: ['data', 'nextCursor'],
      };
    case 'none':
      return undefined;
  }
}

const errorResponse = (description: string): Json => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});

function pathParameters(path: string): Json[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema:
      name === 'userId'
        ? { type: 'string', description: 'User id' }
        : { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: 'ObjectId' },
  }));
}

function queryParameters(query: z.ZodObject): Json[] {
  const schema = toSchema(query, 'input');
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries(schema.properties as Record<string, Json>).map(([name, s]) => {
    const { description, ...rest } = s;
    return {
      name,
      in: 'query',
      required: required.has(name),
      ...(description ? { description } : {}),
      schema: rest,
    };
  });
}

function rolesLine(roles: readonly Role[] | 'public'): string {
  if (roles === 'public') return '**Auth:** none (public).';
  if (roles.length === ANY_ROLE.length) return '**Roles:** any authenticated user.';
  return `**Roles:** ${roles.join(', ')}.`;
}

function operation(routeKey: string, doc: OperationDoc, roles: readonly Role[] | 'public'): Json {
  const [, path] = routeKey.split(' ') as [string, string];
  const isPublic = roles === 'public';
  const responses: Record<string, Json> = {};

  const success = responseSchema(doc.response);
  responses[String(doc.status)] = {
    description: doc.status === 204 ? 'Deleted' : doc.status === 201 ? 'Created' : 'OK',
    ...(success ? { content: { 'application/json': { schema: success } } } : {}),
  };

  const extra = doc.errors ?? {};
  const codes = (status: number, defaults: string[]) =>
    [...defaults, ...(extra[status] ?? [])].join(', ');

  if (doc.body || doc.query || path.includes('{') || extra[400]) {
    responses['400'] = errorResponse(`Invalid request — ${codes(400, ['VALIDATION_ERROR'])}`);
  }
  responses['401'] = errorResponse(
    isPublic ? codes(401, []) : codes(401, ['UNAUTHORIZED (missing, invalid or expired token)']),
  );
  if (!isPublic || extra[403]) {
    responses['403'] = errorResponse(
      isPublic ? codes(403, []) : codes(403, ['FORBIDDEN (role or ownership check failed)']),
    );
  }
  if (path.includes('{') || doc.body || extra[404]) {
    responses['404'] = errorResponse(codes(404, ['NOT_FOUND']));
  }
  for (const status of Object.keys(extra).map(Number)) {
    if (![400, 401, 403, 404].includes(status)) {
      responses[String(status)] = errorResponse(codes(status, []));
    }
  }
  if (isPublic && !extra[401]) delete responses['401'];

  const description = [doc.description, rolesLine(roles)].filter(Boolean).join('\n\n');

  return {
    tags: [doc.tag],
    summary: doc.summary,
    description,
    operationId: operationId(routeKey),
    ...(isPublic ? { security: [] } : {}),
    'x-roles': isPublic ? [] : roles,
    parameters: [...pathParameters(path), ...(doc.query ? queryParameters(doc.query) : [])],
    ...(doc.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: toSchema(doc.body, 'input') } },
          },
        }
      : {}),
    responses,
  };
}

/** "POST /v1/conversations/{id}/labels" → "postConversationsByIdLabels" */
function operationId(routeKey: string): string {
  const [method, path] = routeKey.split(' ') as [string, string];
  const parts = path
    .replace(/^\/v1\//, '')
    .split('/')
    .map((p) => (p.startsWith('{') ? `By${capitalize(p.slice(1, -1))}` : capitalize(p)));
  return method.toLowerCase() + parts.join('').replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Assemble

const documented = new Set(Object.keys(operations));
const paths: Record<string, Json> = {};
const seen = new Set<string>();

for (const table of routeTables) {
  for (const [routeKey, route] of Object.entries(table)) {
    seen.add(routeKey);
    const doc = operations[routeKey];
    if (!doc) throw new Error(`Route ${routeKey} has no entry in scripts/openapi/operations.ts`);
    const [method, path] = routeKey.split(' ') as [string, string];
    paths[path] ??= {};
    paths[path][method.toLowerCase()] = operation(
      routeKey,
      doc,
      isPublicRoute(route) ? 'public' : route.roles,
    );
  }
}
for (const key of documented) {
  if (!seen.has(key)) throw new Error(`operations.ts documents ${key}, but no such route exists`);
}

const tags = [
  { name: 'Auth', description: 'Login and the current user' },
  { name: 'Users', description: 'Team members and roles (admin, supervisor, agent)' },
  { name: 'Inboxes', description: 'Team inboxes and their members' },
  { name: 'Conversations', description: 'WhatsApp conversations with contacts' },
  { name: 'Messages', description: 'Messages inside a conversation' },
  { name: 'Labels', description: 'Shared labels for conversations and deals' },
  { name: 'Pipelines', description: 'Sales pipelines and their stages' },
  { name: 'Deals', description: 'Deals on a pipeline board' },
];

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Waslah WhatsApp CRM API',
    version: '1.0.0',
    description: [
      'REST API for the Waslah WhatsApp CRM. One business phone number, no multi-tenancy.',
      '',
      '## Authentication',
      'Call `POST /v1/auth/login` with email and password to get a JWT, then send it as ' +
        '`Authorization: Bearer <token>` on every other request. Tokens expire after 12 hours.',
      '',
      '## Roles',
      '- **admin** — everything, including user management.',
      '- **supervisor** — manages inboxes, labels, pipelines and all conversations.',
      '- **agent** — works conversations in inboxes they are members of, or assigned to them.',
      '',
      '## Conventions',
      '- Lists are cursor-paginated: `?limit=50&cursor=<opaque>` → `{ data, nextCursor }`. Max `limit` is 100.',
      '- Errors always return `{ error: { code, message, details } }`. ' +
        'Validation failures are `400 VALIDATION_ERROR` with `details.fields`.',
      '- Timestamps are ISO 8601 in UTC. Ids are MongoDB ObjectIds (24 hex chars).',
    ].join('\n'),
  },
  servers: [
    {
      url: 'https://{apiId}.execute-api.{region}.amazonaws.com',
      description: 'API Gateway (ApiUrl stack output)',
      variables: { apiId: { default: 'your-api-id' }, region: { default: 'me-south-1' } },
    },
  ],
  tags,
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT from `POST /v1/auth/login` (HS256, claims `sub` and `role`).',
      },
    },
    schemas: Object.fromEntries(
      Object.entries(components).map(([name, schema]) => [name, toSchema(schema, 'output')]),
    ),
  },
  security: [{ bearerAuth: [] }],
};

const out = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Wrote ${out}: ${Object.keys(paths).length} paths, ${seen.size} operations`);
