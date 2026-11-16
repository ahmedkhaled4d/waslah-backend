/**
 * Response shapes for the OpenAPI document, written as zod so they sit next to the request
 * schemas in `src/modules/<module>/<module>.schemas.ts`. Keep them in sync with the models.
 */
import { z } from 'zod';
import { ROLES } from '../../src/lib/auth';
import { CONVERSATION_STATUSES } from '../../src/modules/conversations/conversations.model';
import { DEAL_STATUSES } from '../../src/modules/deals/deals.model';
import { MESSAGE_STATUSES } from '../../src/modules/messages/messages.model';
import { USER_STATUSES } from '../../src/modules/users/users.model';

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i)
  .describe('MongoDB ObjectId (24 hex chars)');
const dateTime = z.iso.datetime({ offset: true }).describe('ISO 8601 timestamp (UTC)');
const userId = z.string().describe('User id (the JWT `sub` claim)');
const color = z.string().describe('Hex color, e.g. #22c55e');

const timestamps = { createdAt: dateTime, updatedAt: dateTime };

export const Error = z
  .object({
    error: z.object({
      code: z.string().describe('Machine-readable code, e.g. VALIDATION_ERROR, WINDOW_CLOSED'),
      message: z.string(),
      details: z
        .record(z.string(), z.unknown())
        .describe('For VALIDATION_ERROR: `{ fields: { "<path>": "<message>" } }`'),
    }),
  })
  .describe('Standard error envelope returned by every failed request');

export const User = z.object({
  _id: objectId,
  email: z.email(),
  name: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES).describe('Disabled users cannot log in'),
  lastLoginAt: dateTime.optional(),
  ...timestamps,
});

export const LoginResponse = z.object({
  token: z.string().describe('JWT (HS256). Send as `Authorization: Bearer <token>`'),
  tokenType: z.literal('Bearer'),
  expiresAt: dateTime.describe('Tokens last 12 hours; log in again after that'),
  user: User,
});

export const Inbox = z.object({
  _id: objectId,
  name: z.string(),
  description: z.string().optional(),
  color,
  memberIds: z.array(userId).describe('Agents who work this inbox'),
  isDefault: z.boolean().describe('New inbound conversations land in the default inbox'),
  ...timestamps,
});

export const Conversation = z.object({
  _id: objectId,
  contactId: objectId,
  inboxId: objectId,
  status: z.enum(CONVERSATION_STATUSES),
  active: z.boolean().describe('true while open or pending'),
  assigneeId: userId.nullable(),
  labelIds: z.array(objectId),
  lastMessageAt: dateTime,
  lastMessagePreview: z.string().optional(),
  lastInboundAt: dateTime
    .optional()
    .describe('Last customer message; free-form replies are allowed for 24h after it'),
  unreadCount: z.number().int(),
  resolvedAt: dateTime.optional(),
  ...timestamps,
});

export const Message = z.object({
  _id: objectId,
  conversationId: objectId,
  contactId: objectId,
  direction: z.enum(['inbound', 'outbound']),
  waMessageId: z.string().optional().describe('WhatsApp message id (wamid); absent while queued'),
  type: z.string().describe('WhatsApp message type: text, image, document, location, reaction…'),
  text: z.string().optional(),
  media: z
    .object({
      waMediaId: z.string(),
      mimeType: z.string().optional(),
      sha256: z.string().optional(),
      caption: z.string().optional(),
      filename: z.string().optional(),
      s3Key: z.string().optional(),
    })
    .optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  reply: z
    .object({ id: z.string().optional(), title: z.string().optional() })
    .optional()
    .describe('Button / list reply the customer tapped'),
  reaction: z.object({ messageId: z.string(), emoji: z.string().optional() }).optional(),
  replyToWaMessageId: z.string().optional(),
  status: z.enum(MESSAGE_STATUSES),
  statusAt: dateTime.optional(),
  error: z
    .object({ code: z.number(), title: z.string().optional(), message: z.string().optional() })
    .optional(),
  sentBy: userId.optional().describe('Agent who sent an outbound message'),
  sentAt: dateTime,
  ...timestamps,
});

export const Label = z.object({
  _id: objectId,
  name: z.string(),
  nameKey: z.string().describe('Lower-cased name used for uniqueness'),
  color,
  description: z.string().optional(),
  ...timestamps,
});

export const Stage = z.object({
  _id: objectId,
  name: z.string(),
  color,
  probability: z.number().int().min(0).max(100).describe('Win probability, 0-100'),
});

export const Pipeline = z.object({
  _id: objectId,
  name: z.string(),
  stages: z.array(Stage).describe('Array order is board order'),
  ...timestamps,
});

const boardTotals = {
  dealCount: z.number().int(),
  totalValue: z.number(),
  weightedValue: z.number().describe('Sum of value × stage probability'),
};

export const Board = z.object({
  pipeline: z.object({ _id: objectId, name: z.string() }),
  columns: z.array(Stage.extend(boardTotals)),
  totals: z.object(boardTotals),
});

export const Deal = z.object({
  _id: objectId,
  title: z.string(),
  value: z.number().describe('Amount in the currency’s major unit'),
  currency: z.string().describe('ISO 4217 code'),
  pipelineId: objectId,
  stageId: objectId,
  contactId: objectId,
  conversationId: objectId.optional(),
  ownerId: userId.optional(),
  labelIds: z.array(objectId),
  status: z.enum(DEAL_STATUSES),
  lostReason: z.string().optional(),
  expectedCloseDate: dateTime.optional(),
  closedAt: dateTime.optional(),
  notes: z.string().optional(),
  createdBy: userId,
  ...timestamps,
});

export const components = {
  Error,
  User,
  LoginResponse,
  Inbox,
  Conversation,
  Message,
  Label,
  Stage,
  Pipeline,
  Board,
  Deal,
};

export type ComponentName = keyof typeof components;
