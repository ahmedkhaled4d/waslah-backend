import { ValidationError } from './errors';

/** Normalizes to E.164 digits without "+", the format WhatsApp uses for wa_id. */
export function normalizeWaId(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) {
    throw new ValidationError({
      phone: 'Phone number must be 8-15 digits in international format',
    });
  }
  return digits;
}

/** Masks a phone number for logs: 966512345612 -> +9665******12 */
export function maskPhone(waId: string): string {
  if (waId.length <= 6) return '+******';
  return `+${waId.slice(0, 4)}${'*'.repeat(waId.length - 6)}${waId.slice(-2)}`;
}
