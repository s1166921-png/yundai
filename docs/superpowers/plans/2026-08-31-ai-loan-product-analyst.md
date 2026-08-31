# 美鸥 AI 贷款产品分析师 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有“产品规则匹配 + AI 文案整理”升级为可输出参考融资区间、建议期限、区间依据、敏感因素和资料动作的 AI 贷款产品分析师。

**Architecture:** 保留产品目录和准入规则作为唯一事实来源，在其后增加版本化融资场景引擎，生成模型只能选择的保守、基准和积极候选。DeepSeek 仅返回白名单代码，服务端完成越界校验、中文解析、客户投影和失败降级；历史 v2 报告保持可读。

**Tech Stack:** React 19、Vite 6、Node.js ESM、Node Test Runner、DeepSeek Chat Completions API、原生 HTML/CSS 管理后台。

**Spec:** `docs/superpowers/specs/2026-08-31-ai-loan-product-analyst-design.md`

## Global Constraints

- 第一阶段只在本地开发和验证，不部署生产服务器。
- 产品目录、场景策略、AI 输入、提示词和输出契约必须分别版本化。
- DeepSeek 不能修改准入、排序、币种、产品上限、期限边界或参考定价。
- DeepSeek 只能选择服务端候选代码，不得返回自由金融数字或自由文本。
- 企业名称、联系人、手机号、客户编号、银行账号、买方名称、合同、流水和征信不得发送给模型。
- 资料不足时返回“补充资料后可量化”或“待银行最终核定”，不得伪造额度。
- AI 失败不得影响客户记录保存、规则报告、后台查看和 Excel 导出。
- 客户页面不得展示内部评分、提示词、Token、错误类别、模型原始响应或顾问内部备注。
- 验收覆盖 1440 像素桌面和 390 像素现代手机视口，不进行旧款 iPhone 专项验证。
- 不新增运行时依赖；继续使用 Node Test Runner 和现有 React/CSS 结构。

---

### Task 1: 版本化融资场景引擎

**Files:**
- Create: `src/lib/matching/financingScenarioEngine.js`
- Modify: `src/lib/matching/amountEstimators.js`
- Test: `test/financingScenarioEngine.test.js`
- Test: `test/amountEstimators.test.js`

**Interfaces:**
- Consumes: `estimateAmount(product, profile)`、`getProductById(productId)`、`productMatches[]`。
- Produces: `SCENARIO_POLICY_VERSION` 和 `buildFinancingScenarioInput({ profile, productMatches })`。
- Return type: `{ policyVersion: string, products: FinancingScenarioProduct[] }`；每个产品包含不可变的 `productId`、`rank`、`eligibilityStatus`、`amountScenarios`、`termOptions`、`pricingReference`、`missingEvidenceCodes`。

- [ ] **Step 1: 写出融资场景边界的失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildFinancingScenarioInput } from "../src/lib/matching/financingScenarioEngine.js";

test("WeBank scenarios stay inside monthly collections and catalog cap", () => {
  const result = buildFinancingScenarioInput({
    profile: {
      collectionsLast12Months: { amount: 12000000, currency: "RMB" },
      requestedAmount: { amount: 4000000, currency: "RMB" },
    },
    productMatches: [{ productId: "webank-cross-border-data-loan", rank: 1, status: "eligible" }],
  });
  const product = result.products[0];
  assert.deepEqual(product.amountScenarios.map(({ scenarioCode }) => scenarioCode), [
    "conservative", "balanced", "growth",
  ]);
  assert.equal(Math.max(...product.amountScenarios.map(({ maximum }) => maximum)), 3500000);
  assert.deepEqual(product.termOptions, ["webank_4_plus_5", "webank_3_plus_6"]);
});

