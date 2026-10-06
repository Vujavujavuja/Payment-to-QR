"""A prompt the user can invoke to run the whole flow correctly."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field

from .app import app


@app.prompt(
    name="pay_document",
    title="Turn a document into an IPS QR code",
    description="Walks a slip, invoice or fine through extraction, review and QR generation.",
)
def pay_document(
    document: Annotated[
        str,
        Field(description="A path to a PDF, or the pasted text of the document."),
    ],
) -> str:
    """The review-first workflow, written out as steps."""
    return f"""\
Help me pay this document with an NBS IPS QR code:

{document}

Work through it in this order, and do not skip the confirmation.

1. Get the payment fields. If that is a path to a PDF, call
   extract_payment_from_pdf. If it is text, call
   extract_payment_from_text_content. If neither finds much, read the document
   yourself.
2. Run normalize_account_number on the recipient account. If its control
   digits do not verify, stop and tell me: a digit has been misread.
3. Show me every field in a table, marking anything under needs_review, and
   ask me to confirm them against the document.
4. Ask me for anything under missing_required. The payment code is usually
   not printed; offer me list_payment_codes rather than choosing one.
5. If the document states a rule about the amount, such as a reduced sum for
   paying early, point it out and let me choose the amount.
6. Only once I have confirmed, call generate_qr and show me the code.

Never fill in a field I have not confirmed, and remind me to check the account
and amount in my banking app before I pay.
"""
