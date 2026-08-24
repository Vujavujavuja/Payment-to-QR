"""Decoding an IPS QR payload back into a payment."""

from __future__ import annotations

from .constants import IPS_IDENTIFICATION_CODE, IPS_TAG_SEPARATOR
from .format import normalize_amount
from .types import IpsPayment


def parse_payload(payload: str) -> IpsPayment | None:
    """Decode an IPS QR payload back into a payment.

    Useful for round-trip tests and for letting a user paste a payload someone
    else generated, then edit it. Unknown tags are ignored rather than treated
    as errors so payloads from newer spec revisions still decode usefully.

    Returns None when the string is not an IPS payload at all.
    """
    trimmed = (payload or "").strip()
    if not trimmed:
        return None

    tags: dict[str, str] = {}
    for part in trimmed.split(IPS_TAG_SEPARATOR):
        separator = part.find(":")
        if separator <= 0:
            continue
        tags[part[:separator].strip().upper()] = part[separator + 1 :]

    if tags.get("K") != IPS_IDENTIFICATION_CODE:
        return None

    # RO packs the 2-digit model and the reference into one value. A value
    # shorter than 3 characters cannot hold both, so it is treated as absent
    # rather than sliced into a garbage model.
    raw_reference = tags.get("RO", "")
    if len(raw_reference) >= 3:
        reference_model, reference_number = raw_reference[:2], raw_reference[2:]
    else:
        reference_model, reference_number = "", ""

    return IpsPayment(
        recipient_account=tags.get("R", ""),
        recipient_name=tags.get("N", ""),
        amount=normalize_amount(tags.get("I", "")) or "",
        payer_name=tags.get("P", ""),
        payment_code=tags.get("SF", ""),
        purpose=tags.get("S", ""),
        reference_model=reference_model,
        reference_number=reference_number,
    )
