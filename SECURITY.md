# Security policy

## Reporting a vulnerability

Email **nemanja@vujic.ai**. Please do not open a public issue for a security
problem — a public report is visible to everyone before there is a fix.

Include what you did, what happened, and what you expected. A minimal
reproduction is worth more than a long description. If a proof of concept
involves a real payment document, redact it first (see below).

You should get an acknowledgement within a few days. This is a small project
maintained by one person in their spare time, so please be patient with the
timeline — the response will be honest about it rather than silent.

## Supported versions

The `main` branch is the only supported version. This project has not reached
1.0 and there are no maintenance branches.

## What counts as a vulnerability here

This project handles payment instructions, so the interesting failure mode is
not "server compromised" — it is **a QR code that pays the wrong recipient**.

Reports especially worth making:

- **Silent field corruption.** Any input that produces a payload whose
  recipient account, amount, or reference differs from the source document
  *without* validation flagging it. The account is checksum-protected; the
  amount and reference are not.
- **Validation bypass.** A payment that `validatePayment` / `validate_payment`
  calls valid but that encodes to a malformed or misleading payload — for
  example, injection of the `|` tag separator or a newline into a field,
  shifting every field after it.
- **Checksum weaknesses.** Anything that makes `isValidAccountChecksum` accept
  an invalid account, including precision problems on the 18-digit value.
- **Key or image leakage.** `ANTHROPIC_API_KEY` reaching the browser, or an
  uploaded image being persisted, logged, or sent anywhere other than the
  configured provider.

## Known and accepted

These are documented limitations, not vulnerabilities. Reporting them is fine,
but they are already understood:

- **Extraction is unreliable by design.** OCR and vision models misread digits.
  This is why nothing renders until a human reviews the form, and why no QR is
  produced for a payment that fails validation. An extractor returning a wrong
  value is expected behaviour, not a security bug.
- **`/api/extract` has no rate limiting or authentication.** This is a
  repo-only reference project and is not deployed anywhere. If you deploy it
  yourself, put a rate limit in front of that endpoint before exposing it —
  every request spends your own Anthropic credit.
- **Generated codes are not verified against the official NBS validator.**
  See the known limitations in the README.

## Scope

The code in this repository. There is no deployed instance to test against,
and there is no bug bounty.
