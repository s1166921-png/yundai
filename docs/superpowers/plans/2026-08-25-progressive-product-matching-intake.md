# Progressive Product Matching Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 14/58-89-field simple/complex intake with one three-stage adaptive flow that asks only product-discriminating customer questions, moves bank-only checks to admin verification, and preserves seven explainable product recommendations.

**Architecture:** The versioned catalog classifies every rule by collection stage. A normalized progressive profile derives duplicated facts such as Amazon platform, buyer-country admission, repayment fields, and combined consent fields before a customer-stage evaluator produces product direction, ranking, amount provenance, and advisor follow-up. React renders one primary scenario at a time; the Node server keeps legacy records readable while new `progressive-v1` leads use only the new matcher/report path.

**Tech Stack:** React 19, Vite 6, Node.js ESM HTTP server, Node built-in `node:test`, existing CSS design system, no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-progressive-product-matching-intake-design.md`

## Global Constraints

- Product hard rules remain deterministic; AI text cannot override eligibility or invent product facts.
- Main financing scenario is single-select and hidden fields are absent from submitted data.
- Normal customer journeys contain no more than 23 submitted fields, excluding the optional WeBank expansion inside Amazon SC.
- Advisor-only fields never reduce customer-stage confidence and never appear in the customer form or public response.
- Explicit customer-stage hard failures remain `ineligible`; missing customer-stage inputs remain `needs_information`.
- Customer output shows at most three products and never exposes scores, raw failed rules, internal ratings, or admin priority.
- RMB and USD remain separate; no silent conversion is permitted.
- Legacy simple/complex records stay readable, while new UI submissions use `intakeVersion: "progressive-v1"`.
- Existing admin authentication, selected-customer export, file mode `0600`, and same-origin/CORS protections remain intact.
- Vite legacy targets remain `iOS >= 10` and `Safari >= 10`.
- Every task ends with user-path QA at 1440px and 390px; browser findings are fixed before the task is accepted.
- No production deployment, DNS change, push, or merge is part of this plan.

---

### Task 1: Define the progressive intake contract and field budget

**Files:**
- Modify: `src/lib/matching/intakeSchema.js`
- Modify: `src/lib/matching/customerProfile.js`
- Modify: `test/intakeSchema.test.js`
- Modify: `test/customerProfile.test.js`

**Interfaces:**
- Produces: `INTAKE_VERSION = "progressive-v1"`
- Produces: `PRIMARY_BUSINESS_MODELS: readonly string[]`
- Produces: `getVisibleIntakeFields(profile): IntakeField[]`
- Produces: `validateIntakeStep(profile, step): IntakeError[]`
- Produces: `normalizeCustomerProfile(input): CustomerProfile` with derived legacy-compatible canonical fields.
- Produces: `validateCustomerProfile(profile, mode)` accepts `"progressive"` in addition to legacy `"simple"` and `"complex"`.
- Consumes later: Tasks 2, 4, and 5 use the exact field keys introduced here.

- [ ] **Step 1: Replace mode-count tests with a failing three-stage field-budget contract**

Add assertions equivalent to:

```js
test("progressive intake has three stable stages and one primary scenario", () => {
  assert.deepEqual(INTAKE_STEPS.map(({ id }) => id), [1, 2, 3]);
  const fields = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc" });
  assert.equal(fields.find(({ key }) => key === "primaryBusinessModel").type, "select");
  assert.equal(fields.some(({ key }) => key === "businessModels"), false);
});

test("every standard scenario stays within the 23-field budget", () => {
  for (const primaryBusinessModel of PRIMARY_BUSINESS_MODELS) {
    const fields = getVisibleIntakeFields({ primaryBusinessModel, entityRegion: "mainland" });
    assert.ok(fields.length <= 23, `${primaryBusinessModel}: ${fields.length}`);
  }
});

