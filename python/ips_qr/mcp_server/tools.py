"""The tools.

Each one is a thin wrapper over the library. The logic that decides whether an
account is real or a payment is valid lives in :mod:`ips_qr`, where it is
tested against the TypeScript implementation; nothing here re-implements it.
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from ..encode import encode_payment as encode
from ..format import format_account, normalize_account
from ..types import IpsPayment
from ..validate import is_valid_account_checksum
from ..validate import validate_payment as check_payment
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
    validation_to_dict,
)

#: For tools that only compute. Clients use this to decide what may run
#: without asking, and none of these touch the disk or the network.
READ_ONLY = ToolAnnotations(read_only_hint=True, idempotent_hint=True, open_world_hint=False)


class InvalidPaymentError(ToolError):
    """Raised instead of encoding a payment that fails validation.

    A ToolError on purpose. The SDK treats any other exception as a crash and
    tells the client only "Error executing tool", withholding the message; a
    ToolError is an anticipated failure whose text is delivered. The text here
    is the whole point: it lists every error so they can be fixed in one pass.
    """


def _encode_or_refuse(payment: IpsPayment) -> tuple[str, dict[str, Any]]:
    """Validate, then encode. Never the other way round.

    The library will happily encode an invalid payment into a structurally
    sound string; that is by design, so a half-filled form can be inspected.
    A tool handing a payload to an assistant has no such excuse, so the check
    is enforced here and cannot be skipped by calling a different tool.
    """
    validation = validation_to_dict(check_payment(payment))
    if not validation["valid"]:
        problems = "; ".join(f"{e['field']}: {e['message']}" for e in validation["errors"])
        raise InvalidPaymentError(
            f"Refusing to encode an invalid payment. Fix these and try again: {problems}"
        )
    return encode(payment).payload, validation


@app.tool(title="Normalize an account number", annotations=READ_ONLY)
def normalize_account_number(account: RecipientAccount) -> dict[str, Any]:
    """Expand a Serbian account number to its 18 digits and check its control digits.

    Use this the moment an account is read off a document: a failed checksum
    almost always means a misread digit, and it is far cheaper to catch here
    than after a QR code exists.
    """
    normalized = normalize_account(account)
    if normalized is None:
        return {
            "input": account,
            "recognised": False,
            "checksum_valid": False,
            "message": "Not an account number: it must resolve to 18 digits "
            "(3 bank + 13 account + 2 control), e.g. 265-1234567890-98.",
        }
    valid = is_valid_account_checksum(normalized)
    return {
        "input": account,
        "recognised": True,
        "normalized": normalized,
        "display": format_account(normalized),
        "checksum_valid": valid,
        "message": "Control digits verify."
        if valid
        else "Control digits do NOT verify. A digit was probably misread; "
        "re-check the account against the source before using it.",
    }


@app.tool(title="Validate a payment", annotations=READ_ONLY)
def validate_payment(
    recipient_account: RecipientAccount,
    recipient_name: RecipientName,
    amount: Amount,
    payment_code: PaymentCode,
    payer_name: PayerName = "",
    purpose: Purpose = "",
    reference_model: ReferenceModel = "",
    reference_number: ReferenceNumber = "",
) -> dict[str, Any]:
    """Check a payment against the IPS QR rules without producing anything.

    Errors mean a QR code cannot be generated. Warnings mean it can, but
    something looks wrong and the user should be told before they pay.
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
    result = validation_to_dict(check_payment(payment))
    result["account_display"] = account_display(recipient_account)
    return result


@app.tool(title="Encode a payment as an IPS payload", annotations=READ_ONLY)
def encode_payment(
    recipient_account: RecipientAccount,
    recipient_name: RecipientName,
    amount: Amount,
    payment_code: PaymentCode,
    payer_name: PayerName = "",
    purpose: Purpose = "",
    reference_model: ReferenceModel = "",
    reference_number: ReferenceNumber = "",
) -> dict[str, Any]:
    """Turn a confirmed payment into the IPS payload string a QR code carries.

    Refuses a payment that fails validation. Only call this after the user has
    confirmed the fields. Returns text only; use generate_qr for the image.
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
    return {
        "payload": payload,
        "account_display": account_display(recipient_account),
        "warnings": validation["warnings"],
    }