test("Amazon SC scenarios never exceed demand or qualified-store cap", () => {
  const result = buildFinancingScenarioInput({
    profile: {
      qualifiedStoreCount: 1,
      requestedAmount: { amount: 2000000, currency: "USD" },
      singleStoreGmv: { amount: 6500000, currency: "USD" },
      platformHistoryMonths: 18,
    },
    productMatches: [{ productId: "linklogis-amazon-sc", rank: 1, status: "eligible" }],
  });
  assert.equal(Math.max(...result.products[0].amountScenarios.map(({ maximum }) => maximum)), 2000000);
  assert.deepEqual(result.products[0].termOptions, ["sc_90_days", "sc_revolving"]);
});

test("products without a verified formula return no numeric scenarios", () => {
  const result = buildFinancingScenarioInput({
    profile: {},
    productMatches: [{ productId: "cmb-guangdong-business-loan", rank: 1, status: "needs_information" }],
  });
  assert.deepEqual(result.products[0].amountScenarios, []);
  assert.equal(result.products[0].quantificationStatus, "needs_evidence");
});
```

- [ ] **Step 2: 运行场景引擎测试并确认失败**

Run: `node --test test/financingScenarioEngine.test.js`

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`，因为 `financingScenarioEngine.js` 尚未创建。

- [ ] **Step 3: 创建最小场景引擎并明确 v1 公式**

```js
export const SCENARIO_POLICY_VERSION = "meiou-financing-scenarios-v1";

const TERM_CODES = Object.freeze({
  "webank-cross-border-data-loan": ["webank_4_plus_5", "webank_3_plus_6"],
  "pingan-foreign-trade-logistics-loan": ["up_to_36_months"],
  "linklogis-amazon-sc": ["sc_90_days", "sc_revolving"],
  "linklogis-amazon-vc": ["up_to_120_days"],
  "linklogis-b2b-factoring": ["up_to_120_days"],
});

const range = (scenarioCode, currency, minimum, maximum, assumptionCodes) => ({
  scenarioCode, currency, minimum, maximum, assumptionCodes,
});

export function buildFinancingScenarioInput({ profile = {}, productMatches = [] } = {}) {
  return {
    policyVersion: SCENARIO_POLICY_VERSION,
    products: productMatches
      .filter(({ rank, status }) => rank >= 1 && rank <= 3 && status !== "ineligible")
      .sort((left, right) => left.rank - right.rank)
      .map((match) => buildProductScenarios(match, profile)),
  };
}
```

实现以下可测试策略：

- 微众：基准单位为近 12 个月回款除以 12；保守为 1.0–1.5 倍、基准为 1.5–2.5 倍、积极为 2.5–3.5 倍；全部受 2000 万元和同币种融资意向上限约束。
- 联易融 SC：可用上限为 `min(合格店铺数 × 300 万美元, 同币种融资意向)`；保守、基准、积极分别为上限的 40%–60%、60%–80%、80%–100%。这些是美鸥 v1 仿真场景，不宣称为资金方核额公式。
- 平安物流贷：现有公式能精确测算时输出一个 `balanced` 场景；缺营收、税票或行业时不输出数字。
- 平安橙业贷、招商经营贷、联易融 VC 和 B2B：在缺少核额比例前 `amountScenarios` 为空。
- 所有范围用 `Math.round` 取整，过滤 `maximum <= 0`、`minimum > maximum` 和非有限数字。

- [ ] **Step 4: 运行场景与原额度估算测试**

Run: `node --test test/financingScenarioEngine.test.js test/amountEstimators.test.js`

Expected: PASS，且现有 `estimateAmount()` 行为没有回归。

- [ ] **Step 5: 提交场景引擎**

```bash
git add src/lib/matching/financingScenarioEngine.js src/lib/matching/amountEstimators.js test/financingScenarioEngine.test.js test/amountEstimators.test.js
git commit -m "feat: add versioned financing scenario engine"
```

---

### Task 2: v3 脱敏分析输入与代码词典

