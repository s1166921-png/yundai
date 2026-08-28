# AI Financing Advisor Final Fix Report

Status: COMPLETE

Date: 2026-08-28

Implementation commit: `093d39027028f410ccd7ed44a785f7b8d3804c11`

This was the single broad final-fix round for the whole AI financing advisor branch. It
addressed every Critical and Important final-review finding and all listed practical
Minors. No subagent, deployment, push, merge, production hostname, real customer record,
real credential, or external provider call was used.

## Architecture decisions

### Typed provider boundary and server-owned public language

- `meiou-analysis-v2` sends only enumerated scenario/fact bands, stable rule/evidence
  references, preparation/advisor references, and the immutable ranked product IDs.
- `meiou-ai-narrative-v2` has exactly five fields. The provider can select only unique
  ordered subsets of codes supplied for that request and must return each supplied
  product exactly once and in order. Unknown, duplicate, reordered, missing, or extra
  codes/products/fields are contract violations and resolve to the deterministic fallback.
- Customer summaries, product supplements, confirmations, actions, status, and privacy
  text are all resolved from server-owned maps after validation. The provider has no
  free-form customer prose slot. Advisor focus remains private and is also code-selected
  before server-owned Chinese resolution.
- The persisted v2 report is code-only. Public projection validates persisted generated
  data again; invalid, historical, pending, and fallback records use deterministic
  references. Persisted provider/model/prompt/usage/error data, advisor focus/review/note,
  scores, confidences, and injected prose are never copied into the customer response.
- Matching rules retain sole authority over rank, eligibility direction, amounts, rates,
  terms, and conditions. Product cards bind by immutable product ID to catalog-owned
  names/facts and always render deterministic `whyMatched` and `itemsToConfirm` separately
  from supplemental AI selections.

### CORS, retry, and admin consistency

- CORS no longer compares `Origin` with request `Host` or URL authority. Configured
  origins and explicitly enabled documented Vite loopback origins pass one exact
  serialized HTTP-origin parser. Paths, queries, fragments, userinfo, whitespace,
  malformed origins, and normalization aliases are rejected at startup or request time.
- A production browser origin, including the public same origin, must be configured
  explicitly. This secure default is documented in `README.md`.
- Retry availability is internal/admin-only. Repeated `not_configured` and `daily_limit`
  checks do not reserve a retry, increment `retryCount`, or expose a customer capability.
  The count increments only when an actual provider reservation/attempt occurred.
- Retry claims and completions are queued atomic lead updates with operation IDs. Initial
  generation cannot overwrite a retry, concurrent retries cannot both run, and the UTC
  daily capability becomes available again on the next natural day.
- Every admin mutation carries a per-lead revision. Stale revisions return the current
  authoritative lead. The raw admin page refetches with active filters after success,
  server rejection, or ambiguous transport failure; sequenced/aborted list loads ensure
  the newest request wins while preserving data on load failure.
- The served admin script avoids optional chaining, nullish coalescing, async/await,
  object spread, `flatMap`, `Object.entries`, and `Object.values`. CSS includes explicit
  positional and `100vh` fallbacks before `inset` and `100dvh` enhancements.

### Consent and customer presentation

- Consent now states that contact and operating data are saved for product matching and
  advisor follow-up, only deidentified operating fields go to third-party AI, identity and
  contact fields do not, and the result is reference-only rather than approval or funding.
- The anonymous duplicate AI product explanation section was removed. Supplemental
  server-owned AI selections now appear only within named deterministic product cards.

## TDD evidence

Tests were written or tightened before each implementation slice. The observed red states
were retained as working evidence rather than inferred after the code was complete.

