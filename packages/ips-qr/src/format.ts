import {
  ACCOUNT_BANK_DIGITS,
  ACCOUNT_CONTROL_DIGITS,
  ACCOUNT_NUMBER_DIGITS,
  IPS_CURRENCY,
} from './constants.js';

const ACCOUNT_TOTAL_DIGITS = ACCOUNT_BANK_DIGITS + ACCOUNT_NUMBER_DIGITS + ACCOUNT_CONTROL_DIGITS;

/**
 * Normalise an account number to the 18 bare digits the payload wants.
 *
 * Slips almost never print the padded form. `265-1234567890-12` has a 10-digit
 * middle segment that must be left-padded to 13 — dropping the dashes and
 * hoping for 18 digits would silently produce a different account, so the
 * hyphenated form is expanded segment by segment instead.
 *
 * Returns null when the input can't be resolved to exactly 18 digits.
 */
export function normalizeAccount(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const segments = trimmed.split(/[-\s/]+/).filter(Boolean);

  if (segments.length === 3 && segments.every((s) => /^\d+$/.test(s))) {
    const [bank, account, control] = segments;
    if (
      bank.length > ACCOUNT_BANK_DIGITS ||
      account.length > ACCOUNT_NUMBER_DIGITS ||
      control.length > ACCOUNT_CONTROL_DIGITS
    ) {
      return null;
    }
    return (
      bank.padStart(ACCOUNT_BANK_DIGITS, '0') +
      account.padStart(ACCOUNT_NUMBER_DIGITS, '0') +
      control.padStart(ACCOUNT_CONTROL_DIGITS, '0')
    );
  }

  const digits = trimmed.replace(/\D/g, '');
  return digits.length === ACCOUNT_TOTAL_DIGITS ? digits : null;
}

/** Render 18 digits back as `bbb-aaaaaaaaaaaaa-cc` for display. */
export function formatAccount(account: string): string {
  const digits = account.replace(/\D/g, '');
  if (digits.length !== ACCOUNT_TOTAL_DIGITS) return account;
  const bank = digits.slice(0, ACCOUNT_BANK_DIGITS);
  const middle = digits.slice(ACCOUNT_BANK_DIGITS, ACCOUNT_BANK_DIGITS + ACCOUNT_NUMBER_DIGITS);
  const control = digits.slice(ACCOUNT_BANK_DIGITS + ACCOUNT_NUMBER_DIGITS);
  return `${bank}-${middle}-${control}`;
}

/**
 * Parse a human-written amount into a canonical `1234.56` string.
 *
 * Serbian slips use `.` for thousands and `,` for decimals; OCR and pasted text
 * routinely mix both conventions, so the separators are disambiguated by
 * position rather than assumed:
 *
 *   "1.234,56" -> 1234.56   (both present: the last one is the decimal mark)
 *   "1,234.56" -> 1234.56
 *   "1234,5"   -> 1234.50   (1-2 trailing digits: decimal)
 *   "1.234"    -> 1234.00   (exactly 3 trailing digits: thousands)
 *
 * Returns null if no digits are present.
 */
export function normalizeAmount(input: string): string | null {
  const cleaned = input.replace(new RegExp(IPS_CURRENCY, 'gi'), '').replace(/[^\d.,]/g, '').trim();
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let decimalAt = -1;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalAt = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const candidate = Math.max(lastComma, lastDot);
    const trailing = cleaned.length - candidate - 1;
    // A single separator with exactly 3 digits behind it is a thousands mark.
    if (trailing > 0 && trailing <= 2) decimalAt = candidate;
  }

  const wholePart = (decimalAt >= 0 ? cleaned.slice(0, decimalAt) : cleaned).replace(/\D/g, '');
  const fractionPart = decimalAt >= 0 ? cleaned.slice(decimalAt + 1).replace(/\D/g, '') : '';

  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const fraction = (fractionPart + '00').slice(0, 2);
  return `${whole}.${fraction}`;
}

/** Serialise a canonical amount to the payload's `RSD1234,56` form. */
export function formatAmountForPayload(amount: string): string {
  const normalized = normalizeAmount(amount);
  if (normalized === null) return `${IPS_CURRENCY}0,00`;
  return `${IPS_CURRENCY}${normalized.replace('.', ',')}`;
}

/**
 * Collapse whitespace and drop characters that would corrupt the payload.
 *
 * `|` is the tag separator and `\n` is the sub-field separator inside N and P,
 * so a stray one from OCR would shift every field after it.
 */
export function sanitizeText(input: string, maxLength: number): string {
  return input
    .replace(/[|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Strip everything but digits — used for payment codes and reference models. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}
