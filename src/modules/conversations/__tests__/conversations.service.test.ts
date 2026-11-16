import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError } from '../../../lib/errors';

vi.mock('../conversations.repository', () => ({
  conversationsRepository: { findById: vi.fn(), update: vi.fn(), list: vi.fn() },
}));
vi.mock('../../inboxes/inboxes.service', () => ({
  inboxesService: {
    getById: vi.fn(),
    isMember: (inbox: { memberIds: string[] }, id: string) => inbox.memberIds.includes(id),
    accessibleInboxIds: vi.fn(),
  },
}));
vi.mock('../../labels/labels.service', () => ({ labelsService: { assertExists: vi.fn() } }));

const { conversationsRepository } = await import('../conversations.repository');
const { inboxesService } = await import('../../inboxes/inboxes.service');
const { conversationsService } = await import('../conversations.service');

const inboxId = new Types.ObjectId();
const id = new Types.ObjectId().toHexString();
const agent = { id: 'agent-1', role: 'agent' as const };
const otherAgent = { id: 'agent-2', role: 'agent' as const };
const admin = { id: 'admin-1', role: 'admin' as const };

function conversation(assigneeId: string | null) {
  return { _id: new Types.ObjectId(id), inboxId, assigneeId, contactId: new Types.ObjectId() };
}

beforeEach(() => {
  vi.mocked(inboxesService.getById).mockResolvedValue({
    _id: inboxId,
    memberIds: ['agent-1', 'agent-2'],
  } as never);
  vi.mocked(conversationsRepository.update).mockImplementation((_id, set) =>
    Promise.resolve({ ...conversation(null), ...set } as never),
  );
});

describe('access', () => {
  it('blocks agents who are not inbox members and not the assignee', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation(null) as never);
    vi.mocked(inboxesService.getById).mockResolvedValue({ _id: inboxId, memberIds: [] } as never);
    await expect(conversationsService.getForUser(agent, id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets the assignee in even without inbox membership', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation('agent-1') as never);
    vi.mocked(inboxesService.getById).mockResolvedValue({ _id: inboxId, memberIds: [] } as never);
    await expect(conversationsService.getForUser(agent, id)).resolves.toBeTruthy();
  });

  it("scopes an agent's list to their inboxes or assignments", async () => {
    vi.mocked(inboxesService.accessibleInboxIds).mockResolvedValue([inboxId]);
    vi.mocked(conversationsRepository.list).mockResolvedValue([]);
    await conversationsService.list(agent, { limit: 50 });
    expect(conversationsRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ visibleTo: { inboxIds: [inboxId], userId: 'agent-1' } }),
      50,
      undefined,
    );
  });
});

describe('assign', () => {
  it('lets an agent claim an unassigned conversation', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation(null) as never);
    const result = await conversationsService.assign(agent, id, 'agent-1');
    expect(result.assigneeId).toBe('agent-1');
  });

  it('stops an agent from taking a conversation assigned to someone else', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation('agent-2') as never);
    await expect(conversationsService.assign(agent, id, 'agent-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('stops an agent from assigning to a teammate', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation(null) as never);
    await expect(conversationsService.assign(otherAgent, id, 'agent-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('lets a manager reassign to any inbox member', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation('agent-1') as never);
    const result = await conversationsService.assign(admin, id, 'agent-2');
    expect(result.assigneeId).toBe('agent-2');
  });

  it('rejects assigning to someone outside the inbox', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation(null) as never);
    await expect(conversationsService.assign(admin, id, 'stranger')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe('setStatus', () => {
  it('marks resolved conversations inactive', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation('agent-1') as never);
    await conversationsService.setStatus(agent, id, 'resolved');
    expect(conversationsRepository.update).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ status: 'resolved', active: false }),
    );
  });

  it('refuses to reopen when the contact already has an active conversation', async () => {
    vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation('agent-1') as never);
    vi.mocked(conversationsRepository.update).mockRejectedValue(
      Object.assign(new Error('dup'), { code: 11000 }),
    );
    await expect(conversationsService.setStatus(agent, id, 'open')).rejects.toMatchObject({
      code: 'ACTIVE_CONVERSATION_EXISTS',
    });
  });
});
