"""Tools that turn a confirmed payment into an actual QR code."""

from __future__ import annotations

import json
from typing import Any

from mcp.server.mcpserver import Image

from ..qr import render_payload_to_png_bytes
from .app import app
from .payments import (
    Amount,
    PayerName,
    PaymentCode,
    Purpose,
    RecipientAccount,
    RecipientName,
    ReferenceModel,
    ReferenceNumber,
    account_display,
    build_payment,
)
from .tools import READ_ONLY, _encode_or_refuse

#: Said alongside every code. The assistant relays tool output, so this is how
#: the reminder reaches the person about to pay.
BEFORE_PAYING = (
    "Before paying, check the recipient account and amount shown in your banking "
    "app against the original document. This code only fills the form in for you."
)


@app.tool(title="Generate an IPS QR code", annotations=READ_ONLY, structured_output=False)
def generate_qr(
    recipient_account: RecipientAccount,
    recipient_name: RecipientName,
    amount: Amount,
    payment_code: PaymentCode,
    payer_name: PayerName = "",
    purpose: Purpose = "",
    reference_model: ReferenceModel = "",
    reference_number: ReferenceNumber = "",
) -> list[Any]:
    """Render a confirmed payment as a scannable IPS QR code (PNG image).

    Only call this after the user has confirmed every field. Refuses a payment
    that fails validation. Nothing is written to disk; use save_qr for a file.
    """
    payment = build_payment(
        recipient_account,
        recipient_name,
        amount,
        payment_code,
        payer_name,
        purpose,
        reference_model,
        reference_number,
    )
    payload, validation = _encode_or_refuse(payment)
    summary = {
        "payload": payload,
        "account_display": account_display(recipient_account),
        "warnings": validation["warnings"],
        "reminder": BEFORE_PAYING,
    }
    return [
        json.dumps(summary, ensure_ascii=False),
        Image(data=render_payload_to_png_bytes(payload), format="png"),
    ]
