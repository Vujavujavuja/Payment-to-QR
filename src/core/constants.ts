import type { IpsTag } from './types';

/** Fixed header values required by the specification. */
export const IPS_IDENTIFICATION_CODE = 'PR';
export const IPS_VERSION = '01';
/** "1" selects UTF-8. It is the only character set worth emitting. */
export const IPS_CHARACTER_SET = '1';

/** Currency prefix on the amount tag. IPS is a dinar-only scheme. */
export const IPS_CURRENCY = 'RSD';

export const IPS_TAG_SEPARATOR = '|';
export const IPS_TAG_ORDER: IpsTag[] = ['K', 'V', 'C', 'R', 'N', 'I', 'P', 'SF', 'S', 'RO'];

/** Maximum value length per tag, as given by the NBS field table. */
export const IPS_FIELD_LIMITS = {
  recipientAccount: 18,
  recipientName: 70,
  amount: 20, // includes the "RSD" prefix
  payerName: 70,
  paymentCode: 3,
  purpose: 35,
  /** 2-digit model + up to 22 characters of reference. */
  referenceNumber: 22,
} as const;

/**
 * Soft ceiling on the encoded payload.
 *
 * The NBS validator documents an upper bound on QR content; we treat exceeding
 * it as a warning rather than an error so an otherwise-valid slip still renders
 * a code the user can try. Per-field limits above are the hard constraints.
 */
export const IPS_MAX_PAYLOAD_LENGTH = 331;

/** A Serbian account number is 18 digits: 3 bank + 13 account + 2 control. */
export const ACCOUNT_BANK_DIGITS = 3;
export const ACCOUNT_NUMBER_DIGITS = 13;
export const ACCOUNT_CONTROL_DIGITS = 2;

/**
 * Common payment codes, for the UI dropdown. The spec allows any 3-digit code;
 * this list only covers the ones an individual is likely to need.
 */
export const COMMON_PAYMENT_CODES: { code: string; label: string }[] = [
  { code: '189', label: '189 — Transfer / other (prenos sredstava)' },
  { code: '221', label: '221 — Goods and services (promet robe i usluga)' },
  { code: '222', label: '222 — Services (usluge)' },
  { code: '245', label: '245 — Utilities (komunalne usluge)' },
  { code: '253', label: '253 — Public revenue / taxes (javni prihodi)' },
  { code: '288', label: '288 — Court and administrative fees (takse)' },
  { code: '290', label: '290 — Other transactions (ostalo)' },
];

export const DEFAULT_PAYMENT_CODE = '189';
