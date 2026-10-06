"""Tools that pull payment fields out of a document.

These return *candidates*. The heuristics underneath are best-effort by
design, so every result says which fields to distrust and which are missing
outright, and none of it is meant to reach a QR code without a person
confirming it first.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from ..extract import ExtractionResult, PdfTextError, extract_payment_from_text, pdf_to_text
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


@app.tool(title="Extract payment fields from a PDF", annotations=READ_ONLY)
def extract_payment_from_pdf(
    path: Annotated[
        str,
        Field(description="Path to a PDF on this machine. '~' is expanded."),
    ],
) -> dict[str, Any]:
    """Read a local PDF and find the payment fields in it.

    Works on PDFs with a text layer. A scanned PDF has none, and comes back
    with nothing found: read that one yourself and pass what you see to
    validate_payment instead.

    The file is read locally and is not sent anywhere.
    """
    pdf = Path(path).expanduser()
    if pdf.suffix.lower() != ".pdf":
        raise ToolError(f"Not a PDF: {pdf.name}. This tool only reads .pdf files.")
    if not pdf.is_file():
        raise ToolError(f"No such file: {pdf}")
    try:
        text = pdf_to_text(str(pdf))
    except PdfTextError as exc:
        raise ToolError(str(exc)) from exc

    result = extraction_to_dict(extract_payment_from_text(text, provider="mcp-pdf"))
    result["source"] = str(pdf)
    if not text.strip():
        result["notes"].append(
            "The PDF has no text layer, so it is probably a scan. "
            "Nothing could be read from it by this tool."
        )
    return result