| Finding slice | Red evidence | Green evidence |
| --- | --- | --- |
| Typed AI contract/projection | Existing prose contract and missing reference exports failed the new exact-schema/adversarial tests. | Initial contract/input/service slice reached 24/24; final AI/customer group reached 63/63. |
| Deterministic cards/consent | Seven component/view expectations failed when deterministic evidence, integrated supplements, duplicate removal, and disclosure were first asserted. | Initial UI slice reached 34/34; final focused group reached 63/63. |
| CORS | Two forged-authority/configured-origin tests failed while request authority was still accepted/normalized. | Focused CORS set reached 5/5; server/admin group reached 78/78. |
| Retry no-call states | Three capability/count/day-reset tests failed before non-consuming capability existed. | Focused retry service set reached 4/4; integration coverage is green in 78/78 server/admin tests. |
| Admin revisions/races | Three route tests and four raw-page VM race tests failed before revision/refetch/latest-load handling. | Revision conflict, lost response, stale list, cross-lead, and same-lead ordering are green in the 78/78 server/admin suite. |
| Prompt completeness | Advisor-code language policy assertion failed against the old Task-1-only prompt. | Prompt schema/cardinality/order/prohibition and mock request tests pass without network. |
| Final self-review additions | Product evidence test failed 1/14 because deterministic text was browser-filtered; admin projection test failed 1/1 because code-only storage was not resolved for the drawer. | Product view passed 14/14 and focused admin projection passed 1/1 after separation/resolution. |
| Cross-suite convergence | First complete run: 313/316; stale tests still required the removed anonymous block, omitted immutable IDs, and omitted `itemsToConfirm`. | Affected suites passed 28/28; final complete run passed 316/316. |

## Verification commands and results

Bundled runtime used throughout:

```text
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

Focused advisor/customer tests:

```bash
node --test test/aiAdvisorGolden.test.js test/aiPreliminaryReport.test.js \
  test/aiReportContract.test.js test/aiReportService.test.js \
  test/analysisInputBuilder.test.js test/financingIntakeComponent.test.js \
  test/productMatchView.test.js
```

Result: PASS, 63 passed, 0 failed.

Focused server/admin integration:

```bash
node --test test/serverLead.test.js
```

Result: PASS, 78 passed, 0 failed.

Cross-suite correction:

```bash
node --test test/browserCompatibility.test.js \
  test/productMatchingGolden.test.js test/reportBuilder.test.js