**Files:**
- Create: `src/lib/ai/loanAnalystReferences.js`
- Modify: `src/lib/matching/intakeSchema.js`
- Modify: `src/lib/matching/customerProfile.js`
- Modify: `src/lib/ai/analysisInputBuilder.js`
- Test: `test/intakeSchema.test.js`
- Test: `test/customerProfile.test.js`
- Test: `test/analysisInputBuilder.test.js`
- Test: `test/bundlePrivacy.test.js`

**Interfaces:**
- Consumes: `buildFinancingScenarioInput({ profile, productMatches })` 和现有 `buildProductReferenceCodes()`。
- Produces: `AI_ANALYSIS_SCHEMA_VERSION = "meiou-analysis-v3"`、`buildAiAnalysisInput()`。
- `loanAnalystReferences.js` produces `buildRiskCodes()`、`buildSensitivityCodes()`、`resolveLoanAnalystCode(code)` 和期限/可信度中文解析器。

- [ ] **Step 1: 增加必要条件字段和 v3 输入契约失败测试**

```js
test("logistics intake exposes optional revenue, invoice and debt fields", () => {
  const fields = getVisibleIntakeFields({ primaryBusinessModel: "general_import_export" });
  const byKey = new Map(fields.map((field) => [field.key, field]));
  assert.equal(byKey.has("annualRevenueRmb"), true);
  assert.equal(byKey.has("taxInvoiceAmountRmb"), true);
  assert.equal(byKey.has("currentLoanBalanceRmb"), true);
  assert.equal(byKey.get("currentLoanBalanceRmb").requiredFor.length, 0);
});

test("v3 input contains selectable scenarios without customer identity", () => {
  const input = buildAiAnalysisInput({
    profile: {
      companyName: "不应发送的企业",
      contactName: "张三",
      phone: "13800000000",
      primaryBusinessModel: "amazon_sc",
      qualifiedStoreCount: 1,
      requestedAmount: { amount: 2000000, currency: "USD" },
      singleStoreGmv: { amount: 6500000, currency: "USD" },
      platformHistoryMonths: 18,
    },
    productMatches: [{
      productId: "linklogis-amazon-sc", rank: 1, status: "eligible",
      passedRules: [], unknownRules: [],
    }],
    matchReport: { missingDocuments: ["Amazon 近 12 个月 GMV 证明"] },
  });
  assert.equal(input.schemaVersion, "meiou-analysis-v3");
  assert.equal(JSON.stringify(input).includes("不应发送的企业"), false);
  assert.equal(JSON.stringify(input).includes("13800000000"), false);
  assert.deepEqual(input.products[0].amountScenarioCodes, ["conservative", "balanced", "growth"]);
  assert.deepEqual(input.products[0].amountScenarios.map(({ scenarioCode }) => scenarioCode), [
    "conservative", "balanced", "growth",
  ]);
  assert.deepEqual(input.products[0].termCodes, ["sc_90_days", "sc_revolving"]);
});
```

- [ ] **Step 2: 运行输入测试并确认版本断言失败**

Run: `node --test test/intakeSchema.test.js test/customerProfile.test.js test/analysisInputBuilder.test.js test/bundlePrivacy.test.js`

Expected: FAIL，实际 schema 仍为 `meiou-analysis-v2`，产品中没有场景代码。

- [ ] **Step 3: 补齐精简条件字段并升级输入生成器**

`annualRevenueRmb` 和 `taxInvoiceAmountRmb` 在税务经营、一般进出口、加工制造和批发零售场景可见；新增非必填 `currentLoanBalanceRmb`，在选择主营场景后可见。三者均映射为人民币 money object，其中现有贷款余额使用规范字段 `currentLoanBalance`。字段只在影响核额和风险分析时出现，不扩大必填字段集合。

