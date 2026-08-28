import { IPS_FIELD_LIMITS } from '@/core/constants';
import { digitsOnly, normalizeAccount, normalizeAmount, sanitizeText } from '@/core/format';
import { isValidAccountChecksum } from '@/core/validate';
import type { ExtractionResult, FieldConfidence } from './types';

/**
 * Serbian Cyrillic -> Latin, so label matching needs only one alphabet.
 *
 * Slips are printed in either script and OCR frequently mixes them within a
 * single document, which would otherwise double every label pattern below.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z',
  и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'c', џ: 'dz', ш: 's',
};

const LATIN_DIACRITICS: Record<string, string> = { š: 's', ć: 'c', č: 'c', ž: 'z', đ: 'dj' };

function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  return CYRILLIC_TO_LATIN[lower] ?? LATIN_DIACRITICS[lower] ?? lower;
}

/** Fold script and diacritics so `šifra`, `sifra` and `шифра` all match one pattern. */
export function foldScript(input: string): string {
  let folded = '';
  for (const ch of input) folded += foldChar(ch);
  return folded;
}

/**
 * Fold, and return a map from each folded index back to the raw index.
 *
 * Folding is *not* length-preserving — `ђ`, `љ`, `њ` and `џ` each become two
 * Latin characters. An offset found in the folded string is therefore not an
 * offset into the raw string, and slicing one with the other silently
 * misplaces text. `БУЏЕТ` alone is enough to shift everything after it.
 *
 * `offsets[folded.length]` is a sentinel holding the raw length, so a caller
 * can map an exclusive end index without a bounds check.
 */
export function foldWithOffsets(input: string): { folded: string; offsets: number[] } {
  let folded = '';
  const offsets: number[] = [];
  let rawIndex = 0;

  for (const ch of input) {
    for (const foldedChar of foldChar(ch)) {
      folded += foldedChar;
      offsets.push(rawIndex);
    }
    // Not 1: iterating a string yields code points, and an astral character
    // occupies two UTF-16 units in the raw string we will slice.
    rawIndex += ch.length;
  }

  offsets.push(input.length);
  return { folded, offsets };
}

/** Any 18-digit account, hyphenated or not. */
const ACCOUNT_PATTERN = /\b\d{3}[-\s]?\d{1,13}[-\s]?\d{2}\b|\b\d{18}\b/g;

/**
 * Labels that introduce a field, each as a list tried in order.
 *
 * Priority is what separates a label from a false friend, and the first
 * pattern to match anywhere wins before a later one is tried at all.
 *
 * The patterns deliberately have no trailing word boundary: Serbian inflects
 * its labels, so "iznos" also appears as "iznosu" and "svrha" as "svrhu".
 */
const LABELS = {
  recipientAccount: [
    /\bracun\s+primaoca/,
    /\bracun\s+za\s+uplatu/,
    /\bprimalac\s+racun/,
    /\bna\s+racun(\s+broj)?/,
    /\bracun\s+broj/,
  ],
  // "u korist" is unambiguous. "korisnik" is a real label on a bank slip but
  // means the *driver* on a police summons, where it appears first, so it is
  // tried last rather than blacklisted.
  recipientName: [/\bu\s+korist/, /\bprimalac/, /\bpoverilac/, /\bkorisnik/],
  payerName: [/\bplatilac/, /\buplatilac/, /\bduznik/],
  amount: [/\bza\s+uplatu/, /\bnovcan[aou]\s+kazn[aeiu]/, /\biznos/, /\bukupno/, /\bsvega/],
  paymentCode: [/\bsifra\s+placanja/, /\bsifra/],
  purpose: [/\bu\s+svrhu\s+placanja/, /\bsvrh[au]/],
  referenceModel: [/\bmodel/],
  referenceNumber: [
    /\bsa\s+pozivom\s+na\s+broj/,
    /\bpoziv\s+na\s+broj/,
    /\bpozivnabroj/,
    /\bpnb/,
  ],
} as const;

/** Every pattern, for "is this line just another label" checks. */
const ALL_PATTERNS: readonly RegExp[] = Object.values(LABELS).flat();

interface Line {
  raw: string;
  folded: string;
  /** folded index -> raw index, with a sentinel at folded.length. */
  offsets: number[];
}

function toLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, ...foldWithOffsets(raw) }));
}

/**
 * Read the value belonging to a label.
 *
 * On a slip the value sits either to the right of the label or directly below
 * it, depending on the layout, so both are tried. Anything left of the label on
 * the same line is discarded — that is the label's own column header.
 */
function valueForLabel(lines: Line[], patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].folded.match(pattern);
      if (!match || match.index === undefined) continue;

      // The match index is an offset into the *folded* line, so it has to be
      // translated before it can slice the raw one.
      const rawStart = lines[i].offsets[match.index + match[0].length];
      const after = lines[i].raw.slice(rawStart).replace(/^[\s:.\-–]+/, '').trim();
      if (after) return after;

      // Value wrapped to the next line; skip a line that is only another label.
      const next = lines[i + 1];
      if (next && !ALL_PATTERNS.some((p) => p.test(next.folded))) return next.raw;
    }
  }
  return null;
}