test("Amazon SC WeBank expansion is explicit and isolated", () => {
  const base = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc", includeWebankAssessment: false });
  const expanded = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc", includeWebankAssessment: true });
  assert.equal(base.some(({ key }) => key === "amazonAhrScore"), false);
  assert.equal(expanded.some(({ key }) => key === "amazonAhrScore"), true);
});
```

- [ ] **Step 2: Run the focused tests and verify the old five-step/multi-select contract fails**

Run: `node --test test/intakeSchema.test.js test/customerProfile.test.js`

Expected: FAIL because `INTAKE_STEPS` still has five entries and `businessModels` is still a checkbox group.

- [ ] **Step 3: Implement the exact progressive raw field contract**

Use three stages and these customer-facing keys:

```js
export const INTAKE_VERSION = "progressive-v1";
export const INTAKE_STEPS = Object.freeze([
  { id: 1, title: "融资场景与需求", shortTitle: "场景" },
  { id: 2, title: "关键经营数据", shortTitle: "经营" },
  { id: 3, title: "风险确认与联系信息", shortTitle: "提交" },
]);

export const PRIMARY_BUSINESS_MODELS = Object.freeze([
  "tax_operations", "amazon_sc", "amazon_vc", "platform_ecommerce",
  "b2b_supermarket", "general_import_export", "processing_manufacturing",
  "wholesale_retail", "other",
]);
```

Always visible: `companyName`, `primaryBusinessModel`, `preferredCurrency`, `requestedAmount`, `fundUse`, `hasCurrentOverdue`, `hasMaterialCreditOrJudicialNegative`, `contactName`, `phone`, `consentToDataUse`.

Conditional raw keys are limited to:

```js
[
  "entityRegion", "entityType", "registeredProvince", "companyAgeMonths",
  "annualRevenueRmb", "assetLiabilityRatioPercent", "creditBankCount",
  "settlementAccountOpenedMonths", "settlementAccountFlowNormal", "applicantRole",
  "legalRepresentativeAge", "taxInvoiceAmountRmb", "supportsHighAmountAuthorization",
  "controllerIndustryExperienceYears", "industry", "hasSelfOperatedImportExportQualification",
  "importExportAmountLast12MonthsUsd", "importExportAmountMonths13To24Usd",
  "daysSinceLatestImportExport", "importExportCountLast12Months",
  "importExportRevenueSharePercent", "foreignExchangeClassification",
  "platformHistoryMonths", "platformSites", "storeCount", "singleStoreGmvUsd",
  "qualifiedStoreCount", "hasCompatibleCollectionAccount", "acceptsAccountControl",
  "includeWebankAssessment", "allStoreSalesRmb", "platformRepaymentsLast12MonthsRmb",
  "refundRatePercent", "amazonAhrScore", "amazonAccountStatus",
  "fbaInventoryTurnoverCount", "borrowerMatchesCollectionEntity",
  "participatingStoreOperatingDays", "amazonAnnualGmvUsd",
  "acceptsReceivablesArrangement", "accountsReceivableBalanceUsd",
  "buyerName", "buyerCountry", "buyerTradingHistoryMonths", "annualB2bTradeUsd",
]
```

Do not define customer fields for `registeredCity`, `annualNetProfitRmb`, `revenueGrowthPercent`, `averageMonthlyFbaInventoryValueUsd`, `averagePaymentTermDays`, `totalApprovedCreditRmb`, `loanBalanceRmb`, `hasMajorLitigation`, or `hasAbnormalOperations`.

- [ ] **Step 4: Normalize progressive fields and derive legacy-compatible canonical facts**

`normalizeCustomerProfile` must derive:

```js
const businessModels = primaryBusinessModel === "tax_operations" || primaryBusinessModel === "other"
  ? []
  : [primaryBusinessModel];
const isAmazon = ["amazon_sc", "amazon_vc", "platform_ecommerce"].includes(primaryBusinessModel);
const hasTradeQualification = asBoolean(source.hasSelfOperatedImportExportQualification);
const acceptsReceivables = asBoolean(source.acceptsReceivablesArrangement);

