# Contributing

Thanks for looking. This project has one rule that matters more than the rest,
so it goes first.

## Never post a real payment document

Issues here naturally involve slips, invoices and summonses. Those carry account
numbers, names, addresses, and sometimes vehicle plates or case numbers — other
people's as well as your own. A public issue is permanent and indexed.

Before attaching anything:

- **Replace, don't blur.** Blurring is reversible often enough to matter, and
  a redaction box on a JPEG is a black rectangle over intact pixels only if you
  re-encode. Retype the value as `000-0000000000-00` instead.
- **Keep the shape, drop the content.** What the heuristics need is the layout
  and the wording: which labels appear, in what order, how the value wraps. The
  digits themselves are irrelevant to the bug.
- **Prefer text over images.** Paste the extracted text rather than the photo.
  `ips-qr --pdf yours.pdf --show-text` prints exactly what the extractor sees.

Fields worth replacing: account numbers, reference numbers, personal and company
names, addresses, phone numbers, case and invoice numbers, vehicle plates,
dates of birth. The *public* account of an institution — the Republic budget
account on every traffic fine, for instance — is fine to keep.

If you post something by accident, email **nemanja@vujic.ai** rather than just
deleting the comment. Deleted comments remain in the events API for a while,
and forks and notification emails keep their own copies.

## What is most useful

**Documents that extract badly.** Real layouts vary far more than any fixture,
and a failing example is the fastest way to improve the heuristics. Redact it,
paste the text, say what you expected. This is the single most valuable
contribution to this project and needs no code.

**The known limitations.** The README lists them. They are real work, not
disclaimers.

**Backporting the Python fixes.** `python/README.md` documents three bugs that
the port fixed and the TypeScript still has. Each is self-contained.

## Getting set up

The repository holds two implementations of the same spec.

### TypeScript (the web app and `src/core`)

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run build        # catches App Router / boundary errors the above miss
```

No configuration and no API key. OCR runs in the browser.

### Python (`python/`)

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

```bash
ruff check .
pytest -q
```

`pdftotext` (poppler) provides PDF input — `brew install poppler` or
`apt install poppler-utils`. It is not optional in CI: the suite fails if any
test is skipped, because a silently skipped test is how a whole code path rots.

## The two implementations

`src/core` and `python/ips_qr` implement the same specification and their test
suites deliberately mirror each other. A behavioural change to one should
change the other, or the divergence should be explained in the commit message.

They are not required to stay identical — the Python port intentionally fixes
things the TypeScript has not caught up with yet — but silent drift is a bug.

## Adding an extractor

Implement `Extractor` from `src/extract/types.ts` and register it in
`src/extract/index.ts`. Two rules:

1. **Only report what you found.** Leave a field out rather than guessing at
   it. A fabricated field is worse than a blank one, because the user will not
   think to check it.
2. **Score your confidence honestly.** Anything below `0.7` is flagged in the
   UI for review. A flat `1.0` defeats the safety net.

The same applies to a heuristic in `python/ips_qr/extract/normalize.py`: if a
label matches but the value is unusable, keep searching rather than recording
something that merely has the right shape.

## Adding a test fixture

Fixtures live in `python/tests/fixtures/` as plain text. Redact first, keep the
line wrapping — several bugs have been about values split across a line break
or three labels sharing one line, and reflowing the text hides them.

## Pull requests

- Branch off `main`. Any branch name is fine.
- Keep `npm test`, `npm run typecheck`, `ruff check` and `pytest` green. CI
  runs all of them on every push, across Python 3.10–3.13.
- One logical change per commit. The history here is deliberately granular —
  see `git log` — and it is much easier to review a series than one large diff.
- Commit messages: `type(scope): summary` in the imperative, then a body
  explaining *why*. `feat(core):`, `fix(ui):`, `test(python):`, `ci:`, `docs:`.
- Explain the reasoning in the body, not the mechanics. The diff already says
  what changed.

New behaviour needs a test. A bug fix needs a test that fails before it.

## Reporting a security issue

Do not open a public issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the MIT
Licence, the same as the rest of the project.
