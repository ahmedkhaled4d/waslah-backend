# Waslah WhatsApp CRM — Backend

TypeScript on AWS Lambda, MongoDB Atlas, deployed with AWS CDK. See `AGENTS.md` for architecture and conventions.

## What's implemented

- **Message storage**: the WhatsApp webhook (signature-verified) puts payloads on SQS, and a consumer saves contacts, conversations and messages. Delivery/read statuses are applied idempotently and never move backwards.
- **Team inboxes**: create inboxes, add/remove members, choose the default inbox for new chats.
- **Conversations**: list and filter (inbox, status, assignee, label), assign, claim, change status, move between inboxes, mark read, reply (24-hour window enforced).
- **Labels**: shared labels for conversations and deals.
- **Pipelines and deals**: pipelines with ordered stages and win probability, deals with value, owner, status (open/won/lost), labels, and a board endpoint with per-stage totals.
- **Login and users**: email/password login that issues JWTs, admin-managed users with roles (admin, supervisor, agent) and active/disabled status.

## Setup

```bash
npm ci
npm run build && npm run lint && npm test
```

### Deploy (dev)

```bash
npx cdk bootstrap   # once per account/region
npm run deploy:dev -- \
  -c waPhoneNumberId=YOUR_PHONE_NUMBER_ID \
  -c waWabaId=YOUR_WABA_ID \
  -c waGraphApiVersion=v24.0
```

