# AI Product Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned, explainable product-matching system that collects conditional business data, evaluates seven financing products, returns at most three customer-facing recommendations, and preserves detailed evidence for the admin and Excel export.

**Architecture:** A deterministic rules engine owns eligibility, confidence, ranking, and amount simulation. A constrained report builder converts only structured engine output into customer-facing language; it cannot invent product facts or override hard rules. React components collect a normalized customer profile and render results, while the existing Node server validates, persists, exposes, and exports the same structured result.

**Tech Stack:** React 19, Vite 6, Node.js ESM HTTP server, Node built-in `node:test`, existing CSS design system, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-ai-product-matching-design.md`

## Global Constraints

- First phase uses deterministic rules and template-based explanations; it does not call an external AI model.
- Hard eligibility rules always override ranking scores.
- Missing data produces `needs_information`, not `ineligible`.
- Customer output shows at most three products and never exposes internal scores, negative labels, or admin priority.
- Every amount result stores the input, formula key, product rule version, and calculation note.
- RMB and USD values remain separate; no silent currency conversion is allowed.
- Product facts live in a versioned catalog, not inside React components.
- Existing admin authentication and selected-customer Excel export remain protected and functional.
- Existing Vite legacy target remains `iOS >= 10` and `Safari >= 10`.
- No production deployment is part of this plan.

---

### Task 1: Add the test harness and versioned product catalog

**Files:**
- Create: `src/lib/matching/productCatalog.js`
- Create: `test/productCatalog.test.js`
- Modify: `package.json:6-12`

**Interfaces:**
- Produces: `PRODUCT_IDS: readonly string[]`
- Produces: `PRODUCT_CATALOG: readonly ProductDefinition[]`
- Produces: `getProductById(id: string): ProductDefinition`
- `ProductDefinition` contains `id`, `institution`, `name`, `currency`, `pricing`, `term`, `limit`, `version`, `effectiveDate`, `source`, `ruleSet`, `amountEstimator`, and `fitWeights`.

- [ ] **Step 1: Add a Node built-in test script**

Update `package.json` scripts:

```json
{
  "test": "node --test",
  "test:matching": "node --test test/*.test.js"
}
```

- [ ] **Step 2: Write the failing product catalog test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_CATALOG, PRODUCT_IDS, getProductById } from "../src/lib/matching/productCatalog.js";

test("catalog exposes all seven unique, versioned products", () => {
  assert.deepEqual(PRODUCT_IDS, [
    "cmb-guangdong-business-loan",
    "pingan-orange-tax-loan",
    "pingan-foreign-trade-logistics-loan",
    "webank-cross-border-data-loan",
    "linklogis-amazon-sc",
    "linklogis-amazon-vc",
    "linklogis-b2b-factoring",
  ]);
  assert.equal(new Set(PRODUCT_CATALOG.map((product) => product.id)).size, 7);
  for (const product of PRODUCT_CATALOG) {
    assert.match(product.version, /^2026-\d{2}-\d{2}$/);
    assert.ok(product.source.length > 0);
    assert.ok(product.ruleSet.length > 0);
  }
  assert.equal(getProductById("linklogis-amazon-sc").currency, "USD");
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `node --test test/productCatalog.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `productCatalog.js`.

- [ ] **Step 4: Implement the catalog schema and seven definitions**

Use this exact product identity map and source dates:

```js
export const PRODUCT_IDS = Object.freeze([
  "cmb-guangdong-business-loan",
  "pingan-orange-tax-loan",
  "pingan-foreign-trade-logistics-loan",
  "webank-cross-border-data-loan",
  "linklogis-amazon-sc",
  "linklogis-amazon-vc",
  "linklogis-b2b-factoring",
]);

const product = (definition) => Object.freeze({
  enabled: true,
  effectiveDate: "2026-08-21",
  fitWeights: Object.freeze({
    businessModel: 30,
    scaleAndLimit: 20,
    cashFlow: 15,
    currencyTermUse: 15,
    controlAcceptance: 10,
    documentation: 10,
  }),
  ...definition,
  ruleSet: Object.freeze(definition.ruleSet),
});
```

