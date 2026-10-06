"""The tools.

Each one is a thin wrapper over the library. The logic that decides whether an
account is real or a payment is valid lives in :mod:`ips_qr`, where it is
tested against the TypeScript implementation; nothing here re-implements it.
"""

from __future__ import annotations

from typing import Any

from mcp.types import ToolAnnotations

from ..format import format_account, normalize_account
from ..validate import is_valid_account_checksum
from .app import app
from .payments import RecipientAccount

#: For tools that only compute. Clients use this to decide what may run
#: without asking, and none of these touch the disk or the network.
READ_ONLY = ToolAnnotations(read_only_hint=True, idempotent_hint=True, open_world_hint=False)


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
