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

describe('finding the amount in prose', () => {
  it('walks past a label that has no number after it', () => {
    // "novcana kazna" matches first, but the text up to the next label is
    // "u fiksnom" — the digits live after "iznosu", further along the line.
    const text = 'za koji je propisana novcana kazna u fiksnom iznosu od 10000 dinara.';
    expect(extractPaymentFromText(text, 'test').payment.amount).toBe('10000.00');
  });

  it('reports the fine from the summons with label confidence, not a guess', () => {
    const result = extractPaymentFromText(SUMMONS, 'test');
    expect(result.payment.amount).toBe('10000.00');
    expect(result.confidence.amount).toBe(0.8);
  });
});

describe('dates are not amounts', () => {
  it.each(['30.04.2027', '1.1.2026', '12.08.2026.'])('does not read %s as an amount', (date) => {
    const result = extractPaymentFromText(`datum vazenja ${date}`, 'test');
    expect(result.payment.amount).toBeUndefined();
  });

  it('still finds a real amount on a page that also carries dates', () => {
    const text = ['datum vazenja 30.04.2027', 'ukupno 3.450,00'].join('\n');
    expect(extractPaymentFromText(text, 'test').payment.amount).toBe('3450.00');
  });

  it('picks the largest genuine amount, not the largest date', () => {
    const text = ['30.04.2027', '1.234,50', '900,00'].join('\n');
    // Unguarded, the date normalises to 30042027.00 and wins outright.
    expect(extractPaymentFromText(text, 'test').payment.amount).toBe('1234.50');
  });
});

describe('numeric fields demand the right shape', () => {
  it('does not read a car model as a reference model', () => {
    const text = [
      'korisniku vozila marke AUDI A3 model LIMOUSINE, oznake PA275-VE',
      'sa pozivom na broj 08501265012043052 model',
      '97.',
    ].join('\n');
    const result = extractPaymentFromText(text, 'test');
    expect(result.payment.referenceModel).toBe('97');
  });

  it('leaves the reference model empty rather than guessing from a plate', () => {
    const result = extractPaymentFromText('vozila marke AUDI A3 model LIMOUSINE', 'test');
    expect(result.payment.referenceModel).toBeUndefined();
  });

  it('takes a three digit payment code and refuses anything else', () => {
    expect(extractPaymentFromText('sifra placanja: 189', 'test').payment.paymentCode).toBe('189');
    expect(extractPaymentFromText('sifra placanja: 18', 'test').payment.paymentCode).toBeUndefined();
  });

  it('does not invent a payment code for a document that states none', () => {
    // Nothing on a summons gives a sifra placanja. Guessing one would be the
    // single most dangerous thing this module could do.
    const result = extractPaymentFromText(SUMMONS, 'test');
    expect(result.payment.paymentCode).toBeUndefined();
  });

  it('finds the model and reference in the summons', () => {
    const result = extractPaymentFromText(SUMMONS, 'test');
    expect(result.payment.referenceModel).toBe('97');
    expect(result.payment.referenceNumber).toBe('26501000000000000');
  });
});
