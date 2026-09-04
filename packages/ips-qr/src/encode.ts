import {
  IPS_CHARACTER_SET,
  IPS_FIELD_LIMITS,
  IPS_IDENTIFICATION_CODE,
  IPS_MAX_PAYLOAD_LENGTH,
  IPS_TAG_ORDER,
  IPS_TAG_SEPARATOR,
  IPS_VERSION,
} from './constants.js';
import { digitsOnly, formatAmountForPayload, normalizeAccount, sanitizeText } from './format.js';
import type { IpsPayment, IpsTag } from './types.js';

export interface EncodeResult {
  payload: string;
  /** True when the payload exceeds the soft length ceiling — see constants.ts. */
  overLength: boolean;
}

/**
 * Serialise a payment to the IPS QR payload string.
 *
 * Optional tags are omitted entirely rather than emitted empty: a trailing
 * `S:|RO:` is not the same thing as "no purpose given" to every scanner, and
 * dropping them also buys back payload length.
 *
 * Fields are sanitized on the way out, so an unvalidated payment still yields
 * a structurally sound payload. Correctness of the *values* is validate.ts's
 * job; this function's job is to never emit a malformed string.
 */
export function encodePayment(payment: IpsPayment): EncodeResult {
  const tags = new Map<IpsTag, string>();

  tags.set('K', IPS_IDENTIFICATION_CODE);
  tags.set('V', IPS_VERSION);
  tags.set('C', IPS_CHARACTER_SET);

  // Fall back to the raw digits when normalisation fails so a partially
  // filled form still produces something the user can inspect.
  const account = normalizeAccount(payment.recipientAccount) ?? digitsOnly(payment.recipientAccount);
  tags.set('R', account);

  tags.set('N', sanitizeText(payment.recipientName, IPS_FIELD_LIMITS.recipientName));
  tags.set('I', formatAmountForPayload(payment.amount));

  const payer = sanitizeText(payment.payerName ?? '', IPS_FIELD_LIMITS.payerName);
  if (payer) tags.set('P', payer);

  tags.set('SF', digitsOnly(payment.paymentCode).slice(0, IPS_FIELD_LIMITS.paymentCode));

  const purpose = sanitizeText(payment.purpose ?? '', IPS_FIELD_LIMITS.purpose);
  if (purpose) tags.set('S', purpose);

  // RO is a single value: the 2-digit model immediately followed by the
  // reference. A reference without a model is emitted under model 00.
  const reference = sanitizeText(payment.referenceNumber ?? '', IPS_FIELD_LIMITS.referenceNumber);
  if (reference) {
    const model = (digitsOnly(payment.referenceModel ?? '') || '00').slice(0, 2).padStart(2, '0');
    tags.set('RO', `${model}${reference}`);
  }

  const payload = IPS_TAG_ORDER.filter((tag) => tags.has(tag))
    .map((tag) => `${tag}:${tags.get(tag)}`)
    .join(IPS_TAG_SEPARATOR);

  return { payload, overLength: payload.length > IPS_MAX_PAYLOAD_LENGTH };
}
