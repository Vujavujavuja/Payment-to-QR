"""Heuristics that pull payment fields out of free document text.

Everything here is best-effort by design. The output is meant to be *reviewed*
in a form, never used directly: a wrong guess costs the user one correction,
while a missing field costs full retyping, so low-confidence values are still
returned — clearly marked — rather than dropped.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field

from ..constants import IPS_FIELD_LIMITS
from ..format import digits_only, normalize_account, normalize_amount, sanitize_text
from ..types import IpsPayment
from ..validate import is_valid_account_checksum

#: Serbian Cyrillic -> Latin, so label matching needs only one alphabet.
#: Documents are printed in either script and OCR frequently mixes them within
#: a single page, which would otherwise double every label pattern below.
CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "dj", "е": "e",
    "ж": "z", "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj",
    "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s",
    "т": "t", "ћ": "c", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "c",
    "џ": "dz", "ш": "s",
}

_LATIN_DIACRITICS = {"š": "s", "ć": "c", "č": "c", "ž": "z", "đ": "dj"}


def _fold_char(ch: str) -> str:
    lowered = ch.lower()
    return CYRILLIC_TO_LATIN.get(lowered) or _LATIN_DIACRITICS.get(lowered) or lowered


def fold_script(value: str) -> str:
    """Fold script and diacritics so ``šifra``, ``sifra`` and ``шифра`` all match."""
    return "".join(_fold_char(ch) for ch in (value or ""))


def fold_with_offsets(value: str) -> tuple[str, list[int]]:
    """Fold, and return a map from each folded index back to the raw index.

    Folding is *not* length-preserving — ``ђ``, ``љ``, ``њ`` and ``џ`` each
    become two Latin characters. Slicing the raw string with an offset found in
    the folded string is therefore wrong for any line containing them, which in
    Serbian Cyrillic is common (``БУЏЕТ`` alone shifts everything after it by
    one). The offset map keeps the two coordinate systems in sync.
    """
    folded: list[str] = []
    offsets: list[int] = []
    for raw_index, ch in enumerate(value or ""):
        for folded_char in _fold_char(ch):
            folded.append(folded_char)
            offsets.append(raw_index)
    offsets.append(len(value or ""))  # sentinel, so offsets[len(folded)] is valid
    return "".join(folded), offsets


#: Any 18-digit account, hyphenated or not.
ACCOUNT_PATTERN = re.compile(r"\b\d{3}[-\s]?\d{1,13}[-\s]?\d{2}\b|\b\d{18}\b")


def _p(*alternatives: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(a) for a in alternatives)


#: Labels that introduce a field, in priority order — the first pattern that
#: matches anywhere wins, before a later one is tried at all.
#:
#: Priority is what separates a label from a false friend. ``korisnik`` is a
#: real label on bank slips ("korisnik računa"), but on a police summons it
#: first appears in "korisniku vozila" — the *driver*, not the payee. Trying
#: the unambiguous ``u korist`` ("in favour of") first resolves that without
#: having to blacklist anything.
#:
#: Patterns match folded text and deliberately have no trailing word boundary:
#: Serbian inflects labels ("iznos" -> "iznosu", "svrha" -> "svrhu").
LABELS: dict[str, tuple[re.Pattern[str], ...]] = {
    "recipient_account": _p(
        r"\bracun\s+primaoca", r"\bracun\s+za\s+uplatu", r"\bprimalac\s+racun",
        r"\bna\s+racun(\s+broj)?", r"\bracun\s+broj",
    ),
    "recipient_name": _p(
        r"\bu\s+korist", r"\bprimalac", r"\bpoverilac", r"\bkorisnik",
    ),
    "payer_name": _p(r"\bplatilac", r"\buplatilac", r"\bduznik"),
    "amount": _p(
        r"\bza\s+uplatu", r"\bnovcan[aou]\s+kazn[aeiu]", r"\biznos", r"\bukupno", r"\bsvega",
    ),
    "payment_code": _p(r"\bsifra\s+placanja", r"\bsifra"),
    "purpose": _p(r"\bu\s+svrhu\s+placanja", r"\bsvrh[au]", r"\bsvrha"),
    "reference_model": _p(r"\bmodel"),
    "reference_number": _p(
        r"\bsa\s+pozivom\s+na\s+broj", r"\bpoziv\s+na\s+broj", r"\bpozivnabroj", r"\bpnb",
    ),
}

#: Every pattern, for "where does the next label start" checks.
_ALL_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    pattern for patterns in LABELS.values() for pattern in patterns
)


@dataclass
class ExtractionResult:
    """Only the fields the extractor actually found. Never fabricated."""

    payment: IpsPayment = field(default_factory=IpsPayment)
    #: Per-field confidence in [0, 1]. Anything below 0.7 is flagged for review.
    confidence: dict[str, float] = field(default_factory=dict)
    #: Non-fatal notes worth surfacing (low quality, ambiguous amount, ...).
    notes: list[str] = field(default_factory=list)
    #: Which fields were populated at all.
    found: list[str] = field(default_factory=list)
    provider: str = "text"
    raw_text: str = ""


@dataclass(frozen=True, slots=True)
class _Line:
    raw: str
    folded: str
    #: folded index -> raw index
    offsets: list[int]


def _to_lines(text: str) -> list[_Line]:
    lines = []
    for raw in (text or "").splitlines():
        stripped = raw.strip()
        if stripped:
            folded, offsets = fold_with_offsets(stripped)
            lines.append(_Line(raw=stripped, folded=folded, offsets=offsets))
    return lines


#: Leading punctuation between a label and its value. NBSP is explicit
#: because PDF text extraction emits it and it is invisible in source.
_VALUE_LEAD = " \t:.\u2013-\u00a0"


def _value_after(line: _Line, match: re.Match[str]) -> tuple[str, bool]:
    """Text belonging to a label: everything up to the next label on the line.

    A prose document puts several labels on one line — "u korist: X, u svrhu
    placanja: Y na racun broj Z" — so taking the rest of the line would swallow
    the next two fields into this one.

    Returns ``(value, ran_to_end_of_line)``; the flag tells the caller whether
    the value may have been cut off by a line wrap rather than by a label.
    """
    start_folded = match.end()
    cut_folded = len(line.folded)
    for pattern in _ALL_PATTERNS:
        following = pattern.search(line.folded, start_folded)
        if following:
            cut_folded = min(cut_folded, following.start())

    raw_start = line.offsets[start_folded]
    raw_end = line.offsets[cut_folded]
    value = line.raw[raw_start:raw_end].lstrip(_VALUE_LEAD).rstrip(" ,;:").strip()
    return value, cut_folded == len(line.folded)


def _value_for_label(
    lines: list[_Line],
    patterns: tuple[re.Pattern[str], ...],
    accept: Callable[[str], bool] | None = None,
    join_wrapped: bool = False,
) -> str | None:
    """Read the value belonging to a label.

    Patterns are tried in priority order across the whole document before the
    next pattern is considered. Within a pattern, the value sits either to the
    right of the label or directly below it, depending on layout, so both are
    tried.

    ``accept`` lets a caller reject a syntactically-present but unusable value
    and keep searching. This matters on prose: "novcana kazna u fiksnom iznosu
    od 10000 dinara" matches the *kazna* label first, but the text between it
    and the next label ("u fiksnom") holds no number — without a predicate the
    search would stop there and fall through to a much worse guess.

    ``join_wrapped`` appends the following line when the value ran to the end
    of its own line and the next line carries no label. Only safe for free-text
    fields; joining numeric fields would splice unrelated digits together.
    """
    for pattern in patterns:
        for i, line in enumerate(lines):
            match = pattern.search(line.folded)
            if not match:
                continue

            value, ran_to_end = _value_after(line, match)

            if value and join_wrapped and ran_to_end and i + 1 < len(lines):
                nxt = lines[i + 1]
                if not any(p.search(nxt.folded) for p in _ALL_PATTERNS):
                    value = f"{value} {nxt.raw}".strip()

            if value and (accept is None or accept(value)):
                return value

            # Value wrapped to the next line; skip a line that is only a label.
            if not value and i + 1 < len(lines):
                nxt = lines[i + 1]
                if not any(p.search(nxt.folded) for p in _ALL_PATTERNS) and (
                    accept is None or accept(nxt.raw)
                ):
                    return nxt.raw
    return None


def _find_account(text: str, lines: list[_Line]) -> tuple[str, float] | None:
    """Pull the most plausible account out of free text."""
    labelled = _value_for_label(lines, LABELS["recipient_account"])
    candidates: list[str] = []
    if labelled:
        candidates += [m.group(0) for m in ACCOUNT_PATTERN.finditer(labelled)]
    candidates += [m.group(0) for m in ACCOUNT_PATTERN.finditer(text or "")]

    # A checksum-valid candidate beats a positionally-lucky one: documents are
    # full of digit runs that look like accounts but are dates or case numbers.
    normalized = [n for n in (normalize_account(c) for c in candidates) if n]

    for candidate in normalized:
        if is_valid_account_checksum(candidate):
            return candidate, 0.95
    if normalized:
        return normalized[0], 0.4
    return None


_DECIMAL_TOKEN = re.compile(r"\d[\d.,]*\d|\d")
#: Cents must be the *last* thing in the token: "3.450,00" qualifies,
#: "30.04.2027" does not.
_HAS_CENTS = re.compile(r"[.,]\d{2}\.?$")
#: dd.mm.yyyy and friends. Dates are the most common false positive on any
#: official document, and they parse into enormous, plausible-looking amounts.
_DATE_TOKEN = re.compile(r"^\d{1,2}[.,]\d{1,2}[.,]\d{2,4}\.?$")


def _parses_as_amount(value: str) -> bool:
    normalized = normalize_amount(value)
    return normalized is not None and float(normalized) > 0


def _find_amount(lines: list[_Line]) -> tuple[str, float] | None:
    labelled = _value_for_label(lines, LABELS["amount"], accept=_parses_as_amount)
    if labelled:
        normalized = normalize_amount(labelled)
        if normalized and float(normalized) > 0:
            return normalized, 0.8

    # Fall back to the largest decimal-looking number on the page. Totals are
    # usually the biggest figure present, and a wrong guess is visible and
    # trivially corrected in the form.
    numbers = [
        token
        for line in lines
        for token in _DECIMAL_TOKEN.findall(line.raw)
        if _HAS_CENTS.search(token) and not _DATE_TOKEN.match(token)
    ]
    parsed = sorted(
        (n for n in (normalize_amount(t) for t in numbers) if n and float(n) > 0),
        key=float,
        reverse=True,
    )
    return (parsed[0], 0.35) if parsed else None


def extract_payment_from_text(text: str, provider: str = "text") -> ExtractionResult:
    """Turn document text into a partial payment."""
    lines = _to_lines(text)
    result = ExtractionResult(provider=provider, raw_text=text or "")
    payment = result.payment

    def record(name: str, value: str, score: float) -> None:
        setattr(payment, name, value)
        result.confidence[name] = score
        result.found.append(name)

    account = _find_account(text, lines)
    if account:
        record("recipient_account", account[0], account[1])
        if account[1] < 0.5:
            result.notes.append("Account control digits did not verify — please check it.")

    amount = _find_amount(lines)
    if amount:
        record("amount", amount[0], amount[1])
        if amount[1] < 0.5:
            result.notes.append("Amount was inferred from the largest figure on the page.")

    for name, limit, score in (
        ("recipient_name", IPS_FIELD_LIMITS["recipient_name"], 0.6),
        ("payer_name", IPS_FIELD_LIMITS["payer_name"], 0.6),
        ("purpose", IPS_FIELD_LIMITS["purpose"], 0.6),
    ):
        value = _value_for_label(lines, LABELS[name], join_wrapped=True)
        if value:
            record(name, sanitize_text(value, limit), score)

    # Numeric fields carry an exact-width predicate rather than truncating
    # whatever the label happened to sit next to. "model" is the cautionary
    # case: on a vehicle summons it first appears in "marke X model Y" — the
    # car's model, not the reference model — and slicing the first two digits
    # out of a registration plate yields a confident, wrong "00".
    code = _value_for_label(
        lines, LABELS["payment_code"], accept=lambda v: len(digits_only(v)) == 3
    )
    if code:
        record("payment_code", digits_only(code), 0.7)

    model = _value_for_label(
        lines, LABELS["reference_model"], accept=lambda v: len(digits_only(v)) == 2
    )
    if model:
        record("reference_model", digits_only(model), 0.6)

    reference = _value_for_label(
        lines, LABELS["reference_number"], accept=lambda v: len(digits_only(v)) >= 3
    )
    if reference:
        cleaned = re.sub(
            r"[^\d-]", "", sanitize_text(reference, IPS_FIELD_LIMITS["reference_number"])
        )
        if cleaned:
            record("reference_number", cleaned, 0.5)

    if not result.found:
        result.notes.append(
            "Nothing recognisable was found — the document may not contain a payment."
        )

    return result
