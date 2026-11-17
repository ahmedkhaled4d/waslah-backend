/**
 * Builds/updates MongoDB indexes for every model. Run before deploying to prod:
 *   npm run sync-indexes   (reads MONGODB_URI from `.env` or the shell)
 */
import mongoose from 'mongoose';
import { ContactModel } from '../src/modules/contacts/contacts.model';
import { ConversationModel } from '../src/modules/conversations/conversations.model';
import { DealModel } from '../src/modules/deals/deals.model';
import { InboxModel } from '../src/modules/inboxes/inboxes.model';
import { LabelModel } from '../src/modules/labels/labels.model';
import { MessageModel } from '../src/modules/messages/messages.model';
import { PipelineModel } from '../src/modules/pipelines/pipelines.model';
import { UserModel } from '../src/modules/users/users.model';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Set MONGODB_URI');

await mongoose.connect(uri, { autoIndex: false });
for (const model of [
  UserModel,
  ContactModel,
  InboxModel,
  ConversationModel,
  MessageModel,
  LabelModel,
  PipelineModel,
  DealModel,
]) {
  const dropped = await model.syncIndexes();
  console.log(
    `${model.modelName}: synced${dropped.length ? `, dropped ${dropped.join(', ')}` : ''}`,
  );
}
await mongoose.disconnect();
