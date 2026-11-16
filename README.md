# Waslah WhatsApp CRM — Backend

TypeScript on AWS Lambda, MongoDB Atlas, deployed with AWS CDK. See `AGENTS.md` for architecture and conventions.

## What's implemented

- **Message storage**: the WhatsApp webhook (signature-verified) puts payloads on SQS, and a consumer saves contacts, conversations and messages. Delivery/read statuses are applied idempotently and never move backwards.
- **Team inboxes**: create inboxes, add/remove members, choose the default inbox for new chats.
- **Conversations**: list and filter (inbox, status, assignee, label), assign, claim, change status, move between inboxes, mark read, reply (24-hour window enforced).
- **Labels**: shared labels for conversations and deals.
- **Pipelines and deals**: pipelines with ordered stages and win probability, deals with value, owner, status (open/won/lost), labels, and a board endpoint with per-stage totals.

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
2. In the Meta app dashboard → WhatsApp → Configuration, set the callback URL to the `WebhookUrl` stack output, enter the verify token, and subscribe to the **messages** field.

## Auth

Every `/v1` request needs `Authorization: Bearer <JWT>` signed with HS256 using `jwt-secret`, with claims `sub` (user id) and `role` (`admin` | `supervisor` | `agent`). User management and login are not built yet; issue tokens from your auth service.

## API

Lists return `{ data, nextCursor }`. Pass `?limit=&cursor=` to page. Errors return `{ error: { code, message, details } }`.

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
