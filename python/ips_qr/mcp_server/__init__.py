"""A Model Context Protocol server over the IPS QR library.

Runs locally over stdio, so an assistant such as Claude Code can validate a
payment, encode it and render the QR code without any of it leaving the
machine. Needs the ``mcp`` extra; importing :mod:`ips_qr` itself never does.
"""

from .app import app

__all__ = ["app"]
