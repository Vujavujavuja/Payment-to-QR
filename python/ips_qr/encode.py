"""Serialising a payment to the IPS QR payload string."""

from __future__ import annotations

from dataclasses import dataclass

from .constants import (
    IPS_CHARACTER_SET,
    IPS_FIELD_LIMITS,
    IPS_IDENTIFICATION_CODE,
    IPS_MAX_PAYLOAD_LENGTH,
    IPS_TAG_ORDER,
    IPS_TAG_SEPARATOR,
    IPS_VERSION,
)
from .format import (
    digits_only,
    format_amount_for_payload,
    normalize_account,
    sanitize_text,
)
from .types import IpsPayment


@dataclass(frozen=True, slots=True)
class EncodeResult:
    payload: str
    #: True when the payload exceeds the soft length ceiling.
    over_length: bool


def encode_payment(payment: IpsPayment) -> EncodeResult:
    """Serialise a payment to the IPS QR payload string.

    Optional tags are omitted entirely rather than emitted empty: a trailing
    ``S:|RO:`` is not the same thing as "no purpose given" to every scanner,
    and dropping them also buys back payload length.

    Fields are sanitized on the way out, so an unvalidated payment still
    yields a structurally sound payload. Correctness of the *values* is
    :func:`ips_qr.validate.validate_payment`'s job; this function's job is to
    never emit a malformed string.
    """
    tags: dict[str, str] = {
        "K": IPS_IDENTIFICATION_CODE,
        "V": IPS_VERSION,
        "C": IPS_CHARACTER_SET,
    }

    # Fall back to the raw digits when normalisation fails so a partially
    # filled form still produces something the user can inspect.
    account = normalize_account(payment.recipient_account) or digits_only(
        payment.recipient_account
    )
    tags["R"] = account

    tags["N"] = sanitize_text(payment.recipient_name, IPS_FIELD_LIMITS["recipient_name"])
    tags["I"] = format_amount_for_payload(payment.amount)

    payer = sanitize_text(payment.payer_name, IPS_FIELD_LIMITS["payer_name"])
    if payer:
        tags["P"] = payer

    tags["SF"] = digits_only(payment.payment_code)[: IPS_FIELD_LIMITS["payment_code"]]

    purpose = sanitize_text(payment.purpose, IPS_FIELD_LIMITS["purpose"])
    if purpose:
        tags["S"] = purpose

    # RO is a single value: the 2-digit model immediately followed by the
    # reference. A reference without a model is emitted under model 00.
    reference = sanitize_text(payment.reference_number, IPS_FIELD_LIMITS["reference_number"])
    if reference:
        model = (digits_only(payment.reference_model) or "00")[:2].rjust(2, "0")
        tags["RO"] = f"{model}{reference}"

    payload = IPS_TAG_SEPARATOR.join(
        f"{tag}:{tags[tag]}" for tag in IPS_TAG_ORDER if tag in tags
    )
    return EncodeResult(payload=payload, over_length=len(payload) > IPS_MAX_PAYLOAD_LENGTH)
