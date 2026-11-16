import { Types } from 'mongoose';
import { isManager, type AuthUser } from '../../lib/auth';
import { isDuplicateKeyError } from '../../lib/db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { toPage, type Page } from '../../lib/pagination';
import { inboxesService } from '../inboxes/inboxes.service';
import { labelsService } from '../labels/labels.service';
import type { Conversation, ConversationStatus } from './conversations.model';
import { conversationsRepository, type ConversationFilter } from './conversations.repository';
import type { ListConversationsQuery } from './conversations.schemas';

async function getOrThrow(id: Types.ObjectId | string): Promise<Conversation> {
  const conversation = await conversationsRepository.findById(id);
  if (!conversation) throw new NotFoundError('Conversation');
  return conversation;
}

function updated(conversation: Conversation | null): Conversation {
  if (!conversation) throw new NotFoundError('Conversation');
  return conversation;
}

export const conversationsService = {
  async list(user: AuthUser, query: ListConversationsQuery): Promise<Page<Conversation>> {
    const filter: ConversationFilter = { status: query.status };
    if (query.labelId) filter.labelId = query.labelId;
    if (query.assignee === 'me') filter.assigneeId = user.id;
    else if (query.assignee === 'unassigned') filter.assigneeId = null;
    else if (query.assignee) filter.assigneeId = query.assignee;

    const accessible = await inboxesService.accessibleInboxIds(user);
    const inboxId = query.inboxId;
    if (inboxId) {
      if (accessible && !accessible.some((id) => id.equals(inboxId))) throw new ForbiddenError();
      await inboxesService.getById(inboxId);
      filter.inboxIds = [new Types.ObjectId(inboxId)];
    } else if (accessible) {
      filter.visibleTo = { inboxIds: accessible, userId: user.id };
    }

    const rows = await conversationsRepository.list(filter, query.limit, query.cursor);
    return toPage(rows, query.limit, (c) => c.lastMessageAt);
  },

  /** Agents can access conversations in their inboxes or assigned to them. */
  async getForUser(user: AuthUser, id: Types.ObjectId | string): Promise<Conversation> {
    const conversation = await getOrThrow(id);
    if (isManager(user) || conversation.assigneeId === user.id) return conversation;
    const inbox = await inboxesService.getById(conversation.inboxId);
    if (!inboxesService.isMember(inbox, user.id)) throw new ForbiddenError();
    return conversation;
  },

  /**
   * Agents may claim an unassigned conversation or unassign themselves.
   * Managers may assign to any member of the conversation's inbox.
   */
  async assign(user: AuthUser, id: string, assigneeId: string | null): Promise<Conversation> {
    const conversation = await this.getForUser(user, id);
    if (!isManager(user)) {
      const claiming = assigneeId === user.id && conversation.assigneeId === null;
      const releasing = assigneeId === null && conversation.assigneeId === user.id;
      if (!claiming && !releasing)
        throw new ForbiddenError('Agents can only claim or release their own conversations');
    }
    if (assigneeId !== null) {
      const inbox = await inboxesService.getById(conversation.inboxId);
      if (!inboxesService.isMember(inbox, assigneeId)) {
        throw new ConflictError('NOT_INBOX_MEMBER', 'The assignee is not a member of this inbox');
      }
    }
    return updated(await conversationsRepository.update(id, { assigneeId }));
  },

  async setStatus(user: AuthUser, id: string, status: ConversationStatus): Promise<Conversation> {
    await this.getForUser(user, id);
    const active = status !== 'resolved';
    try {
      return updated(
        await conversationsRepository.update(id, {
          status,
          active,
          ...(active ? {} : { resolvedAt: new Date(), unreadCount: 0 }),
        }),
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(
          'ACTIVE_CONVERSATION_EXISTS',
          'This contact already has another open conversation',
        );
      }
      throw err;
    }
  },

  /** Managers move conversations between inboxes. The assignee is cleared if not a member of the new inbox. */
  async moveToInbox(user: AuthUser, id: string, inboxId: string): Promise<Conversation> {
    const conversation = await this.getForUser(user, id);
    const target = await inboxesService.getById(inboxId);
    const keepAssignee =
      conversation.assigneeId !== null && inboxesService.isMember(target, conversation.assigneeId);
    return updated(
      await conversationsRepository.update(id, {
        inboxId: target._id,
        assigneeId: keepAssignee ? conversation.assigneeId : null,
      }),
    );
  },

  async markRead(user: AuthUser, id: string): Promise<Conversation> {
    await this.getForUser(user, id);
    return updated(await conversationsRepository.update(id, { unreadCount: 0 }));
  },

  async addLabel(user: AuthUser, id: string, labelId: string): Promise<Conversation> {
    await this.getForUser(user, id);
    await labelsService.assertExists(labelId);
    return updated(await conversationsRepository.addLabel(id, labelId));
  },

  async removeLabel(user: AuthUser, id: string, labelId: string): Promise<Conversation> {
    await this.getForUser(user, id);
    return updated(await conversationsRepository.removeLabel(id, labelId));
  },

  // ---- Used by other modules -------------------------------------------------

  /** Finds the contact's open/pending conversation or opens a new one in the default inbox. */
  async getOrCreateActive(contactId: Types.ObjectId, at: Date): Promise<Conversation> {
    const inbox = await inboxesService.getDefault();
    try {
      return await conversationsRepository.getOrCreateActive(contactId, inbox._id, at);
    } catch (err) {
      // Two webhooks for a new contact raced; the other one created it.
      if (isDuplicateKeyError(err))
        return conversationsRepository.getOrCreateActive(contactId, inbox._id, at);
      throw err;
    }
  },

  recordInbound(id: Types.ObjectId, at: Date, preview: string): Promise<void> {
    return conversationsRepository.recordInbound(id, at, preview);
  },

  /** Updates the preview and auto-assigns the conversation to the agent if it was unassigned. */
  recordOutbound(id: Types.ObjectId, at: Date, preview: string, sentBy?: string): Promise<void> {
    return conversationsRepository.recordOutbound(id, at, preview, sentBy);
  },

  removeLabelEverywhere(labelId: string): Promise<void> {
    return conversationsRepository.removeLabelEverywhere(labelId);
  },

  countInInbox(inboxId: string): Promise<number> {
    return conversationsRepository.countInInbox(inboxId);
  },
};
