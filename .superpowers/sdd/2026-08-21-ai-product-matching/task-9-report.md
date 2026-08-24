# Task 9 Verification Report

## Scope

- Worktree: `/Users/vera/Documents/New project/dowsure-command-center/.worktrees/ai-product-matching`
- Branch: `feature/ai-product-matching`
- Task 9 base: `eab28cf1353ca8637490a5d5641a7bdcfd796163`
- Verification date: 2026-08-24 (Asia/Shanghai)
- No deployment, push, merge, production server change, or DNS change was performed.

## Golden profile coverage

`test/fixtures/customerProfiles.js` exports 25 uniquely named, recursively frozen profile
literals. The matcher test clones every profile before matching, runs every profile twice,
and asserts deterministic output, no input mutation, at most three ranks, no ineligible
recommendation, and the declared primary product or explicit absence of a recommendation.

Coverage is satisfied jointly by the focused eligibility tests and golden profiles, as
defined by the SDD ledger ruling:

| Coverage class | Evidence |
| --- | --- |
| Passing | One explicit qualified golden profile for each of all seven products; the declared primaries cover `PRODUCT_IDS` exactly. |
| Boundary | Inclusive golden cases for CMB, Ping An Orange, Ping An logistics, and WeBank; exclusive no-recommendation cases for Amazon SC, Amazon VC, and B2B factoring; focused eligibility tests assert the individual rule boundaries. |
| Missing data | `matchProducts({})` asserts all seven products are `needs_information`; explicit golden cases cover missing Amazon history, missing prior-year import/export volume, and missing WeBank AHR score. |
| Hard failure | The `all-products-explicit-hard-failure` golden profile is asserted to make all seven products ineligible; focused and named golden failures cover bank count, customs classification, exclusive thresholds, and rejected account control. |
| Required special cases | Multi-product ranking, USD/RMB preference mismatch, sensitive industry review, excessive bank count, customs failure, Amazon non-US site fallback, and rejected account-control consent are all explicit named profiles. |

Focused command after tightening the coverage assertions:

```text
node --test test/productMatcher.test.js
32 tests, 32 passed, 0 failed
```

## Automated regressions

Complete command:

```text
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/*.test.js
133 tests, 133 passed, 0 failed
```

This includes catalog, normalization, eligibility, amount estimation, matching, report,
schema/lifecycle, HTTP compatibility, API persistence, bundle privacy, admin, and export
regressions. In particular, the suite passed the unauthenticated admin/export rejection,
authenticated internal evidence, empty export selection rejection, selected-only export,
public-response privacy, and modern/legacy bundle privacy tests. The localhost API tests
were run outside the filesystem sandbox because sandboxed loopback binding returns
`listen EPERM`.

## Production build

Command:

```text
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
```

Vite 6.4.2 transformed 41 modules and completed without errors. Output evidence:

| Output | Size | Gzip |
| --- | ---: | ---: |
| `dist/assets/index-CZ6t703t.js` | 256.90 kB | 79.51 kB |
| `dist/assets/polyfills-V-gmNPkf.js` | 69.86 kB | 26.47 kB |
| `dist/assets/index-legacy-Cu4b7lZ3.js` | 308.90 kB | 90.22 kB |
| `dist/assets/polyfills-legacy-BM1tryXK.js` | 77.90 kB | 29.47 kB |
| `dist/assets/index-CTphY4Jx.css` | 54.77 kB | 11.18 kB |

The generated `dist` directory was removed after verification.

## Browser verification

The requested `playwright-cli` executable was unavailable (`command not found`). Per the
Task 9 fallback instruction, verification used the locally installed Playwright 1.61.1
package and bundled Chromium in one deterministic script. The script used a temporary
lead store under `/private/tmp`, retained screenshots only as in-memory PNG buffers, and
closed the browser and loopback server in `finally`.

Each flow completed the real five-step complex form, submitted through `POST /api/leads`,
compared rendered primary/alternative names with the response order, checked summary and
disclaimer text, and scanned the customer UI for internal labels. Layout checks measured
document overflow, direct-child intersections in form/result layout groups, and clipped
text. All results had zero horizontal overflow, zero overlaps, zero clipped-text findings,
and zero console or page errors.

| Flow | Viewport | Ranked product IDs | PNG buffer |
| --- | --- | --- | ---: |
| Amazon SC | 1440x900 | Amazon SC, WeBank data loan, CMB business loan | 4,363,673 bytes |
| Foreign trade | 1440x900 | Ping An logistics, CMB business loan, Ping An Orange | 4,227,256 bytes |
| Amazon SC | 390x844 | Amazon SC, WeBank data loan, CMB business loan | 2,495,820 bytes |
| Foreign trade | 390x844 | Ping An logistics, CMB business loan, Ping An Orange | 2,481,713 bytes |
| Amazon SC | 375x667 | Amazon SC, WeBank data loan, CMB business loan | 2,447,477 bytes |
| Foreign trade | 375x667 | Ping An logistics, CMB business loan, Ping An Orange | 2,435,673 bytes |

The response scan found no private matching keys, credentials, or entered contact/customer
values. The customer result text contained no internal scores, confidence, raw status
labels, failed-rule labels, formula keys, rule versions, or advisor priority.

### Legacy mobile check

At 375x667 with an iPhone Safari 13.1 user agent, the server returned legacy-only HTML.
Chromium requested `index-legacy-Cu4b7lZ3.js` and
`polyfills-legacy-BM1tryXK.js`, did not request the modern application bundle, and rendered
a nonblank page with 2,825 body-text characters, a 15,303 px root height, and an 86,109
byte viewport PNG buffer. The check recorded zero horizontal overflow, overlaps, console
errors, or page errors.

Physical Safari limitation: no physical iPhone, iOS 10 device, or WebKit/Safari runtime was
available. The legacy evidence therefore confirms server bundle selection and execution in
Chromium under an iPhone Safari user agent; it does not replace a physical Safari/iOS 10
compatibility run.

## Cleanup and repository checks

- The temporary Playwright verifier, temporary lead directory, in-memory captures, and generated `dist` output were removed.
- No `.playwright-cli`, Playwright report, test result, screenshot, video, archive, or `server/data/leads.json` artifact remains from Task 9.
- `git diff --check` and `git diff --cached --check` completed without errors before staging the final report.
- The intended Task 9 content uses synthetic profiles and placeholder command examples only; no real customer data or credentials are included.
