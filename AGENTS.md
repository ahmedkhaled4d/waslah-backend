# AGENTS.md — Waslah WhatsApp CRM Backend

Guidance for AI coding agents (and humans) working on this repository. Read this file fully before making changes.

## Project overview

Waslah is a CRM built on the **WhatsApp Cloud API** (Meta Graph API) for a **single business phone number**. There is no multi-tenancy: one access token, one phone number, one WABA.

Core modules (✅ = implemented):

1. **whatsapp** ✅ (webhook, inbound storage, statuses, text replies) – media-to-S3 and templates still to do
2. **contacts** ✅ (created from inbound messages) – profiles, custom fields, segments, opt-in/opt-out still to do
3. **inbox** ✅ – `inboxes` (team inboxes with members), `conversations` (assignment, statuses, labels), `messages`; notes, quick replies, and real-time updates still to do
4. **users** – authentication (✅ JWT verification), roles (admin, supervisor, agent), user management still to do
5. **labels** ✅ – shared labels applied to conversations and deals
6. **templates** – create, submit, and sync WhatsApp message templates
7. **campaigns** – bulk template broadcasts, scheduling, throttling, stats
8. **automation** – keyword triggers, away messages, chatbot flows, human handoff
9. **pipelines / deals** ✅ – pipelines with ordered stages, deals, board totals; follow-up tasks still to do
10. **analytics** – response times, agent performance, campaign results
11. **integrations** – public REST API, outgoing webhooks

## Tech stack

| Concern                 | Choice                                    |
| ----------------------- | ----------------------------------------- |
| Language                | TypeScript (strict mode), Node.js 22.x    |
| Database                | MongoDB Atlas, accessed via Mongoose      |
| Compute                 | AWS Lambda (arm64)                        |
| HTTP                    | API Gateway HTTP API                      |
| Real-time               | API Gateway WebSocket API                 |
| Queues                  | Amazon SQS (+ DLQ per queue)              |
| Scheduling              | Amazon EventBridge Scheduler              |
| Media storage           | Amazon S3                                 |
| Secrets                 | AWS Secrets Manager / SSM Parameter Store |
| Infrastructure as code  | AWS CDK (TypeScript) in `infra/`          |
| Bundling                | esbuild (via CDK `NodejsFunction`)        |
| Validation              | zod                                       |
| Logging/metrics/tracing | Powertools for AWS Lambda (TypeScript)    |
| Tests                   | Vitest                                    |
| Lint/format             | ESLint + Prettier                         |

Do not introduce new frameworks or major dependencies (Express, NestJS, ORMs other than Mongoose, etc.) without being asked.

## Repository layout

```
.
├── src/
│   ├── functions/            # Lambda entry points only (thin handlers)
│   │   ├── http/             # one Lambda per module; each exports a `routes` table + `handler`
│   │   ├── ws/               # WebSocket $connect/$disconnect/$default (planned)
│   │   ├── queues/           # SQS consumers
│   │   └── scheduled/        # EventBridge Scheduler targets (planned)
│   ├── modules/
│   │   └── <module>/
│   │       ├── <module>.model.ts       # Mongoose schema + model
│   │       ├── <module>.repository.ts  # all DB access for this module
│   │       ├── <module>.service.ts     # business logic
│   │       ├── <module>.schemas.ts     # zod request/response schemas
│   │       ├── <module>.types.ts
│   │       └── __tests__/
│   ├── lib/
│   │   ├── db.ts             # cached Mongo connection
│   │   ├── whatsapp/         # Graph API client, webhook types, signature check
│   │   ├── http.ts           # response helpers, error mapping
│   │   ├── auth.ts           # JWT verification, role guards
│   │   ├── config.ts         # env parsing with zod (fail fast)
│   │   ├── logger.ts         # Powertools logger/metrics/tracer
│   │   └── errors.ts         # AppError hierarchy
│   └── types/
├── infra/                    # CDK app and stacks
├── scripts/                  # one-off scripts (seed, migrations)
├── test/                     # integration tests & fixtures
└── AGENTS.md
```

