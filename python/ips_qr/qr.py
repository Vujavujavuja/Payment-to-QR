"""Rendering a payload as a QR code.

The only module in the package with a third-party dependency; install it with
the ``qr`` extra. The import is deferred so the rest of the library stays
usable without it.
"""

from __future__ import annotations

from dataclasses import dataclass

from .encode import encode_payment
from .types import IpsPayment


@dataclass(frozen=True, slots=True)
class QrOptions:
    #: Pixel size of each QR module.
    box_size: int = 10
    #: Quiet-zone width in modules. Below 4 some scanners struggle.
    border: int = 4
    #: The payload is UTF-8 text of non-trivial length; M keeps the module
    #: count manageable while still tolerating a creased printout.
    error_correction: str = "M"


_LEVELS = {"L": 1, "M": 0, "Q": 3, "H": 2}  # qrcode.constants values


def _build(payload: str, options: QrOptions):
    try:
        import qrcode
    except ModuleNotFoundError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError(
            "QR rendering needs the 'qr' extra: pip install 'ips-qr[qr]'"
        ) from exc

    code = qrcode.QRCode(
        error_correction=_LEVELS[options.error_correction],
        box_size=options.box_size,
        border=options.border,
    )
    code.add_data(payload)
    code.make(fit=True)
    return code


def render_payload_to_png(payload: str, path: str, options: QrOptions | None = None) -> str:
    """Write an already-encoded payload to a PNG file. Returns the path."""
    opts = options or QrOptions()
    # Explicit black-on-white: theme-driven colours would break scanning.
    image = _build(payload, opts).make_image(fill_color="black", back_color="white")
    image.save(path)
    return path


def render_payload_to_svg(payload: str, options: QrOptions | None = None) -> str:
    """Render an already-encoded payload as an SVG string, for print."""
    opts = options or QrOptions()
    matrix = _build(payload, opts).get_matrix()
    size = len(matrix)
    scale = opts.box_size
    side = size * scale

    rects = [
        f'<rect x="{x * scale}" y="{y * scale}" width="{scale}" height="{scale}"/>'
        for y, row in enumerate(matrix)
        for x, cell in enumerate(row)
        if cell
    ]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{side}" height="{side}" '
        f'viewBox="0 0 {side} {side}" shape-rendering="crispEdges">'
        f'<rect width="{side}" height="{side}" fill="#ffffff"/>'
        f'<g fill="#000000">{"".join(rects)}</g></svg>'
    )


def render_payment_to_png(
    payment: IpsPayment, path: str, options: QrOptions | None = None
) -> tuple[str, str, bool]:
    """Encode a payment and render it in one step.

    Returns ``(path, payload, over_length)``.
    """
    result = encode_payment(payment)
    render_payload_to_png(result.payload, path, options)
    return path, result.payload, result.over_length