return {
  intakeVersion: source.intakeVersion === "progressive-v1" ? "progressive-v1" : null,
  primaryBusinessModel,
  businessModels,
  primaryPlatformOrBuyerName: isAmazon ? "Amazon" : asText(source.buyerName),
  selfOperatedImportExport: hasTradeQualification,
  hasImportExportLicense: hasTradeQualification,
  allStoreRepayments: asMoney(source.platformRepaymentsLast12MonthsRmb, "RMB"),
  collectionsLast12Months: asMoney(source.platformRepaymentsLast12MonthsRmb, "RMB"),
  acceptsNoa: acceptsReceivables,
  acceptsReceivablesAssignment: acceptsReceivables,
};
```

The returned object continues to include every existing canonical profile key. Legacy raw keys remain accepted by the normalizer for historical/API compatibility, but the progressive raw keys listed in Step 3 take precedence for derived values.

- [ ] **Step 5: Run focused tests and verify field counts**

Run: `node --test test/intakeSchema.test.js test/customerProfile.test.js`

Expected: PASS; all standard scenarios are at most 23 fields and hidden legacy fields are absent.

- [ ] **Step 6: Perform Task 1 user-path QA**

At 1440×900 and 390×844, walk through every stage for `amazon_sc`, `amazon_vc`, `b2b_supermarket`, `general_import_export`, and `tax_operations`. Record field counts, confirm back navigation retains values, switching scenario removes hidden values from the payload, and no stage shows an empty panel or horizontal overflow.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/lib/matching/intakeSchema.js src/lib/matching/customerProfile.js test/intakeSchema.test.js test/customerProfile.test.js
git commit -m "feat: define progressive financing intake"
```

---

### Task 2: Classify product rules and derive buyer admission

**Files:**
- Create: `src/lib/matching/buyerAdmission.js`
- Create: `test/buyerAdmission.test.js`
- Modify: `src/lib/matching/customerProfile.js`
- Modify: `src/lib/matching/productCatalog.js`
- Modify: `src/lib/matching/ruleEvaluator.js`
- Modify: `test/customerProfile.test.js`
- Modify: `test/productCatalog.test.js`
- Modify: `test/ruleEvaluator.test.js`

**Interfaces:**
- Produces: `deriveBuyerAdmission({ buyerName, buyerCountry }): { buyerPlatformType, buyerCountryEligibility }`
- Produces: every catalog rule has `collectionStage: "customer_core" | "customer_conditional" | "advisor_verification" | "amount_only"`.
- Produces: `evaluateEligibility(product, profile, { stages }): EligibilityResult`.
- Produces: `ruleDependencyFields(rule): string[]`, returning the rule's anchor field plus custom evaluator dependency fields without duplicates.
- Consumes: Task 3 calls evaluator with customer stages only and separately exposes advisor verification items.

- [ ] **Step 1: Write failing buyer derivation and rule-stage tests**

```js
test("known B2B buyers and countries are derived without customer self-assessment", () => {
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "Costco", buyerCountry: "美国" }), {
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "confirmed_admitted",
  });
  assert.equal(deriveBuyerAdmission({ buyerName: "Unknown Buyer", buyerCountry: "未知地区" }).buyerCountryEligibility, "needs_review");
});

test("every product rule declares who supplies the fact", () => {
  for (const product of PRODUCT_CATALOG) {
    for (const rule of product.ruleSet) assert.ok(RULE_COLLECTION_STAGES.includes(rule.collectionStage));
  }
});

test("advisor-only unknowns do not lower customer eligibility", () => {
  const result = evaluateEligibility(cmbProduct, customerProfile, {
    stages: ["customer_core", "customer_conditional"],
  });
  assert.equal(result.missingFields.includes("internalBankRating"), false);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/buyerAdmission.test.js test/productCatalog.test.js test/ruleEvaluator.test.js`

Expected: FAIL because buyer derivation and `collectionStage` do not exist.

- [ ] **Step 3: Implement versioned buyer and country admission**

Use normalized case-insensitive aliases for `Walmart`, `Home Depot`, `Target`, `Costco`, and `Chewy`. Include the exact admitted countries and regions from the supplied Linklogis brief. Unknown buyer names and countries return review states, never false admission.

```js
export const BUYER_ADMISSION_VERSION = "2026-08-25";
export function deriveBuyerAdmission({ buyerName, buyerCountry }) {
  return {
    buyerPlatformType: admittedBuyer(buyerName) ? "admitted_1p_retailer" : "other",
    buyerCountryEligibility: admittedCountry(buyerCountry)
      ? "confirmed_admitted"
      : buyerCountry ? "needs_review" : null,
  };
}
```

- [ ] **Step 4: Add collection stages to all seven catalog rule sets**

