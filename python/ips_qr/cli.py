"""Command line entry point: document or fields in, IPS QR out."""

from __future__ import annotations

import argparse
import sys

from .encode import encode_payment
from .extract.normalize import extract_payment_from_text
from .extract.pdf import PdfTextError, pdf_to_text
from .format import format_account
from .parse import parse_payload
from .types import IpsPayment
from .validate import validate_payment

REVIEW_THRESHOLD = 0.7


def _read_source(args: argparse.Namespace) -> str | None:
    if args.pdf:
        return pdf_to_text(args.pdf)
    if args.text:
        with open(args.text, encoding="utf-8") as handle:
            return handle.read()
    if args.stdin:
        return sys.stdin.read()
    return None


def _apply_overrides(payment: IpsPayment, args: argparse.Namespace) -> None:
    """Explicit flags always win over anything extracted."""
    for name in (
        "recipient_account",
        "recipient_name",
        "amount",
        "payment_code",
        "payer_name",
        "purpose",
        "reference_model",
        "reference_number",
    ):
        value = getattr(args, name, None)
        if value is not None:
            setattr(payment, name, value)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ips-qr",
        description="Build an NBS IPS QR code from a document or from explicit fields.",
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--pdf", help="Read a PDF and extract payment fields from it.")
    source.add_argument("--text", help="Read a text file and extract payment fields.")
    source.add_argument("--stdin", action="store_true", help="Read document text from stdin.")
    source.add_argument("--payload", help="Start from an existing IPS payload string.")

    for name in (
        "recipient-account",
        "recipient-name",
        "amount",
        "payment-code",
        "payer-name",
        "purpose",
        "reference-model",
        "reference-number",
    ):
        parser.add_argument(f"--{name}", dest=name.replace("-", "_"))

    parser.add_argument("--png", help="Write the QR code to this PNG path.")
    parser.add_argument("--svg", help="Write the QR code to this SVG path.")
    parser.add_argument(
        "--show-text", action="store_true", help="Print the extracted source text and exit."
    )
    args = parser.parse_args(argv)

    payment = IpsPayment()

    if args.payload:
        parsed = parse_payload(args.payload)
        if parsed is None:
            print("error: that is not an IPS payload.", file=sys.stderr)
            return 2
        payment = parsed
    else:
        try:
            text = _read_source(args)
        except (PdfTextError, OSError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2

        if text is not None:
            if args.show_text:
                print(text)
                return 0
            result = extract_payment_from_text(text, provider="pdf" if args.pdf else "text")
            payment = result.payment
            print("Extracted:", file=sys.stderr)
            for name in result.found:
                score = result.confidence.get(name, 0.0)
                flag = "  <- CHECK" if score < REVIEW_THRESHOLD else ""
                print(f"  {name:<18} {getattr(payment, name)!r} ({score:.2f}){flag}", file=sys.stderr)
            for note in result.notes:
                print(f"  note: {note}", file=sys.stderr)
            print(file=sys.stderr)

    _apply_overrides(payment, args)

    validation = validate_payment(payment)
    for issue in validation.issues:
        print(f"{issue.severity}: {issue.field}: {issue.message}", file=sys.stderr)

    if not validation.valid:
        print("\nRefusing to render a QR code for an invalid payment.", file=sys.stderr)
        return 1

    encoded = encode_payment(payment)
    if encoded.over_length:
        print(
            "warning: payload exceeds the recommended maximum; some scanners may reject it.",
            file=sys.stderr,
        )

    print(f"account: {format_account(payment.recipient_account)}", file=sys.stderr)
    print(encoded.payload)

    if args.png:
        from .qr import render_payload_to_png

        render_payload_to_png(encoded.payload, args.png)
        print(f"wrote {args.png}", file=sys.stderr)
    if args.svg:
        from .qr import render_payload_to_svg

        with open(args.svg, "w", encoding="utf-8") as handle:
            handle.write(render_payload_to_svg(encoded.payload))
        print(f"wrote {args.svg}", file=sys.stderr)

    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
