import type { Types } from 'mongoose';
import { ContactModel, type Contact } from './contacts.model';

export const contactsRepository = {
  /** Creates the contact if new; keeps lastInboundAt monotonic. */
  async upsertInbound(waId: string, profileName: string | undefined, at: Date): Promise<Contact> {
    return ContactModel.findOneAndUpdate(
      { waId },
      {
        $max: { lastInboundAt: at },
        ...(profileName ? { $set: { profileName } } : {}),
        $setOnInsert: { waId },
      },
      { upsert: true, returnDocument: 'after' },
    )
      .lean<Contact>()
      .orFail();
  },

  findById(id: Types.ObjectId | string): Promise<Contact | null> {
    return ContactModel.findById(id).lean<Contact>();
  },
};
