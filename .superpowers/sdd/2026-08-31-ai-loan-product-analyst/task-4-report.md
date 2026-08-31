# Task 4 Report: Customer-Facing Financing Assessment

## Status

Complete.

## RED

Added the requested report-view, static-render, match-view, and golden-path assertions before implementation, then ran:

```sh
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/aiPreliminaryReport.test.js test/productMatchView.test.js test/aiAdvisorGolden.test.js
```

Result: 22 passed, 4 failed as expected. The failures showed that `financingAssessment` did not yet exist in the customer view or public report, and that neither the report component nor the product-match view consumed it.

## GREEN

- `publicAiReport()` now re-resolves the selected amount scenario from the current validated server analysis input and emits the customer-safe `financingAssessment` shape.
- Amounts are formatted only from server scenario values; unavailable values use `补充资料后可量化`. Terms and confidence use fixed server-owned resolvers; pricing uses the versioned server product catalog. Stored model prose and numeric output are not read.
- v2 reports retain their legacy customer projection and emit an empty financing assessment.
- The report view filters every new visible field through the existing customer-safe text boundary.
- The report renders four compact sections: business judgement, financing capacity, sensitivity analysis, and preparation actions. Financing cards expose amount, term, pricing, confidence, reasons, risks, and confirmation items.
- Desktop financing cards use a two-column Grid; the mobile breakpoint and legacy Flexbox fallback use one column with wrapping-safe text.
- Product match highlighting can consume the new assessment when legacy explanations are absent, always keyed by immutable product ID.
- Privacy regressions now distinguish the customer-safe `confidenceLabel` from forbidden internal `confidence` fields.

Focused verification:

```text
tests 42
pass 42
fail 0
```

The focused group includes the requested report, product-match, golden, report-contract, bundle-privacy, and browser compatibility tests.

## Full Suite

The sandboxed first run could not bind `127.0.0.1` for server integration tests. Re-running with local-loopback permission completed successfully:

```text
tests 340
pass 340
fail 0
cancelled 0
skipped 0
```

`git diff --check` passed with no whitespace errors.

## Files

- Modified: `src/lib/ai/aiReportContract.js`
- Modified: `src/lib/aiReportView.js`
- Modified: `src/lib/productMatchView.js`
- Modified: `src/components/AiPreliminaryReport.jsx`
- Modified: `src/components/ProductMatchCenter.jsx`
- Modified: `src/styles.css`
- Modified tests: `test/aiPreliminaryReport.test.js`, `test/productMatchView.test.js`, `test/aiAdvisorGolden.test.js`, `test/bundlePrivacy.test.js`, `test/serverLead.test.js`

## Self-Review

- Verified selected range labels are reconstructed from validated scenario codes and the current server input, rather than persisted report output.
- Verified term, risk, sensitivity, and confidence text comes from fixed server dictionaries, and pricing comes from the server catalog keyed by validated product ID.
- Verified public reports preserve legacy v2 rendering, while v3 and deterministic fallback reports provide the full customer assessment.
- Verified public and bundle privacy checks still prohibit raw internal metadata, prompt, usage, provider, error, score, and raw confidence fields.
- Verified report cards remain at an 8px radius, have no nested card container, wrap long text, use two desktop columns, and collapse at the mobile breakpoint.

## Concerns

None. Full-suite server tests require local-loopback permission in this environment; no production configuration or runtime dependency was added.

## Review Fix Round 1

### RED

Added explicit public projection assertions for catalog identity and deterministic role labels, plus a static two-product report test that associates each card's product identity and role with its own amount and term. Before the implementation, ran:

```sh
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/aiPreliminaryReport.test.js test/aiAdvisorGolden.test.js test/aiReportContract.test.js
```

Result: 18 passed, 4 failed as expected. The customer projection did not expose `institution`, `name`, or `roleLabel`; the view removed these missing fields; and the financing card had no identity header.

### GREEN

- The v3 financing-assessment public type now explicitly includes `{ productId, institution, name, roleLabel, amountLabel, termLabel, pricingLabel, confidenceLabel, reasons, risks, sensitivities, itemsToConfirm }`.
- `institution` and `name` are derived exclusively from the canonical server catalog by validated `productId`; `roleLabel` is derived exclusively from validated product order (`优先产品` first, then `备选产品`). Stored reports and model output are never read for these labels.
- `buildAiReportView()` retains only complete, customer-safe assessment items with the three explicit identity fields.
- Each financing card now presents the role, institution, and product name before its metrics. Existing two-column Grid, 390px single-column breakpoint, Flexbox fallback, and text wrapping rules remain intact.
- Stored v2 narratives continue to project an empty financing assessment, retaining their legacy report rendering safely.

### Covering Test Output

```sh
/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/aiPreliminaryReport.test.js test/productMatchView.test.js test/aiAdvisorGolden.test.js test/aiReportContract.test.js
```

```text
tests 37
pass 37
fail 0
cancelled 0
skipped 0
```

### Review Self-Check

- Verified the public contract test asserts catalog-derived identity and `优先产品` for a valid v3 report, while the v2 test asserts an empty assessment.
- Verified the multi-product view/render test checks the primary and alternative product cards keep their own role, name, amount, and term together.
- Verified golden journeys assert catalog identity and validated-order role labels for every projected assessment.
