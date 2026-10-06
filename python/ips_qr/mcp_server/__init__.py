"""A Model Context Protocol server over the IPS QR library.

Runs locally over stdio, so an assistant such as Claude Code can validate a
payment, encode it and render the QR code without any of it leaving the
machine. Needs the ``mcp`` extra; importing :mod:`ips_qr` itself never does.
"""

# Importing these modules is what registers their tools on the app.
from . import extraction, rendering, tools  # noqa: F401
from .app import app


def main() -> None:
    """Serve over stdio until the client disconnects.

    stdio is the only transport offered on purpose. The tools read local files
    and write local files, which is appropriate for a process the user started
    on their own machine and not for something listening on a port.
    """
    app.run("stdio")


__all__ = ["app", "main"]
