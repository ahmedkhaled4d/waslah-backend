/**
 * One entry per API Gateway route key. The generator fails if a route in
 * `src/functions/http/*` is missing here, or if an entry here has no route.
 */
import type { z } from 'zod';
import {
  assignSchema,
  labelSchema,
  listConversationsQuery,
  moveSchema,
  statusSchema,
} from '../../src/modules/conversations/conversations.schemas';
import {
  createDealSchema,
  dealLabelSchema,
  dealStatusSchema,
  listDealsQuery,
  moveDealSchema,
  updateDealSchema,
} from '../../src/modules/deals/deals.schemas';
import {
  addMembersSchema,
  createInboxSchema,
  updateInboxSchema,
} from '../../src/modules/inboxes/inboxes.schemas';
import { createLabelSchema, updateLabelSchema } from '../../src/modules/labels/labels.schemas';
import { listMessagesQuery, sendTextSchema } from '../../src/modules/messages/messages.schemas';
import {
  addStageSchema,
  createPipelineSchema,
  reorderStagesSchema,
  updatePipelineSchema,
  updateStageSchema,
} from '../../src/modules/pipelines/pipelines.schemas';
import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  updateUserSchema,
} from '../../src/modules/users/users.schemas';
import type { ComponentName } from './components';

/** A success body: a component, a list `{ data: T[] }`, or a cursor page `{ data, nextCursor }`. */
export type ResponseShape =
  | { kind: 'one'; of: ComponentName }
  | { kind: 'list'; of: ComponentName }
  | { kind: 'page'; of: ComponentName }
  | { kind: 'none' };

export interface OperationDoc {
  tag: string;
  summary: string;
  description?: string;
  query?: z.ZodObject;
  body?: z.ZodType;
  status: 200 | 201 | 204;
  response: ResponseShape;
  /** Extra error codes beyond the standard 400/401/403/404, keyed by HTTP status. */
  errors?: Record<number, string[]>;
}

const one = (of: ComponentName): ResponseShape => ({ kind: 'one', of });
const list = (of: ComponentName): ResponseShape => ({ kind: 'list', of });
const page = (of: ComponentName): ResponseShape => ({ kind: 'page', of });
const none: ResponseShape = { kind: 'none' };

