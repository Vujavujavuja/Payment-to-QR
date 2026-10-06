# ips-qr (Python)

A Python port of the TypeScript `packages/ips-qr` library, plus a text/PDF extractor
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

## Use it from Claude Code (MCP)

The package includes a [Model Context Protocol](https://modelcontextprotocol.io)
server, so an assistant can validate a payment, encode it and draw the QR code
on your machine. It runs over stdio as a local process: no port, no account,
and a PDF you point it at is read from disk rather than uploaded.

**In this repository there is nothing to set up.** `.mcp.json` at the root
registers the server; open the folder in Claude Code, approve it once, and ask:

> Make an IPS QR code for ~/Downloads/racun.pdf

or run the bundled prompt, `/mcp__payment-to-qr__pay_document`.

It needs [uv](https://docs.astral.sh/uv/), which builds an isolated
environment on first launch. Without uv, install the extra and point your
client at the script instead:

```bash
pip install -e ".[mcp]"
claude mcp add payment-to-qr -- ips-qr-mcp
```

### Tools

| Tool | |
| --- | --- |
| `normalize_account_number` | Expand an account to 18 digits and check its control digits |
| `validate_payment` | Errors and warnings, nothing produced |
| `encode_payment` | The IPS payload string |
| `parse_payload` | A payload back into fields, validated |
| `list_payment_codes` | Common codes to offer when a document states none |
| `extract_payment_from_text_content` | Candidate fields from text, with confidence |
| `extract_payment_from_pdf` | The same, from a local PDF with a text layer |
| `generate_qr` | The QR code as an inline PNG |
| `save_qr` | The QR code as a `.png` or `.svg` file |

Plus a resource, `ips-qr://format`, and the `pay_document` prompt.

### What it will not do

The same things the web app will not, enforced in the tools rather than left
to the assistant's judgement:

- **Encode an invalid payment.** `encode_payment`, `generate_qr` and `save_qr`
  share one validate-then-encode path and refuse, listing every error.
- **Invent a field.** Extraction reports `missing_required` instead of filling
  gaps, and the payment code is usually among them.
- **Write where it was not asked.** `save_qr` is the only tool that touches the
  disk. It takes `.png` or `.svg` only, creates no directories, and leaves an
  existing file alone unless `overwrite` is set. Every other tool is annotated
  read-only, so you can allow those and still be asked about this one.
- **Move money.** There is no bank connection. Your banking app makes the
  payment after you confirm it there.

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

Writing this port is what surfaced three defects in the TypeScript core and
`src/extract`: `RO` sliced blindly, raw text sliced with folded offsets, and
labels matched in dictionary order with no priority and no validity check.

All three are now fixed on both sides, and the suites mirror each other
deliberately — `tests/fixtures/prekrsajni_poziv.txt` and
`src/extract/__fixtures__/prekrsajni-poziv.txt` are the same document, so a
change to one implementation that is not made to the other shows up as a
failing test rather than as silent drift.
