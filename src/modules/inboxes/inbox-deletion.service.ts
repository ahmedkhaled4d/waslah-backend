import { ConflictError } from '../../lib/errors';
import { conversationsService } from '../conversations/conversations.service';
import { inboxesService } from './inboxes.service';

/** Inbox deletion needs the conversations module. Separate file to avoid a circular import. */
export const inboxDeletionService = {
  async delete(id: string): Promise<void> {
    await inboxesService.getById(id);
    if ((await conversationsService.countInInbox(id)) > 0) {
      throw new ConflictError(
        'INBOX_HAS_CONVERSATIONS',
        "Move this inbox's conversations to another inbox first",
      );
    }
    await inboxesService.deleteInboxDocument(id);
  },
};
