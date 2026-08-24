"""Port of src/core/core.test.ts, plus the cases that port exposed."""

import pytest

from ips_qr import (
    IPS_MAX_PAYLOAD_LENGTH,
    IpsPayment,
    compute_account_control_digits,
    encode_payment,
    format_account,
    format_amount_for_payload,
    is_valid_account_checksum,
    is_valid_model97_reference,
    normalize_account,
    normalize_amount,
    parse_payload,
    validate_payment,
)

#: Checksum-valid account: bank 265, account 1234567890, control 98.
VALID_ACCOUNT = "265000123456789098"


def payment(**overrides) -> IpsPayment:
    base = dict(
        recipient_account=VALID_ACCOUNT,
        recipient_name="Elektrodistribucija Beograd",
        amount="3450.00",
        payment_code="189",
    )
    base.update(overrides)
    return IpsPayment(**base)


class TestNormalizeAccount:
    def test_pads_each_hyphenated_segment_independently(self):
        # The middle segment is 10 digits and must grow to 13 on the left.
        assert normalize_account("265-1234567890-98") == VALID_ACCOUNT

    def test_accepts_an_already_padded_account(self):
        assert normalize_account(VALID_ACCOUNT) == VALID_ACCOUNT

    def test_rejects_digit_runs_that_are_not_18_long(self):
        assert normalize_account("2651234567890") is None

    def test_rejects_segments_that_overflow_their_field(self):
        assert normalize_account("2650-1234567890-98") is None

    def test_round_trips_through_the_display_format(self):
        assert format_account(VALID_ACCOUNT) == "265-0001234567890-98"

    def test_real_budget_account_from_a_traffic_fine(self):
        # 9-digit middle segment, padded to 13.
        assert normalize_account("840-743324843-18") == "840000074332484318"


class TestNormalizeAmount:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("1.234,56", "1234.56"),  # Serbian
            ("1,234.56", "1234.56"),  # English
            ("1234,5", "1234.50"),
            ("1234", "1234.00"),
            ("1.234", "1234.00"),  # single separator, 3 trailing digits -> thousands
            ("1.50", "1.50"),  # single separator, 2 trailing digits -> decimal
            ("RSD 3.450,00", "3450.00"),
            ("0,99", "0.99"),
        ],
    )
    def test_parses(self, raw, expected):
        assert normalize_amount(raw) == expected

    def test_returns_none_when_there_are_no_digits(self):
        assert normalize_amount("RSD") is None

    def test_serialises_to_the_comma_form_the_payload_requires(self):
        assert format_amount_for_payload("1234.5") == "RSD1234,50"


class TestAccountChecksum:
    def test_accepts_a_valid_account(self):
        assert is_valid_account_checksum(VALID_ACCOUNT) is True

    def test_rejects_a_single_transposed_digit(self):
        assert is_valid_account_checksum("265000123456789097") is False

    def test_derives_the_control_digits(self):
        assert compute_account_control_digits("2650001234567890") == "98"


class TestModel97Reference:
    def test_accepts_a_correctly_computed_reference(self):
        assert is_valid_model97_reference("921234567890") is True

    def test_ignores_separators(self):
        assert is_valid_model97_reference("92-1234567890") is True

    def test_rejects_a_wrong_control_pair(self):
        assert is_valid_model97_reference("911234567890") is False

    def test_abstains_on_non_numeric_references(self):
        assert is_valid_model97_reference("AB1234") is None

    def test_accepts_the_reference_from_a_real_summons(self):
        assert is_valid_model97_reference("08501265012043052") is True


class TestValidatePayment:
    def test_accepts_a_well_formed_payment(self):
        assert validate_payment(payment()).valid is True

    def test_flags_a_bad_account_checksum_as_an_error(self):
        result = validate_payment(payment(recipient_account="265000123456789097"))
        assert result.valid is False
        assert any(i.field == "recipient_account" for i in result.issues)

    def test_rejects_a_zero_amount(self):
        assert validate_payment(payment(amount="0")).valid is False

    def test_rejects_a_two_digit_payment_code(self):
        assert validate_payment(payment(payment_code="18")).valid is False

    def test_warns_but_stays_valid_on_a_mismatched_model_97_reference(self):
        result = validate_payment(
            payment(reference_model="97", reference_number="911234567890")
        )
        assert result.valid is True
        assert result.warnings


class TestEncodePayment:
    def test_emits_the_mandatory_tags_in_spec_order(self):
        assert encode_payment(payment()).payload == (
            "K:PR|V:01|C:1|R:265000123456789098|"
            "N:Elektrodistribucija Beograd|I:RSD3450,00|SF:189"
        )

    def test_omits_optional_tags_rather_than_emitting_them_empty(self):
        result = encode_payment(payment(payer_name="", purpose=""))
        assert "P:" not in result.payload
        assert "S:" not in result.payload
        assert "RO:" not in result.payload

    def test_packs_the_reference_model_and_number_into_one_ro_tag(self):
        result = encode_payment(payment(reference_model="97", reference_number="921234567890"))
        assert "RO:97921234567890" in result.payload

    def test_defaults_a_reference_with_no_model_to_model_00(self):
        assert "RO:0012345" in encode_payment(payment(reference_number="12345")).payload

    def test_strips_pipes_that_would_shift_every_later_field(self):
        result = encode_payment(payment(recipient_name="ACME|DOO"))
        assert "N:ACME DOO" in result.payload
        assert len(result.payload.split("|")) == 7

    def test_flags_an_over_length_payload_without_refusing_it(self):
        result = encode_payment(payment(recipient_name="A" * 70, payer_name="B" * 70))
        assert len(result.payload) <= IPS_MAX_PAYLOAD_LENGTH
        assert result.over_length is False


class TestParsePayload:
    def test_round_trips_a_fully_populated_payment(self):
        original = payment(
            payer_name="Petar Petrovic",
            purpose="Racun za struju",
            reference_model="97",
            reference_number="921234567890",
        )
        parsed = parse_payload(encode_payment(original).payload)

        assert parsed is not None
        assert parsed.recipient_account == original.recipient_account
        assert parsed.amount == "3450.00"
        assert parsed.reference_model == "97"
        assert parsed.reference_number == "921234567890"

    def test_returns_none_for_a_string_that_is_not_an_ips_payload(self):
        assert parse_payload("https://example.com") is None

    def test_ignores_tags_it_does_not_know(self):
        parsed = parse_payload(
            "K:PR|V:01|C:1|R:265000123456789098|N:Test|I:RSD10,00|SF:189|XX:future"
        )
        assert parsed is not None and parsed.recipient_name == "Test"

    def test_treats_a_too_short_ro_tag_as_absent(self):
        # The TS original slices RO blindly, turning "RO:9" into model "9".
        parsed = parse_payload("K:PR|V:01|C:1|R:265000123456789098|N:T|I:RSD10,00|SF:189|RO:9")
        assert parsed is not None
        assert parsed.reference_model == ""
        assert parsed.reference_number == ""

    def test_round_trips_cyrillic_intact(self):
        original = payment(recipient_name="БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ")
        parsed = parse_payload(encode_payment(original).payload)
        assert parsed is not None
        assert parsed.recipient_name == "БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ"
