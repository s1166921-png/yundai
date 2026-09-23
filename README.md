# Meiou Financing Product Match Center

React 19 and Vite 6 customer intake for deterministic financing-product matching, with
a local Node API, authenticated admin review, and selected-customer Excel export.

## Sales promotion QR codes

Administrators can create salesperson-specific links and downloadable QR codes at
`/admin/promotions`, then view anonymous page visits by salesperson and date.
This counts visits, not identified customers or unique people.
See the [setup and usage guide](docs/sales-promotion.md) and
[validation record](docs/sales-promotion-qa.md) before deployment.

## Local setup

Sales accounts and customer ownership extend the same admin entry point. See
[sales access and extension guide](docs/sales-customer-access.md) for account setup,
assignment rules, security boundaries, and module responsibilities.

Install the pinned dependencies:

```bash
pnpm install
```

Start the API from your own terminal. This form keeps the API key and local admin
password out of shell history and source files:

```bash
read -s "DEEPSEEK_API_KEY?DeepSeek API Key: "; echo; export DEEPSEEK_API_KEY
read "MEIOU_ADMIN_USER?Admin user: "; export MEIOU_ADMIN_USER
read -s "MEIOU_ADMIN_PASSWORD?Admin password: "; echo; export MEIOU_ADMIN_PASSWORD
DEEPSEEK_MODEL=deepseek-v4-pro \
DEEPSEEK_BASE_URL=https://api.deepseek.com \
DEEPSEEK_TIMEOUT_MS=12000 \
AI_DAILY_REQUEST_LIMIT=100 \
PORT=8787 pnpm dev:api
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

Enter every secret only in your own terminal environment. Do not paste an API key or
password into chat, source code, a committed `.env` file, or browser storage. Use only
synthetic profiles and placeholder local credentials for development and QA.

### AI local modes

- **AI v3 data boundary:** `meiou-analysis-v3` sends only deidentified operating
  classifications, product IDs, and server-owned allowlist codes. Company names,
  contacts, phone numbers, free text, internal match evidence, and advisor notes are
  never sent to DeepSeek.
- **No `DEEPSEEK_API_KEY`:** submissions use the deterministic `rules_fallback` report.
  The fallback is explicitly labeled for the customer and lead persistence still succeeds.
- **Official key configured:** the server calls DeepSeek using the values above and
  validates the returned analysis against the deterministic product order before it is
  used.
- Provider timeouts, rate limits, malformed responses, and other provider failures do
  not block lead persistence. They resolve to the local fallback instead.
- Customer-facing reports are preliminary preparation guidance, not a credit approval,
  credit commitment, or final pricing offer. A financing advisor must review any next step.

### Verified DeepSeek smoke override

The documented production default remains `deepseek-v4-pro` with its 12-second timeout.
For the Task 6 local smoke, the verified successful provider submission used this explicit
override:

```bash
DEEPSEEK_MODEL=deepseek-v4-flash \
DEEPSEEK_TIMEOUT_MS=90000 \
PORT=8787 pnpm dev:api
```

This is a local verification override, not a production-default change. In that smoke,
the Pro configuration timed out and safely produced `rules_fallback`; it did not produce
an `ai` source report. Operators using Pro may need to set a larger appropriate timeout,
while retaining the fallback behavior for provider failures.

Deployment, SMS, production hosting, and cloud credential setup are out of scope for
this repository workflow.

`pnpm dev:api` explicitly enables only `http://127.0.0.1:5173` and
`http://localhost:5173` for the documented local Vite workflow. Direct server
construction and `pnpm start` keep that local-origin mode off by default. Other origins
remain denied unless set in comma-separated `MEIOU_ALLOWED_ORIGINS` values for explicitly
approved frontends. Every configured value must already be an exact serialized `http` or
`https` origin; startup rejects whitespace, userinfo, paths, queries, fragments, default-
port normalization, and malformed values. A constrained direct-loopback same-origin
exception permits the built local admin at `http://127.0.0.1:8787/admin`: the request
must arrive on a loopback listener and its serialized `Origin`, `Host`, protocol, and port
must agree. `Host` alone is never trusted, and forged, malformed, protocol-mismatched, or
cross-origin requests remain denied. Production and proxied frontends must still configure
their exact public origin in `MEIOU_ALLOWED_ORIGINS`. Lead submissions must use
`Content-Type: application/json`.

For a local frontend on a different port, use an exact origin:

```bash
MEIOU_ALLOWED_ORIGINS=http://127.0.0.1:5174 \
PORT=8787 pnpm dev:api
```

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
PORT=8787 pnpm start
```

This command is for direct local verification. The constrained loopback same-origin rule
covers the built admin and API on this URL; it does not broaden the cross-origin allowlist.
Deployment, production server changes, and DNS changes are outside this repository workflow.

## Runtime architecture

- `src/components/FinancingIntake.jsx` renders one three-stage progressive form using `src/lib/matching/intakeSchema.js`.
- Progressive submissions use `intakeVersion: "progressive-v1"` and `estimationMode: "progressive"`; only visible non-empty fields are sent. The Amazon SC WeBank assessment is an explicit optional accordion and its collapsed values are removed when disabled.
- `src/lib/matching/customerProfile.js` normalizes and validates the canonical profile without converting currency.
- `src/lib/matching/productCatalog.js` owns the seven versioned product definitions, sourced facts, rules, estimator metadata, six-dimension fit profiles, ranking weights, and customer/advisor collection stages.
- `src/lib/matching/ruleEvaluator.js`, `amountEstimators.js`, and `productMatcher.js` produce deterministic eligibility, traceable amount estimates, and at most three ranks.
- `src/lib/matching/reportBuilder.js` creates constrained customer-safe report copy; `src/components/ProductMatchCenter.jsx` renders it.
- `src/lib/ai/analysisInputBuilder.js` exposes only stable deidentified facts and server-owned reference codes. The provider may select ordered allowlisted codes and immutable product IDs only; `src/lib/ai/aiReportContract.js` resolves customer text on the server after validation.
- `src/lib/matching/publicProductProjection.js` and the public serializers in `server/index.mjs` keep internal catalog and match evidence out of the customer browser.
- `server/index.mjs` validates JSON submissions, persists allowlisted input and estimator provenance, serves authenticated filtered admin data, enforces per-lead revisions for mutations, and exports selected records.

Lead-file updates are serialized by an in-memory queue within one Node process. Run one
writer process per lead store; this queue is not a cross-process or distributed lock.

See `docs/product-rule-maintenance.md` before changing a product fact, rule, threshold,
formula, or rule version.

See `docs/progressive-intake-qa.md` for the seven repeatable customer journeys,
responsive acceptance matrix, selected-only export check, and residual device limits.

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
  IDs are explicitly selected. Open a customer from this admin entry to review its AI
  scenario audit, submit the advisor review, and export only the selected records.
- Review and AI-retry mutations include the lead's current revision. Ambiguous transport
  failures and revision conflicts trigger a filtered refetch before the UI presents the
  latest server state. No-key and exhausted-day states do not consume the one provider
  retry or display an actionable retry control.

Do not weaken those checks or place internal evidence in public projections. Use
placeholder local credentials and synthetic profiles in development and tests.
