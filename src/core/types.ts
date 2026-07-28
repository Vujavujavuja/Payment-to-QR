/**
 * Domain types for the NBS IPS QR payload.
 *
 * The wire format is a flat `TAG:value|TAG:value|...` string. We model it as a
 * structured object here and only serialise to tags at the edge (see encode.ts),
 * so the UI and the extractors never have to think in tags.
 */

/** Tags defined by the NBS IPS QR specification, in the order they must appear. */
export type IpsTag =
  | 'K' // identification code, always "PR"
  | 'V' // version, always "01"
  | 'C' // character set, always "1" (UTF-8)
  | 'R' // recipient account number, 18 digits
  | 'N' // recipient name (and place)
  | 'I' // amount, e.g. "RSD1234,56"
  | 'P' // payer name (and place)
  | 'SF' // payment code, 3 digits
  | 'S' // purpose of payment
  | 'RO'; // recipient reference number: 2-digit model + reference

export interface IpsPayment {
  /** Recipient account number. Stored unformatted: 18 digits, no dashes. */
  recipientAccount: string;
  /** Recipient name, optionally followed by address/place on further lines. */
  recipientName: string;
  /**
   * Amount in RSD as a plain decimal string with a `.` separator, e.g. "1234.56".
   * Serialised to the spec's comma form on encode.
   */
  amount: string;
  /** Payer name, optionally followed by address/place. Optional. */
  payerName?: string;
  /** Payment code (šifra plaćanja), 3 digits. */
  paymentCode: string;
  /** Purpose of payment (svrha plaćanja). Optional. */
  purpose?: string;
  /** Reference model (poziv na broj — model), 2 digits. "00" means no model. */
  referenceModel?: string;
  /** Reference number (poziv na broj). May contain digits and hyphens. */
  referenceNumber?: string;
}

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  /** Which `IpsPayment` field the issue belongs to. */
  field: keyof IpsPayment | 'payload';
  severity: IssueSeverity;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