```js
export const AI_ANALYSIS_SCHEMA_VERSION = "meiou-analysis-v3";

export const buildAiAnalysisInput = ({ profile = {}, productMatches = [], matchReport = {} } = {}) => {
  const financing = buildFinancingScenarioInput({ profile, productMatches });
  const scenarioByProduct = new Map(financing.products.map((item) => [item.productId, item]));
  const products = rankedProducts(productMatches).map((product) => {
    const scenario = scenarioByProduct.get(product.productId);
    return {
      ...product,
      quantificationStatus: scenario?.quantificationStatus ?? "needs_evidence",
      amountScenarios: scenario?.amountScenarios ?? [],
      amountScenarioCodes: scenario?.amountScenarios.map(({ scenarioCode }) => scenarioCode) ?? [],
      termCodes: scenario?.termOptions ?? [],
      riskCodes: buildRiskCodes({ profile, productId: product.productId }),
      sensitivityCodes: buildSensitivityCodes({ profile, productId: product.productId }),
      confidenceCodes: ["low", "medium", "high"],
    };
  });
  return { schemaVersion: AI_ANALYSIS_SCHEMA_VERSION, policyVersion: financing.policyVersion, facts, summaryCodes, products, preparationActionCodes, advisorFocusCodes };
};
```

代码词典至少覆盖：回款待核验、现有负债待核验、店铺状态待核验、账户控制安排、回款提高可能上调、负债上升可能下调、资料补齐可缩窄区间、期限与回款周期匹配。所有解析后的中文必须是服务端自有固定文本。

- [ ] **Step 4: 运行输入和隐私测试**

Run: `node --test test/intakeSchema.test.js test/customerProfile.test.js test/analysisInputBuilder.test.js test/bundlePrivacy.test.js`

Expected: PASS；扫描构建输入时不出现企业名称、联系人、手机号或自由文本买方名称。

- [ ] **Step 5: 提交 v3 输入**

```bash
git add src/lib/ai/loanAnalystReferences.js src/lib/matching/intakeSchema.js src/lib/matching/customerProfile.js src/lib/ai/analysisInputBuilder.js test/intakeSchema.test.js test/customerProfile.test.js test/analysisInputBuilder.test.js test/bundlePrivacy.test.js
git commit -m "feat: build deidentified loan analyst input"
```

---

### Task 3: DeepSeek v3 严格选择契约与降级

**Files:**
- Modify: `src/lib/ai/aiReportContract.js`
- Modify: `src/lib/ai/fallbackReportBuilder.js`
- Modify: `server/ai/deepSeekClient.mjs`
- Modify: `server/ai/aiReportService.mjs`
- Test: `test/aiReportContract.test.js`
- Test: `test/aiReportService.test.js`

**Interfaces:**
- Consumes: Task 2 的 `meiou-analysis-v3` 输入和各产品白名单代码。
- Produces: `AI_NARRATIVE_SCHEMA_VERSION = "meiou-ai-analyst-v3"`、`validateAiNarrative(raw, analysisInput)`、`buildPersistedAiAnalysis()`、`publicAiReport()`。
- 模型每个产品只能返回 `productId`、`selectedAmountScenarioCode`、`selectedTermCode`、`reasonCodes`、`riskCodes`、`sensitivityCodes`、`confidenceCode`。

- [ ] **Step 1: 写出合法选择、越界和降级失败测试**

```js
test("accepts only supplied amount and term codes", () => {
  const input = analystInputFixture();
  const raw = {
    schemaVersion: "meiou-ai-analyst-v3",
    portfolioSummaryCodes: input.summaryCodes.slice(0, 2),
    productAnalyses: [{
      productId: input.products[0].productId,
      selectedAmountScenarioCode: "balanced",
      selectedTermCode: "sc_90_days",
      reasonCodes: input.products[0].reasonCodes.slice(0, 1),
      riskCodes: input.products[0].riskCodes.slice(0, 1),
      sensitivityCodes: input.products[0].sensitivityCodes.slice(0, 1),
      confidenceCode: "medium",
    }],
    preparationActionCodes: input.preparationActionCodes.slice(0, 2),
    advisorFocusCodes: input.advisorFocusCodes.slice(0, 2),
  };
  assert.equal(validateAiNarrative(raw, input).ok, true);
  raw.productAnalyses[0].selectedAmountScenarioCode = "invented-20m";
  assert.equal(validateAiNarrative(raw, input).ok, false);
});

test("contract violation returns a deterministic v3 fallback", async () => {
  const service = createAiReportService({ client: invalidScenarioClient(), limiter: unlimitedLimiter() });
  const result = await service.generate(validLeadFixture());
  assert.equal(result.status, "fallback");
  assert.equal(result.meta.errorCategory, "contract_violation");
  assert.equal(result.customerReport.schemaVersion, "meiou-ai-analyst-v3");
});
```