Create all seven entries using the exact facts in Spec section 7. Rule objects use only these operators: `equals`, `oneOf`, `minExclusive`, `minInclusive`, `maxInclusive`, `truthy`, `falsy`, and `custom`. Each rule has `id`, `field`, `operator`, `value`, `severity: "hard" | "review"`, and customer-safe `message`.

- [ ] **Step 5: Run catalog tests**

Run: `node --test test/productCatalog.test.js`

Expected: PASS, 1 test.

- [ ] **Step 6: Commit the catalog**

```bash
git add -- package.json src/lib/matching/productCatalog.js test/productCatalog.test.js
git commit -m "feat: add versioned financing product catalog"
```

---

### Task 2: Normalize and validate customer profiles

**Files:**
- Create: `src/lib/matching/customerProfile.js`
- Create: `test/customerProfile.test.js`

**Interfaces:**
- Produces: `normalizeCustomerProfile(input: unknown): CustomerProfile`
- Produces: `validateCustomerProfile(profile: CustomerProfile, mode: "simple" | "complex"): ValidationResult`
- `ValidationResult` is `{ valid: boolean, errors: { field: string, message: string }[] }`.
- Numeric money fields use `{ amount: number | null, currency: "RMB" | "USD" }`.

- [ ] **Step 1: Write failing normalization tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerProfile, validateCustomerProfile } from "../src/lib/matching/customerProfile.js";

test("normalizes enums, booleans, months, percentages, and money without converting currency", () => {
  const profile = normalizeCustomerProfile({
    entityRegion: "MAINLAND",
    businessModels: ["AMAZON_SC"],
    companyAgeMonths: "36",
    annualRevenueRmb: "18000000",
    singleStoreGmvUsd: "5100000",
    acceptsAccountControl: "yes",
    refundRatePercent: "12.5",
  });
  assert.equal(profile.entityRegion, "mainland");
  assert.deepEqual(profile.businessModels, ["amazon_sc"]);
  assert.equal(profile.companyAgeMonths, 36);
  assert.deepEqual(profile.annualRevenue, { amount: 18000000, currency: "RMB" });
  assert.deepEqual(profile.singleStoreGmv, { amount: 5100000, currency: "USD" });
  assert.equal(profile.acceptsAccountControl, true);
  assert.equal(profile.refundRatePercent, 12.5);
});