Customer rules are the exact fields listed in Spec section 5. Bank ratings, risk-warning/AML/adverse-credit flags, financial continuity, controller status, credit exposure, core asset ratio, customs final classification, commodity share, and sales decline are `advisor_verification`. Optional amount inputs are `amount_only`.

Change the B2B buyer rule to consume derived `buyerPlatformType` and `buyerCountryEligibility`; do not ask the customer to choose either value.

Import `deriveBuyerAdmission` in `customerProfile.js` and set canonical `buyerPlatformType` and `buyerCountryEligibility` from `buyerName` and `buyerCountry` for progressive input. Legacy explicit canonical values remain accepted only for non-progressive payload compatibility.

- [ ] **Step 5: Add stage filtering to the evaluator**

```js
export function evaluateEligibility(product, profile = {}, options = {}) {
  const stages = options.stages == null ? null : new Set(options.stages);
  const rules = stages == null
    ? product.ruleSet
    : product.ruleSet.filter((rule) => stages.has(rule.collectionStage));
  return evaluateRules(rules, profile);
}
```

Preserve the existing no-options behavior for legacy tests and authenticated evidence.

Export `ruleDependencyFields(rule)` from `ruleEvaluator.js` by reusing the evaluator's existing dependency extraction. This function must include fields referenced by `fields`, `requiresAllTruthy`, `ratingField`, `currencyField`, `historyField`, `ratioField`, and the other named custom-evaluator field properties already covered by rule-evaluator tests.

- [ ] **Step 6: Run focused tests**

Run: `node --test test/buyerAdmission.test.js test/customerProfile.test.js test/productCatalog.test.js test/ruleEvaluator.test.js`

Expected: PASS.

- [ ] **Step 7: Perform Task 2 user-path QA**

Use the B2B form at desktop/mobile widths. Verify that selecting buyer name and country never asks the customer whether the buyer/country is admitted, and that Costco/美国 and an unknown buyer produce visibly different product directions without exposing the internal list.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/lib/matching/buyerAdmission.js src/lib/matching/customerProfile.js src/lib/matching/productCatalog.js src/lib/matching/ruleEvaluator.js test/buyerAdmission.test.js test/customerProfile.test.js test/productCatalog.test.js test/ruleEvaluator.test.js
git commit -m "feat: classify customer and advisor matching rules"
```

---

### Task 3: Rebuild customer-stage ranking and differentiated reports

**Files:**
- Modify: `src/lib/matching/productMatcher.js`
- Modify: `src/lib/matching/reportBuilder.js`
- Modify: `src/lib/productMatchView.js`
- Modify: `test/productMatcher.test.js`
- Modify: `test/reportBuilder.test.js`
- Modify: `test/productMatchView.test.js`
- Modify: `test/productMatchingGolden.test.js`

**Interfaces:**
- Produces: `matchProducts(profile, { intakeVersion }): ProductMatchResult[]`.
- Each result adds `advisorVerificationFields: string[]` and retains full authenticated evidence.
- Customer report labels are `优先产品方向`, `备选产品方向`, `待补关键信息`, and `暂不匹配`.
- Consumes: Task 4 persists and filters these results; Task 5 renders the public report.

- [ ] **Step 1: Write failing differentiation regressions**

Add golden profiles asserting:

```js
[
  [amazonScProfile, "linklogis-amazon-sc"],
  [amazonScWithWebankExpansion, "webank-cross-border-data-loan"],
  [amazonVcProfile, "linklogis-amazon-vc"],
  [b2bCostcoProfile, "linklogis-b2b-factoring"],
  [foreignTradeProfile, "pingan-foreign-trade-logistics-loan"],
  [guangdongTaxProfile, "cmb-guangdong-business-loan"],
  [nonGuangdongTaxProfile, "pingan-orange-tax-loan"],
].forEach(([profile, expected]) => {
  assert.equal(matchProducts(profile).find(({ rank }) => rank === 1).productId, expected);
});
```

Also assert that changing SC single-store GMV below the Linklogis boundary, changing VC site away from US, or changing B2B trading history to 12 months changes eligibility/ranking deterministically.

- [ ] **Step 2: Run matching/report tests and verify at least the customer-stage cases fail**

Run: `node --test test/productMatcher.test.js test/reportBuilder.test.js test/productMatchView.test.js test/productMatchingGolden.test.js`

Expected: FAIL because advisor rules still depress customer confidence and old presentation labels remain.

- [ ] **Step 3: Evaluate customer stages for status and confidence**

`matchProducts` calls `evaluateEligibility` with `customer_core` and `customer_conditional`. Advisor rules are collected separately:

```js
const CUSTOMER_STAGES = ["customer_core", "customer_conditional"];
const advisorVerificationFields = product.ruleSet
  .filter(({ collectionStage }) => collectionStage === "advisor_verification")
  .flatMap(ruleDependencyFields);