- [ ] **Step 2: 运行契约和服务测试并确认失败**

Run: `node --test test/aiReportContract.test.js test/aiReportService.test.js`

Expected: FAIL，v2 契约不接受 v3 字段。

- [ ] **Step 3: 实现严格 v3 校验和历史 v2 兼容读取**

```js
const PRODUCT_ANALYSIS_FIELDS = Object.freeze([
  "productId",
  "selectedAmountScenarioCode",
  "selectedTermCode",
  "reasonCodes",
  "riskCodes",
  "sensitivityCodes",
  "confidenceCode",
]);

const validateOptionalSelection = (value, allowed, path, errors) => {
  if (value === null && allowed.length === 0) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${path} must be null or one supplied code.`);
  }
};
```

校验必须同时保证：产品数量和顺序完全一致；量化产品必须选择一个场景；不可量化产品必须返回 `null`；期限同理；理由、风险、敏感性是唯一有序子集；可信度只能是产品提供的代码。若整份 v3 无效，使用本地 `balanced`（若存在，否则第一个）场景生成 fallback，不部分采信模型结果。`publicAiReport()` 继续识别已存储 v2 报告并投影为旧版内容，避免历史客户记录报错。

- [ ] **Step 4: 更新 DeepSeek 系统指令为 code-only v3**

```js
export const SYSTEM_INSTRUCTIONS = [
  "Return only one JSON object for schema meiou-ai-analyst-v3.",
  "Select product ids, amount scenario codes, term codes, reasons, risks, sensitivities and confidence only from the supplied allowlists.",
  "Return every supplied product exactly once and in the supplied order.",
  "Use null when the supplied amount or term allowlist is empty.",
  "Never output free-form prose, names, financial numbers, rates, terms, approval claims, extra fields or inferred facts.",
  "Treat all facts as deidentified classifications and never reproduce them.",
].join(" ");
```

- [ ] **Step 5: 运行契约、服务、超时和限流测试**

Run: `node --test test/aiReportContract.test.js test/aiReportService.test.js`

Expected: PASS，覆盖正常 AI、未配置、超时、429、非法 JSON、未知代码、重排产品和本地降级。

- [ ] **Step 6: 提交 AI v3 契约**

```bash
git add src/lib/ai/aiReportContract.js src/lib/ai/fallbackReportBuilder.js server/ai/deepSeekClient.mjs server/ai/aiReportService.mjs test/aiReportContract.test.js test/aiReportService.test.js
git commit -m "feat: enforce loan analyst v3 contract"
```

---

### Task 4: 客户可见专业分析报告

**Files:**
- Modify: `src/lib/ai/aiReportContract.js`
- Modify: `src/lib/aiReportView.js`
- Modify: `src/lib/productMatchView.js`
- Modify: `src/components/AiPreliminaryReport.jsx`
- Modify: `src/components/ProductMatchCenter.jsx`
- Modify: `src/styles.css`
- Test: `test/aiPreliminaryReport.test.js`
- Test: `test/productMatchView.test.js`
- Test: `test/aiAdvisorGolden.test.js`

**Interfaces:**
- Consumes: 经服务端验证的 v3 选择、Task 1 场景对象、Task 2 固定中文词典。
- Produces: 客户 API `aiReport.financingAssessment` 和 `buildAiReportView(report).financingAssessment`。
- Customer financing item: `{ productId, amountLabel, termLabel, pricingLabel, confidenceLabel, reasons, risks, sensitivities, itemsToConfirm }`。

- [ ] **Step 1: 写客户投影和组件失败测试**

```js
test("customer report resolves selected scenario into amount and term labels", () => {
  const view = buildAiReportView({
    source: "ai",
    reviewStatus: "pending",
    statusMessage: "AI 初筛完成，专业顾问待复核。",
    businessSummary: ["当前处于稳定经营阶段。"],
    financingAssessment: [{
      productId: "linklogis-amazon-sc",
      amountLabel: "160-200万美元",
      termLabel: "90天",
      pricingLabel: "年化9%-11%",
      confidenceLabel: "中等可信度",
      reasons: ["店铺经营时长满足基础条件。"],
      risks: ["近12个月回款仍需核验。"],
      sensitivities: ["稳定回款提高后参考区间可能上调。"],
      itemsToConfirm: ["Amazon近12个月回款证明"],
    }],
    preparationActions: [],
    privacyNotice: "AI仅分析脱敏经营字段。",
  });
  assert.equal(view.financingAssessment[0].amountLabel, "160-200万美元");
  assert.equal(view.financingAssessment[0].termLabel, "90天");
});
```

同时在 JSX 静态渲染测试中断言出现“AI 参考融资能力”“区间形成原因”“敏感性分析”“融资准备清单”，且不出现 `promptVersion`、`usage`、`errorCategory`。

- [ ] **Step 2: 运行报告视图测试并确认失败**

Run: `node --test test/aiPreliminaryReport.test.js test/productMatchView.test.js test/aiAdvisorGolden.test.js`

Expected: FAIL，因为现有报告仅有经营判断和准备清单。

- [ ] **Step 3: 服务端解析选中场景并生成客户安全投影**

```js
const resolveSelectedScenario = (productInput, analysis) => {
  const selected = productInput.amountScenarios.find(({ scenarioCode }) => (
    scenarioCode === analysis.selectedAmountScenarioCode
  ));
  return selected == null ? null : {
    currency: selected.currency,
    minimum: selected.minimum,
    maximum: selected.maximum,
  };
};
```

`publicAiReport()` 只能从当前服务端重建的 `analysisInput` 解析金额、期限和定价，不能直接相信数据库中的自由文本或模型响应。无法量化时返回 `amountLabel: "补充资料后可量化"`；目录缺期限时返回 `termLabel: "待银行最终核定"`。

- [ ] **Step 4: 重构客户报告组件为规整的四段布局**

```jsx
<section className="ai-financing-assessment" aria-labelledby="ai-financing-title">
  <span>02</span>
  <div>
    <h3 id="ai-financing-title">AI 参考融资能力</h3>
    <div className="ai-financing-grid">
      {view.financingAssessment.map((item) => <FinancingAssessment key={item.productId} item={item} />)}
    </div>
  </div>