```

Result: PASS, 28 passed, 0 failed.

Complete network-free suite:

```bash
node --test
```

Initial result: 313 passed, 3 failed because three older expectations did not yet reflect
intentional secure product-ID/conditions/duplicate-removal behavior. Final result after
focused correction: PASS, 316 passed, 0 failed, 0 skipped, 2757.147 ms.

Production build:

```bash
node ./node_modules/vite/bin/vite.js build
```

Result: PASS. Modern JS/CSS and legacy polyfill/entry were emitted. The legacy entry was
`dist/assets/index-legacy-B2162vqU.js` (326814 bytes).

Exact browser privacy scan:

```bash
rg -n "DEEPSEEK_API_KEY|Bearer test-key|api.deepseek.com/chat/completions|advisorFocus" dist/assets
```

Result: PASS by no-match contract (`rg` exit 1, empty output).

Old-iPhone served-page probe used an iPhone OS 10 Safari user agent against the local built
server. The returned page omitted the module entry and served
`polyfills-legacy-DEWPvjvJ.js` plus `index-legacy-B2162vqU.js` as the executable entry.

## Rendered UAT

The API used a fresh `/private/tmp` synthetic lead store, fixed synthetic admin credentials,
explicit trusted Vite origins, the exact configured admin origin, and no provider key.
Headless Chrome drove the actual pages; no screenshot was created.

At both `1440x900` and `390x844`, customer UAT passed with:

- explicit `规则匹配报告` fallback source;
- deterministic primary `微众银行跨境电商数据贷`, amount `75万-262.5万元`, and stable
  alternatives;
- visible deterministic matching reasons and pending confirmation copy;
- zero anonymous AI product cards;
- first-party persistence/follow-up consent, deidentified third-party boundary, privacy
  notice, and non-approval disclaimer;
- no horizontal overflow or scoped clipped text.

At both viewports, admin UAT passed with:

- actionable retry hidden in no-key state;
- two direct retry probes returning `409`, `ai_retry_unavailable`, `not_configured`;
- revision unchanged at 2 and `retryCount` unchanged at 0 after both probes;
- `pending`, `in_review`, `reviewed`, and `needs_information` saved through the real UI;
- active customer filter retained, exactly one row selected, and Excel export started;
- no horizontal overflow or scoped clipped text.

Reduced-motion emulation reported `prefers-reduced-motion: reduce` as active. Legacy
behavior is covered by the built legacy entry, old-iPhone served-page probe, Safari/iOS 10
target tests, Flexbox-before-Grid tests, old-WebKit scrolling fallback, and raw-admin
served-script syntax checks.

All local API, Vite, and Chrome sessions were stopped. Ports 5173, 8787, and 9222 had no
listeners afterward. The run-specific synthetic lead store and Chrome profile were removed.

## Changed files

AI boundary and lifecycle:

- `src/lib/ai/aiReportReferences.js`
- `src/lib/ai/aiReportContract.js`
- `src/lib/ai/analysisInputBuilder.js`
- `src/lib/ai/fallbackReportBuilder.js`
- `server/ai/deepSeekClient.mjs`
- `server/ai/aiReportService.mjs`
- `server/ai/dailyLimiter.mjs`
- `server/index.mjs`

Customer/admin presentation and deterministic report:

- `server/adminPage.mjs`
- `src/components/AiPreliminaryReport.jsx`
- `src/components/ProductMatchCenter.jsx`
- `src/lib/matching/intakeSchema.js`
- `src/lib/matching/reportBuilder.js`
- `src/lib/productMatchView.js`
- `src/styles.css`

Tests:

- `test/aiAdvisorGolden.test.js`
- `test/aiPreliminaryReport.test.js`
- `test/aiReportContract.test.js`
- `test/aiReportService.test.js`
- `test/analysisInputBuilder.test.js`
- `test/browserCompatibility.test.js`
- `test/financingIntakeComponent.test.js`
- `test/productMatchView.test.js`
- `test/productMatchingGolden.test.js`
- `test/reportBuilder.test.js`
- `test/serverLead.test.js`

Documentation/evidence:

- `README.md`
- `docs/product-rule-maintenance.md`
- `.superpowers/sdd/2026-08-27-ai-financing-advisor/progress.md`
- `.superpowers/sdd/2026-08-27-ai-financing-advisor/final-fix-report.md`

## Commit and audit

- `093d39027028f410ccd7ed44a785f7b8d3804c11` — `fix: secure AI advisor final integration`
- The ledger/report evidence is committed separately in the commit containing this file;
  its final SHA is reported in the task response.

Before the implementation commit, `git diff --check` and `git diff --cached --check` were
clean. Status and changed-path review contained only the intended source/tests/docs; no
lead store, `.env`, `dist`, screenshot, export, credential, or production-host file was
staged. A credential-pattern diff audit found no credential-like additions. Final
post-report status and artifact audits are recorded after the evidence commit.

## Self-review and limitations

- Public generated and fallback responses are recursively covered for injected status,
  summary, product reason, confirmation, action, metadata, advisor, note, score, and
  confidence values. Browser filtering remains defense in depth; server validation and
  server-owned resolution are the security boundary.
- Historical leads default to revision 0 and safe advisor-review/report projection without
  store mutation. The lead-store queue remains intentionally single-process; it is not a
  distributed lock, as documented.
- Chrome emulation, target/build checks, and the old-iPhone served response are not a
  physical iPhone/Safari device test.
- No cloud/server deployment, GitHub push, or merge was performed.

Official API check: Not run

Reason: no user-configured provider key was present, and this round deliberately made no
external provider request or request for a key.
