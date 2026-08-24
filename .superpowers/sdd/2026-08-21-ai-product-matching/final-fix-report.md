# AI Product Matching Final-Fix Report

## Scope

- Worktree: `/Users/vera/Documents/New project/dowsure-command-center/.worktrees/ai-product-matching`
- Branch: `feature/ai-product-matching`
- Review base: `bda0c996f2f516d92e04b88f345884c7c587ab9e`
- Verification date: 2026-08-24 (Asia/Shanghai)
- Containing commit message: `fix: harden product matching readiness`
- No push, merge, deployment, production/DNS operation, or production-data migration was performed.

## Findings Resolved

### Critical

1. Intake and catalog reachability now expose canonical, schema-compatible inputs for
   Amazon SC, Amazon VC, B2B factoring, wholesale/import-export logistics, and simple
   profiles. This includes VC GMV, account-control alternatives, controller experience,
   product-source negatives and exemptions, canonical buyer type/country review states,
   and all logistics dependencies. Repeatable tests submit values through the actual
   five-step intake schema and prove truthful eligible, ineligible, and incomplete results.
2. Customer presentation is now derived on the server/report boundary. Only eligible,
   sufficiently evidenced matches can be labelled `优先匹配` or `备选方向` and retain an
   amount. Incomplete results are `可能方向` or `待补信息`, with numeric amounts suppressed.
   Public payloads and bundles do not expose confidence, scores, raw statuses, versions,
   failures, snapshots, formula keys, or internal reasons.

### Important and Minor

- Matching uses six catalog-owned fit dimensions with neutral non-applicable handling and
  explicit comparisons for amount/limits, purpose, repayment, currency, term, operating
  scale, and control signals. Boundary and ranking-order regressions are committed.
- Exact and range amounts render numeric values before notes; manual estimates remain
  note-only.
- WeBank broad credit/judicial negatives and the Amazon SC compatible-account exemption
  are explicit source fields with pass, fail, and unknown tests.
- Composite/custom eligibility evidence reports the actual missing dependency paths.
- Intake submission uses request versions plus cancellation where available; a mounted
  React/real-Chrome test proves stale responses cannot restore prior results, including
  the no-`AbortController` fallback.
- API hardening covers same/configured-origin CORS, JSON-only POSTs, allowlisted persisted
  inputs, minimal estimator snapshots, 0600 store permissions, generic public 500 errors
  with server-side detail logging, deterministic 413 JSON responses with connection close,
  and `Cache-Control: no-store` on authenticated lead/admin/export responses.
- The authenticated admin page supports search/customer, product, status, amount, currency,
  institution, and date filters. Export remains explicitly selection-only and is covered
  through the UI contract and API integration.
- Public target-profile punctuation was normalized and projection-tested.
- README and maintenance guidance document the changed contracts, the single-process queue,
  configured CORS, presentation tiers, storage boundaries, and browser limitations.

## Changed Files

Core matching and presentation:

- `src/lib/matching/customerProfile.js`
- `src/lib/matching/intakeSchema.js`
- `src/lib/matching/productCatalog.js`
- `src/lib/matching/productMatcher.js`
- `src/lib/matching/reportBuilder.js`
- `src/lib/matching/ruleEvaluator.js`
- `src/lib/productMatchView.js`
- `src/components/FinancingIntake.jsx`
- `src/components/ProductMatchCenter.jsx`
- `src/lib/http/jsonRequest.js`
- `src/styles.css`

Server, storage, and admin:

- `server/index.mjs`

Regression coverage:

- `test/intakeBrowserLifecycle.test.js`
- `test/intakeReachability.test.js`
- `test/bundlePrivacy.test.js`
- `test/customerProfile.test.js`
- `test/fixtures/customerProfiles.js`
- `test/intakeSchema.test.js`
- `test/jsonRequest.test.js`
- `test/productCatalog.test.js`
- `test/productEligibility.test.js`
- `test/productMatchView.test.js`
- `test/productMatcher.test.js`
- `test/reportBuilder.test.js`
- `test/ruleEvaluator.test.js`
- `test/serverLead.test.js`

Documentation:

- `README.md`
- `docs/product-rule-maintenance.md`
- `.superpowers/sdd/2026-08-21-ai-product-matching/final-fix-report.md`

## Verification Evidence

Full Node suite, run outside the filesystem sandbox so loopback server and installed Chrome
coverage could execute:

```text
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
175 tests, 175 passed, 0 failed, 0 skipped
```

Focused schema/browser evidence:

```text
node --test test/intakeReachability.test.js test/intakeBrowserLifecycle.test.js
6 tests, 6 passed, 0 failed
```

Those six tests cover Amazon SC exemption, Amazon VC, B2B eligible/review states,
wholesale/logistics, the simple incomplete path, and mounted-component stale-response
protection. The lifecycle case used installed Google Chrome 151 through direct CDP and did
not add a browser-test framework dependency.

Production build:

```text
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
vite v6.4.2; 41 modules transformed; completed in 2.31s
```

| Output | Size | Gzip |
| --- | ---: | ---: |
| `dist/assets/index-ssHizsNK.js` | 261.71 kB | 80.69 kB |
| `dist/assets/polyfills-V-gmNPkf.js` | 69.86 kB | 26.47 kB |
| `dist/assets/index-legacy-Cc3d6iAx.js` | 313.95 kB | 91.52 kB |
| `dist/assets/polyfills-legacy-BM1tryXK.js` | 77.90 kB | 29.47 kB |
| `dist/assets/index-Ha2y4UHB.css` | 55.03 kB | 11.26 kB |
| `dist/assets/funding-network-Dwo2K2wd.jpg` | 188.50 kB | n/a |

The modern and legacy bundle privacy scan returned no matches for the review's forbidden
public fields or phrases. The committed bundle privacy test independently rebuilds and
scans both bundle variants. Server integration coverage exercises all requested business
branches, API hardening, admin filters, and selected-only export.

`git diff --check` and the staged equivalent were run before commit. Generated `dist`,
screenshots, `.playwright-cli`, temporary lead stores, browser profiles, and test credentials
were absent or removed; no test server was left running.

## Residual Limits

- Lead writes are serialized by an in-memory queue inside one Node process. Deployments must
  use one writer per lead-store file or replace the file store with cross-process locking or
  transactional storage before horizontally scaling.
- No physical Safari/iPhone/iOS runtime was available. Legacy compilation and Chrome 151
  lifecycle execution passed, but they do not substitute for a physical Safari/iOS check.
- Existing stored lead records were intentionally not rewritten. Store initialization fixes
  existing file permissions to 0600; new submissions use the allowlisted/minimal shape.
- A separate-origin reverse proxy must set `MEIOU_ALLOWED_ORIGINS` to each exact trusted
  origin. Same-origin remains the default.