</section>
<section className="ai-report-sensitivity" aria-labelledby="ai-sensitivity-title">...</section>
<section className="ai-report-actions" aria-labelledby="ai-actions-title">...</section>
```

桌面使用 `grid-template-columns: repeat(2, minmax(0, 1fr))`，390 像素媒体查询改为单列；卡片圆角不超过 8px；金额、期限、定价是首屏可扫描字段；风险和敏感因素使用清晰文字，不用内部代码或分数。

- [ ] **Step 5: 运行视图、Golden 和隐私测试**

Run: `node --test test/aiPreliminaryReport.test.js test/productMatchView.test.js test/aiAdvisorGolden.test.js test/aiReportContract.test.js test/bundlePrivacy.test.js`

Expected: PASS，AI 成功和规则降级都能生成完整、客户安全的报告结构。

- [ ] **Step 6: 提交客户报告**

```bash
git add src/lib/ai/aiReportContract.js src/lib/aiReportView.js src/lib/productMatchView.js src/components/AiPreliminaryReport.jsx src/components/ProductMatchCenter.jsx src/styles.css test/aiPreliminaryReport.test.js test/productMatchView.test.js test/aiAdvisorGolden.test.js
git commit -m "feat: present AI financing assessment report"
```

---

### Task 5: 顾问后台的场景依据和复核信息

**Files:**
- Modify: `server/index.mjs`
- Modify: `server/adminPage.mjs`
- Modify: `server/advisorReview.mjs`
- Test: `test/serverLead.test.js`
- Test: `test/advisorReview.test.js`

**Interfaces:**
- Consumes: 存储的 `aiAnalysis`、当前产品目录和当前 `SCENARIO_POLICY_VERSION`。
- Produces: 管理 API 中的 `aiScenarioAudit`，包含 `policyVersion`、候选场景、AI 选择、缺失资料、元数据和顾问复核状态。
- 不改变现有复核写入接口及 revision 乐观锁语义。

- [ ] **Step 1: 写后台审计投影和历史重建失败测试**

```js
test("admin lead exposes current scenario audit without exposing it publicly", async () => {
  const created = await submitProgressiveAmazonLead(server);
  const publicLead = await getPublicLead(server, created.id);
  const adminLead = await getAdminLead(server, created.id);
  assert.equal(Object.hasOwn(publicLead, "aiScenarioAudit"), false);
  assert.equal(adminLead.aiScenarioAudit.policyVersion, "meiou-financing-scenarios-v1");
  assert.equal(adminLead.aiScenarioAudit.products[0].selectedScenarioCode, "balanced");
});