After the first deploy, set these secrets in AWS Secrets Manager (they're created with placeholder values):

| Secret                       | Value                                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| `waslah/dev/mongodb-uri`     | Atlas connection string                                          |
| `waslah/dev/wa-access-token` | Permanent System User token                                      |
| `waslah/dev/wa-app-secret`   | Meta app secret                                                  |
| `waslah/dev/wa-verify-token` | Any random string; enter the same one in Meta's webhook settings |
| `waslah/dev/jwt-secret`      | Random string, at least 32 chars, used to sign user JWTs         |

Then:

1. Run `MONGODB_URI="..." npm run sync-indexes` once.
2. Create the first admin (it can then create everyone else through the API):
   ```bash
   MONGODB_URI="..." ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='min 8 chars' ADMIN_NAME="Your Name" npm run create-admin
   ```
3. In the Meta app dashboard → WhatsApp → Configuration, set the callback URL to the `WebhookUrl` stack output, enter the verify token, and subscribe to the **messages** field.

## Auth

`POST /v1/auth/login` with `{ email, password }` returns `{ token, tokenType, expiresAt, user }`. Every other `/v1` request needs `Authorization: Bearer <token>`. Tokens are HS256 JWTs signed with `jwt-secret`, carry `sub` (user id) and `role` (`admin` | `supervisor` | `agent`), and expire after 12 hours.

Passwords are hashed with scrypt (Node's built-in). Login failures return `401 UNAUTHORIZED` for both unknown emails and wrong passwords; disabled accounts get `403 USER_DISABLED`. A disabled user's existing token keeps working until it expires, except on `GET /v1/auth/me`, which checks the account.

Only admins create and edit users (`/v1/users`). Admins can't change their own role or disable themselves.

## OpenAPI

`openapi.json` at the repo root describes every route (OpenAPI 3.1). It's generated from the route tables and zod schemas, so regenerate it after changing an endpoint:

```bash
npm run openapi
```

The generator fails if a route has no entry in `scripts/openapi/operations.ts`, so new routes must be documented there. Import the file into Postman, Swagger UI, or a client generator.

## API

Lists return `{ data, nextCursor }`. Pass `?limit=&cursor=` to page. Errors return `{ error: { code, message, details } }`.

### Auth and users

| Method | Path                       | Roles    | Body                                                                        |
| ------ | -------------------------- | -------- | --------------------------------------------------------------------------- |
| POST   | `/v1/auth/login`           | public   | `{ email, password }`                                                       |
| GET    | `/v1/auth/me`              | any      |                                                                             |
| POST   | `/v1/auth/change-password` | any      | `{ currentPassword, newPassword }`                                          |
| GET    | `/v1/users`                | managers |                                                                             |
| GET    | `/v1/users/{id}`           | managers |                                                                             |
| POST   | `/v1/users`                | admin    | `{ email, name, password, role? }` (role defaults to `agent`)               |
| PATCH  | `/v1/users/{id}`           | admin    | `{ name?, role?, status?: active\|disabled, password? }` (password = reset) |

### Inboxes

| Method | Path                                | Roles                      | Body                                                |
| ------ | ----------------------------------- | -------------------------- | --------------------------------------------------- |
| GET    | `/v1/inboxes`                       | any (agents see their own) |                                                     |
| GET    | `/v1/inboxes/{id}`                  | any                        |                                                     |
| POST   | `/v1/inboxes`                       | managers                   | `{ name, description?, color?, memberIds? }`        |
| PATCH  | `/v1/inboxes/{id}`                  | managers                   | `{ name?, description?, color?, isDefault?: true }` |
| DELETE | `/v1/inboxes/{id}`                  | managers                   | must have no conversations                          |
| POST   | `/v1/inboxes/{id}/members`          | managers                   | `{ memberIds: [] }`                                 |
| DELETE | `/v1/inboxes/{id}/members/{userId}` | managers                   |                                                     |

### Conversations and messages

| Method | Path                                      | Roles    | Body / query                                                |
| ------ | ----------------------------------------- | -------- | ----------------------------------------------------------- |
| GET    | `/v1/conversations`                       | any      | `?inboxId&status&assignee=me\|unassigned\|<userId>&labelId` |
| GET    | `/v1/conversations/{id}`                  | any      |                                                             |
| POST   | `/v1/conversations/{id}/assign`           | any*     | `{ assigneeId: string \| null }`                            |
| POST   | `/v1/conversations/{id}/status`           | any      | `{ status: open\|pending\|resolved }`                       |
| POST   | `/v1/conversations/{id}/move`             | managers | `{ inboxId }`                                               |
| POST   | `/v1/conversations/{id}/read`             | any      |                                                             |
| POST   | `/v1/conversations/{id}/labels`           | any      | `{ labelId }`                                               |
| DELETE | `/v1/conversations/{id}/labels/{labelId}` | any      |                                                             |
| GET    | `/v1/conversations/{id}/messages`         | any      | newest first                                                |
| POST   | `/v1/conversations/{id}/messages`         | any      | `{ text, replyToWaMessageId? }`                             |

\* Agents can only claim unassigned conversations or release their own.

### Labels

| Method | Path              | Roles    | Body                                         |
| ------ | ----------------- | -------- | -------------------------------------------- |
| GET    | `/v1/labels`      | any      |                                              |
| POST   | `/v1/labels`      | managers | `{ name, color?, description? }`             |
| PATCH  | `/v1/labels/{id}` | managers |                                              |
| DELETE | `/v1/labels/{id}` | managers | also removes it from conversations and deals |

### Pipelines

| Method | Path                                  | Roles    | Body                                                                              |
| ------ | ------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| GET    | `/v1/pipelines`                       | any      |                                                                                   |
| GET    | `/v1/pipelines/{id}`                  | any      |                                                                                   |
| GET    | `/v1/pipelines/{id}/board`            | any      | stages + open-deal count, total and weighted value                                |
| POST   | `/v1/pipelines`                       | managers | `{ name, stages?: [{ name, color?, probability? }] }` (default stages if omitted) |
| PATCH  | `/v1/pipelines/{id}`                  | managers | `{ name }`                                                                        |
| DELETE | `/v1/pipelines/{id}`                  | managers | must have no deals                                                                |
| POST   | `/v1/pipelines/{id}/stages`           | managers | `{ name, color?, probability? }`                                                  |
| PUT    | `/v1/pipelines/{id}/stages/order`     | managers | `{ stageIds: [] }` (every stage, new order)                                       |
| PATCH  | `/v1/pipelines/{id}/stages/{stageId}` | managers |                                                                                   |
| DELETE | `/v1/pipelines/{id}/stages/{stageId}` | managers | stage must have no deals                                                          |

### Deals

| Method | Path                              | Roles    | Body / query                                                                                                           |
| ------ | --------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/deals`                       | any      | `?pipelineId&stageId&status&ownerId&contactId&labelId`                                                                 |
| GET    | `/v1/deals/{id}`                  | any      |                                                                                                                        |
| POST   | `/v1/deals`                       | any      | `{ title, pipelineId, contactId, stageId?, value?, currency?, conversationId?, ownerId?, expectedCloseDate?, notes? }` |
| PATCH  | `/v1/deals/{id}`                  | any      | `{ title?, value?, currency?, ownerId?, expectedCloseDate?, notes? }` (`null` clears)                                  |
| POST   | `/v1/deals/{id}/move`             | any      | `{ stageId, pipelineId? }`                                                                                             |
| POST   | `/v1/deals/{id}/status`           | any      | `{ status: open\|won\|lost, lostReason? }`                                                                             |
| POST   | `/v1/deals/{id}/labels`           | any      | `{ labelId }`                                                                                                          |
| DELETE | `/v1/deals/{id}/labels/{labelId}` | any      |                                                                                                                        |
| DELETE | `/v1/deals/{id}`                  | managers |                                                                                                                        |