```

Customer confidence denominator includes customer-stage rules only. `amount_only` missing fields suppress numeric amount display but do not demote product direction.

- [ ] **Step 4: Make primary scenario the dominant ranking discriminator**

Use exact scenario mapping before weighted tie-breaking. `tax_operations` keeps CMB and Ping An Orange in competition; `amazon_sc` keeps Linklogis SC and optionally WeBank; all other scenarios have their specified primary candidate. Products outside the selected scenario may appear only as lower alternatives when no hard failure is known.

Keep the existing deterministic ordering and maximum three ranks.

- [ ] **Step 5: Update report labels and disclaimer**

Replace customer `优先匹配`/`备选方向` copy with the four labels from this task. A customer-stage pass may display a product estimator only when required estimator inputs are usable. Append: `仍需资金方及融资顾问核验完整资料，本结果不构成授信或放款承诺。`

- [ ] **Step 6: Run focused matching/report tests**

Run: `node --test test/productMatcher.test.js test/reportBuilder.test.js test/productMatchView.test.js test/productMatchingGolden.test.js`

Expected: PASS for all seven representative profiles and boundary mutations.

- [ ] **Step 7: Perform Task 3 user-path QA**

Submit seven representative profiles through the real API and inspect the rendered report at desktop/mobile widths. Confirm the first product differs by scenario, amounts appear only with sufficient amount inputs, alternatives are at most two, internal scores never appear, and every report includes the verification disclaimer.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/lib/matching/productMatcher.js src/lib/matching/reportBuilder.js src/lib/productMatchView.js test/productMatcher.test.js test/reportBuilder.test.js test/productMatchView.test.js test/productMatchingGolden.test.js
git commit -m "feat: differentiate progressive product recommendations"
```

---

### Task 4: Version progressive leads and retire disconnected scoring for new submissions

**Files:**
- Modify: `server/index.mjs`
- Modify: `test/serverLead.test.js`
- Modify: `src/lib/aiInsight.js`
- Test: `test/aiInsight.test.js`

**Interfaces:**
- Progressive POST payload: `{ intakeVersion: "progressive-v1", estimationMode: "progressive", ...visibleFields }`.
- Progressive persisted lead stores `profile`, `productMatches`, `matchReport`, `advisorVerificationFields`, and no generated legacy `estimate`/legacy `aiInsight`.
- Legacy simple/complex payloads keep existing estimate behavior for historical compatibility.
- Admin/export display `intakeVersion` and customer-safe advisor follow-up without exposing it publicly.

- [ ] **Step 1: Write failing progressive API tests**

```js
test("progressive leads do not calculate disconnected legacy scores", async () => {
  const payload = completeProgressiveAmazonScPayload();
  const response = await postLead(url, payload);
  assert.equal(response.lead.estimationMode, "progressive");
  const [stored] = await authenticatedLeads(url);
  assert.equal(stored.intakeVersion, "progressive-v1");
  assert.equal(Object.hasOwn(stored, "estimate"), false);
  assert.equal(Object.hasOwn(stored, "aiInsight"), false);
});

test("progressive raw input contains visible fields only", async () => {
  await postLead(url, { ...completeProgressiveAmazonVcPayload(), internalBankRating: "6AAA" });
  const [stored] = await authenticatedLeads(url);
  assert.equal(Object.hasOwn(stored.rawInput, "internalBankRating"), false);
});
```

- [ ] **Step 2: Run server tests and verify failure**

Run: `node --test test/serverLead.test.js test/aiInsight.test.js`

Expected: FAIL because only `simple` and `complex` modes are accepted and every lead receives legacy estimates.

