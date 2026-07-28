import Anthropic from '@anthropic-ai/sdk';
import { IPS_FIELD_LIMITS } from '@/core/constants';
import { digitsOnly, normalizeAccount, normalizeAmount, sanitizeText } from '@/core/format';
import { isValidAccountChecksum } from '@/core/validate';
import { ExtractionError, type ExtractionInput, type ExtractionResult, type Extractor, type FieldConfidence } from '../types';

export const CLAUDE_PROVIDER_ID = 'claude';

const DEFAULT_MODEL = 'claude-opus-5';

/** Media types the vision API accepts. */
const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

const NULLABLE_STRING = { type: ['string', 'null'] } as const;

/**
 * Every field is required-but-nullable rather than optional.
 *
 * Strict JSON schema needs `required` to list every key, and forcing an
 * explicit null makes "the model looked and it is not there" distinguishable
 * from "the model forgot to answer".
 */
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    recipientAccount: NULLABLE_STRING,
    recipientName: NULLABLE_STRING,
    amount: NULLABLE_STRING,
    payerName: NULLABLE_STRING,
    paymentCode: NULLABLE_STRING,
    purpose: NULLABLE_STRING,
    referenceModel: NULLABLE_STRING,
    referenceNumber: NULLABLE_STRING,
    fieldConfidence: {
      type: 'object',
      properties: {
        recipientAccount: { type: 'number' },
        recipientName: { type: 'number' },
        amount: { type: 'number' },
        payerName: { type: 'number' },
        paymentCode: { type: 'number' },
        purpose: { type: 'number' },
        referenceModel: { type: 'number' },
        referenceNumber: { type: 'number' },
      },
      required: [
        'recipientAccount',
        'recipientName',
        'amount',
        'payerName',
        'paymentCode',
        'purpose',
        'referenceModel',
        'referenceNumber',
      ],
      additionalProperties: false,
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'recipientAccount',
    'recipientName',
    'amount',
    'payerName',
    'paymentCode',
    'purpose',
    'referenceModel',
    'referenceNumber',
    'fieldConfidence',
    'notes',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You read Serbian payment documents and extract the fields needed for an NBS IPS QR code.

Input is a photo or screenshot of anything a payment can be derived from: a printed uplatnica, an invoice, a utility bill, a bank statement line, or a screenshot of a message.

Rules:
- Report only what is visible. If a field is not present, return null for it. Never infer, complete, or invent an account number, reference, or amount.
- recipientAccount: the account being paid INTO (racun primaoca / рачун примаоца), not the payer's account. Keep the printed hyphenation.
- amount: digits only with a decimal point, e.g. "3450.00". Serbian slips use "." for thousands and "," for decimals — resolve that before answering.
- paymentCode: the 3-digit sifra placanja. Do not guess a default.
- referenceModel: the 2-digit model. referenceNumber: the poziv na broj without the model.
- purpose: max ${IPS_FIELD_LIMITS.purpose} characters, trimmed to the essential description.
- fieldConfidence: 0 to 1 per field, reflecting how legible the source actually was. Use a low value when you had to squint; the user reviews low-confidence fields.
- notes: short observations that would help the user, such as an unreadable region or two candidate accounts on the page.

Transcribe digits exactly. A single wrong digit sends money to the wrong account.`;

function isSupportedMediaType(value: string): value is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(value);
}

function clampConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : undefined;
}

interface ClaudeExtraction {
  recipientAccount: string | null;
  recipientName: string | null;
  amount: string | null;
  payerName: string | null;
  paymentCode: string | null;
  purpose: string | null;
  referenceModel: string | null;
  referenceNumber: string | null;
  fieldConfidence: Record<string, number>;
  notes: string[];
}

/**
 * Claude vision extractor. Opt-in: requires ANTHROPIC_API_KEY on the server.
 *
 * Handles the cases OCR cannot — a photo at an angle, a handwritten slip, a
 * screenshot of a chat message. Costs an API call and sends the image to
 * Anthropic, which is why it is not the default.
 */
export class ClaudeExtractor implements Extractor {
  readonly id = CLAUDE_PROVIDER_ID;
  readonly label = 'Claude vision';

  constructor(
    private readonly apiKey: string | undefined = process.env.ANTHROPIC_API_KEY,
    private readonly model: string = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async extract(input: ExtractionInput, signal?: AbortSignal): Promise<ExtractionResult> {
    if (!this.apiKey) {
      throw new ExtractionError('ANTHROPIC_API_KEY is not configured.', this.id);
    }
    if (!isSupportedMediaType(input.mimeType)) {
      throw new ExtractionError(
        `Unsupported image type "${input.mimeType}". Use JPEG, PNG, GIF or WebP.`,
        this.id,
      );
    }

    const client = new Anthropic({ apiKey: this.apiKey });

    let response;
    try {
      response = await client.messages.create(
        {
          model: this.model,
          // Thinking is on by default on Opus 5 and counts against max_tokens,
          // so this is sized well above the JSON payload it has to emit.
          max_tokens: 4096,
          // Transcription accuracy matters more than depth of reasoning here.
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: input.mimeType,
                    data: Buffer.from(input.data).toString('base64'),
                  },
                },
                { type: 'text', text: 'Extract the IPS payment fields from this image.' },
              ],
            },
          ],
        },
        { signal },
      );
    } catch (error) {
      throw new ExtractionError('The Claude API request failed.', this.id, error);
    }

    // Check stop_reason before touching content: on a refusal the content array
    // is empty or partial, and indexing into it would throw an opaque error.
    if (response.stop_reason === 'refusal') {
      throw new ExtractionError(
        'Claude declined to process this image. Try the on-device OCR extractor instead.',
        this.id,
      );
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new ExtractionError('Claude returned no text content.', this.id);
    }

    let parsed: ClaudeExtraction;
    try {
      parsed = JSON.parse(text) as ClaudeExtraction;
    } catch (error) {
      throw new ExtractionError('Claude returned malformed JSON.', this.id, error);
    }

    return this.toResult(parsed);
  }

  /**
   * Map the model's answer onto a payment.
   *
   * Values go through the same normalizers as OCR output rather than being
   * trusted as-is: the model returns what it read, and turning that into the
   * canonical forms is core's job, not the prompt's.
   */
  private toResult(parsed: ClaudeExtraction): ExtractionResult {
    const payment: ExtractionResult['payment'] = {};
    const confidence: FieldConfidence = {};
    const notes = Array.isArray(parsed.notes) ? [...parsed.notes] : [];

    const carry = (field: keyof FieldConfidence, value: string | null | undefined) => {
      if (value === null || value === undefined || value === '') return false;
      const score = clampConfidence(parsed.fieldConfidence?.[field]);
      if (score !== undefined) confidence[field] = score;
      return true;
    };

    if (carry('recipientAccount', parsed.recipientAccount)) {
      const normalized = normalizeAccount(parsed.recipientAccount!);
      payment.recipientAccount = normalized ?? digitsOnly(parsed.recipientAccount!);
      if (normalized && !isValidAccountChecksum(normalized)) {
        notes.push('The transcribed account fails its control-digit check — verify it against the slip.');
        confidence.recipientAccount = Math.min(confidence.recipientAccount ?? 0.5, 0.3);
      }
    }

    if (carry('amount', parsed.amount)) {
      payment.amount = normalizeAmount(parsed.amount!) ?? '';
    }

    if (carry('recipientName', parsed.recipientName)) {
      payment.recipientName = sanitizeText(parsed.recipientName!, IPS_FIELD_LIMITS.recipientName);
    }

    if (carry('payerName', parsed.payerName)) {
      payment.payerName = sanitizeText(parsed.payerName!, IPS_FIELD_LIMITS.payerName);
    }

    if (carry('purpose', parsed.purpose)) {
      payment.purpose = sanitizeText(parsed.purpose!, IPS_FIELD_LIMITS.purpose);
    }

    if (carry('paymentCode', parsed.paymentCode)) {
      const code = digitsOnly(parsed.paymentCode!).slice(0, 3);
      if (code.length === 3) payment.paymentCode = code;
    }

    if (carry('referenceModel', parsed.referenceModel)) {
      const model = digitsOnly(parsed.referenceModel!).slice(0, 2);
      if (model.length === 2) payment.referenceModel = model;
    }

    if (carry('referenceNumber', parsed.referenceNumber)) {
      payment.referenceNumber = sanitizeText(parsed.referenceNumber!, IPS_FIELD_LIMITS.referenceNumber);
    }

    return { payment, confidence, provider: this.id, notes };
  }
}
