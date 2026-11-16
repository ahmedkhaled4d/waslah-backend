import type { Types } from 'mongoose';
import { isManager, type AuthUser } from '../../lib/auth';
import { isDuplicateKeyError } from '../../lib/db';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { inboxesRepository } from './inboxes.repository';
import type { Inbox } from './inboxes.model';
import type { CreateInboxInput, UpdateInboxInput } from './inboxes.schemas';

function rethrowDuplicate(err: unknown): never {
  if (isDuplicateKeyError(err)) {
    throw new ConflictError('INBOX_EXISTS', 'An inbox with this name already exists');
  }
  throw err;
}

export const inboxesService = {
  /** Managers see every inbox; agents see the inboxes they are members of. */
  listForUser(user: AuthUser): Promise<Inbox[]> {
    return isManager(user) ? inboxesRepository.list() : inboxesRepository.listForMember(user.id);
  },

  /** Inbox ids the user can work in, or `null` meaning "all" (managers). */
  async accessibleInboxIds(user: AuthUser): Promise<Types.ObjectId[] | null> {
    return isManager(user) ? null : inboxesRepository.idsForMember(user.id);
  },

  async getById(id: Types.ObjectId | string): Promise<Inbox> {
    const inbox = await inboxesRepository.findById(id);
    if (!inbox) throw new NotFoundError('Inbox');
    return inbox;
  },

  async getForUser(user: AuthUser, id: string): Promise<Inbox> {
    const inbox = await this.getById(id);
    if (!isManager(user) && !inbox.memberIds.includes(user.id)) throw new ForbiddenError();
    return inbox;
  },

  async getDefault(): Promise<Inbox> {
    return (await inboxesRepository.findDefault()) ?? inboxesRepository.ensureDefault();
  },

  isMember(inbox: Pick<Inbox, 'memberIds'>, memberId: string): boolean {
    return inbox.memberIds.includes(memberId);
  },

  async create(input: CreateInboxInput): Promise<Inbox> {
    try {
      return await inboxesRepository.create({ ...input, memberIds: [...new Set(input.memberIds)] });
    } catch (err) {
      rethrowDuplicate(err);
    }
  },

  async update(id: string, input: UpdateInboxInput): Promise<Inbox> {
    await this.getById(id);
    try {
      if (input.isDefault) await inboxesRepository.clearDefaultExcept(id);
      const inbox = await inboxesRepository.update(id, input);
      if (!inbox) throw new NotFoundError('Inbox');
      return inbox;
    } catch (err) {
      rethrowDuplicate(err);
    }
  },

  async addMembers(id: string, memberIds: string[]): Promise<Inbox> {
    const inbox = await inboxesRepository.addMembers(id, memberIds);
    if (!inbox) throw new NotFoundError('Inbox');
    return inbox;
  },

  async removeMember(id: string, memberId: string): Promise<Inbox> {
    const inbox = await inboxesRepository.removeMember(id, memberId);
    if (!inbox) throw new NotFoundError('Inbox');
    return inbox;
  },

  /** Deletes only the inbox document. Use inboxDeletionService, which checks for conversations. */
  async deleteInboxDocument(id: string): Promise<void> {
    const inbox = await this.getById(id);
    if (inbox.isDefault) {
      throw new ConflictError(
        'DEFAULT_INBOX',
        'Make another inbox the default before deleting this one',
      );
    }
    await inboxesRepository.delete(id);
  },
};
