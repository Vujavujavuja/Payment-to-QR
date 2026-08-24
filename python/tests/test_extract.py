"""Extraction heuristics, exercised against a real document shape.

The fixture is a redacted copy of an actual traffic-fine summons: names,
address, plate, case number and fine number are replaced with placeholders,
while the payment paragraph keeps its exact wording and line wrapping. That
paragraph is what the heuristics have to survive — prose, Cyrillic, three
labels on one line, and a value split across a line break.
"""

from pathlib import Path

import pytest

from ips_qr import encode_payment, parse_payload, validate_payment
from ips_qr.extract import extract_payment_from_text
from ips_qr.extract.normalize import fold_script, fold_with_offsets

FIXTURE = Path(__file__).parent / "fixtures" / "prekrsajni_poziv.txt"

#: The public account of the Republic of Serbia budget, as printed on fines.
BUDGET_ACCOUNT = "840000074332484318"


@pytest.fixture(scope="module")
def summons() -> str:
    return FIXTURE.read_text(encoding="utf-8")


class TestFolding:
    @pytest.mark.parametrize("raw", ["šifra", "sifra", "шифра", "ШИФРА"])
    def test_every_spelling_folds_to_one_form(self, raw):
        assert fold_script(raw) == "sifra"

    def test_offsets_survive_multi_character_expansions(self):
        # Џ -> "dz" and Њ -> "nj" make folding longer than the source, so a
        # folded index is not a raw index. Slicing raw text with a folded
        # offset — which the TS original does — misplaces every later field.
        raw = "БУЏЕТ РЕПУБЛИКЕ"
        folded, offsets = fold_with_offsets(raw)
        assert folded == "budzet republike"
        assert len(folded) > len(raw)
        # The folded "republike" must map back to the raw "РЕПУБЛИКЕ".
        start = folded.index("republike")
        assert raw[offsets[start] :] == "РЕПУБЛИКЕ"

    def test_offsets_have_an_end_sentinel(self):
        folded, offsets = fold_with_offsets("abc")
        assert offsets[len(folded)] == 3


class TestLabelPriority:
    def test_prefers_u_korist_over_korisnik(self, summons):
        # "кориснику возила" (the driver) appears well before "у корист"
        # (the payee). Scanning line by line without priority picks the driver.
        result = extract_payment_from_text(summons)
        assert result.payment.recipient_name == "БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ"

    def test_stops_a_value_at_the_next_label_on_the_same_line(self, summons):
        # One line holds "u korist: X, u svrhu placanja: Y"; the recipient must
        # not swallow the purpose.
        result = extract_payment_from_text(summons)
        assert "сврху" not in result.payment.recipient_name
        assert "плаћања" not in result.payment.recipient_name


class TestAmount:
    def test_finds_the_fine_amount_in_prose(self, summons):
        result = extract_payment_from_text(summons)
        assert result.payment.amount == "10000.00"
        assert result.confidence["amount"] >= 0.8

    def test_does_not_mistake_a_date_for_an_amount(self, summons):
        # "30.04.2027" parses to 30042027.00 if dates are not excluded.
        result = extract_payment_from_text(summons)
        assert result.payment.amount != "30042027.00"

    def test_keeps_searching_when_the_first_label_match_holds_no_number(self):
        # "novcana kazna" matches before "iznos", but the text between it and
        # the next label has no digits in it.
        text = "za koji je propisana novcana kazna u fiksnom iznosu od 10000 dinara."
        result = extract_payment_from_text(text)
        assert result.payment.amount == "10000.00"


class TestAccountAndReference:
    def test_finds_the_checksum_valid_account(self, summons):
        result = extract_payment_from_text(summons)
        assert result.payment.recipient_account == BUDGET_ACCOUNT
        assert result.confidence["recipient_account"] == 0.95

    def test_prefers_a_checksum_valid_candidate_over_an_earlier_one(self):
        # The invalid run comes first; the valid one must still win.
        text = "broj 145-7-31981-26 ... na racun broj 840-743324843-18"
        result = extract_payment_from_text(text)
        assert result.payment.recipient_account == BUDGET_ACCOUNT

    def test_finds_the_model_and_reference(self, summons):
        result = extract_payment_from_text(summons)
        assert result.payment.reference_model == "97"
        assert result.payment.reference_number == "26501000000000000"


class TestHonesty:
    def test_does_not_invent_a_payment_code(self, summons):
        # Nothing on a summons states a sifra placanja. Guessing one would be
        # the single most dangerous thing this module could do.
        result = extract_payment_from_text(summons)
        assert "payment_code" not in result.found
        assert result.payment.payment_code == ""

    def test_an_incomplete_extraction_fails_validation(self, summons):
        result = extract_payment_from_text(summons)
        assert validate_payment(result.payment).valid is False

    def test_says_so_when_it_finds_nothing(self):
        result = extract_payment_from_text("The quick brown fox jumps over the lazy dog.")
        assert result.found == []
        assert result.notes


class TestEndToEnd:
    def test_extracted_payment_completes_and_encodes(self, summons):
        result = extract_payment_from_text(summons)
        payment = result.payment
        # The two things a human must supply: the payment code, and halving the
        # fine under the 8-day rule. Neither is derivable from the page.
        payment.payment_code = "253"
        payment.amount = "5000"

        validation = validate_payment(payment)
        assert validation.valid, validation.issues

        payload = encode_payment(payment).payload
        assert payload.startswith("K:PR|V:01|C:1|R:840000074332484318|")
        assert "I:RSD5000,00" in payload
        assert "SF:253" in payload
        assert "RO:9726501000000000000" in payload

        # And it survives a round trip through the wire format.
        assert parse_payload(payload) is not None
        assert parse_payload(payload).amount == "5000.00"
