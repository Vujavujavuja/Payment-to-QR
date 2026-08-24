"""Normalising human-written accounts and amounts into canonical form."""

from __future__ import annotations

import re

from .constants import (
    ACCOUNT_BANK_DIGITS,
    ACCOUNT_CONTROL_DIGITS,
    ACCOUNT_NUMBER_DIGITS,
    ACCOUNT_TOTAL_DIGITS,
    IPS_CURRENCY,
)

_SEGMENT_SPLIT = re.compile(r"[-\s/]+")
_NON_DIGIT = re.compile(r"\D")


def digits_only(value: str) -> str:
    """Strip everything but digits — used for payment codes and models."""
    return _NON_DIGIT.sub("", value or "")


def normalize_account(value: str) -> str | None:
    """Normalise an account number to the 18 bare digits the payload wants.

    Slips almost never print the padded form. ``265-1234567890-12`` has a
    10-digit middle segment that must be left-padded to 13 — dropping the
    dashes and hoping for 18 digits would silently produce a *different*
    account, so the hyphenated form is expanded segment by segment instead.

    Returns None when the input cannot be resolved to exactly 18 digits.
    """
    trimmed = (value or "").strip()
    if not trimmed:
        return None

    segments = [s for s in _SEGMENT_SPLIT.split(trimmed) if s]

    if len(segments) == 3 and all(s.isdigit() for s in segments):
        bank, account, control = segments
        if (
            len(bank) > ACCOUNT_BANK_DIGITS
            or len(account) > ACCOUNT_NUMBER_DIGITS
            or len(control) > ACCOUNT_CONTROL_DIGITS
        ):
            return None
        return (
            bank.rjust(ACCOUNT_BANK_DIGITS, "0")
            + account.rjust(ACCOUNT_NUMBER_DIGITS, "0")
            + control.rjust(ACCOUNT_CONTROL_DIGITS, "0")
        )

    digits = _NON_DIGIT.sub("", trimmed)
    return digits if len(digits) == ACCOUNT_TOTAL_DIGITS else None


def format_account(account: str) -> str:
    """Render 18 digits back as ``bbb-aaaaaaaaaaaaa-cc`` for display."""
    digits = _NON_DIGIT.sub("", account or "")
    if len(digits) != ACCOUNT_TOTAL_DIGITS:
        return account
    bank = digits[:ACCOUNT_BANK_DIGITS]
    middle = digits[ACCOUNT_BANK_DIGITS : ACCOUNT_BANK_DIGITS + ACCOUNT_NUMBER_DIGITS]
    control = digits[ACCOUNT_BANK_DIGITS + ACCOUNT_NUMBER_DIGITS :]
    return f"{bank}-{middle}-{control}"


_CURRENCY_RE = re.compile(IPS_CURRENCY, re.IGNORECASE)
_NOT_AMOUNT = re.compile(r"[^\d.,]")
_LEADING_ZEROS = re.compile(r"^0+(?=\d)")


def normalize_amount(value: str) -> str | None:
    """Parse a human-written amount into a canonical ``1234.56`` string.

    Serbian documents use ``.`` for thousands and ``,`` for decimals; OCR and
    pasted text routinely mix both conventions, so the separators are
    disambiguated by *position* rather than assumed::

        "1.234,56" -> 1234.56   (both present: the last one is the decimal mark)
        "1,234.56" -> 1234.56
        "1234,5"   -> 1234.50   (1-2 trailing digits: decimal)
        "1.234"    -> 1234.00   (exactly 3 trailing digits: thousands)

    Returns None if no digits are present.
    """
    cleaned = _NOT_AMOUNT.sub("", _CURRENCY_RE.sub("", value or "")).strip()
    if not any(ch.isdigit() for ch in cleaned):
        return None

    last_comma = cleaned.rfind(",")
    last_dot = cleaned.rfind(".")

    decimal_at = -1
    if last_comma >= 0 and last_dot >= 0:
        decimal_at = max(last_comma, last_dot)
    elif last_comma >= 0 or last_dot >= 0:
        candidate = max(last_comma, last_dot)
        trailing = len(cleaned) - candidate - 1
        # A single separator with exactly 3 digits behind it is a thousands mark.
        if 0 < trailing <= 2:
            decimal_at = candidate

    whole_part = _NON_DIGIT.sub("", cleaned[:decimal_at] if decimal_at >= 0 else cleaned)
    fraction_part = _NON_DIGIT.sub("", cleaned[decimal_at + 1 :]) if decimal_at >= 0 else ""

    whole = _LEADING_ZEROS.sub("", whole_part) or "0"
    fraction = (fraction_part + "00")[:2]
    return f"{whole}.{fraction}"


def format_amount_for_payload(amount: str) -> str:
    """Serialise a canonical amount to the payload's ``RSD1234,56`` form."""
    normalized = normalize_amount(amount)
    if normalized is None:
        return f"{IPS_CURRENCY}0,00"
    return f"{IPS_CURRENCY}{normalized.replace('.', ',')}"


_PAYLOAD_BREAKERS = re.compile(r"[|\r\n]+")
_WHITESPACE = re.compile(r"\s+")


def sanitize_text(value: str, max_length: int) -> str:
    """Collapse whitespace and drop characters that would corrupt the payload.

    ``|`` is the tag separator and newline is the sub-field separator inside
    N and P, so a stray one from OCR would shift every field after it.
    """
    collapsed = _WHITESPACE.sub(" ", _PAYLOAD_BREAKERS.sub(" ", value or "")).strip()
    return collapsed[:max_length]
