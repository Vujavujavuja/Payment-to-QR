import { describe, expect, it } from 'vitest';
import { encodePayment } from './encode';
import { formatAccount, formatAmountForPayload, normalizeAccount, normalizeAmount } from './format';
import { parsePayload } from './parse';
import type { IpsPayment } from './types';
import { computeAccountControlDigits, isValidAccountChecksum, isValidModel97Reference, validatePayment } from './validate';

/** Checksum-valid account: bank 265, account 1234567890, control 98. */
const VALID_ACCOUNT = '265000123456789098';

function payment(overrides: Partial<IpsPayment> = {}): IpsPayment {
  return {
    recipientAccount: VALID_ACCOUNT,
    recipientName: 'Elektrodistribucija Beograd',
    amount: '3450.00',
    paymentCode: '189',
    ...overrides,
  };
}

describe('normalizeAccount', () => {
  it('pads each hyphenated segment independently', () => {
    // The middle segment is 10 digits and must grow to 13 on the left.
    expect(normalizeAccount('265-1234567890-98')).toBe(VALID_ACCOUNT);
  });

  it('accepts an already-padded 18 digit account', () => {
    expect(normalizeAccount(VALID_ACCOUNT)).toBe(VALID_ACCOUNT);
  });

  it('rejects digit runs that are not 18 long', () => {
    expect(normalizeAccount('2651234567890')).toBeNull();
  });

  it('rejects segments that overflow their field', () => {
    expect(normalizeAccount('2650-1234567890-98')).toBeNull();
  });

  it('round-trips through the display format', () => {
    expect(formatAccount(VALID_ACCOUNT)).toBe('265-0001234567890-98');
  });
});

describe('normalizeAmount', () => {
  it.each([
    ['1.234,56', '1234.56'], // Serbian
    ['1,234.56', '1234.56'], // English
    ['1234,5', '1234.50'],
    ['1234', '1234.00'],
    ['1.234', '1234.00'], // single separator, 3 trailing digits -> thousands
    ['1.50', '1.50'], // single separator, 2 trailing digits -> decimal
    ['RSD 3.450,00', '3450.00'],
    ['0,99', '0.99'],
  ])('parses %s as %s', (input, expected) => {
    expect(normalizeAmount(input)).toBe(expected);
  });

  it('returns null when there are no digits', () => {
    expect(normalizeAmount('RSD')).toBeNull();
  });

  it('serialises to the comma form the payload requires', () => {
    expect(formatAmountForPayload('1234.5')).toBe('RSD1234,50');
  });
});

describe('account checksum', () => {
  it('accepts a valid account', () => {
    expect(isValidAccountChecksum(VALID_ACCOUNT)).toBe(true);
  });

  it('rejects a single transposed digit', () => {
    expect(isValidAccountChecksum('265000123456789097')).toBe(false);
  });

  it('derives the control digits', () => {
    expect(computeAccountControlDigits('2650001234567890')).toBe('98');
  });
});

describe('model 97 reference', () => {
  it('accepts a correctly computed reference', () => {
    expect(isValidModel97Reference('921234567890')).toBe(true);
  });

  it('ignores separators', () => {
    expect(isValidModel97Reference('92-1234567890')).toBe(true);
  });

  it('rejects a wrong control pair', () => {
    expect(isValidModel97Reference('911234567890')).toBe(false);
  });

  it('abstains on non-numeric references', () => {
    expect(isValidModel97Reference('AB1234')).toBeNull();
  });
});

describe('validatePayment', () => {
  it('accepts a well-formed payment', () => {
    expect(validatePayment(payment()).valid).toBe(true);
  });

  it('flags a bad account checksum as an error', () => {
    const result = validatePayment(payment({ recipientAccount: '265000123456789097' }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'recipientAccount')).toBe(true);
  });

  it('rejects a zero amount', () => {
    expect(validatePayment(payment({ amount: '0' })).valid).toBe(false);
  });

  it('rejects a two digit payment code', () => {
    expect(validatePayment(payment({ paymentCode: '18' })).valid).toBe(false);
  });

  it('warns but stays valid on a mismatched model 97 reference', () => {
    const result = validatePayment(payment({ referenceModel: '97', referenceNumber: '911234567890' }));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
  });
});

describe('encodePayment', () => {
  it('emits the mandatory tags in spec order', () => {
    const { payload } = encodePayment(payment());
    expect(payload).toBe(
      'K:PR|V:01|C:1|R:265000123456789098|N:Elektrodistribucija Beograd|I:RSD3450,00|SF:189',
    );
  });

  it('omits optional tags rather than emitting them empty', () => {
    const { payload } = encodePayment(payment({ payerName: '', purpose: '' }));
    expect(payload).not.toContain('P:');
    expect(payload).not.toContain('S:');
    expect(payload).not.toContain('RO:');
  });

  it('packs the reference model and number into one RO tag', () => {
    const { payload } = encodePayment(payment({ referenceModel: '97', referenceNumber: '921234567890' }));
    expect(payload).toContain('RO:97921234567890');
  });

  it('defaults a reference with no model to model 00', () => {
    const { payload } = encodePayment(payment({ referenceNumber: '12345' }));
    expect(payload).toContain('RO:0012345');
  });

  it('strips pipe characters that would shift every later field', () => {
    const { payload } = encodePayment(payment({ recipientName: 'ACME|DOO' }));
    expect(payload).toContain('N:ACME DOO');
    expect(payload.split('|').length).toBe(7);
  });
});

describe('parsePayload', () => {
  it('round-trips a fully populated payment', () => {
    const original = payment({
      payerName: 'Petar Petrovic',
      purpose: 'Racun za struju',
      referenceModel: '97',
      referenceNumber: '921234567890',
    });
    const { payload } = encodePayment(original);
    const parsed = parsePayload(payload);

    expect(parsed).not.toBeNull();
    expect(parsed!.recipientAccount).toBe(original.recipientAccount);
    expect(parsed!.amount).toBe('3450.00');
    expect(parsed!.referenceModel).toBe('97');
    expect(parsed!.referenceNumber).toBe('921234567890');
  });

  it('returns null for a string that is not an IPS payload', () => {
    expect(parsePayload('https://example.com')).toBeNull();
  });

  it('treats a too-short RO tag as absent rather than slicing it', () => {
    // "RO:9" cannot hold a 2-digit model and a reference, and slicing it
    // anyway yields a one-digit model the spec does not have.
    const parsed = parsePayload('K:PR|V:01|C:1|R:265000123456789098|N:T|I:RSD10,00|SF:189|RO:9');
    expect(parsed).not.toBeNull();
    expect(parsed!.referenceModel).toBeUndefined();
    expect(parsed!.referenceNumber).toBeUndefined();
  });

  it('still parses the shortest RO that can hold both parts', () => {
    const parsed = parsePayload('K:PR|V:01|C:1|R:265000123456789098|N:T|I:RSD10,00|SF:189|RO:001');
    expect(parsed!.referenceModel).toBe('00');
    expect(parsed!.referenceNumber).toBe('1');
  });

  it('ignores tags it does not know', () => {
    const parsed = parsePayload('K:PR|V:01|C:1|R:265000123456789098|N:Test|I:RSD10,00|SF:189|XX:future');
    expect(parsed?.recipientName).toBe('Test');
  });
});
