"""The MCP server.

Tools are plain functions underneath, so most tests call them directly. The
protocol-level tests go through a real client connected in-process, which
checks the part direct calls cannot: what a client is actually told.
"""

import base64
import json
import shutil
import subprocess
import sys
from pathlib import Path

import anyio
import pytest

pytest.importorskip("mcp", reason="needs the 'mcp' extra")
cv2 = pytest.importorskip("cv2", reason="decoding needs opencv-python-headless")
numpy = pytest.importorskip("numpy")

from mcp import Client
from pdf_builder import minimal_pdf

from ips_qr import validate_payment
from ips_qr.mcp_server import app
from ips_qr.mcp_server.app import INSTRUCTIONS
from ips_qr.mcp_server.payments import (
    account_display,
    build_payment,
    payment_to_dict,
    validation_to_dict,
)


def connect(fn):
    """Run ``fn(client)`` against the server over an in-process connection."""

    async def runner():
        async with Client(app) as client:
            return await fn(client)

    return anyio.run(runner)


def call(name, **arguments):
    """Call a tool through the protocol and return its decoded JSON result."""

    async def invoke(client):
        return await client.call_tool(name, arguments)

    result = connect(invoke)
    assert not result.is_error, result.content
    if result.structured_content is not None:
        return result.structured_content
    return json.loads(result.content[0].text)


def call_expecting_error(name, **arguments):
    """Call a tool that should refuse, and return the refusal text."""

    async def invoke(client):
        return await client.call_tool(name, arguments)

    result = connect(invoke)
    assert result.is_error, "expected the tool to refuse"
    return result.content[0].text


def call_raw(name, **arguments):
    """Call a tool and return the whole result, for tools that return an image."""

    async def invoke(client):
        return await client.call_tool(name, arguments)

    result = connect(invoke)
    assert not result.is_error, result.content
    return result


def decode_qr(png: bytes) -> str:
    """Read a QR code with OpenCV, which shares no code with the encoder."""
    image = cv2.imdecode(numpy.frombuffer(png, numpy.uint8), cv2.IMREAD_COLOR)
    decoded, _points, _straight = cv2.QRCodeDetector().detectAndDecode(image)
    return decoded


def tool_named(name):
    async def listing(client):
        return (await client.list_tools()).tools

    return next(tool for tool in connect(listing) if tool.name == name)


class TestServerIdentity:
    def test_names_itself(self):
        assert app.name == "payment-to-qr"

    def test_sends_its_instructions_to_the_client(self):
        async def read(client):
            return client.instructions

        assert connect(read) == INSTRUCTIONS

    def test_instructions_say_it_does_not_move_money(self):
        # The claim most likely to be assumed otherwise, given the name.
        assert "does not move money" in INSTRUCTIONS

    def test_instructions_forbid_inventing_fields(self):
        assert "Never invent" in INSTRUCTIONS


class TestOptionalDependency:
    def test_the_core_library_imports_without_mcp(self):
        # The server is an extra. Poison the import and make sure the library
        # underneath still loads, in a fresh interpreter so nothing is cached.
        code = (
            "import sys; sys.modules['mcp'] = None\n"
            "import ips_qr\n"
            "from ips_qr import encode_payment, validate_payment\n"
            "print('ok')"
        )
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        assert done.stdout.strip() == "ok", done.stderr


#: The redacted traffic-fine summons the extractor suites share.
SUMMONS = (Path(__file__).parent / "fixtures" / "prekrsajni_poziv.txt").read_text(encoding="utf-8")

#: Checksum-valid account: bank 265, account 1234567890, control 98.
VALID_ACCOUNT = "265-1234567890-98"

VALID = {
    "recipient_account": VALID_ACCOUNT,
    "recipient_name": "Elektrodistribucija Beograd",
    "amount": "3450,00",
    "payment_code": "189",
}


class TestPaymentHelpers:
    def test_build_payment_passes_input_through_untouched(self):
        # Validation must see what was sent, not a normalised copy of it.
        payment = build_payment(**VALID)
        assert payment.recipient_account == VALID_ACCOUNT
        assert payment.amount == "3450,00"

    def test_payment_to_dict_drops_empty_fields(self):
        assert payment_to_dict(build_payment(**VALID)) == VALID

    def test_validation_keeps_errors_and_warnings_apart(self):
        payment = build_payment(
            **{**VALID, "recipient_account": "265-1234567890-97"},
            reference_model="97",
            reference_number="911234567890",
        )
        result = validation_to_dict(validate_payment(payment))
        assert result["valid"] is False
        assert [e["field"] for e in result["errors"]] == ["recipient_account"]
        assert [w["field"] for w in result["warnings"]] == ["reference_number"]

    def test_account_display_is_the_form_printed_on_a_slip(self):
        assert account_display(VALID_ACCOUNT) == "265-0001234567890-98"

    def test_account_display_returns_garbage_unchanged(self):
        assert account_display("not an account") == "not an account"


