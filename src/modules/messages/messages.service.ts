import type { AuthUser } from '../../lib/auth';
import { isDuplicateKeyError } from '../../lib/db';
import { RetryableError, WhatsAppApiError, WindowClosedError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { toPage, type Page } from '../../lib/pagination';
import { maskPhone } from '../../lib/phone';
import { sendWhatsAppMessage } from '../../lib/whatsapp/client';
import {
  waTimestampToDate,
  type InboundMessage,
  type WebhookPayload,
  type WebhookStatus,
} from '../../lib/whatsapp/webhook.types';
import { contactsService } from '../contacts/contacts.service';
import { conversationsService } from '../conversations/conversations.service';
import { previewOf, toMessageContent } from './messages.content';
import type { Message, MessageStatus } from './messages.model';
import { messagesRepository } from './messages.repository';
import type { SendTextInput } from './messages.schemas';

/** Which current statuses each incoming status may replace. Statuses never move backwards. */
export const ALLOWED_PREVIOUS: Record<WebhookStatus['status'], readonly MessageStatus[]> = {
  sent: ['queued'],
  delivered: ['queued', 'sent'],
  read: ['queued', 'sent', 'delivered'],
  failed: ['queued', 'sent', 'delivered'],
};

/** A status may arrive before we've saved the wamid of a message we just sent. */
const STATUS_RACE_WINDOW_MS = 5 * 60 * 1000;

export const messagesService = {
  /** Entry point for the inbound SQS consumer. */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;
        const names = new Map(
          (change.value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name] as const),
        );
        for (const msg of change.value.messages ?? []) {
          await this.saveInbound(msg, names.get(msg.from));
        }
        for (const status of change.value.statuses ?? []) {
          await this.applyStatus(status);
        }
      }
    }
  },

  /** Idempotent: a duplicate wamid is ignored. */
  async saveInbound(msg: InboundMessage, profileName?: string): Promise<void> {
    const at = waTimestampToDate(msg.timestamp);
    const contact = await contactsService.upsertFromInbound(msg.from, profileName, at);
    const conversation = await conversationsService.getOrCreateActive(contact._id, at);
    const content = toMessageContent(msg);

    try {
      await messagesRepository.insert({
        ...content,
        conversationId: conversation._id,
        contactId: contact._id,
        direction: 'inbound',
        waMessageId: msg.id,
        replyToWaMessageId: msg.context?.id,
        status: 'received',
        sentAt: at,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        logger.info('Duplicate inbound message ignored', { waMessageId: msg.id });
        return;
      }
      throw err;
    }

    await conversationsService.recordInbound(conversation._id, at, previewOf(content));
    logger.info('Inbound message saved', { from: maskPhone(msg.from), type: msg.type });
  },

  async applyStatus(status: WebhookStatus): Promise<void> {
    const at = waTimestampToDate(status.timestamp);
    const error = status.errors?.[0];
    const moved = await messagesRepository.advanceStatus(
      status.id,
      ALLOWED_PREVIOUS[status.status],
      status.status,
      at,
      error ? { code: error.code, title: error.title, message: error.message } : undefined,
    );
    if (moved) return;

    const existing = await messagesRepository.findByWaMessageId(status.id);
    if (existing) return; // Older or duplicate status: nothing to do.
    if (Date.now() - at.getTime() < STATUS_RACE_WINDOW_MS) {
      throw new RetryableError(`Status for unknown message ${status.id}; retrying`);
    }
    // Sent outside this CRM (e.g. from WhatsApp Business app) — ignore.
  },

  async list(
    user: AuthUser,
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<Message>> {
    const conversation = await conversationsService.getForUser(user, conversationId);
    const rows = await messagesRepository.listByConversation(conversation._id, limit, cursor);
    return toPage(rows, limit, (m) => m.sentAt);
  },

  /** Agent reply. Only allowed inside the 24-hour customer service window. */
  async sendText(user: AuthUser, conversationId: string, input: SendTextInput): Promise<Message> {
    const conversation = await conversationsService.getForUser(user, conversationId);
    const contact = await contactsService.getById(conversation.contactId);
    if (!contactsService.isWindowOpen(contact)) throw new WindowClosedError();

    const now = new Date();
    const queued = await messagesRepository.insert({
      conversationId: conversation._id,
      contactId: contact._id,
      direction: 'outbound',
      type: 'text',
      text: input.text,
      replyToWaMessageId: input.replyToWaMessageId,
      status: 'queued',
      sentBy: user.id,
      sentAt: now,
    });

    let sent: Message | null;
    try {
      const { waMessageId } = await sendWhatsAppMessage(
        contact.waId,
        { type: 'text', text: { body: input.text } },
        input.replyToWaMessageId,
      );
      sent = await messagesRepository.update(queued._id, {
        waMessageId,
        status: 'sent',
        statusAt: new Date(),
      });
    } catch (err) {
      const code = err instanceof WhatsAppApiError ? Number(err.details?.waCode ?? 0) : 0;
      await messagesRepository.update(queued._id, {
        status: 'failed',
        statusAt: new Date(),
        error: { code, message: err instanceof Error ? err.message : 'Unknown error' },
      });
      throw err;
    }

    await conversationsService.recordOutbound(
      conversation._id,
      now,
      previewOf({ type: 'text', text: input.text }),
      user.id,
    );
    return sent ?? queued;
  },
};
