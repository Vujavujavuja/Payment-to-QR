"""NBS IPS QR — payload encoding, validation and extraction.

A Python port of the TypeScript ``src/core`` library. Framework-agnostic and
dependency-free except :mod:`ips_qr.qr`, so it can back a CLI, a bot, or a
web service without dragging a UI along.
"""

from .constants import (
    COMMON_PAYMENT_CODES,
    DEFAULT_PAYMENT_CODE,
    IPS_FIELD_LIMITS,
    IPS_MAX_PAYLOAD_LENGTH,
)
from .encode import EncodeResult, encode_payment
from .format import (
    digits_only,
    format_account,
    format_amount_for_payload,
    normalize_account,
    normalize_amount,
    sanitize_text,
)
from .parse import parse_payload
from .types import IpsPayment, ValidationIssue, ValidationResult, empty_payment
from .validate import (
    compute_account_control_digits,
    is_valid_account_checksum,
    is_valid_model97_reference,
    validate_payment,
)

__all__ = [
    "COMMON_PAYMENT_CODES",
    "DEFAULT_PAYMENT_CODE",
    "IPS_FIELD_LIMITS",
    "IPS_MAX_PAYLOAD_LENGTH",
    "EncodeResult",
    "IpsPayment",
    "ValidationIssue",
    "ValidationResult",
    "compute_account_control_digits",
    "digits_only",
    "empty_payment",
    "encode_payment",
    "format_account",
    "format_amount_for_payload",
    "is_valid_account_checksum",
    "is_valid_model97_reference",
    "normalize_account",
    "normalize_amount",
    "parse_payload",
    "sanitize_text",
    "validate_payment",
]