class TestNormalizeAccountNumber:
    def test_pads_and_verifies_a_printed_account(self):
        result = call("normalize_account_number", account=VALID_ACCOUNT)
        assert result["normalized"] == "265000123456789098"
        assert result["display"] == "265-0001234567890-98"
        assert result["checksum_valid"] is True

    def test_flags_a_misread_digit(self):
        result = call("normalize_account_number", account="265-1234567890-97")
        assert result["recognised"] is True
        assert result["checksum_valid"] is False
        assert "misread" in result["message"]

    def test_says_when_the_input_is_not_an_account_at_all(self):
        result = call("normalize_account_number", account="12345")
        assert result["recognised"] is False
        assert "normalized" not in result

    def test_is_advertised_as_read_only(self):
        annotations = tool_named("normalize_account_number").annotations
        assert annotations.read_only_hint is True


class TestValidatePayment:
    def test_accepts_a_well_formed_payment(self):
        result = call("validate_payment", **VALID)
        assert result["valid"] is True
        assert result["errors"] == []
        assert result["account_display"] == "265-0001234567890-98"

    def test_reports_every_error_not_just_the_first(self):
        result = call(
            "validate_payment",
            recipient_account="265-1234567890-97",
            recipient_name="",
            amount="0",
            payment_code="18",
        )
        assert result["valid"] is False
        assert {e["field"] for e in result["errors"]} == {
            "recipient_account",
            "recipient_name",
            "amount",
            "payment_code",
        }

    def test_a_warning_does_not_make_the_payment_invalid(self):
        result = call(
            "validate_payment", **VALID, reference_model="97", reference_number="911234567890"
        )
        assert result["valid"] is True
        assert result["warnings"]

    def test_the_schema_marks_only_four_fields_required(self):
        schema = tool_named("validate_payment").input_schema
        assert sorted(schema["required"]) == [
            "amount",
            "payment_code",
            "recipient_account",
            "recipient_name",
        ]

    def test_the_schema_tells_the_model_not_to_assume_a_payment_code(self):
        description = tool_named("validate_payment").input_schema["properties"]["payment_code"][
            "description"
        ]
        assert "ask the user" in description


class TestEncodePayment:
    def test_produces_the_spec_payload(self):
        result = call("encode_payment", **VALID)
        assert result["payload"] == (
            "K:PR|V:01|C:1|R:265000123456789098|N:Elektrodistribucija Beograd|I:RSD3450,00|SF:189"
        )

    def test_carries_optional_fields_and_cyrillic(self):
        result = call(
            "encode_payment",
            recipient_account="840-743324843-18",
            recipient_name="БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ",
            amount="5000",
            payment_code="253",
            reference_model="97",
            reference_number="08501265012043052",
        )
        assert "N:БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ" in result["payload"]
        assert result["payload"].endswith("RO:9708501265012043052")

    def test_refuses_a_bad_checksum_instead_of_encoding_it(self):
        message = call_expecting_error(
            "encode_payment", **{**VALID, "recipient_account": "265-1234567890-97"}
        )
        assert "Refusing" in message
        assert "recipient_account" in message

    def test_the_refusal_lists_every_problem_at_once(self):
        message = call_expecting_error(
            "encode_payment",
            recipient_account=VALID_ACCOUNT,
            recipient_name="",
            amount="0",
            payment_code="189",
        )
        assert "recipient_name" in message and "amount" in message

    def test_passes_warnings_along_with_the_payload(self):
        result = call(
            "encode_payment", **VALID, reference_model="97", reference_number="911234567890"
        )
        assert result["payload"]
        assert result["warnings"]


class TestParsePayload:
    def test_round_trips_what_encode_payment_produced(self):
        payload = call("encode_payment", **VALID, purpose="Racun za struju")["payload"]
        result = call("parse_payload", payload=payload)
        assert result["recognised"] is True
        assert result["fields"]["recipient_account"] == "265000123456789098"
        assert result["fields"]["amount"] == "3450.00"
        assert result["fields"]["purpose"] == "Racun za struju"
        assert result["validation"]["valid"] is True

    def test_says_when_the_text_is_not_a_payload(self):
        result = call("parse_payload", payload="https://example.com/pay")
        assert result["recognised"] is False
        assert "fields" not in result

    def test_validates_a_payload_that_parses_but_is_wrong(self):
        # Well-formed, but the account's control digits do not verify.
        result = call(
            "parse_payload",
            payload="K:PR|V:01|C:1|R:265000123456789097|N:Test|I:RSD10,00|SF:189",
        )
        assert result["recognised"] is True
        assert result["validation"]["valid"] is False


class TestListPaymentCodes:
    def test_lists_three_digit_codes_with_meanings(self):
        codes = call("list_payment_codes")["codes"]
        assert codes
        assert all(len(c["code"]) == 3 and c["code"].isdigit() for c in codes)
        assert all(c["meaning"] for c in codes)

    def test_includes_the_codes_people_actually_use(self):
        listed = {c["code"] for c in call("list_payment_codes")["codes"]}
        assert {"189", "221", "253"} <= listed

    def test_says_the_list_is_not_a_default(self):
        assert "not a default" in call("list_payment_codes")["note"]

    def test_takes_no_arguments(self):
        assert tool_named("list_payment_codes").input_schema.get("required", []) == []