- [ ] **Step 3: Add progressive version validation and allowlists**

Accept `progressive` in API mode validation only when `intakeVersion === "progressive-v1"`. Build progressive `rawInput` from `getVisibleIntakeFields(normalizedSource)` rather than the global field list. Unknown/hidden customer keys are ignored in storage and never reach matching.

- [ ] **Step 4: Split new and legacy lead calculation paths**

```js
const isProgressive = input.intakeVersion === INTAKE_VERSION;
const productMatches = matchProducts(profile, { intakeVersion: input.intakeVersion });
const base = { profile, productMatches, matchReport, intakeVersion: input.intakeVersion ?? null };
return isProgressive
  ? { ...identity, ...base, advisorVerificationFields: collectAdvisorFields(productMatches) }
  : { ...identity, ...legacyLeadFields, estimate, aiInsight, ...base };
```

Do not delete estimator modules or rewrite stored legacy files.

- [ ] **Step 5: Update admin columns and selected export**

Add `intakeVersion`, primary scenario, first product direction, amount range, and advisor verification fields. Legacy score columns remain available for legacy rows but are blank for progressive rows. Existing product/status/date filters and explicit selected IDs remain unchanged.

- [ ] **Step 6: Run API, auth, storage, privacy, and export tests**

Run: `node --test test/serverLead.test.js test/aiInsight.test.js`

Expected: PASS, including existing legacy compatibility tests.

- [ ] **Step 7: Perform Task 4 user-path QA**

Submit one progressive customer, log into the local admin, verify the row shows the correct primary scenario/product and advisor fields, select only that customer, export, and confirm no legacy score/default AI columns contain fabricated values. Verify unauthenticated admin/export still returns `401`.

- [ ] **Step 8: Commit Task 4**

```bash
git add server/index.mjs src/lib/aiInsight.js test/serverLead.test.js test/aiInsight.test.js
git commit -m "feat: persist progressive product matching leads"
```

---

### Task 5: Build the three-stage adaptive React experience

**Files:**
- Modify: `src/components/FinancingIntake.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `test/financingIntakeComponent.test.js`
- Modify: `test/intakeLifecycle.test.js`
- Modify: `test/browserCompatibility.test.js`

**Interfaces:**
- `FinancingIntake` submits `intakeVersion: "progressive-v1"` and `estimationMode: "progressive"`.
- The component consumes only `getVisibleIntakeFields(profile)` and `validateIntakeStep(profile, step)`.
- The optional WeBank control is a toggle; all other customer decisions use select, radio, checkbox, number, date, or text controls according to existing UI conventions.

- [ ] **Step 1: Write failing component lifecycle tests**

Mount the real component and assert:

```js
assert.equal(screen.queryByText("简易版"), null);
assert.equal(screen.queryByText("复杂版"), null);
assert.equal(screen.getAllByRole("listitem", { container: progress }).length, 3);
await chooseScenario("Amazon SC");
assert.ok(screen.getByLabelText("单店近 12 个月 GMV"));
assert.equal(screen.queryByLabelText("年交易额"), null);
await toggleWeBank(true);
assert.ok(screen.getByLabelText("Amazon AHR 分数"));
```

Also assert that switching from Amazon SC to B2B removes SC-only payload keys, in-flight submissions abort on edits, and server field errors focus the corresponding visible control.

- [ ] **Step 2: Run component tests and verify failure**

Run: `node --test test/financingIntakeComponent.test.js test/intakeLifecycle.test.js`

Expected: FAIL because the mode switch and five-stage wizard still render.

- [ ] **Step 3: Remove the mode switch and render three adaptive stages**

Initialize profile with `intakeVersion`, use a single `primaryBusinessModel`, clear hidden values when scenario changes, preserve visible values on back navigation, and submit only visible non-empty fields:

```js
const payload = visibleFields.reduce((result, field) => {
  const value = profile[field.key];
  if (!isEmpty(value)) result[field.key] = value;
  return result;
}, { intakeVersion: INTAKE_VERSION, estimationMode: "progressive" });
```

The submit button copy is `生成产品匹配报告`. The progress indicator has stable dimensions and never shifts when labels change.

- [ ] **Step 4: Add restrained progressive disclosure styling**

Use the current purple-cyan visual system. Do not add cards inside cards. Use full-width unframed stage bands, compact field groups, an explicit WeBank expansion toggle, fixed-height action row, and mobile one-column layout. Keep existing Flexbox fallbacks before Grid enhancements and avoid unsupported Safari 10 `gap` fallbacks.

- [ ] **Step 5: Update surrounding page copy**

Replace “选择匹配版本” with “提交关键经营信息，获取产品方向”. Describe the process as “系统会根据主要融资场景，只追问影响产品判断的关键信息”. Do not advertise field counts or implementation behavior inside the live product UI.

- [ ] **Step 6: Run component and legacy compatibility tests**

Run: `node --test test/financingIntakeComponent.test.js test/intakeLifecycle.test.js test/browserCompatibility.test.js`

Expected: PASS.

- [ ] **Step 7: Perform Task 5 user-path QA and optimize friction**

At 1440×900, 390×844, and 375×667:

1. Complete Amazon SC without WeBank expansion.
2. Complete Amazon SC with WeBank expansion.
3. Complete Amazon VC.
4. Complete B2B Costco/美国.
5. Complete foreign trade.
6. Complete Guangdong and non-Guangdong tax scenarios.
7. Go backward/forward, change scenario, trigger validation, submit, and inspect the report.

For every journey record: number of visible inputs, unclear labels, repeated questions, taps required, keyboard type, content overlap, horizontal overflow, scroll jumps, stale values, and whether the resulting first product matches the scenario. Fix all Critical/Important usability findings before acceptance.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/components/FinancingIntake.jsx src/App.jsx src/styles.css test/financingIntakeComponent.test.js test/intakeLifecycle.test.js test/browserCompatibility.test.js
git commit -m "feat: add adaptive progressive matching form"
```

