import { describe, expect, it } from 'vitest';
import { foldScript, foldWithOffsets } from './normalize';

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
