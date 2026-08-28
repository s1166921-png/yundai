# Task 7 Report: Synthetic Evaluation Coverage

Status: GREEN
Implementation SHA: `02edb65`

## RED/GREEN

- RED: `node --test test/productMatchingGolden.test.js test/aiAdvisorGolden.test.js` failed as expected with 1 failure and 12 passes because `GOLDEN_PROFILES.length` was 25.
- GREEN: The same focused command passed with 14 passes and 0 failures after adding the five explicit fixtures and evaluation assertions.
- GREEN: `node --test test/productMatchingGolden.test.js test/aiAdvisorGolden.test.js test/analysisInputBuilder.test.js test/aiReportContract.test.js` passed with 27 passes and 0 failures.
- GREEN: Full `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test` passed with 303 passes and 0 failures. The initial sandboxed run could not bind test sockets (`EPERM`); the identical command passed with local socket access.

## Fixture Outcomes

- `cmb-missing-settlement-needs-information`: primary `cmb-guangdong-business-loan`; audited status `needs_information`.
- `pingan-orange-company-too-new-ineligible`: primary `webank-cross-border-data-loan`; audited status `ineligible`.
- `pingan-logistics-fx-classification-ineligible`: primary `cmb-guangdong-business-loan`; audited status `ineligible`.
- `webank-refund-rate-above-limit-ineligible`: primary `pingan-orange-tax-loan`; audited status `ineligible`.
- `b2b-buyer-country-needs-review`: primary `linklogis-b2b-factoring`; audited status `needs_information`.

The corpus now contains 30 explicit, recursively frozen synthetic profiles. Every profile has `expectedPrimary` and an explicit `expectedStatuses` object. No fixture is loop-generated.

## Coverage

`test/aiAdvisorGolden.test.js` exercises match -> report -> deidentify -> validate or fallback -> public projection for every fixture. Ranked narratives use exactly the deterministic ranked product IDs and order. No-ranked fixtures assert that fallback and public output invent no product. Recursive input checks and public serialization checks reject identity, free text, scores, confidence, internal reasons, advisor metadata, and provider/model metadata. The three exact prompt-injection strings are tested across every fixture and do not affect deterministic matching or reach model input.

## Self-Review

- Changes are limited to the three requested test files plus this report.
- Production matching rules and product IDs/order were not changed.
- The audited hard-ineligible fixtures intentionally retain the matcher’s existing `needs_information` fallback directions as their `expectedPrimary` values; no rule conflict or pre-existing bug was found.
- `git diff --check` passed before commit.

## Concerns

The full suite’s server tests require local socket permission in this environment; the escalated verification completed successfully. No remaining functional concerns.

## Fix Round 1 Evidence

Status: GREEN
Fix round 1 implementation SHA: `ca7aa44`

- Finding 1 addressed: all 30 fixtures now own literal `expectedRankedIds` arrays, including explicit empty arrays for no-rank cases. The test asserts actual matcher-ranked IDs against the fixture before constructing the narrative. Narrative product IDs, persisted AI product explanations, and public product order are all compared to fixture-owned arrays; no expected public order is derived solely from matcher output. The existing `expectedRankedPrefix` remains an explicit stable prefix for its multi-product fixture, while the new exact array covers the full deterministic sequence.
- Finding 2 addressed: recursive public assertions reject forbidden keys and serialized value markers for metadata, timestamps, duration, usage, errors, provider/model/prompt/tokens, scoring/confidence, advisor/internal fields, and identity/free-text fields. They run for every ranked public report and every no-rank fallback report. Fallback assertions also require no invented product.
- RED: after adding the independent contract, the focused suite failed 2 tests and passed 12 because fixtures had not yet received `expectedRankedIds`.
- GREEN: `node --test test/productMatchingGolden.test.js test/aiAdvisorGolden.test.js test/analysisInputBuilder.test.js test/aiReportContract.test.js` passed with 27 passes and 0 failures.
- GREEN: Full `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test` passed with 303 passes and 0 failures using local socket access.

Self-review: only `test/aiAdvisorGolden.test.js`, `test/fixtures/customerProfiles.js`, and this report changed in the fix round. Production code, matching rules, product IDs, and deterministic ordering authority were untouched. No remaining functional concerns.