---

### Task 6: Complete regression, privacy, and end-to-end acceptance

**Files:**
- Modify: `test/productMatchingGolden.test.js`
- Modify: `test/browserBundlePrivacy.test.js`
- Modify: `README.md`
- Create: `docs/progressive-intake-qa.md`

**Interfaces:**
- Produces: repeatable acceptance fixtures and a QA record for all customer journeys.
- Does not change public API behavior except to fix defects discovered by acceptance.

- [ ] **Step 1: Add final golden and privacy assertions**

Golden fixtures must cover all seven products, every strict threshold, unknown customer data, explicit hard failure, advisor-only missing data, and the optional WeBank expansion. Bundle tests must reject catalog rules, internal reasons, scores, advisor fields, and admin credentials in modern and legacy client assets.

- [ ] **Step 2: Run the complete suite**

Run: `node --test test/*.test.js`

Expected: PASS with zero failures.

- [ ] **Step 3: Build modern and legacy production bundles**

Run: `node ./node_modules/vite/bin/vite.js build`

Expected: exit 0 and output both `index-*.js` and `index-legacy-*.js` assets.

- [ ] **Step 4: Run final customer and admin E2E**

Start local API with exact allowed origin and local-only credentials, then start Vite. Complete the seven journeys from Task 5 and the selected-only admin export. Check browser console, network response status, empty/stale report behavior, 1440/390/375 overflow, and reduced-motion behavior.

- [ ] **Step 5: Document measured results and residual limitations**

`docs/progressive-intake-qa.md` records per journey: submitted field count, primary product, optional fields, desktop/mobile outcome, defects found/fixed, and residual limitations. Explicitly state that headless/desktop emulation is not a physical iPhone Safari test.

- [ ] **Step 6: Update README**

Document progressive payload version, local CORS startup example, admin credentials environment variables, single-process lead-store limitation, rule collection stages, and commands for tests/build/dev.

- [ ] **Step 7: Verify diff hygiene and final status**

Run:

```bash
git diff --check
git status --short
node --test test/*.test.js
node ./node_modules/vite/bin/vite.js build
```

Expected: no whitespace errors, only intended files before commit, all tests pass, build succeeds.

- [ ] **Step 8: Commit Task 6**

```bash
git add test/productMatchingGolden.test.js test/browserBundlePrivacy.test.js README.md docs/progressive-intake-qa.md
git commit -m "test: verify progressive matching user journeys"
```

No merge, push, or deployment follows this commit without explicit user authorization.