class TestExtractFromText:
    def test_finds_the_fields_a_summons_states(self):
        result = call("extract_payment_from_text_content", text=SUMMONS)
        fields = result["fields"]
        assert fields["recipient_account"] == "840000074332484318"
        assert fields["recipient_name"] == "БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ"
        assert fields["amount"] == "10000.00"
        assert fields["reference_model"] == "97"
        assert result["account_display"] == "840-0000743324843-18"

    def test_reports_the_payment_code_as_missing_rather_than_guessing(self):
        # Nothing on a summons states a sifra placanja.
        result = call("extract_payment_from_text_content", text=SUMMONS)
        assert "payment_code" not in result["fields"]
        assert result["missing_required"] == ["payment_code"]

    def test_flags_low_confidence_fields_for_review(self):
        result = call("extract_payment_from_text_content", text=SUMMONS)
        # The account passed its checksum; the name is a label match only.
        assert "recipient_account" not in result["needs_review"]
        assert "recipient_name" in result["needs_review"]

    def test_everything_is_missing_when_nothing_is_found(self):
        result = call("extract_payment_from_text_content", text="The quick brown fox.")
        assert result["fields"] == {}
        assert len(result["missing_required"]) == 4
        assert result["notes"]

    def test_tells_the_assistant_to_confirm_with_the_user(self):
        result = call("extract_payment_from_text_content", text=SUMMONS)
        assert "confirm" in result["next_step"]


needs_pdftotext = pytest.mark.skipif(
    shutil.which("pdftotext") is None, reason="needs poppler's pdftotext on PATH"
)

PDF_LINES = [
    "PREKRSAJNI NALOG",
    "Uplatu izvrsiti u korist: BUDZET REPUBLIKE SRBIJE,",
    "na racun broj 840-743324843-18",
    "sa pozivom na broj 08501265012043052 model 97",
    "novcana kazna u fiksnom iznosu od 10000 dinara",
]


class TestExtractFromPdf:
    @needs_pdftotext
    def test_reads_a_pdf_from_disk(self, tmp_path):
        pdf = tmp_path / "nalog.pdf"
        pdf.write_bytes(minimal_pdf(PDF_LINES))
        result = call("extract_payment_from_pdf", path=str(pdf))
        assert result["fields"]["recipient_account"] == "840000074332484318"
        assert result["fields"]["amount"] == "10000.00"
        assert result["source"] == str(pdf)
        assert result["missing_required"] == ["payment_code"]

    @needs_pdftotext
    def test_explains_a_pdf_with_no_text_layer(self, tmp_path):
        pdf = tmp_path / "scan.pdf"
        pdf.write_bytes(minimal_pdf([]))
        result = call("extract_payment_from_pdf", path=str(pdf))
        assert result["fields"] == {}
        assert any("no text layer" in note for note in result["notes"])

    def test_refuses_a_file_that_is_not_a_pdf(self, tmp_path):
        other = tmp_path / "notes.txt"
        other.write_text("racun 840-743324843-18")
        message = call_expecting_error("extract_payment_from_pdf", path=str(other))
        assert "Not a PDF" in message

    def test_says_when_the_file_does_not_exist(self, tmp_path):
        message = call_expecting_error("extract_payment_from_pdf", path=str(tmp_path / "no.pdf"))
        assert "No such file" in message


class TestGenerateQr:
    def test_returns_a_summary_and_a_png(self):
        result = call_raw("generate_qr", **VALID)
        kinds = [block.type for block in result.content]
        assert kinds == ["text", "image"]
        assert result.content[1].mime_type == "image/png"

    def test_the_image_scans_back_to_the_payload_it_reports(self):
        result = call_raw("generate_qr", **VALID)
        summary = json.loads(result.content[0].text)
        png = base64.b64decode(result.content[1].data)
        assert decode_qr(png) == summary["payload"]

    def test_cyrillic_survives_into_the_image(self):
        result = call_raw(
            "generate_qr",
            recipient_account="840-743324843-18",
            recipient_name="БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ",
            amount="5000",
            payment_code="253",
        )
        png = base64.b64decode(result.content[1].data)
        assert "БУЏЕТ РЕПУБЛИКЕ СРБИЈЕ" in decode_qr(png)

    def test_reminds_the_user_to_check_in_their_banking_app(self):
        summary = json.loads(call_raw("generate_qr", **VALID).content[0].text)
        assert "banking" in summary["reminder"]

    def test_refuses_to_draw_an_invalid_payment(self):
        message = call_expecting_error(
            "generate_qr", **{**VALID, "recipient_account": "265-1234567890-97"}
        )
        assert "Refusing" in message
