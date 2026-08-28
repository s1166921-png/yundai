# Product Rule Maintenance

The financing matcher is deterministic. Product facts and eligibility rules live in
`src/lib/matching/productCatalog.js`; React components must not copy or reinterpret them.

## Catalog fields

Each product definition includes:

- `id`: stable machine identifier. Do not reuse an ID for a different product.
- `institution` and `name`: customer-facing identity.
- `currency`: `RMB` or `USD`. Money is never converted silently.
- `customerScenario`, `customerTargetProfile`, and `customerPrerequisite`: customer-safe discovery copy.
- `pricing`, `term`, and `limit`: sourced product facts. Use `null` plus an explanatory note when a fact is not known.
- `version`: rule version in `YYYY-MM-DD` form.
- `effectiveDate` and `source`: provenance for the rule set.
- `ruleSet`: ordered eligibility and review rules.
- `amountEstimator`: formula metadata and documented inputs.
- `fitWeights`: catalog-owned ranking dimensions.
- `fitProfile`: catalog-owned business models, scale rules, cash-flow inputs, purposes,
  repayment methods, and control groups. Keep non-applicable lists empty so the matcher
  treats those dimensions neutrally.

Every rule contains `id`, `field`, `operator`, `value`, `severity`, and `message`.
`severity` is `hard` for a true eligibility prerequisite and `review` for a condition
that needs advisor review. `message` must be safe for a customer. Sensitive operational
detail belongs only in `internalReason`, which is restricted to authenticated internal
views and exports.

Rule fields must be canonical paths returned by
`normalizeCustomerProfile` in `src/lib/matching/customerProfile.js`. Money rules read an
`.amount` path, while the canonical money object retains its fixed currency. Do not add
currency conversion to a rule or estimator.

## Allowed operators

The standard operators implemented by `src/lib/matching/ruleEvaluator.js` are:

| Operator | Meaning |
| --- | --- |
| `equals` | Exact scalar equality. |
| `oneOf` | A scalar is in the allowed values, or an answered array overlaps them. |
| `minExclusive` | Value must be greater than the threshold. |
| `minInclusive` | Value must be greater than or equal to the threshold. |
| `maxInclusive` | Value must be less than or equal to the threshold. |
| `truthy` | Value must be exactly `true`. |
| `falsy` | Value must be exactly `false`. |
| `custom` | Invoke a named evaluator already registered in `CUSTOM_EVALUATORS`. |

Missing scalars and empty arrays evaluate as `unknown`. Composite evaluators report the
actual unanswered dependency paths, not only the rule's anchor field. A hard failure
makes the product `ineligible`; otherwise unknown data makes it `needs_information`.
Never turn missing data into a hard failure. A currency-specific condition is neutral
when the request uses another currency.

Before adding a new custom evaluator, prefer a standard operator. If a custom evaluator
is necessary, keep it pure, register it in `CUSTOM_EVALUATORS`, and add focused passed,
failed, unknown, and exact-boundary cases to `test/ruleEvaluator.test.js` or
`test/productEligibility.test.js`.

## Rule change procedure

1. Confirm the source document and effective date. Record the source in the product definition.
2. Update the canonical profile and intake schema first if the rule needs a new field. Keep hidden conditional fields absent from the rendered form.
3. Add or change focused evaluator and product eligibility tests, including pass, exact boundary, missing data, and hard failure. Run the focused test and observe the expected failure before changing behavior.
4. Update the catalog rule or estimator. Keep customer facts out of React components.
5. Bump the affected product's `version` and, when applicable, `effectiveDate` to the approved `YYYY-MM-DD` rule date. A behavior, threshold, severity, formula, or sourced product-fact change requires a version bump; copy-only maintenance that does not change meaning does not.
6. Update `test/fixtures/customerProfiles.js` with independent, explicit profile literals. Change an existing golden only when the approved rule changes its outcome; otherwise add a named fixture for the new case. Every fixture declares `expectedPrimary` or explicit `null` for no recommendation.
7. Run `node --test test/*.test.js`, then build with `pnpm build`. Confirm both modern and `*-legacy-*` assets are present and the bundle privacy test remains green.
8. Exercise an affected customer flow at desktop and target mobile sizes. Re-check the authenticated admin detail and selected-ID export when persisted evidence changes.

Do not update a golden expectation merely to make a failing test pass. First establish
that the approved source changed the expected product outcome and that the catalog
version was bumped with it.

## Amount estimates

`src/lib/matching/amountEstimators.js` may calculate only with documented formulas and
coefficients. Every estimate retains its `formulaKey`, input snapshot, product rule
version, currency, and calculation note through the internal match result.

Each match snapshot contains only fields consumed by that product's estimator; never
copy the full profile or raw intake into every snapshot. Exact and range estimates render
their numeric value before any note, while manual estimates remain note-only.

When a coefficient, exchange rate, cap, or other required input is unknown, return a
`manual` estimate with `min: null` and `max: null` plus a factual follow-up note. Never
invent a coefficient, infer an exchange rate, or convert RMB and USD to produce a more
complete-looking value.

## Customer-safe projection

The customer browser must receive only the strict projections defined by:

- `src/lib/matching/publicProductProjection.js` for the public product catalog.
- `server/index.mjs` public lead/report serializers for submission results.
- `src/lib/productMatchView.js` for customer rendering state.

Customer responses and browser bundles must not contain rule sets, raw failed rules,
internal reasons, fit scores, confidence values, advisor priority, input snapshots,
formula keys, or rule versions. Customer non-match copy is a safe summary, not a raw
failure label.

`buildCustomerMatchReport` is itself a customer-safe boundary. Only an eligible result
with at least 80 confidence may be labelled `优先匹配` and retain an amount. Incomplete
results use `可能方向` below 50 confidence or `待补信息` otherwise, with amounts removed.

Full matching evidence remains server-side and is available only through authenticated
admin and export paths. `GET /api/leads` and `GET /api/leads/export` require configured
admin authentication, and export requires an explicit non-empty `ids` selection. Keep
those boundaries intact when changing persistence or reporting.

Raw submission provenance is persisted once through the intake-field allowlist. The JSON
lead store remains mode `0600`; updates are queued only within one process, so never point
multiple writer processes at the same file. Preserve exact configured-origin CORS (the
request `Host` is never origin authority), JSON-only POST handling, no-store admin
responses, bounded bodies, and generic public 500 messages when changing the server.

Use synthetic profiles in tests and local verification. Never commit credentials,
`server/data/leads.json`, browser captures, or real customer information.
