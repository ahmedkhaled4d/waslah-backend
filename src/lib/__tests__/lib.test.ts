import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { keysetFilter, toPage } from '../pagination';
import { maskPhone, normalizeWaId } from '../phone';
import { isValidSignature } from '../whatsapp/signature';

describe('isValidSignature', () => {
  const secret = 'app-secret';
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const sign = (b: Buffer, s = secret) =>
    `sha256=${createHmac('sha256', s).update(b).digest('hex')}`;

  it('accepts a correct signature', () => {
    expect(isValidSignature(body, sign(body), secret)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(isValidSignature(body, sign(body, 'other'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(isValidSignature(Buffer.from('{}'), sign(body), secret)).toBe(false);
  });

  it('rejects missing or malformed headers', () => {
    expect(isValidSignature(body, undefined, secret)).toBe(false);
    expect(isValidSignature(body, 'sha1=abc', secret)).toBe(false);
    expect(isValidSignature(body, 'sha256=zz', secret)).toBe(false);
  });
});

describe('phone helpers', () => {
  it('normalizes to E.164 digits without +', () => {
    expect(normalizeWaId('+966 51 234 5612')).toBe('966512345612');
    expect(normalizeWaId('00966512345612')).toBe('966512345612');
  });

  it('rejects numbers of invalid length', () => {
    expect(() => normalizeWaId('12345')).toThrow();
  });

  it('masks numbers for logs', () => {
    expect(maskPhone('966512345612')).toBe('+9665******12');
  });
});

describe('pagination', () => {
  const rows = [3, 2, 1].map((n) => ({ _id: new Types.ObjectId(), at: new Date(2026, 0, n) }));

  it('returns a cursor when there are more rows than the limit', () => {
    const page = toPage(rows, 2, (r) => r.at);
    expect(page.data).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    const filter = keysetFilter('at', page.nextCursor ?? undefined);
    expect(filter).toHaveProperty('$or');
  });

  it('returns no cursor on the last page', () => {
    expect(toPage(rows, 5, (r) => r.at).nextCursor).toBeNull();
  });

  it('rejects a garbage cursor', () => {
    expect(() => keysetFilter('at', 'not-a-cursor')).toThrow('Invalid request');
  });
});
