import { describe, expect, it } from 'vitest';
import { previewOf, toMessageContent } from '../messages.content';

const base = { from: '966512345612', id: 'wamid.1', timestamp: '1763290000' };

describe('toMessageContent', () => {
  it('maps an image with caption', () => {
    const c = toMessageContent({
      ...base,
      type: 'image',
      image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Invoice' },
    });
    expect(c.media).toMatchObject({ waMediaId: 'media-1', mimeType: 'image/jpeg' });
    expect(c.text).toBe('Invoice');
    expect(previewOf(c)).toBe('[image] Invoice');
  });

  it('maps an interactive button reply', () => {
    const c = toMessageContent({
      ...base,
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Yes please' } },
    });
    expect(c.reply).toEqual({ id: 'yes', title: 'Yes please' });
    expect(c.text).toBe('Yes please');
  });

  it('keeps the raw payload for unsupported types', () => {
    const c = toMessageContent({ ...base, type: 'order', order: { catalog_id: '1' } });
    expect(c.raw).toMatchObject({ type: 'order' });
  });
});