/** Pull the most plausible account out of free text. */
function findAccount(text: string, lines: Line[]): { value: string; confidence: number } | null {
  const labelled = valueForLabel(lines, LABELS.recipientAccount);
  const candidates: string[] = [];

  if (labelled) candidates.push(...(labelled.match(ACCOUNT_PATTERN) ?? []));
  candidates.push(...(text.match(ACCOUNT_PATTERN) ?? []));

  // A checksum-valid candidate beats a positionally-lucky one: OCR routinely
  // produces digit runs that look like accounts but are dates or invoice ids.
  const normalized = candidates
    .map((c) => normalizeAccount(c))
    .filter((c): c is string => c !== null);

  const verified = normalized.find(isValidAccountChecksum);
  if (verified) return { value: verified, confidence: 0.95 };
  if (normalized.length > 0) return { value: normalized[0], confidence: 0.4 };
  return null;
}

function findAmount(lines: Line[]): { value: string; confidence: number } | null {
  const labelled = valueForLabel(lines, LABELS.amount);
  if (labelled) {
    const normalized = normalizeAmount(labelled);
    if (normalized && Number(normalized) > 0) return { value: normalized, confidence: 0.8 };
  }

  // Fall back to the largest decimal-looking number on the slip. Totals are
  // usually the biggest figure present, and a wrong guess is visible and
  // trivially corrected in the form.
  const numbers: string[] = [];
  for (const line of lines) {
    for (const token of line.raw.match(/\d[\d.,]*\d|\d/g) ?? []) {
      if (/[.,]\d{2}\b/.test(token)) numbers.push(token);
    }
  }
  const parsed = numbers
    .map((n) => normalizeAmount(n))
    .filter((n): n is string => n !== null && Number(n) > 0)
    .sort((a, b) => Number(b) - Number(a));

  return parsed.length > 0 ? { value: parsed[0], confidence: 0.35 } : null;
}

/**
 * Turn OCR text into a partial payment.
 *
 * Every field is optional and low-confidence guesses are still returned — the
 * form shows them for review rather than applying them silently, so a wrong
 * guess costs the user one correction while a missing one costs full retyping.
 */
export function extractPaymentFromText(text: string, provider: string): ExtractionResult {
  const lines = toLines(text);
  const payment: ExtractionResult['payment'] = {};
  const confidence: FieldConfidence = {};
  const notes: string[] = [];

  const account = findAccount(text, lines);
  if (account) {
    payment.recipientAccount = account.value;
    confidence.recipientAccount = account.confidence;
    if (account.confidence < 0.5) notes.push('Account control digits did not verify — please check it.');
  }

  const amount = findAmount(lines);
  if (amount) {
    payment.amount = amount.value;
    confidence.amount = amount.confidence;
    if (amount.confidence < 0.5) notes.push('Amount was inferred from the largest figure on the page.');
  }

  const recipientName = valueForLabel(lines, LABELS.recipientName);
  if (recipientName) {
    payment.recipientName = sanitizeText(recipientName, IPS_FIELD_LIMITS.recipientName);
    confidence.recipientName = 0.6;
  }

  const payerName = valueForLabel(lines, LABELS.payerName);
  if (payerName) {
    payment.payerName = sanitizeText(payerName, IPS_FIELD_LIMITS.payerName);
    confidence.payerName = 0.6;
  }

  const purpose = valueForLabel(lines, LABELS.purpose);
  if (purpose) {
    payment.purpose = sanitizeText(purpose, IPS_FIELD_LIMITS.purpose);
    confidence.purpose = 0.6;
  }

  const paymentCode = valueForLabel(lines, LABELS.paymentCode);
  if (paymentCode) {
    const code = digitsOnly(paymentCode).slice(0, 3);
    if (code.length === 3) {
      payment.paymentCode = code;
      confidence.paymentCode = 0.7;
    }
  }

  const model = valueForLabel(lines, LABELS.referenceModel);
  if (model) {
    const digits = digitsOnly(model).slice(0, 2);
    if (digits.length === 2) {
      payment.referenceModel = digits;
      confidence.referenceModel = 0.6;
    }
  }

  const reference = valueForLabel(lines, LABELS.referenceNumber);
  if (reference) {
    const cleaned = sanitizeText(reference, IPS_FIELD_LIMITS.referenceNumber).replace(/[^\d-]/g, '');
    if (cleaned) {
      payment.referenceNumber = cleaned;
      confidence.referenceNumber = 0.5;
    }
  }

  if (Object.keys(payment).length === 0) {
    notes.push('Nothing recognisable was found — the image may be too blurry or not a payment slip.');
  }

  return { payment, confidence, rawText: text, provider, notes };
}
