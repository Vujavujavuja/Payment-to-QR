"""Tools that pull payment fields out of a document.

These return *candidates*. The heuristics underneath are best-effort by
design, so every result says which fields to distrust and which are missing
outright, and none of it is meant to reach a QR code without a person
confirming it first.
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import Field

from ..extract import ExtractionResult, extract_payment_from_text
from .app import app
from .payments import REQUIRED_FIELDS, account_display, payment_to_dict
from .tools import READ_ONLY

#: Below this the extractor was guessing. Same threshold as the web app.
REVIEW_THRESHOLD = 0.7


def extraction_to_dict(result: ExtractionResult) -> dict[str, Any]:
    """Shape an extraction for an assistant: what was found, and how far to trust it."""
    fields = payment_to_dict(result.payment)
    out: dict[str, Any] = {
        "fields": fields,
        "confidence": {name: result.confidence[name] for name in result.found},
        "needs_review": [
            name for name in result.found if result.confidence.get(name, 0.0) < REVIEW_THRESHOLD
        ],
        "missing_required": [name for name in REQUIRED_FIELDS if name not in fields],
        "notes": list(result.notes),
        "next_step": (
            "Show these fields to the user and confirm each one against the document "
            "before generating a code. Ask for anything under missing_required; "
            "do not fill it in yourself."
        ),
    }
    if "recipient_account" in fields:
        out["account_display"] = account_display(fields["recipient_account"])
    return out


@app.tool(title="Extract payment fields from text", annotations=READ_ONLY)
def extract_payment_from_text_content(
    text: Annotated[
        str,
        Field(
            description=(
                "The document's text, with its original line breaks. Serbian Cyrillic "
                "and Latin are both handled."
            )
        ),
    ],
) -> dict[str, Any]:
    """Find payment fields in the text of a slip, invoice, fine or summons.

    Returns candidates with a confidence each, never a finished payment. A
    field the document does not state is reported as missing rather than
    guessed: in particular, expect payment_code to be missing on most invoices
    and official documents.
    """
    return extraction_to_dict(extract_payment_from_text(text, provider="mcp-text"))
