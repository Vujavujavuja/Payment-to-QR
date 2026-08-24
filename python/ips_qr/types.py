"""Domain types for the NBS IPS QR payload.

The wire format is a flat ``TAG:value|TAG:value|...`` string. It is modelled as
a structured object here and only serialised to tags at the edge (see
:mod:`ips_qr.encode`), so callers never have to think in tags.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

#: Tags defined by the specification, in the order they must appear.
IpsTag = Literal["K", "V", "C", "R", "N", "I", "P", "SF", "S", "RO"]

IssueSeverity = Literal["error", "warning"]


@dataclass(slots=True)
class IpsPayment:
    """A payment, in canonical internal form."""

    #: Recipient account. Stored unformatted: 18 digits, no dashes.
    recipient_account: str = ""
    #: Recipient name, optionally followed by address/place.
    recipient_name: str = ""
    #: Amount in RSD as a plain decimal string, e.g. "1234.56".
    amount: str = ""
    #: Payment code (sifra placanja), 3 digits.
    payment_code: str = ""
    #: Payer name. Optional.
    payer_name: str = ""
    #: Purpose of payment (svrha placanja). Optional.
    purpose: str = ""
    #: Reference model (model poziva na broj), 2 digits. "00" means none.
    reference_model: str = ""
    #: Reference number (poziv na broj). Optional.
    reference_number: str = ""


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    #: Field name on IpsPayment, or "payload" for whole-payload issues.
    field: str
    severity: IssueSeverity
    message: str


@dataclass(frozen=True, slots=True)
class ValidationResult:
    valid: bool
    issues: tuple[ValidationIssue, ...] = ()

    @property
    def errors(self) -> tuple[ValidationIssue, ...]:
        return tuple(i for i in self.issues if i.severity == "error")

    @property
    def warnings(self) -> tuple[ValidationIssue, ...]:
        return tuple(i for i in self.issues if i.severity == "warning")


def empty_payment() -> IpsPayment:
    """A blank payment, for seeding an empty form."""
    from .constants import DEFAULT_PAYMENT_CODE

    return IpsPayment(payment_code=DEFAULT_PAYMENT_CODE)
