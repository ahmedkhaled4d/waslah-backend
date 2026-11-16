import { Types } from 'mongoose';
import type { AuthUser } from '../../lib/auth';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { toPage, type Page } from '../../lib/pagination';
import { contactsService } from '../contacts/contacts.service';
import { conversationsService } from '../conversations/conversations.service';
import { labelsService } from '../labels/labels.service';
import { pipelinesService } from '../pipelines/pipelines.service';
import type { Deal } from './deals.model';
import { dealsRepository, type StageTotals } from './deals.repository';
import type {
  CreateDealInput,
  DealStatusInput,
  ListDealsQuery,
  MoveDealInput,
  UpdateDealInput,
} from './deals.schemas';

function found(deal: Deal | null): Deal {
  if (!deal) throw new NotFoundError('Deal');
  return deal;
}

function stageNotInPipeline(): ValidationError {
  return new ValidationError({ fields: { stageId: 'Stage does not belong to this pipeline' } });
}

export const dealsService = {
  async list(query: ListDealsQuery): Promise<Page<Deal>> {
    const { limit, cursor, ...filter } = query;
    const rows = await dealsRepository.list(filter, limit, cursor);
    return toPage(rows, limit, (d) => d.updatedAt);
  },

  async getById(id: string): Promise<Deal> {
    return found(await dealsRepository.findById(id));
  },

  async create(user: AuthUser, input: CreateDealInput): Promise<Deal> {
    const pipeline = await pipelinesService.getById(input.pipelineId);
    const stage = input.stageId
      ? pipelinesService.findStage(pipeline, input.stageId)
      : pipeline.stages[0];
    if (!stage) throw stageNotInPipeline();
    const contact = await contactsService.getById(input.contactId);
    if (input.conversationId) {
      const conversation = await conversationsService.getForUser(user, input.conversationId);
      if (!conversation.contactId.equals(contact._id)) {
        throw new ValidationError({
          fields: { conversationId: 'Conversation belongs to another contact' },
        });
      }
    }

    return dealsRepository.create({
      title: input.title,
      value: input.value,
      currency: input.currency.toUpperCase(),
      pipelineId: pipeline._id,
      stageId: stage._id,
      contactId: contact._id,
      conversationId: input.conversationId ? new Types.ObjectId(input.conversationId) : undefined,
      ownerId: input.ownerId ?? user.id,
      expectedCloseDate: input.expectedCloseDate,
      notes: input.notes,
      createdBy: user.id,
    });
  },

  async update(id: string, input: UpdateDealInput): Promise<Deal> {
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const [key, value] of Object.entries(input)) {
      if (value === null) unset.push(key);
      else if (value !== undefined)
        set[key] = key === 'currency' ? String(value).toUpperCase() : value;
    }
    return found(await dealsRepository.update(id, set, unset));
  },

  async move(id: string, input: MoveDealInput): Promise<Deal> {
    const deal = await this.getById(id);
    const pipeline = await pipelinesService.getById(input.pipelineId ?? deal.pipelineId);
    const stage = pipelinesService.findStage(pipeline, input.stageId);
    if (!stage) throw stageNotInPipeline();
    return found(
      await dealsRepository.update(id, { pipelineId: pipeline._id, stageId: stage._id }),
    );
  },

  async setStatus(id: string, input: DealStatusInput): Promise<Deal> {
    if (input.status === 'open') {
      return found(
        await dealsRepository.update(id, { status: 'open' }, ['closedAt', 'lostReason']),
      );
    }
    const set: Record<string, unknown> = { status: input.status, closedAt: new Date() };
    const unset: string[] = [];
    if (input.status === 'lost' && input.lostReason) set.lostReason = input.lostReason;
    else unset.push('lostReason');
    return found(await dealsRepository.update(id, set, unset));
  },

  async addLabel(id: string, labelId: string): Promise<Deal> {
    await labelsService.assertExists(labelId);
    return found(await dealsRepository.addLabel(id, labelId));
  },

  async removeLabel(id: string, labelId: string): Promise<Deal> {
    return found(await dealsRepository.removeLabel(id, labelId));
  },

  async delete(id: string): Promise<void> {
    if (!(await dealsRepository.delete(id))) throw new NotFoundError('Deal');
  },

  // ---- Used by other modules -------------------------------------------------

  countInStage(pipelineId: string, stageId: string): Promise<number> {
    return dealsRepository.countInStage(pipelineId, stageId);
  },

  countInPipeline(pipelineId: string): Promise<number> {
    return dealsRepository.countInPipeline(pipelineId);
  },

  totalsByStage(pipelineId: Types.ObjectId): Promise<StageTotals[]> {
    return dealsRepository.totalsByStage(pipelineId);
  },

  removeLabelEverywhere(labelId: string): Promise<void> {
    return dealsRepository.removeLabelEverywhere(labelId);
  },
};
