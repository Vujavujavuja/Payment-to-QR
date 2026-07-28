# open-nbs-ips-qr

Open source **NBS IPS QR** code generator. Photograph a payment slip — or a bill, an invoice, a screenshot someone sent you — and get a scannable IPS QR code you can pay from any Serbian banking app.

> Unofficial project. Not affiliated with or endorsed by the National Bank of Serbia. Always confirm the amount and recipient account in your banking app before paying.

---

## How it works

```
image ──▶ extractor ──▶ editable form ──▶ validation ──▶ QR code
          (OCR or         (you check      (mod 97-10,
           Claude)         the fields)     field limits)
```

The middle step is not skippable by design. Extraction is a best effort: OCR misreads digits and vision models can transcribe a `7` as a `1`. Every field the extractor was unsure about is flagged for review, and **no QR is rendered until the payment passes validation** — including the account's mod 97-10 control digits.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No configuration, no API key. OCR runs in your browser and the image never leaves your device.

### Optional: Claude vision extraction

On-device OCR struggles with angled photos, handwriting, and low light. To enable a more capable extractor:

```bash
cp .env.example .env
# add your key to ANTHROPIC_API_KEY
```

The option only appears in the UI once the server confirms a key is configured. Note the tradeoff: this **sends the image to Anthropic**, and a payment slip usually carries a name, an address, and an account number. It is opt-in for that reason, and the key stays server-side — it is never shipped to the browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm test` | Core library test suite |
| `npm run typecheck` | `tsc --noEmit` |

## The payload format

An IPS QR code is a flat, pipe-separated string:

```
K:PR|V:01|C:1|R:265000123456789098|N:Elektrodistribucija Beograd|I:RSD3450,00|SF:189|S:Racun za struju|RO:97921234567890
```

| Tag | Field | Required | Max |
| --- | --- | --- | --- |
| `K` | Identification code — always `PR` | yes | 2 |
| `V` | Version — always `01` | yes | 2 |
| `C` | Character set — `1` for UTF-8 | yes | 1 |
| `R` | Recipient account, 18 digits | yes | 18 |
| `N` | Recipient name | yes | 70 |
| `I` | Amount, e.g. `RSD3450,00` | yes | 20 |
| `P` | Payer name | no | 70 |
| `SF` | Payment code, 3 digits | yes | 3 |
| `S` | Purpose of payment | no | 35 |
| `RO` | 2-digit model + reference number | no | 2 + 22 |

Optional tags are omitted entirely rather than emitted empty.

### Things that are easy to get wrong

- **Account padding.** Slips print `265-1234567890-98`. The middle segment is 10 digits and must be left-padded to 13 — stripping the hyphens gives you 16 characters, and padding the wrong end gives you a *different, valid-looking* account.
- **Decimal separators.** `1.234,56` (Serbian) and `1,234.56` (English) both appear, sometimes in one document. The library disambiguates by separator position rather than assuming a locale.
- **Control digits.** An 18-digit account exceeds `Number.MAX_SAFE_INTEGER`, so the mod 97-10 check must use `BigInt`. Done in floating point, it silently accepts invalid accounts.

## Using the core library on its own

`src/core` is framework-agnostic — no React, no DOM outside `qr.ts` — so it can back a CLI or a bot:

```ts
import { encodePayment, validatePayment } from '@/core';

const payment = {
  recipientAccount: '265-1234567890-98', // padded and checksummed for you
  recipientName: 'Elektrodistribucija Beograd',
  amount: '3450.00',
  paymentCode: '189',
};

const { valid, issues } = validatePayment(payment);
if (valid) console.log(encodePayment(payment).payload);
```

`validatePayment` separates **errors** (the payload would be wrong or unusable) from **warnings** (suspicious but still encodable — you may know something the library doesn't).

## Project layout

```
src/
  core/        IPS spec: types, validation, encode, parse, QR rendering
  extract/     Provider interface + Tesseract and Claude implementations
    providers/
  app/         Next.js App Router pages and the /api/extract route
  components/  Dropzone, form, QR preview
```

## Adding an extractor

Implement `Extractor` from `src/extract/types.ts` and register it in `src/extract/index.ts`. Two rules:

1. **Only report what you found.** Leave a field out rather than guessing at it — a fabricated field is worse than a blank one, because the user won't think to check it.
2. **Score your confidence honestly.** Anything below `0.7` is flagged in the UI for review. A flat `1.0` defeats the safety net.

## Contributing

Issues and pull requests welcome. Please keep `npm test` and `npm run typecheck` green; both run in CI.

Especially useful: sample slips that extract badly. Real-world layouts vary far more than any test fixture, and a failing example is the fastest way to improve the heuristics.

## Known limitations

- OCR accuracy on photographed slips is mediocre. This is why the form exists.
- Model 97 reference validation is warning-only, and abstains on non-numeric references — some issuers use letters.
- Generated codes are not verified against the official NBS validator as part of CI.

## License

MIT — see [LICENSE](LICENSE).
