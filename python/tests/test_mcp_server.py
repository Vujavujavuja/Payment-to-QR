"""The MCP server.

Tools are plain functions underneath, so most tests call them directly. The
protocol-level tests go through a real client connected in-process, which
checks the part direct calls cannot: what a client is actually told.
"""

import subprocess
import sys

import anyio
import pytest

pytest.importorskip("mcp", reason="needs the 'mcp' extra")

from mcp import Client

from ips_qr.mcp_server import app
from ips_qr.mcp_server.app import INSTRUCTIONS


def connect(fn):
    """Run ``fn(client)`` against the server over an in-process connection."""

    async def runner():
        async with Client(app) as client:
            return await fn(client)

    return anyio.run(runner)


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
