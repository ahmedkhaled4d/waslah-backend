import { readFileSync } from 'node:fs';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryableError, WindowClosedError } from '../../../lib/errors';
import { webhookPayloadSchema } from '../../../lib/whatsapp/webhook.types';

vi.mock('../messages.repository', () => ({
  messagesRepository: {
    insert: vi.fn(),
    advanceStatus: vi.fn(),
    findByWaMessageId: vi.fn(),
    update: vi.fn(),
    listByConversation: vi.fn(),
  },
}));
vi.mock('../../contacts/contacts.service', () => ({
  contactsService: { upsertFromInbound: vi.fn(), getById: vi.fn(), isWindowOpen: vi.fn() },
}));
vi.mock('../../conversations/conversations.service', () => ({
  conversationsService: {
    getOrCreateActive: vi.fn(),
    recordInbound: vi.fn(),
    recordOutbound: vi.fn(),
    getForUser: vi.fn(),
  },
}));
vi.mock('../../../lib/whatsapp/client', () => ({ sendWhatsAppMessage: vi.fn() }));

const { messagesRepository } = await import('../messages.repository');
const { contactsService } = await import('../../contacts/contacts.service');
const { conversationsService } = await import('../../conversations/conversations.service');
const { sendWhatsAppMessage } = await import('../../../lib/whatsapp/client');
const { messagesService, ALLOWED_PREVIOUS } = await import('../messages.service');

const fixture = webhookPayloadSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../../../../test/fixtures/whatsapp/text-message.json', import.meta.url),
      'utf8',
    ),
  ),
);

const contact = { _id: new Types.ObjectId(), waId: '966512345612', optIn: false };
const conversation = { _id: new Types.ObjectId(), contactId: contact._id };
const agent = { id: 'agent-1', role: 'agent' as const };

beforeEach(() => {
  vi.mocked(contactsService.upsertFromInbound).mockResolvedValue(contact as never);
  vi.mocked(contactsService.getById).mockResolvedValue(contact as never);
  vi.mocked(conversationsService.getOrCreateActive).mockResolvedValue(conversation as never);
  vi.mocked(conversationsService.getForUser).mockResolvedValue(conversation as never);
  vi.mocked(messagesRepository.insert).mockImplementation((d) =>
    Promise.resolve({ ...d, _id: new Types.ObjectId() } as never),
  );
  vi.mocked(messagesRepository.advanceStatus).mockResolvedValue(true);
});

describe('handleWebhook', () => {
  it("saves the inbound message to the contact's active conversation", async () => {
    await messagesService.handleWebhook(fixture);

    expect(contactsService.upsertFromInbound).toHaveBeenCalledWith(
      '966512345612',
      'Sara',
      new Date(1763290000_000),
    );
    expect(messagesRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: conversation._id,
        direction: 'inbound',
        type: 'text',
        text: 'Hi, what are your prices?',
        status: 'received',
      }),
    );
    expect(conversationsService.recordInbound).toHaveBeenCalledWith(
      conversation._id,
      new Date(1763290000_000),
      'Hi, what are your prices?',
    );
  });

  it('ignores a duplicate delivery of the same message', async () => {
    vi.mocked(messagesRepository.insert).mockRejectedValue(
      Object.assign(new Error('dup'), { code: 11000 }),
    );
    await messagesService.handleWebhook(fixture);
    expect(conversationsService.recordInbound).not.toHaveBeenCalled();
  });

  it('advances the status of outbound messages', async () => {
    await messagesService.handleWebhook(fixture);
    expect(messagesRepository.advanceStatus).toHaveBeenCalledWith(
      'wamid.OUTBOUND1',
      ALLOWED_PREVIOUS.delivered,
      'delivered',
      new Date(1763290005_000),
      undefined,
    );
  });
});

describe('applyStatus', () => {
  const status = (secondsAgo: number) => ({
    id: 'wamid.X',
    status: 'read' as const,
    timestamp: String(Math.floor(Date.now() / 1000) - secondsAgo),
    recipient_id: '966512345612',
  });

  it('never moves a status backwards', () => {
    expect(ALLOWED_PREVIOUS.sent).not.toContain('read');
    expect(ALLOWED_PREVIOUS.delivered).not.toContain('read');
    expect(ALLOWED_PREVIOUS.read).not.toContain('failed');
  });

  it('retries a recent status for a message not saved yet', async () => {
    vi.mocked(messagesRepository.advanceStatus).mockResolvedValue(false);
    vi.mocked(messagesRepository.findByWaMessageId).mockResolvedValue(null);
    await expect(messagesService.applyStatus(status(10))).rejects.toBeInstanceOf(RetryableError);
  });

  it('ignores an old status for an unknown message', async () => {
    vi.mocked(messagesRepository.advanceStatus).mockResolvedValue(false);
    vi.mocked(messagesRepository.findByWaMessageId).mockResolvedValue(null);
    await expect(messagesService.applyStatus(status(3600))).resolves.toBeUndefined();
  });
});

describe('sendText', () => {
  it('refuses free-form messages outside the 24-hour window', async () => {
    vi.mocked(contactsService.isWindowOpen).mockReturnValue(false);
    await expect(
      messagesService.sendText(agent, conversation._id.toHexString(), { text: 'Hello' }),
    ).rejects.toBeInstanceOf(WindowClosedError);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('sends, stores the wamid, and auto-assigns the conversation to the sender', async () => {
    vi.mocked(contactsService.isWindowOpen).mockReturnValue(true);
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ waMessageId: 'wamid.NEW' });

    await messagesService.sendText(agent, conversation._id.toHexString(), { text: 'Hello' });

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      '966512345612',
      { type: 'text', text: { body: 'Hello' } },
      undefined,
    );
    expect(messagesRepository.update).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.objectContaining({ waMessageId: 'wamid.NEW', status: 'sent' }),
    );
    expect(conversationsService.recordOutbound).toHaveBeenCalledWith(
      conversation._id,
      expect.any(Date),
      'Hello',
      'agent-1',
    );
  });

  it('marks the message failed when the API call fails', async () => {
    vi.mocked(contactsService.isWindowOpen).mockReturnValue(true);
    vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('boom'));

    await expect(
      messagesService.sendText(agent, conversation._id.toHexString(), { text: 'Hello' }),
    ).rejects.toThrow('boom');
    expect(messagesRepository.update).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