### HTTP routing

Each file in `src/functions/http/` exports `routes: RouteTable`, keyed by API Gateway route key (`'GET /v1/deals/{id}'`), with the roles allowed for each route. `createHttpHandler(routes)` dispatches on `event.routeKey`, authenticates, checks roles, and connects to Mongo. **The CDK stack reads these route tables to create API routes**, so a new route only needs to be added to the table.

### Layering rules

- **Handlers** parse the input, call one service method, and map the result or error to a response. No business logic and no direct DB calls.
- **Services** hold business logic. They call repositories and `lib/whatsapp`, never `mongoose` directly.
- **Repositories** are the only place that touches Mongoose models.
- Modules may call other modules' **services**, never their repositories or models.
- No circular imports between modules. When an operation needs two modules that already depend on each other in one direction, put it in a small orchestration service (e.g. `labels/label-deletion.service.ts`, `inboxes/inbox-deletion.service.ts`, `pipelines/pipeline-board.service.ts`).

## Commands

```bash
npm ci                 # install
npm run build          # tsc --noEmit type check
npm run lint           # eslint
npm run format         # prettier --write
npm test               # vitest run (unit)
npm run synth          # cdk synth (needs -c context, see README)
npm run sync-indexes   # build Mongo indexes (MONGODB_URI=...)
npm run deploy:dev     # cdk deploy --context stage=dev
npm run deploy:prod    # cdk deploy --context stage=prod (humans only)
```

Before finishing any task, run `npm run build && npm run lint && npm test`, and make sure all three pass.

**Never run `deploy:prod`** or any command that changes production AWS resources or the production database.

## Configuration and secrets

All config is read and validated in `src/lib/config.ts` with zod at cold start. Never read `process.env` anywhere else.

| Variable                     | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `STAGE`                      | `dev` / `prod`                                     |
| `MONGODB_URI_SECRET_ARN`     | Secrets Manager ARN of the Atlas connection string |
| `WA_ACCESS_TOKEN_SECRET_ARN` | Permanent System User token                        |
| `WA_APP_SECRET_ARN`          | Meta app secret (webhook signature verification)   |
| `WA_VERIFY_TOKEN_SECRET_ARN` | Webhook verification handshake token               |
| `WA_PHONE_NUMBER_ID`         | Sender phone number ID                             |
| `WA_WABA_ID`                 | WhatsApp Business Account ID (templates)           |
| `WA_GRAPH_API_VERSION`       | e.g. `v24.0` — never hardcode the version          |
| `WA_INBOUND_QUEUE_URL`       | SQS queue the webhook writes to                    |
| `MEDIA_BUCKET`               | S3 bucket for media (planned)                      |
| `JWT_SECRET_ARN`             | Auth signing secret                                |

- Fetch secrets once per cold start (Powertools Parameters, with caching). Never fetch them per request.
- Never log tokens, secrets, full phone numbers, or message bodies at `info` level. Mask phone numbers (`+9665******12`).
- Never commit `.env` files or real credentials.

## MongoDB on Lambda

- Create the connection **outside the handler** and reuse it across invocations (`src/lib/db.ts` caches the promise).
- Use `maxPoolSize: 5` (or lower), `serverSelectionTimeoutMS: 5000`, and `bufferCommands: false`.
- Set `context.callbackWaitsForEmptyEventLoop = false` in HTTP handlers.
- Use `.lean()` for reads that don't need document methods.
- Every query in a hot path must be backed by an index. Declare indexes in the schema and list new ones in the PR description.
- Store timestamps as `Date` in UTC (`timestamps: true` on schemas).
- Phone numbers are stored in **E.164 format without `+`** (as WhatsApp sends `wa_id`), normalized in one helper.

### Key collections and indexes

