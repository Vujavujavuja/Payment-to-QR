"""Reference material a client can read without calling a tool."""

from __future__ import annotations

from ..constants import (
    IPS_CHARACTER_SET,
    IPS_FIELD_LIMITS,
    IPS_IDENTIFICATION_CODE,
    IPS_MAX_PAYLOAD_LENGTH,
    IPS_TAG_ORDER,
    IPS_VERSION,
)
from .app import app

#: tag -> (meaning, required, limit). Limits come from the library's own
#: constants, so this page cannot describe a rule the validator does not apply.
_TAGS = {
    "K": (f"Identification code, always {IPS_IDENTIFICATION_CODE}", True, 2),
    "V": (f"Version, always {IPS_VERSION}", True, 2),
    "C": (f"Character set, {IPS_CHARACTER_SET} for UTF-8", True, 1),
    "R": ("Recipient account, 18 digits", True, IPS_FIELD_LIMITS["recipient_account"]),
    "N": ("Recipient name", True, IPS_FIELD_LIMITS["recipient_name"]),
    "I": ("Amount, e.g. RSD3450,00", True, IPS_FIELD_LIMITS["amount"]),
    "P": ("Payer name", False, IPS_FIELD_LIMITS["payer_name"]),
    "SF": ("Payment code, 3 digits", True, IPS_FIELD_LIMITS["payment_code"]),
    "S": ("Purpose of payment", False, IPS_FIELD_LIMITS["purpose"]),
    "RO": (
        "2-digit model + reference number",
        False,
        2 + IPS_FIELD_LIMITS["reference_number"],
    ),
}


def render_format_reference() -> str:
    rows = "\n".join(
        f"| `{tag}` | {_TAGS[tag][0]} | {'yes' if _TAGS[tag][1] else 'no'} | {_TAGS[tag][2]} |"
        for tag in IPS_TAG_ORDER
    )
    return f"""# NBS IPS QR payload format

An IPS QR code carries one flat string of `TAG:value` pairs separated by `|`,
in a fixed order:

```
K:PR|V:01|C:1|R:265000123456789098|N:Elektrodistribucija Beograd|I:RSD3450,00|SF:189
```

| Tag | Field | Required | Max length |
| --- | --- | --- | --- |
{rows}

Optional tags are left out entirely rather than written empty. The whole
payload should stay within {IPS_MAX_PAYLOAD_LENGTH} characters.

## Easy to get wrong

- **Account padding.** A slip prints `265-1234567890-98`. The middle segment
  is padded on the left to 13 digits; removing the hyphens is not enough.
- **Control digits.** The last two digits of the account satisfy mod 97-10.
  A failure almost always means a misread digit.
- **Decimal separator.** The payload uses a comma: `RSD3450,00`.
- **Payment code.** Usually not printed on invoices or official documents.
  It has to come from the person paying.
"""


@app.resource(
    "ips-qr://format",
    name="ips-qr-format",
    title="IPS QR payload format",
    description="The tags of an NBS IPS QR payload, their limits, and the common mistakes.",
    mime_type="text/markdown",
)
def format_reference() -> str:
    return render_format_reference()
