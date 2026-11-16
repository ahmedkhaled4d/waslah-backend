import type { InboundMessage } from '../../lib/whatsapp/webhook.types';
import type { Message } from './messages.model';

type Content = Pick<Message, 'type' | 'text' | 'media' | 'location' | 'reply' | 'reaction' | 'raw'>;

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const;

/** Maps a WhatsApp webhook message to the fields we store. Unknown types keep the raw payload. */
export function toMessageContent(msg: InboundMessage): Content {
  const content: Content = { type: msg.type };

  if (msg.text) content.text = msg.text.body;

  for (const mediaType of MEDIA_TYPES) {
    const media = msg[mediaType];
    if (msg.type === mediaType && media) {
      content.media = {
        waMediaId: media.id,
        mimeType: media.mime_type,
        sha256: media.sha256,
        caption: media.caption,
        filename: media.filename,
      };
      if (media.caption) content.text = media.caption;
    }
  }

  if (msg.location) content.location = msg.location;
  if (msg.button) content.reply = { id: msg.button.payload, title: msg.button.text };
  if (msg.button?.text) content.text = msg.button.text;
  const interactiveReply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
  if (interactiveReply) {
    content.reply = { id: interactiveReply.id, title: interactiveReply.title };
    content.text = interactiveReply.title;
  }
  if (msg.reaction)
    content.reaction = { messageId: msg.reaction.message_id, emoji: msg.reaction.emoji };

  const known = content.text !== undefined || content.media || content.location || content.reaction;
  if (!known) content.raw = msg;
  return content;
}

/** Short text for the conversation list. */
export function previewOf(content: Pick<Message, 'type' | 'text' | 'reaction'>): string {
  if (content.type === 'reaction') return `Reacted ${content.reaction?.emoji ?? ''}`.trim();
  const label = content.type === 'text' ? '' : `[${content.type}] `;
  return `${label}${content.text ?? ''}`.trim().slice(0, 140);
}
