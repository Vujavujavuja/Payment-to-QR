# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-24

First tagged release. Two implementations of the NBS IPS QR specification, a
web app in front of one of them, and CI that verifies both.

### Added

**Core library (TypeScript, `src/core`)**

- IPS QR payload encoding, with optional tags omitted rather than emitted empty.
- Payment validation separating errors (the payload would be wrong) from
  warnings (suspicious but encodable).
- ISO 7064 MOD 97-10 account checksums, computed with `BigInt` — an 18-digit
  account exceeds `Number.MAX_SAFE_INTEGER`, and in floating point the check
  silently accepts invalid accounts.
- Account normalisation that expands `265-1234567890-98` segment by segment.
  Stripping the hyphens yields 16 digits, and padding the wrong end produces a
  different, valid-looking account.
- Amount parsing that disambiguates `1.234,56` from `1,234.56` by separator
  position rather than assuming a locale.
- Payload parsing, for round-trip tests and for editing a code someone else
  generated.
- QR rendering to PNG data URL and SVG.

**Extraction (TypeScript, `src/extract`)**

- Provider interface with per-field confidence scores.
- In-browser Tesseract OCR — the default, needing no key and keeping the image
  on the device.
- Optional Claude vision extractor, opt-in and server-side only.
- Serbian Cyrillic/Latin script folding, so labels match in either alphabet.

**Web app**

- Read → check → scan flow. The review step is not skippable: no QR renders
  until the payment passes validation.
- Image input by camera, file, drag and drop, or pasted screenshot.
- Fields the extractor was unsure about are flagged for review.
- PNG, SVG and raw payload export.

**Python port (`python/ips_qr`)**

- Full port of the core library. Dependency-free except QR rendering, whose
  import is deferred.
- Text and PDF extraction, with `pdftotext` as the PDF backend.
- `ips-qr` command line interface.
- 71 tests, including a round trip that renders a real PNG and decodes it with
  OpenCV — an independent decoder, so the test does not grade its own homework.

**Project**

- CI across Node and Python 3.10–3.13. The run fails if any test is skipped,
  because a silently skipped test is how a code path rots.
- ESLint, contributor documentation, issue and pull request templates, and a
  security policy.

### Fixed

Found by running a real Serbian traffic-fine summons through the extractor.
All three exist in the TypeScript and are fixed in the Python port only; see
[#2](https://github.com/Vujavujavuja/Payment-to-QR/issues/2) for the backport.

- **Fold offsets on Cyrillic.** Folding is not length-preserving — `ђ`, `љ`,
  `њ` and `џ` each become two Latin characters — so an offset found in the
  folded string is not an offset into the raw string. `БУЏЕТ` alone was enough
  to misplace every field after it on a line.
- **Label priority.** `korisnik` means the payee on a bank slip and the driver
  on a police summons, where it appears first; the extractor returned the car
  as the recipient. Patterns are now tried most-specific first.
- **Label match treated as a usable value.** Numeric fields now carry an
  exact-width predicate and the search continues when it fails —
  `novcana kazna u fiksnom iznosu od 10000` matches the *kazna* label at a
  point where no number follows, and `marke X model Y` is a car rather than a
  reference model.
- **`RO` tag slicing.** A tag shorter than three characters is treated as
  absent rather than sliced, so `RO:9` no longer yields reference model `9`.
- **Dates read as amounts.** `30.04.2027` parsed to a confident `30042027.00`.
- **`lang="sr"` on an English interface**, which made screen readers pronounce
  English text with a Serbian voice. Serbian copy is tracked in
  [#3](https://github.com/Vujavujavuja/Payment-to-QR/issues/3).
- **Required-field errors on an untouched form**, which read as broken rather
  than as guidance.

[Unreleased]: https://github.com/Vujavujavuja/Payment-to-QR/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Vujavujavuja/Payment-to-QR/releases/tag/v0.1.0