test("historical lead is reprojected with current catalog term labels", async () => {
  const lead = historicalV2LeadFixture();
  const admin = await projectAdminLead(lead);
  assert.doesNotThrow(() => admin.aiReport);
  assert.equal(admin.matchReport.primary.term, "4+5 或 3+6，额度有效期 1 年");
});
```

- [ ] **Step 2: 运行后台测试并确认审计字段缺失**

Run: `node --test test/serverLead.test.js test/advisorReview.test.js`

Expected: FAIL，管理投影没有 `aiScenarioAudit`。

- [ ] **Step 3: 增加仅管理员可见的场景审计投影**

```js
function buildAiScenarioAudit(lead) {
  const scenarioInput = buildFinancingScenarioInput({
    profile: lead?.profile,
    productMatches: lead?.productMatches,
  });
  const selectedByProduct = new Map(
    (lead?.aiAnalysis?.customerReport?.productAnalyses ?? [])
      .map((item) => [item.productId, item]),
  );
  return {
    policyVersion: scenarioInput.policyVersion,
    products: scenarioInput.products.map((product) => ({
      ...product,
      selectedScenarioCode: selectedByProduct.get(product.productId)?.selectedAmountScenarioCode ?? null,
      selectedTermCode: selectedByProduct.get(product.productId)?.selectedTermCode ?? null,
    })),
  };
}
```

`publicLead()` 不增加该字段；`adminLead()` 增加该字段。后台显示“规则边界”“AI 选择”“影响因素”“待补资料”“规则版本”和现有 DeepSeek 元数据，但不显示 API 密钥、原始响应或完整脱敏输入。

- [ ] **Step 4: 更新后台详情 UI**

在 `server/adminPage.mjs` 的客户详情中增加 `AI 专业分析` 区域，按产品一行展示参考区间、期限、定价、可信度、主要风险和待补资料。保留“待复核、复核中、已复核、需补资料”状态和现有备注/重试操作，不增加修改全局公式的入口。

- [ ] **Step 5: 运行后台、导出和并发复核测试**

Run: `node --test test/serverLead.test.js test/advisorReview.test.js`

Expected: PASS；选择导出仍只导出所选客户，重复导出不改变客户数据，revision 冲突仍返回 409。

- [ ] **Step 6: 提交后台复核功能**

```bash
git add server/index.mjs server/adminPage.mjs server/advisorReview.mjs test/serverLead.test.js test/advisorReview.test.js
git commit -m "feat: add advisor scenario audit view"
```

---

### Task 6: 全链路验证、真实 DeepSeek 冒烟和浏览器验收

**Files:**
- Modify: `test/aiAdvisorGolden.test.js`
- Modify: `test/aiPreliminaryReport.test.js`
- Modify: `test/browserCompatibility.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–5 的最终 API、页面和后台。
- Produces: 可重复的本地验证命令、五类 Golden 场景、运行说明和验收证据。