| Collection           | Important indexes                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts`           | `{ waId: 1 }` unique                                                                                                                                                                                                        |
| `inboxes`            | `{ name: 1 }` unique; `{ memberIds: 1 }`; `{ isDefault: 1 }` unique where `isDefault: true`                                                                                                                                 |
| `conversations`      | `{ contactId: 1 }` unique where `active: true` (one open conversation per contact); `{ inboxId: 1, status: 1, lastMessageAt: -1 }`; `{ assigneeId: 1, status: 1, lastMessageAt: -1 }`; `{ labelIds: 1, lastMessageAt: -1 }` |
| `messages`           | `{ waMessageId: 1 }` unique where it is a string (idempotency); `{ conversationId: 1, sentAt: -1, _id: -1 }`                                                                                                                |
| `labels`             | `{ nameKey: 1 }` unique (lower-cased name)                                                                                                                                                                                  |
| `pipelines`          | `{ name: 1 }` unique; stages are embedded, array order = board order                                                                                                                                                        |
| `templates`          | `{ name: 1, language: 1 }` unique                                                                                                                                                                                           |
| `campaigns`          | `{ status: 1, scheduledAt: 1 }`                                                                                                                                                                                             |
| `campaignRecipients` | `{ campaignId: 1, status: 1 }`; `{ waMessageId: 1 }`                                                                                                                                                                        |
| `wsConnections`      | `{ connectionId: 1 }` unique; `{ userId: 1 }`; TTL on `expiresAt`                                                                                                                                                           |
| `deals`              | `{ pipelineId: 1, stageId: 1, status: 1, updatedAt: -1 }`; `{ contactId: 1 }`; `{ ownerId: 1, status: 1 }`; `{ labelIds: 1 }`                                                                                               |

### Inbox rules

- New inbound conversations land in the **default inbox** (auto-created as "General" if missing).
- A contact has at most one **active** (`open` or `pending`) conversation. A message for a resolved conversation opens a new one. A customer reply moves `pending` back to `open`.
- **Managers** (admin, supervisor) see and manage everything. **Agents** see conversations in inboxes they are members of, plus any conversation assigned to them. Agents can claim unassigned conversations and release their own, but can't reassign other people's.
- An assignee must be a member of the conversation's inbox. Moving a conversation to another inbox clears an assignee who isn't a member there.
- The first agent to reply to an unassigned conversation is auto-assigned.
- Labels are shared across conversations and deals. Deleting a label removes it from both.

## WhatsApp Cloud API rules

### Webhook (`POST /webhooks/whatsapp`)

1. `GET` handles the verification handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`).
2. `POST` **must verify `X-Hub-Signature-256`** (HMAC-SHA256 of the **raw body** with the app secret) using `crypto.timingSafeEqual`. Reject with 401 on mismatch.
3. After verification, push the payload to the `wa-inbound` SQS queue and **return 200 immediately**. Never do DB writes or outbound calls in the webhook Lambda.
4. The SQS consumer handles `messages` (inbound) and `statuses` (sent/delivered/read/failed).
5. Processing must be **idempotent**: Meta retries and SQS delivers at least once. Rely on the unique `waMessageId` index and treat duplicate-key errors (`11000`) as success.
6. Status updates can arrive out of order. Never move a status backwards (`read` > `delivered` > `sent`; `failed` is terminal).

### Sending

- All outbound messages go through `lib/whatsapp/client.ts`. No other code calls `graph.facebook.com`.
- Agent replies may be sent synchronously. Campaign and automation sends go through the `wa-outbound` SQS queue, with concurrency limited to respect throughput and the messaging tier.
- **24-hour customer service window**: free-form messages are allowed only if the contact's `lastInboundAt` is within 24 hours. Outside the window, only approved templates may be sent. Enforce this in the service layer and return a clear error code (`WINDOW_CLOSED`).
- Respect opt-out: never send marketing templates to contacts with `optIn: false`.
- Map Graph API error codes to `AppError` types. Retry only on transient errors (rate limit / 5xx) with exponential backoff, and send everything else to the DLQ or mark it failed.

### Media

- Inbound media URLs are short-lived and need the bearer token. Download them in the queue consumer, upload to S3 under `media/{yyyy}/{mm}/{waMediaId}`, and store the S3 key on the message.
- Serve media to the frontend via short-lived S3 presigned URLs only.

