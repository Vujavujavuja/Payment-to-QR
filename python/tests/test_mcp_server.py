"""The MCP server.

Tools are plain functions underneath, so most tests call them directly. The
protocol-level tests go through a real client connected in-process, which
checks the part direct calls cannot: what a client is actually told.
"""

import json
import subprocess
import sys

import anyio
import pytest

pytest.importorskip("mcp", reason="needs the 'mcp' extra")

from mcp import Client

from ips_qr import validate_payment
from ips_qr.mcp_server import app
from ips_qr.mcp_server.app import INSTRUCTIONS
from ips_qr.mcp_server.payments import (
    account_display,
    build_payment,
    payment_to_dict,
    validation_to_dict,
)


def connect(fn):
    """Run ``fn(client)`` against the server over an in-process connection."""

    async def runner():
        async with Client(app) as client:
            return await fn(client)

    return anyio.run(runner)


def call(name, **arguments):
    """Call a tool through the protocol and return its decoded JSON result."""

    async def invoke(client):
        return await client.call_tool(name, arguments)

    result = connect(invoke)
    assert not result.is_error, result.content
    if result.structured_content is not None:
        return result.structured_content
    return json.loads(result.content[0].text)


def tool_named(name):
    async def listing(client):
        return (await client.list_tools()).tools

    return next(tool for tool in connect(listing) if tool.name == name)


class TestServerIdentity:
    def test_names_itself(self):
        assert app.name == "payment-to-qr"

    def test_sends_its_instructions_to_the_client(self):
        async def read(client):
            return client.instructions

        assert connect(read) == INSTRUCTIONS

    def test_instructions_say_it_does_not_move_money(self):
        # The claim most likely to be assumed otherwise, given the name.
        assert "does not move money" in INSTRUCTIONS

    def test_instructions_forbid_inventing_fields(self):
        assert "Never invent" in INSTRUCTIONS


class TestOptionalDependency:
    def test_the_core_library_imports_without_mcp(self):
        # The server is an extra. Poison the import and make sure the library
        # underneath still loads, in a fresh interpreter so nothing is cached.
        code = (
            "import sys; sys.modules['mcp'] = None\n"
            "import ips_qr\n"
            "from ips_qr import encode_payment, validate_payment\n"
            "print('ok')"
        )
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        assert done.stdout.strip() == "ok", done.stderr


#: Checksum-valid account: bank 265, account 1234567890, control 98.
VALID_ACCOUNT = "265-1234567890-98"

VALID = {
    "recipient_account": VALID_ACCOUNT,
    "recipient_name": "Elektrodistribucija Beograd",
    "amount": "3450,00",
    "payment_code": "189",
}


class TestPaymentHelpers:
    def test_build_payment_passes_input_through_untouched(self):
        # Validation must see what was sent, not a normalised copy of it.
        payment = build_payment(**VALID)
        assert payment.recipient_account == VALID_ACCOUNT
        assert payment.amount == "3450,00"

    def test_payment_to_dict_drops_empty_fields(self):
        assert payment_to_dict(build_payment(**VALID)) == VALID

    def test_validation_keeps_errors_and_warnings_apart(self):
        payment = build_payment(
            **{**VALID, "recipient_account": "265-1234567890-97"},
            reference_model="97",
            reference_number="911234567890",
        )
        result = validation_to_dict(validate_payment(payment))
        assert result["valid"] is False
        assert [e["field"] for e in result["errors"]] == ["recipient_account"]
        assert [w["field"] for w in result["warnings"]] == ["reference_number"]

    def test_account_display_is_the_form_printed_on_a_slip(self):
        assert account_display(VALID_ACCOUNT) == "265-0001234567890-98"

    def test_account_display_returns_garbage_unchanged(self):
        assert account_display("not an account") == "not an account"


class TestNormalizeAccountNumber:
    def test_pads_and_verifies_a_printed_account(self):
        result = call("normalize_account_number", account=VALID_ACCOUNT)
        assert result["normalized"] == "265000123456789098"
        assert result["display"] == "265-0001234567890-98"
        assert result["checksum_valid"] is True

    def test_flags_a_misread_digit(self):
        result = call("normalize_account_number", account="265-1234567890-97")
        assert result["recognised"] is True
        assert result["checksum_valid"] is False
        assert "misread" in result["message"]

    def test_says_when_the_input_is_not_an_account_at_all(self):
        result = call("normalize_account_number", account="12345")
        assert result["recognised"] is False
        assert "normalized" not in result

    def test_is_advertised_as_read_only(self):
        annotations = tool_named("normalize_account_number").annotations
        assert annotations.read_only_hint is True
