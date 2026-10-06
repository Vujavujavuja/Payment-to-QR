"""Tools that turn a confirmed payment into an actual QR code."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

from mcp.server.mcpserver import Image
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from ..qr import render_payload_to_png_bytes, render_payload_to_svg
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


#: The one tool that changes anything. Not read-only, and honest that it can
#: replace a file, so a client asks before running it.
WRITES_A_FILE = ToolAnnotations(
    read_only_hint=False, destructive_hint=True, idempotent_hint=True, open_world_hint=False
)

_FORMATS = (".png", ".svg")


@app.tool(title="Save an IPS QR code to a file", annotations=WRITES_A_FILE)
def save_qr(
    path: Annotated[
        str,
        Field(description="Where to write it. Must end in .png or .svg. '~' is expanded."),
    ],
    recipient_account: RecipientAccount,
    recipient_name: RecipientName,
    amount: Amount,
    payment_code: PaymentCode,
    payer_name: PayerName = "",
    purpose: Purpose = "",
    reference_model: ReferenceModel = "",
    reference_number: ReferenceNumber = "",
    overwrite: Annotated[
        bool, Field(description="Replace the file if it already exists. Off by default.")
    ] = False,
) -> dict[str, Any]:
    """Write a confirmed payment's QR code to a PNG or SVG file on this machine.

    Only call this after the user has confirmed every field and asked for a
    file. Refuses a payment that fails validation, refuses to replace an
    existing file unless overwrite is set, and never creates directories.
    """
    target = Path(path).expanduser()
    if target.suffix.lower() not in _FORMATS:
        raise ToolError(f"Unsupported file type '{target.suffix}'. Use .png or .svg.")
    if not target.parent.is_dir():
        raise ToolError(f"The folder does not exist: {target.parent}")
    if target.exists() and not overwrite:
        raise ToolError(f"{target} already exists. Pass overwrite=true to replace it.")

    # Validate before touching the disk, so a refused payment leaves no file.
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

    if target.suffix.lower() == ".svg":
        target.write_text(render_payload_to_svg(payload), encoding="utf-8")
    else:
        target.write_bytes(render_payload_to_png_bytes(payload))

    return {
        "saved": str(target.resolve()),
        "payload": payload,
        "account_display": account_display(recipient_account),
        "warnings": validation["warnings"],
        "reminder": BEFORE_PAYING,
    }