test("rejects invalid percentages and negative money", () => {
  const profile = normalizeCustomerProfile({ annualRevenueRmb: "-1", refundRatePercent: "101" });
  const result = validateCustomerProfile(profile, "complex");
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((error) => error.field).sort(), ["annualRevenue", "refundRatePercent"]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test test/customerProfile.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement parsers and the canonical profile**

Implement `asNumber`, `asBoolean`, `asEnum`, and `asMoney` as pure functions. The returned profile must include every field from Spec section 5, using `null` for unanswered scalar fields and `[]` for unanswered multi-select fields.

```js
const asMoney = (value, currency) => ({
  amount: value === "" || value == null ? null : Number(value),
  currency,
});

export function normalizeCustomerProfile(input = {}) {
  return {
    companyName: String(input.companyName || "").trim(),
    contactName: String(input.contactName || "").trim(),
    phone: String(input.phone || "").trim(),
    entityRegion: asEnum(input.entityRegion, ["mainland", "hong_kong", "united_states", "other_overseas"]),
    businessModels: Array.isArray(input.businessModels) ? input.businessModels.map((item) => String(item).toLowerCase()) : [],
    annualRevenue: asMoney(input.annualRevenueRmb, "RMB"),
    singleStoreGmv: asMoney(input.singleStoreGmvUsd, "USD"),
    annualB2bTrade: asMoney(input.annualB2bTradeUsd, "USD"),
    acceptsAccountControl: asBoolean(input.acceptsAccountControl),
    acceptsNoa: asBoolean(input.acceptsNoa),
    raw: input,
  };
}
```

Complete the object with the spec fields and validate finite ranges: percentages 0-100, ages 18-100, months and counts non-negative, and money non-negative.

- [ ] **Step 4: Run profile tests**

Run: `node --test test/customerProfile.test.js`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit profile normalization**

```bash
git add -- src/lib/matching/customerProfile.js test/customerProfile.test.js
git commit -m "feat: normalize financing customer profiles"
```

---

### Task 3: Implement three-state hard eligibility evaluation

**Files:**
- Create: `src/lib/matching/ruleEvaluator.js`
- Create: `test/ruleEvaluator.test.js`
- Create: `test/productEligibility.test.js`

**Interfaces:**
- Consumes: `ProductDefinition` from Task 1 and `CustomerProfile` from Task 2.
- Produces: `evaluateRule(rule, profile): RuleResult`
- Produces: `evaluateEligibility(product, profile): EligibilityResult`
- `EligibilityResult.status` is exactly `eligible | needs_information | ineligible`.

- [ ] **Step 1: Write the failing three-state evaluator tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRule, evaluateEligibility } from "../src/lib/matching/ruleEvaluator.js";

const minRule = { id: "gmv", field: "singleStoreGmv.amount", operator: "minExclusive", value: 5000000, severity: "hard", message: "单店年 GMV 需超过 500 万美元" };

test("missing values are unknown, explicit failures are failed", () => {
  assert.equal(evaluateRule(minRule, { singleStoreGmv: { amount: null } }).status, "unknown");
  assert.equal(evaluateRule(minRule, { singleStoreGmv: { amount: 5000000 } }).status, "failed");
  assert.equal(evaluateRule(minRule, { singleStoreGmv: { amount: 5000001 } }).status, "passed");
});

test("eligibility prioritizes hard failure over missing data", () => {
  const product = { ruleSet: [minRule, { ...minRule, id: "history", field: "platformHistoryMonths", operator: "minExclusive", value: 12 }] };
  assert.equal(evaluateEligibility(product, { singleStoreGmv: { amount: 4000000 }, platformHistoryMonths: null }).status, "ineligible");
  assert.equal(evaluateEligibility(product, { singleStoreGmv: { amount: 6000000 }, platformHistoryMonths: null }).status, "needs_information");
});
```

- [ ] **Step 2: Run evaluator tests and verify failure**

Run: `node --test test/ruleEvaluator.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement safe path lookup and all rule operators**

```js
const readPath = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);

export function evaluateEligibility(product, profile) {
  const results = product.ruleSet.map((rule) => evaluateRule(rule, profile));
  const hardFailure = results.some((result) => result.severity === "hard" && result.status === "failed");
  const missing = results.some((result) => result.status === "unknown");
  return {
    status: hardFailure ? "ineligible" : missing ? "needs_information" : "eligible",
    passedRules: results.filter((result) => result.status === "passed"),
    failedRules: results.filter((result) => result.status === "failed"),
    missingFields: [...new Set(results.filter((result) => result.status === "unknown").map((result) => result.field))],
  };
}
```

Custom rules are named functions stored in an internal map, not arbitrary callbacks from request data.

- [ ] **Step 4: Add exact product boundary tests**

In `test/productEligibility.test.js`, create tests for:

- Amazon SC: `5,000,000 USD` fails, `5,000,001 USD` passes when history is 13 months and account control is accepted.
- Amazon VC: 6 months fails because the rule is greater than 6; 7 months passes with US site and allowed entity.
- B2B factoring: `2,400,000 USD` fails, `2,400,001 USD` passes with 13-month buyer history and admitted country.
- WeBank: AHR 200 fails, 201 passes; refund 40 passes, 40.01 fails; non-US site fails.
- Ping An logistics: 500,000 USD passes the inclusive import/export minimum; 499,999 fails.
- CMB: 10,000,000 RMB passes the inclusive revenue threshold; five existing banks fails the maximum-four rule.
- Ping An Orange: 24 company months passes; applicant age 66 fails.

- [ ] **Step 5: Run eligibility tests**

Run: `node --test test/ruleEvaluator.test.js test/productEligibility.test.js`

Expected: PASS for all rule and product boundary cases.

- [ ] **Step 6: Commit hard eligibility**

```bash
git add -- src/lib/matching/ruleEvaluator.js test/ruleEvaluator.test.js test/productEligibility.test.js
git commit -m "feat: evaluate financing product eligibility"
```

---

### Task 4: Add confidence, fit ranking, and amount simulation

**Files:**
- Create: `src/lib/matching/amountEstimators.js`
- Create: `src/lib/matching/productMatcher.js`
- Create: `test/amountEstimators.test.js`
- Create: `test/productMatcher.test.js`

**Interfaces:**
- Consumes: catalog, profile, and `evaluateEligibility`.
- Produces: `estimateAmount(product, profile): AmountEstimate`
- Produces: `matchProducts(profile): ProductMatchResult[]`
- `AmountEstimate` is `{ kind: "exact" | "range" | "manual", currency, min, max, formulaKey, note }`.

- [ ] **Step 1: Write failing amount estimator tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { estimateAmount } from "../src/lib/matching/amountEstimators.js";

test("Ping An logistics applies industry coefficient and 5m RMB cap", () => {
  const estimate = estimateAmount({ amountEstimator: "pingan_logistics" }, {
    industry: "processing_manufacturing",
    annualRevenue: { amount: 40000000, currency: "RMB" },
    taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
  });
  assert.deepEqual(estimate, {
    kind: "exact", currency: "RMB", min: 5000000, max: 5000000,
    formulaKey: "pingan_logistics_v1", note: "制造业按营收16%与税票核额综合判断，受500万元上限约束",
  });
});

test("WeBank returns a collection-based range", () => {
  const estimate = estimateAmount({ amountEstimator: "webank_collections" }, {
    collectionsLast12Months: { amount: 12000000, currency: "RMB" },
  });
  assert.deepEqual(estimate, {
    kind: "range", currency: "RMB", min: 1000000, max: 3500000,
    formulaKey: "webank_collections_v1", note: "按近12个月月均回款的1至3.5倍测算，最终倍数由机构综合评级确定",
  });
});
```

- [ ] **Step 2: Run amount tests and verify failure**

Run: `node --test test/amountEstimators.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the seven estimator behaviors**

Implement these exact behaviors:

- CMB: `manual`, RMB, no invented amount because coefficient values are unavailable.
- Ping An Orange: range from 50,001 to 3,000,000 RMB.
- Ping An logistics: `min(5,000,000, max(annualRevenue * industryCoefficient, taxInvoiceAmount))`; coefficient is 0.10 for wholesale/retail and 0.16 for processing/manufacturing.
- WeBank: monthly collections multiplied by 1 and 3.5, capped at 20,000,000 RMB.
- Linklogis SC: range 0 to `3,000,000 USD * qualifiedStoreCount`; note that final amount requires institution assessment.
- Linklogis VC: `manual` USD based on eligible receivables, no fixed cap.
- Linklogis B2B: `manual` USD based on buyer receivables, no fixed cap.

- [ ] **Step 4: Write failing matcher ordering tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { matchProducts } from "../src/lib/matching/productMatcher.js";

test("Amazon SC customer ranks SC first and never recommends hard failures", () => {
  const matches = matchProducts(completeAmazonScProfile());
  assert.equal(matches[0].productId, "linklogis-amazon-sc");
  assert.ok(matches.every((match) => match.status !== "ineligible" || match.rank == null));
  assert.ok(matches.filter((match) => match.rank != null).length <= 3);
});

test("missing data lowers confidence without changing to ineligible", () => {
  const match = matchProducts({ businessModels: ["amazon_sc"], singleStoreGmv: { amount: 6000000, currency: "USD" } })
    .find((item) => item.productId === "linklogis-amazon-sc");
  assert.equal(match.status, "needs_information");
  assert.ok(match.confidence < 80);
});
```

Define `completeAmazonScProfile()` in the test file with mainland entity, Amazon SC model, 13-month history, 6,000,000 USD single-store GMV, accepted account control, USD preference, and 90-day term.

- [ ] **Step 5: Implement ranking and confidence**

`matchProducts(profile)` evaluates all enabled products, computes confidence from answered required fields, computes fit score using the six weights in the spec, sorts `eligible` before `needs_information`, and assigns ranks only to the top three non-ineligible products.

Use deterministic tie-breaking: higher confidence, then catalog order.

- [ ] **Step 6: Run matcher and estimator tests**

Run: `node --test test/amountEstimators.test.js test/productMatcher.test.js`

Expected: PASS for amount boundaries, ranking, confidence, and maximum-three behavior.

- [ ] **Step 7: Commit matching calculations**

```bash
git add -- src/lib/matching/amountEstimators.js src/lib/matching/productMatcher.js test/amountEstimators.test.js test/productMatcher.test.js
git commit -m "feat: rank products and simulate financing amounts"
```

---

### Task 5: Build the constrained customer report

**Files:**
- Create: `src/lib/matching/reportBuilder.js`
- Create: `test/reportBuilder.test.js`
- Modify: `src/lib/aiInsight.js:1-70`

**Interfaces:**
- Consumes: `ProductMatchResult[]` and `CustomerProfile`.
- Produces: `buildCustomerMatchReport(profile, matches): CustomerMatchReport`
- `CustomerMatchReport` contains `primary`, `alternatives`, `missingDocuments`, `summary`, `disclaimer`, and `ruleVersion`.

- [ ] **Step 1: Write failing report privacy and factuality tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomerMatchReport } from "../src/lib/matching/reportBuilder.js";

test("customer report excludes internal scores and hard-failure labels", () => {
  const report = buildCustomerMatchReport(profileFixture, matchFixture);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /fitScore|confidence|failedRules|一票否决/);
  assert.ok(report.alternatives.length <= 2);
});

test("report copies rates and terms only from the product catalog", () => {
  const report = buildCustomerMatchReport(profileFixture, matchFixture);
  assert.equal(report.primary.pricing, "年化9%-11%");
  assert.equal(report.primary.term, "90天或随借随还");
});
```

Create fixtures in the test file for a ranked Linklogis SC result and its catalog-backed facts.

- [ ] **Step 2: Run report tests and verify failure**

Run: `node --test test/reportBuilder.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the report builder**

Select `rank === 1` as primary and ranks 2-3 as alternatives. Build `whyMatched` only from passed rule messages and fit dimension labels. Build missing documents from missing fields through a fixed field-to-document map. Use this exact disclaimer:

```js
export const MATCH_DISCLAIMER = "本结果基于您提交的信息和当前产品规则进行初步匹配，仅供融资准备参考，不构成授信、放款、利率或期限承诺，最终结果以资金方审核为准。";
```

- [ ] **Step 4: Replace free-form AI insight decisions**

Keep `createAiInsight` for legacy reports, but make new product reports call `buildCustomerMatchReport`. Remove any code path that infers a product, rate, term, or amount from prose alone.

- [ ] **Step 5: Run report tests**

Run: `node --test test/reportBuilder.test.js`

Expected: PASS, including no internal score leakage.

- [ ] **Step 6: Commit report generation**

```bash
git add -- src/lib/matching/reportBuilder.js src/lib/aiInsight.js test/reportBuilder.test.js
git commit -m "feat: generate constrained product match reports"
```

---

### Task 6: Integrate matching into the lead API, persistence, admin, and Excel

**Files:**
- Modify: `server/index.mjs:18-180`
- Modify: `server/index.mjs:220-430`
- Create: `test/serverLead.test.js`

**Interfaces:**
- Consumes: `normalizeCustomerProfile`, `validateCustomerProfile`, `matchProducts`, and `buildCustomerMatchReport`.
- API `POST /api/leads` returns `{ ok, lead: { profile, productMatches, matchReport, ruleVersion } }`.
- Existing `GET /api/leads` and `GET /api/leads/export` retain Basic authentication.

- [ ] **Step 1: Extract server construction for tests**

Change the server module to export `createMeiouServer(options)` without listening during import:

```js
export function createMeiouServer({ leadsFilePath = leadsFile } = {}) {
  return createServer((request, response) => handleRequest(request, response, { leadsFilePath }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ensureStore(leadsFile);
  createMeiouServer().listen(port, "127.0.0.1", () => console.log(`Meiou lead server running at http://127.0.0.1:${port}`));
}
```

- [ ] **Step 2: Write the failing POST integration test**

Use a temporary JSON file and an ephemeral port. Submit a complete Amazon SC payload and assert status 201, primary product `linklogis-amazon-sc`, maximum three ranked recommendations, and persisted `ruleVersion`.

```js
assert.equal(response.status, 201);
assert.equal(payload.lead.matchReport.primary.productId, "linklogis-amazon-sc");
assert.ok(payload.lead.productMatches.filter((match) => match.rank != null).length <= 3);
assert.match(payload.lead.ruleVersion, /^2026-/);
```

- [ ] **Step 3: Run the server test and verify failure**

Run: `node --test test/serverLead.test.js`

Expected: FAIL because the current server does not return product matches.

- [ ] **Step 4: Integrate profile validation and matching**

In `normalizeLead`, retain existing contact fields for backward compatibility, store the normalized `profile`, and add `productMatches`, `matchReport`, and `ruleVersion`. Return HTTP 400 with field-level errors for invalid input instead of HTTP 500.

- [ ] **Step 5: Extend admin and Excel fields**

Add columns for primary product, alternatives, status, confidence, rule version, amount range, currency, missing fields, and advisor next step. Keep internal scores visible only in authenticated admin/export output. Continue requiring selected IDs for export.

- [ ] **Step 6: Run API and all matching tests**

Run: `node --test test/*.test.js`

Expected: PASS; unauthorized admin/export requests remain 401 and empty selection export remains 400.

- [ ] **Step 7: Commit backend integration**

```bash
git add -- server/index.mjs test/serverLead.test.js
git commit -m "feat: persist and export product match results"
```

---

### Task 7: Build the conditional financing intake wizard

**Files:**
- Create: `src/components/FinancingIntake.jsx`
- Create: `src/lib/matching/intakeSchema.js`
- Create: `test/intakeSchema.test.js`
- Modify: `src/App.jsx:488-690`
- Modify: `src/styles.css:1360-1575`

**Interfaces:**
- Produces: `getVisibleIntakeFields(profile, mode): IntakeField[]`
- `FinancingIntake` calls `onComplete(leadResponse)` after successful POST.
- Consumes canonical field names from Task 2.

- [ ] **Step 1: Write failing conditional field tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getVisibleIntakeFields } from "../src/lib/matching/intakeSchema.js";

test("Amazon SC reveals store fields and hides customs fields", () => {
  const keys = getVisibleIntakeFields({ businessModels: ["amazon_sc"] }, "complex").map((field) => field.key);
  assert.ok(keys.includes("singleStoreGmvUsd"));
  assert.ok(keys.includes("platformHistoryMonths"));
  assert.ok(keys.includes("acceptsAccountControl"));
  assert.ok(!keys.includes("customsCreditLevel"));
});

test("foreign trade reveals customs fields", () => {
  const keys = getVisibleIntakeFields({ businessModels: ["general_import_export"] }, "complex").map((field) => field.key);
  assert.ok(keys.includes("importExportLast12MonthsUsd"));
  assert.ok(keys.includes("foreignExchangeClass"));
  assert.ok(keys.includes("selfOperatedImportExport"));
});
```

- [ ] **Step 2: Run schema tests and verify failure**

Run: `node --test test/intakeSchema.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement five wizard steps and branch schema**

Define the five steps from Spec section 6. Each field has `key`, `step`, `label`, `type`, `options`, `requiredFor`, `visibleWhen`, `unit`, and `help`. Use checkboxes for business models and yes/no segmented controls for account control, NOA, receivables assignment, and risk confirmations.

- [ ] **Step 4: Extract the form from App**

Move form state, mode switching, conditional rendering, validation status, and submission from `LeadForm` into `FinancingIntake`. Keep the current simple/complex mode choice and existing contact-field requirements.

- [ ] **Step 5: Add progress and accessible errors**

Render a stable five-step progress indicator, preserve values when navigating backward, focus the first invalid field, and connect errors with `aria-describedby`. Do not render hidden fields in the DOM.

- [ ] **Step 6: Run schema tests and production build**

Run: `node --test test/intakeSchema.test.js`

Run: `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build`

Expected: tests PASS and Vite build succeeds with both modern and legacy bundles.

- [ ] **Step 7: Commit the wizard**

```bash
git add -- src/components/FinancingIntake.jsx src/lib/matching/intakeSchema.js test/intakeSchema.test.js src/App.jsx src/styles.css
git commit -m "feat: add conditional financing intake wizard"
```

---

### Task 8: Replace bank access tabs with the AI Product Match Center

**Files:**
- Create: `src/components/ProductMatchCenter.jsx`
- Modify: `src/App.jsx:420-485`
- Modify: `src/styles.css:900-1215`

**Interfaces:**
- `ProductMatchCenter` accepts `{ report: CustomerMatchReport | null, products: ProductDefinition[] }`.
- Before submission it renders seven scenario cards.
- After submission it renders one primary, up to two alternatives, and a collapsed non-match section.

- [ ] **Step 1: Create the pre-submission product center**

Replace `bankTabs` and `bankAccess` with seven product cards grouped by scenario: tax/business operations, foreign trade, Amazon marketplace, and B2B receivables. Each card uses catalog-backed currency, limit, term, and target profile.

- [ ] **Step 2: Add the post-submission result hierarchy**

Primary card shows product, institution, why matched, amount estimate, currency, term, pricing, and key prerequisite. Alternative cards show differences and missing information. The non-match disclosure shows only customer-safe messages.

- [ ] **Step 3: Connect form completion to results**

Lift the submitted report state into `App`. Pass `setLeadResult` to `FinancingIntake` and pass the resulting report to `ProductMatchCenter`. After a successful submission, scroll the match center into view using its element ID and `scrollIntoView({ behavior: "smooth", block: "start" })`, with a reduced-motion fallback.

- [ ] **Step 4: Add responsive styles**

Use a three-column desktop grid, two-column tablet grid, and one-column mobile layout. Do not nest decorative cards inside cards. Keep fixed metric-row dimensions so missing values do not shift the layout.

- [ ] **Step 5: Build and manually verify copy privacy**

Run the Vite build. Search the built client source and rendered UI to confirm `fitScore`, `failedRules`, and `admin priority` are absent from customer copy.

- [ ] **Step 6: Commit the match center**

```bash
git add -- src/components/ProductMatchCenter.jsx src/App.jsx src/styles.css
git commit -m "feat: add AI product match center"
```

---

### Task 9: End-to-end regression, legacy mobile verification, and handoff

**Files:**
- Create: `test/fixtures/customerProfiles.js`
- Create: `docs/product-rule-maintenance.md`
- Modify: `test/productMatcher.test.js`
- Modify: `README.md`

**Interfaces:**
- Produces: at least 20 named golden customer profiles and expected top products.
- Produces: maintenance instructions for changing rules without rewriting UI code.

- [ ] **Step 1: Add 20 golden profiles**

Include passing and failing profiles for every product, multi-product profiles, missing-data profiles, currency mismatch, exact thresholds, sensitive industries, excessive bank count, customs failures, Amazon non-US site, and rejected account-control consent.

Export fixtures as:

```js
export const GOLDEN_PROFILES = [
  {
    name: "amazon-sc-qualified",
    profile: {
      entityRegion: "mainland",
      businessModels: ["amazon_sc"],
      platformSites: ["united_states"],
      platformHistoryMonths: 18,
      qualifiedStoreCount: 1,
      singleStoreGmv: { amount: 6000000, currency: "USD" },
      acceptsAccountControl: true,
      preferredCurrency: "USD",
      preferredTermDays: 90,
      currentDelinquency: false,
      seriousNegativeRecord: false,
    },
    expectedPrimary: "linklogis-amazon-sc",
  },
  {
    name: "webank-us-store-qualified",
    profile: {
      entityRegion: "mainland",
      businessModels: ["platform_ecommerce"],
      platformSites: ["united_states"],
      companyAgeMonths: 24,
      applicantAge: 38,
      longestStoreHistoryMonths: 30,
      storeCount: 1,
      salesLast12Months: { amount: 24000000, currency: "RMB" },
      collectionsLast12Months: { amount: 9000000, currency: "RMB" },
      refundRatePercent: 12,
      amazonAhrScore: 320,
      amazonAccountStatus: "normal",
      fbaTurnoverCount: 3,
      borrowerMatchesCollectionEntity: true,
      acceptsStoreLock: true,
      currentDelinquency: false,
      seriousNegativeRecord: false,
    },
    expectedPrimary: "webank-cross-border-data-loan",
  },
];
```

The remaining 18 fixtures follow the same fully explicit object shape; every fixture must run without helper mutation and must name its expected primary product or expected absence of a recommendation.

- [ ] **Step 2: Assert every golden outcome**

Loop through fixtures and assert expected primary, maximum three ranks, no hard-failed recommendation, and deterministic repeat output.

- [ ] **Step 3: Run the complete automated suite**

Run: `node --test test/*.test.js`

Expected: all catalog, profile, eligibility, amount, matcher, report, schema, and API tests PASS.

- [ ] **Step 4: Build both client bundles**

Run: `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build`

Expected: modern and legacy bundles are present in `dist/assets`, with no build error.

- [ ] **Step 5: Verify desktop and mobile flows with Playwright**

Start the local API and Vite servers. Test 1440x900, 390x844, and 375x667 viewports. Complete one Amazon SC and one foreign-trade flow, verify result order, no overlapping UI, and report readability. Emulate iPhone Safari user agent and confirm the legacy bundle renders a nonblank page.

- [ ] **Step 6: Document rule maintenance**

Document catalog fields, allowed operators, version bump procedure, golden test update procedure, and the rule that unknown coefficients produce `manual` estimates rather than invented values.

- [ ] **Step 7: Update README and run final diff checks**

Add local test/build commands and architecture paths. Run `git diff --check`, inspect `git status --short`, and verify no generated customer data or credentials are staged.

- [ ] **Step 8: Commit verification and documentation**

```bash
git add -- test/fixtures/customerProfiles.js test/productMatcher.test.js docs/product-rule-maintenance.md README.md
git commit -m "test: verify AI product matching workflows"
```

---

## Completion Gate

Implementation is complete only when:

- `node --test test/*.test.js` passes.
- Vite produces modern and legacy bundles.
- Every product has passing, boundary, missing-data, and hard-failure coverage.
- Customer UI contains no internal scores or raw failure labels.
- Admin and Excel still require authentication and selected IDs.
- Desktop and target mobile screenshots show no overlap or clipped content.
- No production server or DNS change has been made.
