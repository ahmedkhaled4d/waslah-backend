import type { Types } from 'mongoose';
import { NotFoundError } from '../../lib/errors';
import { contactsRepository } from './contacts.repository';
import type { Contact } from './contacts.model';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export const contactsService = {
  upsertFromInbound(waId: string, profileName: string | undefined, at: Date): Promise<Contact> {
    return contactsRepository.upsertInbound(waId, profileName, at);
  },

  async getById(id: Types.ObjectId | string): Promise<Contact> {
    const contact = await contactsRepository.findById(id);
    if (!contact) throw new NotFoundError('Contact');
    return contact;
  },

  /** Free-form messages are only allowed within 24h of the customer's last message. */
  isWindowOpen(contact: Pick<Contact, 'lastInboundAt'>, now = new Date()): boolean {
    return (
      contact.lastInboundAt !== undefined &&
      now.getTime() - new Date(contact.lastInboundAt).getTime() < WINDOW_MS
    );
  },
};
