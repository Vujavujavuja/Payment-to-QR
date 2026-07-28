import type { IpsPayment } from '@/core/types';

/** Fields an extractor can populate. Mirrors IpsPayment minus derived values. */
export type ExtractableField = keyof IpsPayment;

/**
 * Per-field confidence in [0, 1].
 *
 * The UI uses this to decide what to highlight for review — a 0.4 amount gets
 * flagged, a 0.95 account does not. Extractors that cannot produce a
 * meaningful score should report a flat conservative value rather than 1.
 */
export type FieldConfidence = Partial<Record<ExtractableField, number>>;

export interface ExtractionResult {
  /** Only the fields the extractor actually found. Never fabricated. */
  payment: Partial<IpsPayment>;
  confidence: FieldConfidence;
  /** Raw text, when the provider produced any. Shown in the UI for debugging. */
  rawText?: string;
  provider: string;
  /** Non-fatal notes worth surfacing (low OCR quality, ambiguous amount, ...). */
  notes?: string[];
}

export interface ExtractionInput {
  /** Image bytes. */
  data: Uint8Array;
  /** MIME type, e.g. "image/jpeg". Providers may reject unsupported types. */
  mimeType: string;
}

export interface Extractor {
  /** Stable identifier, surfaced in the UI and in ExtractionResult.provider. */
  readonly id: string;
  readonly label: string;
  /** Whether this extractor can run in the current environment. */
  isAvailable(): Promise<boolean> | boolean;
  extract(input: ExtractionInput, signal?: AbortSignal): Promise<ExtractionResult>;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}