- [ ] **Step 1: 增加五类业务 Golden 场景**

```js
const CASES = [
  ["amazon-sc-complete", "linklogis-amazon-sc", "growth"],
  ["amazon-sc-missing-collections", "linklogis-amazon-sc", "conservative"],
  ["webank-medium-collections", "webank-cross-border-data-loan", "balanced"],
  ["pingan-logistics-manufacturing", "pingan-foreign-trade-logistics-loan", "balanced"],
  ["cmb-missing-formula", "cmb-guangdong-business-loan", null],
];

for (const [fixtureName, expectedProductId, expectedScenarioCode] of CASES) {
  test(`golden analyst case: ${fixtureName}`, () => {
    const result = buildDeterministicAnalystFixture(fixtureName);
    assert.equal(result.productAnalyses[0].productId, expectedProductId);
    assert.equal(result.productAnalyses[0].selectedAmountScenarioCode, expectedScenarioCode);
  });
}
```

另覆盖需求金额超过产品上限、币种不一致、当前逾期、拒绝账户管理、VC/B2B 暂不能精确量化。

- [ ] **Step 2: 运行完整自动化测试**

Run: `npm test`

Expected: 全部 PASS，无跳过测试、未处理 Promise rejection 或隐私扫描失败。

- [ ] **Step 3: 构建现代与 legacy 产物**

Run: `npm run build`

Expected: Vite 构建成功；浏览器兼容测试确认现代入口和 legacy 入口仍存在；不要求旧款 iPhone 实机验证。

- [ ] **Step 4: 使用本地 API 完成真实 DeepSeek 冒烟**

启动 API 时只从进程环境注入 `DEEPSEEK_API_KEY`，不写入仓库。提交一条测试 Amazon SC 客户，断言响应满足：

```js
assert.equal(response.aiReport.source, "ai");
assert.equal(response.aiReport.financingAssessment[0].productId, "linklogis-amazon-sc");
assert.match(response.aiReport.financingAssessment[0].amountLabel, /美元/);
assert.match(response.aiReport.financingAssessment[0].termLabel, /90天|循环/);
```

随后将模型配置移除再提交一次，断言 `source === "rules_fallback"` 且客户仍能看到本地融资区间。

- [ ] **Step 5: 完成桌面和现代手机端用户验收**

用 Playwright 打开 `http://127.0.0.1:5173/`：

- 1440×1000：完成一次条件式表单提交，确认报告区间、期限、定价、风险和行动建议不重叠。
- 390×844：完成同一路径，确认报告单列、最长字段换行、按钮可点击、页面无水平滚动。
- 打开 `http://127.0.0.1:8787/admin`：确认客户详情、AI 场景审计、顾问复核和选择导出可用。
- 截图并检查页面不是空白，控制台无未捕获错误，请求无 CORS 失败。

- [ ] **Step 6: 更新本地运行与隐私说明**

在 `README.md` 记录：前端/API 启动命令、DeepSeek 环境变量名称、AI v3 降级行为、仅脱敏字段发送、客户报告非授信承诺、管理员复核入口。不得记录真实 API key、服务器密码或客户数据。

- [ ] **Step 7: 最终提交**

```bash
git add test/aiAdvisorGolden.test.js test/aiPreliminaryReport.test.js test/browserCompatibility.test.js README.md
git commit -m "test: verify AI loan analyst workflow"
```

- [ ] **Step 8: 最终分支检查**

Run: `git status --short && git log --oneline -8`

Expected: 仅保留实施前已存在且明确不属于本计划的工作区改动；本计划产生的文件均已提交，提交历史按 Task 1–6 分段可审查。
