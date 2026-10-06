"""The server instance and the instructions a client reads on connect."""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

#: Sent to the client at initialisation. This is the one place the rules of
#: the tool can be stated before any tool is called, so it carries the same
#: constraints the web app enforces with its review form.
INSTRUCTIONS = """\
Payment to QR builds NBS IPS QR codes: the QR standard Serbian banking apps scan
to pre-fill a payment.

It does not move money. It has no bank connection and never asks for
credentials. It encodes payment instructions; the user's own banking app makes
the payment after they confirm it there.

How to use it:

1. Get the fields. Either read the document yourself or call an extract tool.
2. Show every field to the user and have them confirm before generating
   anything. A wrong digit sends money to a stranger.
3. Validate, then generate. A code is never produced for a payment that fails
   validation.

Rules that are not negotiable:

- Never invent or complete a field. If the recipient account, amount or payment
  code is not on the document, ask the user for it.
- The payment code (sifra placanja) is usually NOT printed on invoices, fines or
  summonses. Do not default it silently; ask, or offer list_payment_codes.
- Extraction results carry a confidence per field. Anything listed under
  needs_review must be checked against the source with the user.
- An amount can depend on a rule the document states rather than a number it
  prints, such as paying half a fine within a deadline. That is the user's
  decision, not something to compute for them.

This is an unofficial tool, not affiliated with the National Bank of Serbia.
"""

app = MCPServer(
    "payment-to-qr",
    title="Payment to QR",
    instructions=INSTRUCTIONS,
    website_url="https://github.com/Vujavujavuja/Payment-to-QR",
)
