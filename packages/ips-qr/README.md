# ips-qr

NBS IPS QR payload encoding, validation and parsing — the QR standard the
National Bank of Serbia defines for instant payments.

The main entry has **no dependencies**. QR *rendering* is a separate entry
point behind an optional peer, so validating an account number costs you
nothing you did not ask for.

```bash
npm install ips-qr
```

> Not published to npm yet. Until then: `npm install github:Vujavujavuja/Payment-to-QR#main --workspace ips-qr`, or vendor `packages/ips-qr`. See the tracking issue for the publishing decision.

## Use

```ts
import { encodePayment, validatePayment, normalizeAccount } from 'ips-qr';

const payment = {
  recipientAccount: '265-1234567890-98', // padded and checksummed for you
  recipientName: 'Elektrodistribucija Beograd',
  amount: '3450,00',                     // Serbian or English separators
  paymentCode: '189',
};

const { valid, issues } = validatePayment(payment);
if (valid) {
  console.log(encodePayment(payment).payload);
  // K:PR|V:01|C:1|R:265000123456789098|N:Elektrodistribucija Beograd|I:RSD3450,00|SF:189
}
```

`validatePayment` separates **errors** — the payload would be wrong or unusable
— from **warnings**, which are suspicious but still encodable, because the
caller may know something the library does not.

### Rendering a code

```bash
npm install ips-qr qrcode
```

```ts
import { encodePayment } from 'ips-qr';
import { renderPayloadToDataUrl, renderPayloadToSvg } from 'ips-qr/qr';

const { payload } = encodePayment(payment);
const svg = await renderPayloadToSvg(payload);
```

`qrcode` is an optional peer dependency. Import `ips-qr/qr` without it and the
import fails loudly, rather than the main entry quietly costing every consumer
a dependency they may never use.

## What it does

| | |
| --- | --- |
| `encodePayment` | payment → `K:PR\|V:01\|...` payload |
| `parsePayload` | payload → payment, for editing a code someone else made |
| `validatePayment` | errors and warnings, including mod 97-10 control digits |
| `normalizeAccount` | `265-1234567890-98` → `265000123456789098` |
| `normalizeAmount` | `1.234,56` and `1,234.56` → `1234.56` |
| `isValidModel97Reference` | checks a reference, abstains on non-numeric |

## Things it gets right that are easy to get wrong

- **Account padding.** The middle segment of `265-1234567890-98` is 10 digits
  and must be left-padded to 13. Stripping the hyphens gives 16 characters,
  and padding the wrong end gives a *different, valid-looking* account.
- **Separators.** `1.234,56` and `1,234.56` both occur, sometimes in one
  document. Disambiguated by separator position, not by assuming a locale.
- **Control digits.** An 18-digit account exceeds `Number.MAX_SAFE_INTEGER`,
  so the mod 97-10 check uses `BigInt`. In floating point it silently accepts
  invalid accounts.

## Notes

ESM only, Node 20+. There is a Python port of the same library in the same
repository, with a mirrored test suite, so the two cannot drift silently.

MIT. Unofficial — not affiliated with or endorsed by the National Bank of Serbia.
