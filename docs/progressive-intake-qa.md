# Progressive Intake QA

## Acceptance Baseline

- Customer flow: one three-stage adaptive intake using `progressive-v1`.
- Products: seven deterministic product directions with at most one primary and two alternatives.
- Viewports: 1440x900, 390x844, and 375x667.
- Browser evidence: local Chromium/Playwright with console, network, focus, reduced-motion, and overflow checks.
- Admin evidence: authenticated local admin list and explicit selected-only Excel export.
- Data: synthetic profiles and placeholder local credentials only.

## Customer Journeys

Submitted-field counts include the version and mode envelope. Optional empty fields and hidden scenario fields are not submitted.

| Journey | Submitted fields | Optional path | First product direction | Desktop/mobile result |
| --- | ---: | --- | --- | --- |
| Amazon SC | 22 | WeBank off | 联易融 Amazon SC 卖家融资贷 | Pass at all three viewports |
| Amazon SC + WeBank | 32 | Four-group one-panel accordion | 微众银行跨境电商数据贷 | Pass; switch movement 0px |
| Amazon VC | 20 | Receivables arrangement | 联易融 Amazon VC 发货后融资贷 | Pass at all three viewports |
| B2B Costco / US | 21 | Buyer and receivables facts | 联易融 B2B 保理融资 | Pass at all three viewports |
| General import/export | 25 | No amount-only estimator inputs | 平安银行外贸物流贷 | Pass at all three viewports |
| Guangdong tax operations | 25 | High-amount authorization | 招商银行经营贷 | Pass at all three viewports |
| Non-Guangdong tax operations | 25 | High-amount authorization | 平安银行橙业贷税金方案 | Pass at all three viewports |

## Functional Checks

- Step validation focuses the first invalid visible field.
- Next and Back focus and scroll the new step heading with reduced-motion and legacy fallbacks.
- Scenario changes remove inactive values before submission.
- Disabling the WeBank assessment removes every expansion-only value.
- The WeBank accordion exposes one group at a time, reports group completion, supports keyboard navigation, and opens the invalid group before field focus.
- Editing after submission aborts stale work and removes the stale report.
- Reports focus after success, expose customer-safe direction and amount wording, and include the non-commitment disclaimer.
- Unknown customer facts remain `needs_information`; explicit customer hard failures remove the affected direction; advisor-only evidence does not demote a complete customer-stage result.

## Privacy And Admin Checks

- Modern and legacy browser bundles exclude rule sets, rule versions, internal reasons, scores, confidence, failed rules, estimator snapshots, formula keys, advisor fields, and admin credential names.
- Public responses exclude internal matching evidence and advisor verification fields.
- `GET /api/leads` and `GET /api/leads/export` require authentication.
- Export rejects an empty selection and exports only explicitly selected customer IDs.
- The admin page remains unlinked from the customer site.

## Visual Results

- Zero horizontal overflow at 1440x900, 390x844, and 375x667.
- No incoherent overlap, clipped controls, unstable action rows, or console/network errors.
- Purple-cyan styling, field widths, spacing, report hierarchy, and mobile wrapping remain consistent.
- Preferred-product amount appears once; customer-facing values use normalized units such as `最高300万美元`, `75万-262.5万元`, and `5万-300万元`.

## Defects Fixed During Acceptance

- Added step-heading focus and scroll after Next/Back navigation.
- Grouped the optional high-precision WeBank path and then replaced the flat 24-control section with a stable one-panel accordion.
- Kept the WeBank switch fixed during expansion and added invalid-group opening.
- Removed duplicate amount presentation and normalized mixed/zero-floor amount wording.

## Residual Limitations

- Headless Chromium responsive emulation is not a physical iPhone Safari test. A real-device pass remains required before production launch, especially for old iOS WebKit and network/TLS behavior.
- The lead-file write queue protects one Node process only; it is not a distributed lock.
- This record covers local verification only. No merge, push, deployment, DNS, certificate, or production-server change is authorized by this QA.

## Final Run

- Date: 2026-08-25 (Asia/Shanghai).
- Complete Node suite: 226 passed, 0 failed.
- Production build: passed; modern `index-*.js` and legacy `index-legacy-*.js` assets emitted.
- Customer browser matrix: 21/21 journeys passed across seven scenarios and three viewports; no console errors, failed API responses, or horizontal overflow.
- Lifecycle checks: hidden scenario cleanup passed; stale request produced no report; reduced-motion behavior passed.
- Admin browser check: the local synthetic store loaded successfully, export stayed disabled with no selection, one selected customer downloaded `meiou-leads.xls`, and an empty export request returned HTTP 400.
- A first parallel full-suite run observed one transient client-side `ECONNRESET` while testing oversized-body connection closure. The isolated test passed immediately, and the final complete 226-test rerun passed with the expected HTTP 413 behavior.
