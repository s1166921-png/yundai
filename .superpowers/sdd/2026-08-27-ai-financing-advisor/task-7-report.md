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
