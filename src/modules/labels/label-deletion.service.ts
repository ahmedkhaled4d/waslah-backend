import { conversationsService } from '../conversations/conversations.service';
import { dealsService } from '../deals/deals.service';
import { labelsService } from './labels.service';

/** Deleting a label also detaches it from conversations and deals. Separate file to avoid circular imports. */
export const labelDeletionService = {
  async delete(id: string): Promise<void> {
    await labelsService.deleteLabelDocument(id);
    await conversationsService.removeLabelEverywhere(id);
    await dealsService.removeLabelEverywhere(id);
  },
};
