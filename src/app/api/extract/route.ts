import { NextResponse } from 'next/server';
import { ClaudeExtractor } from '@/extract/providers/claude';
import { ExtractionError } from '@/extract/types';
import {
  GLOBAL_KEY,
  clientKeyFromHeaders,
  extractionLimiter,
  globalExtractionLimiter,
} from '@/lib/rate-limit';

// Buffer and the Anthropic SDK need the Node runtime, not Edge.
export const runtime = 'nodejs';

/**
 * Anthropic caps a single image at 5 MB after base64 encoding, which inflates
 * by ~4/3. Rejecting early gives a clear message instead of a 413 from upstream.
 */
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

/**
 * Server-side extraction endpoint.
 *
 * Only the Claude provider lives here — Tesseract runs entirely in the browser
 * and never needs a round trip. The API key stays server-side; it is never
 * shipped to the client.
 */
function tooManyRequests(retryAfterSeconds: number, message: string) {
  return NextResponse.json(
    { error: message, code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  const extractor = new ClaudeExtractor();

  // Rate limiting comes before anything else that costs money or memory:
  // every request past this point either buffers an image or bills an API
  // call. Both limits are checked because they stop different things -- one
  // caller hammering the endpoint, and many callers each staying politely
  // under the per-caller limit while the bill still climbs.
  const perClient = extractionLimiter.check(clientKeyFromHeaders(request.headers));
  if (!perClient.allowed) {
    return tooManyRequests(
      perClient.retryAfterSeconds,
      'Too many extraction requests from this address. Try again later, or use on-device OCR, which has no limit.',
    );
  }

  const global = globalExtractionLimiter.check(GLOBAL_KEY);
  if (!global.allowed) {
    return tooManyRequests(
      global.retryAfterSeconds,
      'This server has reached its extraction limit for now. Try again later, or use on-device OCR, which has no limit.',
    );
  }

  if (!extractor.isAvailable()) {
    return NextResponse.json(
      {
        error: 'Claude extraction is not configured on this server. Set ANTHROPIC_API_KEY, or use on-device OCR.',
        code: 'provider_unavailable',
      },
      { status: 501 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('image');
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json(
      { error: 'Expected a multipart/form-data body.', code: 'bad_request' },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: 'No image was uploaded under the "image" field.', code: 'bad_request' },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 3.5 MB. Try a smaller photo.`,
        code: 'payload_too_large',
      },
      { status: 413 },
    );
  }

  try {
    const result = await extractor.extract({
      data: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExtractionError) {
      // The upstream cause may carry key material or request details, so only
      // our own message crosses the wire; the detail goes to the server log.
      console.error('[extract] provider error', error.provider, error.cause ?? error);
      return NextResponse.json({ error: error.message, code: 'extraction_failed' }, { status: 502 });
    }
    console.error('[extract] unexpected error', error);
    return NextResponse.json(
      { error: 'Extraction failed unexpectedly.', code: 'internal_error' },
      { status: 500 },
    );
  }
}

/**
 * Lets the client show or hide the Claude option without attempting an upload.
 *
 * Not rate limited on purpose: it runs on every page load, costs nothing, and
 * reaches no third party. Throttling it would break the UI for the honest
 * case while saving nothing worth saving.
 */
export async function GET() {
  return NextResponse.json({ available: new ClaudeExtractor().isAvailable() });
}
