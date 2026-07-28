import { extractPaymentFromText } from '../normalize';
import { ExtractionError, type ExtractionInput, type ExtractionResult, type Extractor } from '../types';

export const TESSERACT_PROVIDER_ID = 'tesseract';

/**
 * Serbian in both scripts, plus English.
 *
 * Slips are printed either way and label text is what the normalizer keys off,
 * so dropping a script costs field recognition, not just character accuracy.
 * English is included because bank-generated PDFs often carry Latin headers.
 */
const LANGUAGES = 'srp+srp_latn+eng';

/**
 * In-browser OCR. The default extractor: no API key, no server round trip,
 * and the image never leaves the device.
 *
 * Accuracy on photographed slips is mediocre — this is why every field lands
 * in an editable form rather than going straight to a QR code.
 */
export class TesseractExtractor implements Extractor {
  readonly id = TESSERACT_PROVIDER_ID;
  readonly label = 'On-device OCR (Tesseract)';

  isAvailable(): boolean {
    return typeof window !== 'undefined';
  }

  async extract(input: ExtractionInput, signal?: AbortSignal): Promise<ExtractionResult> {
    if (!this.isAvailable()) {
      throw new ExtractionError('Tesseract only runs in the browser.', this.id);
    }

    // Imported lazily: the worker and wasm payload are large, and a user who
    // only pastes a payload should never download them.
    const { createWorker } = await import('tesseract.js');

    const worker = await createWorker(LANGUAGES);
    try {
      if (signal?.aborted) throw new ExtractionError('Cancelled.', this.id);

      const blob = new Blob([input.data as BlobPart], { type: input.mimeType });
      const { data } = await worker.recognize(blob);

      const result = extractPaymentFromText(data.text ?? '', this.id);

      // Tesseract's own page confidence is a useful signal the text heuristics
      // cannot see: clean text with no matches means a non-slip image, whereas
      // garbled text means a bad photo, and the advice differs.
      if (typeof data.confidence === 'number' && data.confidence < 60) {
        result.notes = [
          ...(result.notes ?? []),
          'OCR quality was low — try better lighting, or a flatter, straighter shot.',
        ];
      }

      return result;
    } catch (error) {
      if (error instanceof ExtractionError) throw error;
      throw new ExtractionError('OCR failed to process the image.', this.id, error);
    } finally {
      await worker.terminate();
    }
  }
}