export const operations: Record<string, OperationDoc> = {
  // ---- Auth & users
  'POST /v1/auth/login': {
    tag: 'Auth',
    summary: 'Log in with email and password',
    description:
      'Returns a JWT to send as `Authorization: Bearer <token>` on every other request. ' +
      'Accounts are created by an admin (`POST /v1/users`) or the `create-admin` script.',
    body: loginSchema,
    status: 200,
    response: one('LoginResponse'),
    errors: { 401: ['UNAUTHORIZED (wrong email or password)'], 403: ['USER_DISABLED'] },
  },
  'GET /v1/auth/me': {
    tag: 'Auth',
    summary: 'Get the current user',
    description: 'Rejects with 401 if the account behind the token was disabled or deleted.',
    status: 200,
    response: one('User'),
  },
  'POST /v1/auth/change-password': {
    tag: 'Auth',
    summary: 'Change my password',
    body: changePasswordSchema,
    status: 204,
    response: none,
    errors: { 400: ['INVALID_PASSWORD (current password is wrong)'] },
  },
  'GET /v1/users': {
    tag: 'Users',
    summary: 'List users',
    status: 200,
    response: list('User'),
  },
  'GET /v1/users/{id}': {
    tag: 'Users',
    summary: 'Get a user',
    status: 200,
    response: one('User'),
  },
  'POST /v1/users': {
    tag: 'Users',
    summary: 'Create a user',
    body: createUserSchema,
    status: 201,
    response: one('User'),
    errors: { 409: ['USER_EXISTS'] },
  },
  'PATCH /v1/users/{id}': {
    tag: 'Users',
    summary: 'Update a user',
    description:
      'Change name, role, status, or reset the password (no current password needed). ' +
      'Admins cannot change their own role or status.',
    body: updateUserSchema,
    status: 200,
    response: one('User'),
    errors: { 400: ['CANNOT_MODIFY_SELF'] },
  },

  // ---- Inboxes
  'GET /v1/inboxes': {
    tag: 'Inboxes',
    summary: 'List inboxes',
    description: 'Managers see all inboxes; agents see only the inboxes they are members of.',
    status: 200,
    response: list('Inbox'),
  },
  'GET /v1/inboxes/{id}': {
    tag: 'Inboxes',
    summary: 'Get an inbox',
    status: 200,
    response: one('Inbox'),
  },
  'POST /v1/inboxes': {
    tag: 'Inboxes',
    summary: 'Create an inbox',
    body: createInboxSchema,
    status: 201,
    response: one('Inbox'),
    errors: { 409: ['INBOX_EXISTS'] },
  },
  'PATCH /v1/inboxes/{id}': {
    tag: 'Inboxes',
    summary: 'Update an inbox',
    description: 'Set `isDefault: true` to make this the inbox for new conversations.',
    body: updateInboxSchema,
    status: 200,
    response: one('Inbox'),
    errors: { 409: ['INBOX_EXISTS'] },
  },
  'DELETE /v1/inboxes/{id}': {
    tag: 'Inboxes',
    summary: 'Delete an inbox',
    description: 'The inbox must have no conversations and must not be the default.',
    status: 204,
    response: none,
    errors: { 409: ['INBOX_HAS_CONVERSATIONS', 'DEFAULT_INBOX'] },
  },
  'POST /v1/inboxes/{id}/members': {
    tag: 'Inboxes',
    summary: 'Add members to an inbox',
    body: addMembersSchema,
    status: 200,
    response: one('Inbox'),
  },
  'DELETE /v1/inboxes/{id}/members/{userId}': {
    tag: 'Inboxes',
    summary: 'Remove a member from an inbox',
    status: 200,
    response: one('Inbox'),
  },

  // ---- Conversations & messages
  'GET /v1/conversations': {
    tag: 'Conversations',
    summary: 'List conversations',
    description:
      'Newest activity first. Agents only see conversations in their inboxes or assigned to them. ' +
      '`assignee` accepts `me`, `unassigned`, or a user id.',
    query: listConversationsQuery,
    status: 200,
    response: page('Conversation'),
  },
  'GET /v1/conversations/{id}': {
    tag: 'Conversations',
    summary: 'Get a conversation',
    status: 200,
    response: one('Conversation'),
  },
  'POST /v1/conversations/{id}/assign': {
    tag: 'Conversations',
    summary: 'Assign or unassign a conversation',
    description:
      'Managers may assign any inbox member. Agents may only claim an unassigned conversation ' +
      '(`assigneeId` = their own id) or release their own (`assigneeId: null`).',
    body: assignSchema,
    status: 200,
    response: one('Conversation'),
    errors: { 409: ['NOT_INBOX_MEMBER'] },
  },
  'POST /v1/conversations/{id}/status': {
    tag: 'Conversations',
    summary: 'Change conversation status',
    description:
      'Resolving clears the unread count. Reopening fails if the contact already has another active conversation.',
    body: statusSchema,
    status: 200,
    response: one('Conversation'),
    errors: { 409: ['ACTIVE_CONVERSATION_EXISTS'] },
  },
  'POST /v1/conversations/{id}/move': {
    tag: 'Conversations',
    summary: 'Move a conversation to another inbox',
    description: 'The assignee is cleared if they are not a member of the new inbox.',
    body: moveSchema,
    status: 200,
    response: one('Conversation'),
  },
  'POST /v1/conversations/{id}/read': {
    tag: 'Conversations',
    summary: 'Mark a conversation as read',
    status: 200,
    response: one('Conversation'),
  },
  'POST /v1/conversations/{id}/labels': {
    tag: 'Conversations',
    summary: 'Add a label to a conversation',
    body: labelSchema,
    status: 200,
    response: one('Conversation'),
  },
  'DELETE /v1/conversations/{id}/labels/{labelId}': {
    tag: 'Conversations',
    summary: 'Remove a label from a conversation',
    status: 200,
    response: one('Conversation'),
  },
  'GET /v1/conversations/{id}/messages': {
    tag: 'Messages',
    summary: 'List messages in a conversation',
    description: 'Newest first.',
    query: listMessagesQuery,
    status: 200,
    response: page('Message'),
  },
  'POST /v1/conversations/{id}/messages': {
    tag: 'Messages',
    summary: 'Send a text reply',
    description:
      'Sends via the WhatsApp Cloud API. Only allowed within 24 hours of the last customer message ' +
      '(`WINDOW_CLOSED` otherwise). The first agent to reply to an unassigned conversation is auto-assigned. ' +
      'If WhatsApp rejects the message it is stored with `status: failed` and a 502 is returned.',
    body: sendTextSchema,
    status: 201,
    response: one('Message'),
    errors: { 409: ['WINDOW_CLOSED'], 502: ['WHATSAPP_API_ERROR'] },
  },

  // ---- Labels
  'GET /v1/labels': { tag: 'Labels', summary: 'List labels', status: 200, response: list('Label') },
  'POST /v1/labels': {
    tag: 'Labels',
    summary: 'Create a label',
    body: createLabelSchema,
    status: 201,
    response: one('Label'),
    errors: { 409: ['LABEL_EXISTS'] },
  },
  'PATCH /v1/labels/{id}': {
    tag: 'Labels',
    summary: 'Update a label',
    body: updateLabelSchema,
    status: 200,
    response: one('Label'),
    errors: { 409: ['LABEL_EXISTS'] },
  },
  'DELETE /v1/labels/{id}': {
    tag: 'Labels',
    summary: 'Delete a label',
    description: 'Also removes the label from every conversation and deal.',
    status: 204,
    response: none,
  },

  // ---- Pipelines
  'GET /v1/pipelines': {
    tag: 'Pipelines',
    summary: 'List pipelines',
    status: 200,
    response: list('Pipeline'),
  },
  'GET /v1/pipelines/{id}': {
    tag: 'Pipelines',
    summary: 'Get a pipeline',
    status: 200,
    response: one('Pipeline'),
  },
  'GET /v1/pipelines/{id}/board': {
    tag: 'Pipelines',
    summary: 'Get the pipeline board',
    description:
      'Stages in order with open-deal count, total value and probability-weighted value.',
    status: 200,
    response: one('Board'),
  },
  'POST /v1/pipelines': {
    tag: 'Pipelines',
    summary: 'Create a pipeline',
    description: 'Omit `stages` to get the default stages.',
    body: createPipelineSchema,
    status: 201,
    response: one('Pipeline'),
    errors: { 409: ['PIPELINE_EXISTS'] },
  },
  'PATCH /v1/pipelines/{id}': {
    tag: 'Pipelines',
    summary: 'Rename a pipeline',
    body: updatePipelineSchema,
    status: 200,
    response: one('Pipeline'),
    errors: { 409: ['PIPELINE_EXISTS'] },
  },
  'DELETE /v1/pipelines/{id}': {
    tag: 'Pipelines',
    summary: 'Delete a pipeline',
    description: 'The pipeline must have no deals.',
    status: 204,
    response: none,
    errors: { 409: ['PIPELINE_HAS_DEALS'] },
  },
  'POST /v1/pipelines/{id}/stages': {
    tag: 'Pipelines',
    summary: 'Add a stage',
    description: 'Appended at the end of the board.',
    body: addStageSchema,
    status: 201,
    response: one('Pipeline'),
  },
  'PUT /v1/pipelines/{id}/stages/order': {
    tag: 'Pipelines',
    summary: 'Reorder stages',
    description:
      '`stageIds` must contain every stage of the pipeline exactly once, in the new order.',
    body: reorderStagesSchema,
    status: 200,
    response: one('Pipeline'),
    errors: { 409: ['PIPELINE_CHANGED'] },
  },
  'PATCH /v1/pipelines/{id}/stages/{stageId}': {
    tag: 'Pipelines',
    summary: 'Update a stage',
    body: updateStageSchema,
    status: 200,
    response: one('Pipeline'),
  },
  'DELETE /v1/pipelines/{id}/stages/{stageId}': {
    tag: 'Pipelines',
    summary: 'Remove a stage',
    description: 'The stage must have no deals, and a pipeline keeps at least one stage.',
    status: 200,
    response: one('Pipeline'),
    errors: { 409: ['STAGE_HAS_DEALS', 'LAST_STAGE'] },
  },

  // ---- Deals
  'GET /v1/deals': {
    tag: 'Deals',
    summary: 'List deals',
    description: 'Most recently updated first.',
    query: listDealsQuery,
    status: 200,
    response: page('Deal'),
  },
  'GET /v1/deals/{id}': { tag: 'Deals', summary: 'Get a deal', status: 200, response: one('Deal') },
  'POST /v1/deals': {
    tag: 'Deals',
    summary: 'Create a deal',
    description:
      '`stageId` defaults to the pipeline’s first stage; `ownerId` defaults to the caller.',
    body: createDealSchema,
    status: 201,
    response: one('Deal'),
  },
  'PATCH /v1/deals/{id}': {
    tag: 'Deals',
    summary: 'Update a deal',
    description: 'Send `null` for `ownerId` or `expectedCloseDate` to clear them.',
    body: updateDealSchema,
    status: 200,
    response: one('Deal'),
  },
  'POST /v1/deals/{id}/move': {
    tag: 'Deals',
    summary: 'Move a deal to another stage',
    description: 'Pass `pipelineId` to move it to a stage in another pipeline.',
    body: moveDealSchema,
    status: 200,
    response: one('Deal'),
  },
  'POST /v1/deals/{id}/status': {
    tag: 'Deals',
    summary: 'Set deal status (open / won / lost)',
    body: dealStatusSchema,
    status: 200,
    response: one('Deal'),
  },
  'POST /v1/deals/{id}/labels': {
    tag: 'Deals',
    summary: 'Add a label to a deal',
    body: dealLabelSchema,
    status: 200,
    response: one('Deal'),
  },
  'DELETE /v1/deals/{id}/labels/{labelId}': {
    tag: 'Deals',
    summary: 'Remove a label from a deal',
    status: 200,
    response: one('Deal'),
  },
  'DELETE /v1/deals/{id}': {
    tag: 'Deals',
    summary: 'Delete a deal',
    status: 204,
    response: none,
  },
};
