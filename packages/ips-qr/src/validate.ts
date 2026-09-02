import { IPS_FIELD_LIMITS } from './constants.js';
import { digitsOnly, formatAmountForPayload, normalizeAccount, normalizeAmount } from './format.js';
import type { IpsPayment, ValidationIssue, ValidationResult } from './types.js';

/**
 * ISO 7064 MOD 97-10, the same scheme IBAN uses.
 *
 * A valid 18-digit Serbian account satisfies `value mod 97 == 1`. BigInt is
 * required here: 18 digits exceeds Number.MAX_SAFE_INTEGER, and doing this in
 * floating point silently accepts wrong accounts.
 */
export function isValidAccountChecksum(account: string): boolean {
  const digits = digitsOnly(account);
  if (digits.length !== IPS_FIELD_LIMITS.recipientAccount) return false;
  return BigInt(digits) % 97n === 1n;
}

/** Derive the 2 control digits for a bank + account pair (3 + 13 digits). */
export function computeAccountControlDigits(bankAndAccount: string): string | null {
  const digits = digitsOnly(bankAndAccount);
  if (digits.length !== 16) return null;
  const control = 98n - (BigInt(digits + '00') % 97n);
  return control.toString().padStart(2, '0');
}

/**
 * Check the leading control digits of a model-97 reference number.
 *
 * Model 97 puts two control digits at the front of the reference; the rest,
 * with separators removed, must satisfy MOD 97-10. Only digit references are
 * checked — some issuers use letters, and we would rather stay silent than
 * reject a reference we cannot interpret.
 */
export function isValidModel97Reference(reference: string): boolean | null {
  const compact = reference.replace(/[\s-]/g, '');
  if (!/^\d{3,}$/.test(compact)) return null;
  const control = compact.slice(0, 2);
  const body = compact.slice(2);
  const expected = 98n - (BigInt(body + '00') % 97n);
  return expected.toString().padStart(2, '0') === control;
}

function required(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Validate a payment before encoding.
 *
 * Errors mean the payload would be wrong or unusable. Warnings mean it is
 * probably wrong but still encodable — the user may know something we do not,
 * so those never block generation.
 */
export function validatePayment(payment: IpsPayment): ValidationResult {
  const issues: ValidationIssue[] = [];
  const error = (field: ValidationIssue['field'], message: string) =>
    issues.push({ field, severity: 'error', message });
  const warn = (field: ValidationIssue['field'], message: string) =>
    issues.push({ field, severity: 'warning', message });

  // --- recipient account ---
  const account = required(payment.recipientAccount);
  if (!account) {
    error('recipientAccount', 'Recipient account is required.');
  } else {
    const normalized = normalizeAccount(account);
    if (!normalized) {
      error('recipientAccount', 'Account must resolve to 18 digits (e.g. 265-1234567890-12).');
    } else if (!isValidAccountChecksum(normalized)) {
      error('recipientAccount', 'Account control digits are invalid — check for a misread digit.');
    }
  }

  // --- recipient name ---
  const recipientName = required(payment.recipientName);
  if (!recipientName) {
    error('recipientName', 'Recipient name is required.');
  } else if (recipientName.length > IPS_FIELD_LIMITS.recipientName) {
    error('recipientName', `Recipient name exceeds ${IPS_FIELD_LIMITS.recipientName} characters.`);
  }

  // --- amount ---
  const amount = required(payment.amount);
  if (!amount) {
    error('amount', 'Amount is required.');
  } else {
    const normalized = normalizeAmount(amount);
    if (normalized === null) {
      error('amount', 'Amount is not a number.');
    } else if (Number(normalized) <= 0) {
      error('amount', 'Amount must be greater than zero.');
    } else if (formatAmountForPayload(normalized).length > IPS_FIELD_LIMITS.amount) {
      error('amount', 'Amount is too large for the payload.');
    }
  }

  // --- payer name (optional) ---
  const payerName = required(payment.payerName);
  if (payerName.length > IPS_FIELD_LIMITS.payerName) {
    error('payerName', `Payer name exceeds ${IPS_FIELD_LIMITS.payerName} characters.`);
  }

  // --- payment code ---
  const paymentCode = required(payment.paymentCode);
  if (!paymentCode) {
    error('paymentCode', 'Payment code is required.');
  } else if (!/^\d{3}$/.test(paymentCode)) {
    error('paymentCode', 'Payment code must be exactly 3 digits.');
  }

  // --- purpose (optional) ---
  const purpose = required(payment.purpose);
  if (purpose.length > IPS_FIELD_LIMITS.purpose) {
    error('purpose', `Purpose exceeds ${IPS_FIELD_LIMITS.purpose} characters.`);
  }

  // --- reference (optional, but model and number go together) ---
  const model = required(payment.referenceModel);
  const reference = required(payment.referenceNumber);
  if (model && !/^\d{2}$/.test(model)) {
    error('referenceModel', 'Reference model must be exactly 2 digits (use 00 for none).');
  }
  if (reference.length > IPS_FIELD_LIMITS.referenceNumber) {
    error('referenceNumber', `Reference exceeds ${IPS_FIELD_LIMITS.referenceNumber} characters.`);
  }
  if (reference && !/^[\d\s-]+$/.test(reference)) {
    warn('referenceNumber', 'Reference contains characters some banks reject.');
  }
  if (model && !reference) {
    warn('referenceNumber', 'A reference model was given without a reference number.');
  }
  if (model === '97' && reference) {
    const ok = isValidModel97Reference(reference);
    if (ok === false) {
      warn('referenceNumber', 'Model 97 control digits do not match — verify the reference.');
    }
  }

  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}