### Templates

- Template CRUD goes through `WA_WABA_ID`. A scheduled job syncs approval status (`APPROVED`, `REJECTED`, `PAUSED`, etc.) into the `templates` collection.
- Campaigns may only use templates whose status is `APPROVED`.

## Real-time (WebSocket)

- `$connect` authenticates via a JWT query param and stores `{ connectionId, userId, expiresAt }` in `wsConnections`.
- Push events with `ApiGatewayManagementApi.postToConnection`. On `410 Gone`, delete the connection record.
- Event names: `message.created`, `message.status`, `conversation.updated`, `conversation.assigned`.

## API conventions

- REST, JSON, base path `/v1`. Resource names are plural nouns (`/v1/contacts`, `/v1/conversations/{id}/messages`).
- Validate every request body, query, and path param with zod. Return `400` with field errors on failure.
- Error response shape:
  ```json
  { "error": { "code": "WINDOW_CLOSED", "message": "Human readable", "details": {} } }
  ```
- Pagination is cursor-based: `?limit=50&cursor=<opaque>` returns `{ data, nextCursor }`. Max `limit` is 100.
- Authorization: every handler declares its required role(s) via the `requireRole()` guard in `lib/auth.ts`. Agents can only access conversations assigned to them or their team, unless they are a supervisor or admin.

## Code style

- TypeScript `strict: true`. No `any` (use `unknown` and narrow). No non-null `!` assertions without a comment.
- ES modules, named exports only (no default exports).
- `async/await` only, no `.then()` chains. Never leave a floating promise.
- Throw `AppError` subclasses from services; handlers convert them to HTTP responses.
- File names are `kebab-case` or `<module>.<role>.ts`. Types and classes are `PascalCase`, variables and functions `camelCase`, constants `UPPER_SNAKE_CASE`.
- Keep handlers small. Keep bundle size down by importing AWS SDK v3 clients individually (`@aws-sdk/client-sqs`), never the whole SDK.

## Testing

- Unit-test every service method: happy path plus key failure cases. Mock repositories and `lib/whatsapp`.
- Integration tests use `mongodb-memory-server`. Never point tests at Atlas.
- Keep webhook payload fixtures in `test/fixtures/whatsapp/` (real-shaped, with anonymized numbers). Add one for every new message type handled.
- Bug fixes must include a test that reproduces the bug.

## Infrastructure (CDK)

- One stack per stage: `waslah-dev`, `waslah-prod`. Resource names include the stage.
- Every SQS queue has a DLQ (`maxReceiveCount: 5`) and a CloudWatch alarm on DLQ depth > 0.
- Lambdas use `arm64`, Node.js 22.x, explicit memory and timeout, and least-privilege IAM. Grant access only to the specific secrets, queues, and buckets each function uses.
- The webhook Lambda timeout is ≤ 5s. SQS consumer timeouts must be shorter than the queue's visibility timeout.
- The S3 media bucket is private, encrypted, and has public access blocked.
- Don't change `infra/` and application code in the same PR unless the feature requires both.

## Git and PRs

- Use Conventional Commits: `feat(inbox): assign conversation to team`, `fix(whatsapp): ignore duplicate status`.
- Keep PRs small and scoped to one module where possible.
- A PR description lists: what changed, new env vars and secrets, new indexes, and any migration steps.

## Things agents must NOT do

- Do not deploy to prod, change prod data, or rotate secrets.
- Do not call the real WhatsApp API from tests or scripts without explicit instruction (it sends real messages to real people).
- Do not disable webhook signature verification, even temporarily.
- Do not bypass the 24-hour window or opt-out checks.
- Do not delete stages or pipelines that still have deals, or inboxes that still have conversations (the services enforce this).
- Do not add multi-tenant concepts (tenant IDs, multiple WABAs/phone numbers). This system serves one number.
- Do not hardcode the Graph API version, IDs, or tokens.
