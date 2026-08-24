"""The PDF text path.

A real PDF is built here rather than committed: the documents this project is
aimed at are payment slips and summonses, which carry names, addresses and
account numbers. Generating a synthetic one keeps the plumbing under test
without putting anybody's paperwork in the repository.
"""

import shutil

import pytest

from ips_qr.extract import extract_payment_from_text
from ips_qr.extract.pdf import PdfTextError, pdf_to_text

pytestmark = pytest.mark.skipif(
    shutil.which("pdftotext") is None,
    reason="needs poppler's pdftotext on PATH",
)

LINES = [
    "PREKRSAJNI NALOG",
    "Uplatu izvrsiti u korist: BUDZET REPUBLIKE SRBIJE,",
    "u svrhu placanja: UPLATA PO PREKRSAJNOM NALOGU",
    "na racun broj 840-743324843-18",
    "sa pozivom na broj 08501265012043052 model 97",
    "novcana kazna u fiksnom iznosu od 10000 dinara",
]


def _minimal_pdf(lines: list[str]) -> bytes:
    """Hand-build a one-page PDF with correct xref offsets."""
    text_ops = ["BT", "/F1 11 Tf", "14 TL", "40 740 Td"]
    for line in lines:
        escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        text_ops.append(f"({escaped}) Tj T*")
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode("latin-1")

    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
        b"/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length " + str(len(stream)).encode() + b">>\nstream\n" + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<</Size {len(objects) + 1}/Root 1 0 R>>\nstartxref\n{xref_at}\n".encode()
        + b"%%EOF\n"
    )
    return bytes(out)


@pytest.fixture(scope="module")
def sample_pdf(tmp_path_factory):
    path = tmp_path_factory.mktemp("pdf") / "nalog.pdf"
    path.write_bytes(_minimal_pdf(LINES))
    return path


def test_extracts_text_from_a_pdf(sample_pdf):
    text = pdf_to_text(str(sample_pdf))
    assert "BUDZET REPUBLIKE SRBIJE" in text
    assert "840-743324843-18" in text


def test_layout_mode_preserves_line_structure(sample_pdf):
    # The label heuristics read "the value to the right of the label", so a
    # reflowed single blob would break field association.
    text = pdf_to_text(str(sample_pdf), layout=True)
    assert len([line for line in text.splitlines() if line.strip()]) >= len(LINES)


def test_the_full_pdf_to_payment_path(sample_pdf):
    result = extract_payment_from_text(pdf_to_text(str(sample_pdf)), provider="pdf")
    payment = result.payment

    assert payment.recipient_account == "840000074332484318"
    assert result.confidence["recipient_account"] == 0.95
    assert payment.recipient_name == "BUDZET REPUBLIKE SRBIJE"
    assert payment.amount == "10000.00"
    assert payment.reference_model == "97"
    assert payment.reference_number == "08501265012043052"
    # Still not guessed, even end to end.
    assert payment.payment_code == ""


def test_a_missing_file_raises_pdf_text_error(tmp_path):
    with pytest.raises(PdfTextError):
        pdf_to_text(str(tmp_path / "nope.pdf"))
