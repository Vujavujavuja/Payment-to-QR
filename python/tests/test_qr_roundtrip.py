"""Proof that a generated code actually scans.

Every other test checks the payload *string*. These check the artefact a bank
app is pointed at: render a real PNG, decode it with an independent decoder
(OpenCV, which shares no code with the encoder), and require the bytes back.
A payload that is correct but renders to an unscannable image is still a bug.
"""

import pytest

from ips_qr import IpsPayment, encode_payment, parse_payload, validate_payment

cv2 = pytest.importorskip("cv2", reason="decode check needs opencv-python-headless")
pytest.importorskip("qrcode", reason="rendering needs the 'qr' extra")

from ips_qr.qr import QrOptions, render_payload_to_png, render_payload_to_svg


def _decode(path: str) -> str:
    image = cv2.imread(str(path))
    assert image is not None, f"could not read {path}"
    decoded, _points, _straight = cv2.QRCodeDetector().detectAndDecode(image)
    return decoded


CASES = {
    "latin_minimal": IpsPayment(
        recipient_account="265000123456789098",
        recipient_name="Elektrodistribucija Beograd",
        amount="3450.00",
        payment_code="189",
    ),
    "cyrillic_traffic_fine": IpsPayment(
        recipient_account="840-743324843-18",
        recipient_name="БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ",
        amount="5000",
        payment_code="253",
        purpose="УПЛАТА ПО ПРЕКРШАЈНОМ НАЛОГУ",
        reference_model="97",
        reference_number="08501265012043052",
    ),
    "every_optional_field": IpsPayment(
        recipient_account="265000123456789098",
        recipient_name="Preduzece za promet robe i usluga DOO",
        amount="1234567.89",
        payment_code="221",
        payer_name="Petar Petrović",
        purpose="Racun 2026/08-1234",
        reference_model="97",
        reference_number="921234567890",
    ),
}


@pytest.mark.parametrize("name", sorted(CASES))
def test_rendered_png_decodes_back_to_the_same_payload(name, tmp_path):
    payment = CASES[name]
    assert validate_payment(payment).valid, "fixture must be a valid payment"

    payload = encode_payment(payment).payload
    path = tmp_path / f"{name}.png"
    render_payload_to_png(payload, str(path))

    assert _decode(str(path)) == payload


@pytest.mark.parametrize("name", sorted(CASES))
def test_decoded_payload_reparses_to_an_equivalent_payment(name, tmp_path):
    payment = CASES[name]
    payload = encode_payment(payment).payload
    path = tmp_path / f"{name}.png"
    render_payload_to_png(payload, str(path))

    reparsed = parse_payload(_decode(str(path)))
    assert reparsed is not None
    assert validate_payment(reparsed).valid
    assert reparsed.recipient_name == payment.recipient_name
    assert reparsed.reference_number == (payment.reference_number or "")


def test_cyrillic_survives_the_image_round_trip(tmp_path):
    # UTF-8 through QR byte mode is where a naive encoder mangles Serbian.
    payload = encode_payment(CASES["cyrillic_traffic_fine"]).payload
    path = tmp_path / "cyrillic.png"
    render_payload_to_png(payload, str(path))
    assert "БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ" in _decode(str(path))


def test_a_small_quiet_zone_still_decodes(tmp_path):
    # The spec's floor is 4 modules; verify the default is not accidentally 0.
    payload = encode_payment(CASES["latin_minimal"]).payload
    path = tmp_path / "tight.png"
    render_payload_to_png(payload, str(path), QrOptions(box_size=6, border=4))
    assert _decode(str(path)) == payload


def test_svg_is_well_formed_and_sized(tmp_path):
    payload = encode_payment(CASES["latin_minimal"]).payload
    svg = render_payload_to_svg(payload)
    assert svg.startswith("<svg xmlns=")
    assert svg.rstrip().endswith("</svg>")
    assert svg.count("<rect") > 100  # modules actually drawn
    assert 'fill="#000000"' in svg and 'fill="#ffffff"' in svg
