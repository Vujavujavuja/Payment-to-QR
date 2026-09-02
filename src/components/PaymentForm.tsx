'use client';

import { useState } from 'react';
import { COMMON_PAYMENT_CODES, IPS_FIELD_LIMITS } from 'ips-qr';
import type { IpsPayment, ValidationIssue } from 'ips-qr';
import type { FieldConfidence } from '@/extract/types';

/** Below this, the extractor was guessing and the field is flagged for review. */
const REVIEW_THRESHOLD = 0.7;

interface Props {
  payment: IpsPayment;
  issues: ValidationIssue[];
  confidence: FieldConfidence;
  onChange: (patch: Partial<IpsPayment>) => void;
}

export function PaymentForm({ payment, issues, confidence, onChange }: Props) {
  const [touched, setTouched] = useState<Set<keyof IpsPayment>>(new Set());

  /**
   * Only complain about a field once the user has been near it, or once it has
   * a value to complain about. An empty form greeting someone with three red
   * "required" errors reads as broken rather than as guidance.
   */
  const shouldShowError = (field: keyof IpsPayment) =>
    touched.has(field) || Boolean((payment[field] as string | undefined)?.trim());

  const errorFor = (field: keyof IpsPayment) =>
    shouldShowError(field)
      ? issues.find((i) => i.field === field && i.severity === 'error')?.message
      : undefined;
  const warningFor = (field: keyof IpsPayment) =>
    issues.find((i) => i.field === field && i.severity === 'warning')?.message;
  const uncertain = (field: keyof IpsPayment) => {
    const score = confidence[field];
    return score !== undefined && score < REVIEW_THRESHOLD;
  };

  function field(
    name: keyof IpsPayment,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) {
    const error = errorFor(name);
    const warning = warningFor(name);
    return (
      <div className={`field${uncertain(name) ? ' is-uncertain' : ''}`}>
        <label htmlFor={name}>{label}</label>
        {input}
        {uncertain(name) && (
          <div className="field-flag">Low confidence — check this against the slip.</div>
        )}
        {error && (
          <div className="field-error" role="alert">
            {error}
          </div>
        )}
        {!error && warning && <div className="field-flag">{warning}</div>}
        {!error && !warning && hint && <div className="dropzone-hint">{hint}</div>}
      </div>
    );
  }

  const markTouched = (name: keyof IpsPayment) =>
    setTouched((previous) => (previous.has(name) ? previous : new Set(previous).add(name)));

  const text = (name: keyof IpsPayment, extra: Record<string, unknown> = {}) => (
    <input
      id={name}
      value={(payment[name] as string | undefined) ?? ''}
      onChange={(event) => onChange({ [name]: event.target.value })}
      onBlur={() => markTouched(name)}
      aria-invalid={Boolean(errorFor(name))}
      {...extra}
    />
  );

  return (
    <div>
      {field(
        'recipientAccount',
        'Recipient account',
        text('recipientAccount', {
          inputMode: 'numeric',
          placeholder: '265-1234567890-98',
          autoComplete: 'off',
        }),
        'Hyphenated or plain — short middle segments are padded automatically.',
      )}

      {field(
        'recipientName',
        'Recipient',
        text('recipientName', { maxLength: IPS_FIELD_LIMITS.recipientName, placeholder: 'Who is being paid' }),
      )}

      <div className="field-row">
        {field(
          'amount',
          'Amount (RSD)',
          text('amount', { inputMode: 'decimal', placeholder: '3450.00' }),
        )}
        {field(
          'paymentCode',
          'Payment code',
          <select
            id="paymentCode"
            value={payment.paymentCode}
            onChange={(event) => onChange({ paymentCode: event.target.value })}
          >
            {/* A scanned code may legitimately fall outside the common list;
                keep it selectable rather than silently resetting it. */}
            {!COMMON_PAYMENT_CODES.some((c) => c.code === payment.paymentCode) && payment.paymentCode && (
              <option value={payment.paymentCode}>{payment.paymentCode} — from the slip</option>
            )}
            {COMMON_PAYMENT_CODES.map((code) => (
              <option key={code.code} value={code.code}>
                {code.label}
              </option>
            ))}
          </select>,
        )}
      </div>

      {field(
        'payerName',
        'Payer (optional)',
        text('payerName', { maxLength: IPS_FIELD_LIMITS.payerName, placeholder: 'Your name' }),
      )}

      {field(
        'purpose',
        'Purpose (optional)',
        text('purpose', {
          maxLength: IPS_FIELD_LIMITS.purpose,
          placeholder: 'e.g. Racun za struju',
        }),
        `${(payment.purpose ?? '').length}/${IPS_FIELD_LIMITS.purpose} characters`,
      )}

      <div className="field-row">
        {field(
          'referenceModel',
          'Model (optional)',
          text('referenceModel', { inputMode: 'numeric', maxLength: 2, placeholder: '97' }),
        )}
        {field(
          'referenceNumber',
          'Reference (optional)',
          text('referenceNumber', {
            maxLength: IPS_FIELD_LIMITS.referenceNumber,
            placeholder: '921234567890',
          }),
        )}
      </div>
    </div>
  );
}
