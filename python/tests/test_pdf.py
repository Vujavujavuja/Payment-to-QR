"""The PDF text path.

A real PDF is built here rather than committed: the documents this project is
aimed at are payment slips and summonses, which carry names, addresses and
account numbers. Generating a synthetic one keeps the plumbing under test
without putting anybody's paperwork in the repository.
"""

import shutil

import pytest
from pdf_builder import minimal_pdf

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


@pytest.fixture(scope="module")
def sample_pdf(tmp_path_factory):
    path = tmp_path_factory.mktemp("pdf") / "nalog.pdf"
    path.write_bytes(minimal_pdf(LINES))
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
