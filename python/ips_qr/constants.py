"""Fixed values from the NBS IPS QR specification."""

from typing import Final

IPS_IDENTIFICATION_CODE: Final = "PR"
IPS_VERSION: Final = "01"
#: "1" selects UTF-8. It is the only character set worth emitting.
IPS_CHARACTER_SET: Final = "1"

#: Currency prefix on the amount tag. IPS is a dinar-only scheme.
IPS_CURRENCY: Final = "RSD"

IPS_TAG_SEPARATOR: Final = "|"
IPS_TAG_ORDER: Final = ("K", "V", "C", "R", "N", "I", "P", "SF", "S", "RO")

#: Maximum value length per tag, from the NBS field table.
IPS_FIELD_LIMITS: Final = {
    "recipient_account": 18,
    "recipient_name": 70,
    "amount": 20,  # includes the "RSD" prefix
    "payer_name": 70,
    "payment_code": 3,
    "purpose": 35,
    "reference_number": 22,
}

#: Soft ceiling on the encoded payload — a warning, never an error.
IPS_MAX_PAYLOAD_LENGTH: Final = 331

#: A Serbian account is 18 digits: 3 bank + 13 account + 2 control.
ACCOUNT_BANK_DIGITS: Final = 3
ACCOUNT_NUMBER_DIGITS: Final = 13
ACCOUNT_CONTROL_DIGITS: Final = 2
ACCOUNT_TOTAL_DIGITS: Final = (
    ACCOUNT_BANK_DIGITS + ACCOUNT_NUMBER_DIGITS + ACCOUNT_CONTROL_DIGITS
)

#: Common payment codes, for a UI dropdown. The spec allows any 3-digit code.
COMMON_PAYMENT_CODES: Final = (
    ("189", "Transfer / other (prenos sredstava)"),
    ("221", "Goods and services (promet robe i usluga)"),
    ("222", "Services (usluge)"),
    ("245", "Utilities (komunalne usluge)"),
    ("253", "Public revenue / taxes (javni prihodi)"),
    ("288", "Court and administrative fees (takse)"),
    ("290", "Other transactions (ostalo)"),
)

DEFAULT_PAYMENT_CODE: Final = "189"
