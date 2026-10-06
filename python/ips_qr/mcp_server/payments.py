"""Shared shapes: tool parameters in, plain dictionaries out.

Every payment-taking tool accepts the same eight fields. They are declared
once here, with the descriptions a client shows the model, so the tools cannot
drift into describing the same field three different ways.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated, Any

from pydantic import Field

from ..format import format_account, normalize_account
from ..types import IpsPayment, ValidationResult

RecipientAccount = Annotated[
    str,
    Field(
        description=(
            "Recipient account as printed, e.g. '265-1234567890-98' or 18 digits. "
            "Short middle segments are padded automatically. Never guess or complete it."
        )
    ),
]
RecipientName = Annotated[str, Field(description="Who is being paid. Max 70 characters.")]
Amount = Annotated[
    str,
    Field(
        description=(
            "Amount in RSD. Serbian ('3.450,00') and English ('3,450.00') separators "
            "are both understood."
        )
    ),
]
PaymentCode = Annotated[
    str,
    Field(
        description=(
            "Sifra placanja, exactly 3 digits (e.g. 189, 221, 253). Often not printed "
            "on the document: ask the user rather than assuming one."
        )
    ),
]
PayerName = Annotated[str, Field(description="Optional. Who is paying. Max 70 characters.")]
Purpose = Annotated[str, Field(description="Optional. Svrha placanja. Max 35 characters.")]
ReferenceModel = Annotated[
    str, Field(description="Optional. Model poziva na broj, 2 digits, e.g. '97'.")
]
ReferenceNumber = Annotated[
    str, Field(description="Optional. Poziv na broj, without the model. Max 22 characters.")
]

#: Fields a payment cannot be encoded without.
REQUIRED_FIELDS = ("recipient_account", "recipient_name", "amount", "payment_code")


def build_payment(
    recipient_account: str,
    recipient_name: str,
    amount: str,
    payment_code: str,
    payer_name: str = "",
    purpose: str = "",
    reference_model: str = "",
    reference_number: str = "",
) -> IpsPayment:
    """Assemble tool arguments into the library's payment type, untouched.

    No normalising here: validation has to see what the caller actually sent,
    or it would be checking a tidied copy rather than the input.
    """
    return IpsPayment(
        recipient_account=recipient_account,
        recipient_name=recipient_name,
        amount=amount,
        payment_code=payment_code,
        payer_name=payer_name,
        purpose=purpose,
        reference_model=reference_model,
        reference_number=reference_number,
    )


def payment_to_dict(payment: IpsPayment) -> dict[str, str]:
    """A payment as a dictionary, leaving out fields that are empty."""
    return {name: value for name, value in asdict(payment).items() if value}


def validation_to_dict(result: ValidationResult) -> dict[str, Any]:
    """A validation result with errors and warnings kept apart.

    They mean different things to a caller: an error blocks the QR code, a
    warning is something to raise with the user and then proceed.
    """
    return {
        "valid": result.valid,
        "errors": [{"field": i.field, "message": i.message} for i in result.errors],
        "warnings": [{"field": i.field, "message": i.message} for i in result.warnings],
    }


def account_display(account: str) -> str:
    """The account in the hyphenated form a person can compare to a slip."""
    normalized = normalize_account(account)
    return format_account(normalized) if normalized else account
