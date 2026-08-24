## What and why

<!-- What changes, and what problem it solves. The diff already says how. -->

## Checks

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- [ ] `ruff check .` and `pytest -q` in `python/` (if Python changed)
- [ ] New behaviour has a test; a fix has a test that failed before it

## If this touches the spec

`src/core` and `python/ips_qr` implement the same specification and their test
suites mirror each other.

- [ ] Both implementations changed, **or** the divergence is explained below

## If this touches extraction

- [ ] No field is guessed when it is not present in the source
- [ ] Confidence scores reflect actual certainty
- [ ] Any fixture added is redacted — no real account numbers, names or addresses

<!--
Reminder: never paste an unredacted payment document into a PR, including in
test fixtures or screenshots. See CONTRIBUTING.md.
-->
