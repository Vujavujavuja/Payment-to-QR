import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPaymentFromText, foldScript, foldWithOffsets } from './normalize';

/**
 * A redacted traffic-fine summons, shared with the Python suite.
 *
 * Names, address, plate, case number and fine number are placeholders; the
 * payment paragraph keeps its exact wording and line wrapping, because that
 * is the part under test. Real documents never go in the repository.
 */
const SUMMONS = readFileSync(
  fileURLToPath(new URL('./__fixtures__/prekrsajni-poziv.txt', import.meta.url)),
  'utf8',
);

/** The public account of the Republic of Serbia budget, printed on every fine. */
const BUDGET_ACCOUNT = '840000074332484318';

describe('foldScript', () => {
  it.each(['šifra', 'sifra', 'шифра', 'ШИФРА', 'Šifra'])('folds %s to one form', (input) => {
    expect(foldScript(input)).toBe('sifra');
  });

  it('folds Cyrillic and Latin spellings of the same word together', () => {
    expect(foldScript('РАЧУН')).toBe(foldScript('racun'));
  });
});

describe('foldWithOffsets', () => {
  it('expands the characters that fold to two letters', () => {
    // Џ -> dz, so the folded string is longer than its source.
    const { folded } = foldWithOffsets('БУЏЕТ');
    expect(folded).toBe('budzet');
    expect(folded.length).toBeGreaterThan('БУЏЕТ'.length);
  });

  it('maps a folded index back to the character it came from', () => {
    const raw = 'БУЏЕТ РЕПУБЛИКЕ';
    const { folded, offsets } = foldWithOffsets(raw);
    const start = folded.indexOf('republike');
    // Slicing raw at the *folded* index would land mid-word; the map fixes it.
    expect(raw.slice(offsets[start])).toBe('РЕПУБЛИКЕ');
  });

  it('points both halves of a two-letter fold at the same source character', () => {
    const { folded, offsets } = foldWithOffsets('Џ');
    expect(folded).toBe('dz');
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(0);
  });

  it('ends with a sentinel holding the raw length', () => {
    const raw = 'НАЛОГ';
    const { folded, offsets } = foldWithOffsets(raw);
    expect(offsets[folded.length]).toBe(raw.length);
  });

  it('keeps offsets aligned for text that needs no folding at all', () => {
    const { folded, offsets } = foldWithOffsets('racun broj');
    expect(folded).toBe('racun broj');
    expect(offsets.slice(0, folded.length)).toEqual([...folded].map((_, i) => i));
  });
});

describe('Cyrillic offsets in a real document', () => {
  it('does not shift the value when the line contains a two-letter fold', () => {
    // "БУЏЕТ" sits between the label and the value on this line. Slicing raw
    // text with a folded offset returns it one character short.
    const line = 'Uplatu izvrsiti u korist: БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ';
    const result = extractPaymentFromText(line, 'test');
    expect(result.payment.recipientName ?? '').not.toMatch(/^УЏЕТ|^ЏЕТ/);
  });

  it('finds the checksum-valid account in the summons', () => {
    const result = extractPaymentFromText(SUMMONS, 'test');
    expect(result.payment.recipientAccount).toBe(BUDGET_ACCOUNT);
    expect(result.confidence.recipientAccount).toBe(0.95);
  });

  it('prefers a checksum-valid account over an earlier lookalike', () => {
    const text = 'broj 145-7-31981-26 ... na racun broj 840-743324843-18';
    expect(extractPaymentFromText(text, 'test').payment.recipientAccount).toBe(BUDGET_ACCOUNT);
  });
});

describe('label priority', () => {
  it('prefers "u korist" over the driver sense of "korisnik"', () => {
    // "кориснику возила" appears well before "у корист" in the summons.
    // Scanning line by line without priority returns the car instead.
    const result = extractPaymentFromText(SUMMONS, 'test');
    expect(result.payment.recipientName).toBe('БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ');
    expect(result.payment.recipientName).not.toMatch(/AUDI|возила/);
  });

  it('still honours "korisnik" when nothing more specific is present', () => {
    const result = extractPaymentFromText('korisnik: EPS Snabdevanje', 'test');
    expect(result.payment.recipientName).toBe('EPS Snabdevanje');
  });

  it('matches an inflected label', () => {
    // "iznosu", not "iznos" — a trailing \b would miss it.
    const result = extractPaymentFromText('u fiksnom iznosu od 10000 dinara', 'test');
    expect(result.payment.amount).toBe('10000.00');
  });
});

describe('several labels on one line', () => {
  it('stops the recipient where the purpose label begins', () => {
    const result = extractPaymentFromText(SUMMONS, 'test');
    expect(result.payment.recipientName).not.toMatch(/сврху|плаћања/);
  });

  it('stops the purpose where the account label begins', () => {
    const result = extractPaymentFromText(SUMMONS, 'test');
    expect(result.payment.purpose ?? '').not.toMatch(/рачун|840/);
  });

  it('splits a Latin line carrying three labels', () => {
    const line = 'u korist: BUDZET REPUBLIKE SRBIJE, u svrhu placanja: KAZNA na racun broj 840-743324843-18';
    const result = extractPaymentFromText(line, 'test');
    expect(result.payment.recipientName).toBe('BUDZET REPUBLIKE SRBIJE');
    expect(result.payment.purpose).toBe('KAZNA');
    expect(result.payment.recipientAccount).toBe(BUDGET_ACCOUNT);
  });
});
