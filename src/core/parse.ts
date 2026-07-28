import { IPS_IDENTIFICATION_CODE, IPS_TAG_SEPARATOR } from './constants';
import { normalizeAmount } from './format';
import type { IpsPayment, IpsTag } from './types';

/**
 * Decode an IPS QR payload back into a payment.
 *
 * Useful for round-trip tests and for letting a user paste a payload someone
 * else generated, then edit it. Unknown tags are ignored rather than treated
 * as errors so payloads from newer spec revisions still decode usefully.
 *
 * Returns null when the string is not an IPS payload at all.
 */
export function parsePayload(payload: string): IpsPayment | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const tags = new Map<string, string>();
  for (const part of trimmed.split(IPS_TAG_SEPARATOR)) {
    const separator = part.indexOf(':');
    if (separator <= 0) continue;
    tags.set(part.slice(0, separator).trim().toUpperCase(), part.slice(separator + 1));
  }

  if (tags.get('K') !== IPS_IDENTIFICATION_CODE) return null;

  const get = (tag: IpsTag) => tags.get(tag) ?? '';

  // RO packs the 2-digit model and the reference into one value.
  const rawReference = get('RO');
  const referenceModel = rawReference ? rawReference.slice(0, 2) : undefined;
  const referenceNumber = rawReference ? rawReference.slice(2) : undefined;

  return {
    recipientAccount: get('R'),
    recipientName: get('N'),
    amount: normalizeAmount(get('I')) ?? '',
    payerName: get('P') || undefined,
    paymentCode: get('SF'),
    purpose: get('S') || undefined,
    referenceModel,
    referenceNumber,
  };
}
