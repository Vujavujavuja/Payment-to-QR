# ips-qr (Python)

A Python port of the TypeScript `src/core` library, plus a text/PDF extractor
and a CLI. Same IPS QR spec, same validation rules, same refusal to render a
code for a payment that does not validate.

The core is dependency-free. Only QR rendering needs a third-party package,
and it is imported lazily so the rest works without it.

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

`pdftotext` (poppler) is used for PDF input. On macOS: `brew install poppler`.
Without it the library still works on text you supply yourself.

## Use it as a library

```python
from ips_qr import IpsPayment, encode_payment, validate_payment

payment = IpsPayment(
    recipient_account="265-1234567890-98",  # padded and checksummed for you
    recipient_name="Elektrodistribucija Beograd",
    amount="3450,00",                        # Serbian or English separators
    payment_code="189",
)

result = validate_payment(payment)
if result.valid:
    print(encode_payment(payment).payload)
else:
    for issue in result.errors:
        print(issue.field, issue.message)
```

`validate_payment` separates **errors** (the payload would be wrong or
unusable) from **warnings** (suspicious but still encodable — you may know
something the library does not).

## Use it from the command line

```bash
ips-qr --pdf racun.pdf --payment-code 253 --png qr.png
```

Extraction prints what it found, with a confidence per field, and flags
anything below 0.7 for review. Explicit flags always override what was
extracted. If the result does not validate, no QR is written.

Other sources: `--text file.txt`, `--stdin`, or `--payload 'K:PR|V:01|...'`
to start from an existing code.

## What extraction will and will not do

It reports only what it can see. It does not infer a payment code, complete a
partial account, or convert a legal rule into a number — a traffic fine that
says "pay half within 8 days" still extracts as the full amount, because the
halving is a rule about the document, not a value in it.

Confidence scores are honest: 0.95 means the account passed its control-digit
check, 0.35 means it was the largest number on the page. Anything under 0.7 is
meant to be looked at.

## Tests

```bash
pytest -q
```

71 tests. Beyond the ported core suite they cover the parts that actually
break in the field:

- **Script folding offsets.** `Џ` folds to `dz`, so a folded string is longer
  than its source and folded indices are not raw indices.
- **Label priority.** `korisnik` means "payee" on a bank slip and "driver" on
  a police summons; `u korist` is tried first for that reason.
- **False friends.** "marke X model Y" is a car, not a reference model.
- **Dates as amounts.** `30.04.2027` parses to a very confident 30042027.00
  unless dates are excluded.
- **Round trip through a real image.** Payloads are rendered to PNG and read
  back with OpenCV — an independent decoder, so the test is not grading its
  own homework.

The fixture is a redacted summons: the payment paragraph keeps its exact
wording and line wrapping, everything identifying is a placeholder.

## Relationship to the TypeScript library

Writing this port is what surfaced three defects in `src/core` and
`src/extract`: `RO` sliced blindly, raw text sliced with folded offsets, and
labels matched in dictionary order with no priority and no validity check.

All three are now fixed on both sides, and the suites mirror each other
deliberately — `tests/fixtures/prekrsajni_poziv.txt` and
`src/extract/__fixtures__/prekrsajni-poziv.txt` are the same document, so a
change to one implementation that is not made to the other shows up as a
failing test rather than as silent drift.
