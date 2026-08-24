"""Checksums and payment validation."""

from __future__ import annotations

import re

from .constants import IPS_FIELD_LIMITS
from .format import (
    digits_only,
    format_amount_for_payload,
    normalize_account,
    normalize_amount,
)
from .types import IpsPayment, ValidationIssue, ValidationResult


def is_valid_account_checksum(account: str) -> bool:
    """ISO 7064 MOD 97-10, the same scheme IBAN uses.

    A valid 18-digit Serbian account satisfies ``value % 97 == 1``. Python's
    int is arbitrary precision, so the 53-bit trap that forces BigInt in the
    TypeScript original does not apply here.
    """
    digits = digits_only(account)
    if len(digits) != IPS_FIELD_LIMITS["recipient_account"]:
        return False
    return int(digits) % 97 == 1


def compute_account_control_digits(bank_and_account: str) -> str | None:
    """Derive the 2 control digits for a bank + account pair (3 + 13 digits)."""
    digits = digits_only(bank_and_account)
    if len(digits) != 16:
        return None
    return str(98 - (int(digits + "00") % 97)).zfill(2)


_NUMERIC_REFERENCE = re.compile(r"^\d{3,}$")


def is_valid_model97_reference(reference: str) -> bool | None:
    """Check the leading control digits of a model-97 reference number.

    Model 97 puts two control digits at the front; the rest, with separators
    removed, must satisfy MOD 97-10. Only digit references are checked — some
    issuers use letters, and abstaining beats rejecting something we cannot
    interpret. Returns None to mean "no opinion".
    """
    compact = re.sub(r"[\s-]", "", reference or "")
    if not _NUMERIC_REFERENCE.match(compact):
        return None
    control, body = compact[:2], compact[2:]
    expected = str(98 - (int(body + "00") % 97)).zfill(2)
    return expected == control


def _required(value: str | None) -> str:
    return (value or "").strip()


def validate_payment(payment: IpsPayment) -> ValidationResult:
    """Validate a payment before encoding.

    Errors mean the payload would be wrong or unusable. Warnings mean it is
    probably wrong but still encodable — the user may know something the
    library does not, so those never block generation.
    """
    issues: list[ValidationIssue] = []

    def error(field: str, message: str) -> None:
        issues.append(ValidationIssue(field, "error", message))

    def warn(field: str, message: str) -> None:
        issues.append(ValidationIssue(field, "warning", message))

    # --- recipient account ---
    account = _required(payment.recipient_account)
    if not account:
        error("recipient_account", "Recipient account is required.")
    else:
        normalized = normalize_account(account)
        if not normalized:
            error(
                "recipient_account",
                "Account must resolve to 18 digits (e.g. 265-1234567890-12).",
            )
        elif not is_valid_account_checksum(normalized):
            error(
                "recipient_account",
                "Account control digits are invalid — check for a misread digit.",
            )

    # --- recipient name ---
    recipient_name = _required(payment.recipient_name)
    if not recipient_name:
        error("recipient_name", "Recipient name is required.")
    elif len(recipient_name) > IPS_FIELD_LIMITS["recipient_name"]:
        error(
            "recipient_name",
            f"Recipient name exceeds {IPS_FIELD_LIMITS['recipient_name']} characters.",
        )

    # --- amount ---
    amount = _required(payment.amount)
    if not amount:
        error("amount", "Amount is required.")
    else:
        normalized_amount = normalize_amount(amount)
        if normalized_amount is None:
            error("amount", "Amount is not a number.")
        elif float(normalized_amount) <= 0:
            error("amount", "Amount must be greater than zero.")
        elif len(format_amount_for_payload(normalized_amount)) > IPS_FIELD_LIMITS["amount"]:
            error("amount", "Amount is too large for the payload.")

    # --- payer name (optional) ---
    payer_name = _required(payment.payer_name)
    if len(payer_name) > IPS_FIELD_LIMITS["payer_name"]:
        error("payer_name", f"Payer name exceeds {IPS_FIELD_LIMITS['payer_name']} characters.")

    # --- payment code ---
    payment_code = _required(payment.payment_code)
    if not payment_code:
        error("payment_code", "Payment code is required.")
    elif not re.fullmatch(r"\d{3}", payment_code):
        error("payment_code", "Payment code must be exactly 3 digits.")

    # --- purpose (optional) ---
    purpose = _required(payment.purpose)
    if len(purpose) > IPS_FIELD_LIMITS["purpose"]:
        error("purpose", f"Purpose exceeds {IPS_FIELD_LIMITS['purpose']} characters.")

    # --- reference (optional, but model and number go together) ---
    model = _required(payment.reference_model)
    reference = _required(payment.reference_number)
    if model and not re.fullmatch(r"\d{2}", model):
        error("reference_model", "Reference model must be exactly 2 digits (use 00 for none).")
    if len(reference) > IPS_FIELD_LIMITS["reference_number"]:
        error(
            "reference_number",
            f"Reference exceeds {IPS_FIELD_LIMITS['reference_number']} characters.",
        )
    if reference and not re.fullmatch(r"[\d\s-]+", reference):
        warn("reference_number", "Reference contains characters some banks reject.")
    if model and not reference:
        warn("reference_number", "A reference model was given without a reference number.")
    if model == "97" and reference and is_valid_model97_reference(reference) is False:
        warn("reference_number", "Model 97 control digits do not match — verify the reference.")

    return ValidationResult(
        valid=not any(i.severity == "error" for i in issues),
        issues=tuple(issues),
    )
