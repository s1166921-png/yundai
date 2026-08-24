# Meiou Financing Product Match Center

React 19 and Vite 6 customer intake for deterministic financing-product matching, with
a local Node API, authenticated admin review, and selected-customer Excel export.

## Local setup

Install the pinned dependencies:

```bash
pnpm install
```

Start the API with locally supplied admin credentials:

```bash
MEIOU_ADMIN_USER=<local-user> MEIOU_ADMIN_PASSWORD=<local-password> pnpm dev:api
```

In a second terminal, start Vite:

```bash
pnpm dev
```

- Customer application: `http://127.0.0.1:5173/`
- Local API: `http://127.0.0.1:8787/`
- Authenticated admin: `http://127.0.0.1:8787/admin`

Vite proxies `/api` to the local API. The Node server binds to loopback and has no
default admin credential; both environment values are required for the standalone
runtime.

Cross-origin browser access is denied by default except for the request's own origin.
Set comma-separated `MEIOU_ALLOWED_ORIGINS` values only for explicitly approved
frontends. Lead submissions must use `Content-Type: application/json`.

## Test and build

Run the complete Node suite:

```bash
node --test test/*.test.js
```

The suite covers catalog shape, profile normalization, three-state eligibility, amount
estimation, deterministic ranking, customer reports, schema-compatible SC/VC/B2B/
wholesale/simple submissions, API hardening, admin filters and selected export, and
bundle privacy. A direct-CDP test launches installed Google Chrome against the real React
form and verifies that an edited in-flight submission cannot restore a stale result.
Golden end-to-end matcher profiles live in `test/fixtures/customerProfiles.js` and use
synthetic data only.

Build the modern and legacy browser bundles:

```bash
pnpm build
```

`@vitejs/plugin-legacy` retains the `iOS >= 10` and `Safari >= 10` targets. A successful
build writes modern and `*-legacy-*` assets under `dist/assets`; the bundle privacy test
checks both asset families for matching internals. This compilation and Chrome check is
not physical Safari or iOS-device testing; those environments remain an external manual
verification limitation.

To exercise the built application locally, start the combined static and API server:

```bash
MEIOU_ADMIN_USER=<local-user> MEIOU_ADMIN_PASSWORD=<local-password> PORT=8787 pnpm start
```

This command is for local verification. Deployment, production server changes, and DNS
changes are outside this repository workflow.

## Runtime architecture

- `src/components/FinancingIntake.jsx` renders the five-step conditional form using `src/lib/matching/intakeSchema.js`.
- `src/lib/matching/customerProfile.js` normalizes and validates the canonical profile without converting currency.
- `src/lib/matching/productCatalog.js` owns the seven versioned product definitions, sourced facts, rules, estimator metadata, six-dimension fit profiles, and ranking weights.
- `src/lib/matching/ruleEvaluator.js`, `amountEstimators.js`, and `productMatcher.js` produce deterministic eligibility, traceable amount estimates, and at most three ranks.
- `src/lib/matching/reportBuilder.js` creates constrained customer-safe report copy; `src/components/ProductMatchCenter.jsx` renders it.
- `src/lib/matching/publicProductProjection.js` and the public serializers in `server/index.mjs` keep internal catalog and match evidence out of the customer browser.
- `server/index.mjs` validates JSON submissions, persists allowlisted input and estimator provenance, serves authenticated filtered admin data, and exports selected records.

Lead-file updates are serialized by an in-memory queue within one Node process. Run one
writer process per lead store; this queue is not a cross-process or distributed lock.

See `docs/product-rule-maintenance.md` before changing a product fact, rule, threshold,
formula, or rule version.

## Privacy and admin boundaries

Customer submissions are stored locally in `server/data/leads.json`. That generated file,
credentials, screenshots, and real customer information must not be committed.

The public product and submission responses exclude raw match statuses, rule sets,
failures, internal reasons, fit scores, confidence, advisor priority, input snapshots,
formula keys, and rule versions. Eligible, sufficiently evidenced results may show
`优先匹配`; incomplete results show `可能方向` or `待补信息` and suppress amount conclusions.

Full evidence is available only through authenticated internal paths:

- `GET /api/leads` requires admin authentication.
- `GET /api/leads/export` requires admin authentication and a non-empty `ids` selection.
- The unlinked `/admin` UI filters by customer, product, institution, currency, status,
  financing amount, and date; it enables export only after one or more visible customer
  IDs are explicitly selected.

Do not weaken those checks or place internal evidence in public projections. Use
placeholder local credentials and synthetic profiles in development and tests.
