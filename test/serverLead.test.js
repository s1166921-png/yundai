import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, readFile, readdir, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createMeiouServer } from "../server/index.mjs";
import { buildAdminPage } from "../server/adminPage.mjs";
import { getVisibleIntakeFields } from "../src/lib/matching/intakeSchema.js";

const serverEntryPath = fileURLToPath(new URL("../server/index.mjs", import.meta.url));

const testAdminCredentials = Object.freeze({
  username: "integration-admin",
  password: "integration-password",
});

const basicAuthorization = (username, password) => (
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
);

const adminAuthorization = basicAuthorization(
  testAdminCredentials.username,
  testAdminCredentials.password,
);

const completeAmazonScPayload = (overrides = {}) => ({
  estimationMode: "complex",
  companyName: "Amazon SC Trading Co.",
  contactName: "Ada Chen",
  phone: "13800138000",
  entityRegion: "mainland",
  entityType: "limited_company",
  businessModels: ["amazon_sc"],
  primaryPlatformOrBuyerName: "Amazon",
  platformHistoryMonths: 13,
  singleStoreGmvUsd: 6000000,
  qualifiedStoreCount: 1,
  acceptsAccountControl: true,
  hasCompatibleCollectionAccount: false,
  preferredCurrency: "usd",
  requestedAmount: 2000000,
  preferredTermMonths: 3,
  fundUse: "inventory_procurement",
  preferredRepaymentMethod: "revolving",
  consentToDataUse: true,
  ...overrides,
});

const completeAmazonVcPayload = (overrides = {}) => ({
  estimationMode: "complex",
  companyName: "Amazon VC Trading Co.",
  contactName: "Victor Chen",
  phone: "13800138001",
  entityRegion: "mainland",
  entityType: "limited_company",
  businessModels: ["amazon_vc"],
  primaryPlatformOrBuyerName: "Amazon",
  platformSites: ["united_states"],
  platformHistoryMonths: 7,
  amazonAnnualGmvUsd: 2500000,
  accountsReceivableBalanceUsd: 900000,
  acceptsNoa: true,
  acceptsAccountControl: true,
  acceptsReceivablesAssignment: true,
  preferredCurrency: "usd",
  requestedAmount: 2000000,
  preferredTermMonths: 4,
  fundUse: "receivables_turnover",
  preferredRepaymentMethod: "receivables_collection",
  consentToDataUse: true,
  ...overrides,
});

const completeB2bPayload = (overrides = {}) => ({
  estimationMode: "complex",
  companyName: "B2B Factoring Co.",
  contactName: "Bea Lin",
  phone: "13800138002",
  entityRegion: "hong_kong",
  entityType: "limited_company",
  businessModels: ["b2b_supermarket"],
  primaryPlatformOrBuyerName: "Approved Buyer",
  buyerName: "Approved Buyer",
  buyerCountry: "Singapore",
  buyerPlatformType: "admitted_1p_retailer",
  buyerCountryEligibility: "needs_review",
  buyerTradingHistoryMonths: 13,
  annualB2bTradeUsd: 2500000,
  accountsReceivableBalanceUsd: 800000,
  acceptsAccountControl: true,
  acceptsReceivablesAssignment: true,
  preferredCurrency: "usd",
  requestedAmount: 1500000,
  preferredTermMonths: 4,
  fundUse: "receivables_turnover",
  preferredRepaymentMethod: "receivables_collection",
  consentToDataUse: true,
  ...overrides,
});

const completeLogisticsPayload = (overrides = {}) => ({
  estimationMode: "complex",
  companyName: "Wholesale Logistics Co.",
  contactName: "Lena Wu",
  phone: "13800138003",
  entityRegion: "mainland",
  entityType: "limited_company",
  businessModels: ["wholesale_retail"],
  primaryPlatformOrBuyerName: "Wholesale operations",
  industry: "批发零售",
  companyAgeMonths: 60,
  controllerIndustryExperienceYears: 5,
  selfOperatedImportExport: true,
  hasImportExportLicense: true,
  foreignExchangeClassification: "a",
  customsCreditClassification: "一般信用企业",
  importExportAmountLast12MonthsUsd: 500000,
  importExportAmountMonths13To24Usd: 500000,
  daysSinceLatestImportExport: 90,
  importExportCountLast12Months: 2,
  importExportRevenueSharePercent: 50,
  commodityRevenueSharePercent: 20,
  twoYearSalesDeclinePercent: 30,
  assetLiabilityRatioPercent: 55,
  coreAssetLiabilityRatioPercent: 80,
  taxRecordAndInvoiceCustomerTier: "tax_invoice",
  annualRevenueRmb: 30000000,
  taxInvoiceAmountRmb: 2000000,
  preferredCurrency: "rmb",
  requestedAmount: 3000000,
  preferredTermMonths: 12,
  fundUse: "logistics_working_capital",
  consentToDataUse: true,
  ...overrides,
});

const completeSimplePayload = (overrides = {}) => ({
  estimationMode: "simple",
  companyName: "Simple Direction Co.",
  contactName: "Sam Li",
  phone: "13800138004",
  businessModels: ["amazon_sc"],
  primaryPlatformOrBuyerName: "Amazon",
  annualRevenueRmb: 12000000,
  hasCurrentOverdue: false,
  hasDishonestyRecord: false,
  hasMajorLitigation: false,
  hasAbnormalOperations: false,
  preferredCurrency: "usd",
  requestedAmount: 1000000,
  fundUse: "inventory_procurement",
  consentToDataUse: true,
  ...overrides,
});

const visibleProgressivePayload = (profile) => ({
  intakeVersion: "progressive-v1",
  estimationMode: "progressive",
  ...Object.fromEntries(getVisibleIntakeFields(profile)
    .filter(({ key }) => profile[key] != null && profile[key] !== "")
    .map(({ key }) => [key, profile[key]])),
});

const completeProgressiveAmazonScPayload = (overrides = {}) => visibleProgressivePayload({
  companyName: "Progressive Amazon SC Co.",
  primaryBusinessModel: "amazon_sc",
  entityRegion: "mainland",
  entityType: "limited_company",
  platformHistoryMonths: 13,
  singleStoreGmvUsd: 6000000,
  qualifiedStoreCount: 1,
  acceptsAccountControl: true,
  preferredCurrency: "usd",
  requestedAmount: 2000000,
  fundUse: "inventory_procurement",
  hasCurrentOverdue: false,
  hasMaterialCreditOrJudicialNegative: false,
  contactName: "Progressive SC Contact",
  phone: "13800138100",
  consentToDataUse: true,
  ...overrides,
});

const completeProgressiveAmazonVcPayload = (overrides = {}) => visibleProgressivePayload({
  companyName: "Progressive Amazon VC Co.",
  primaryBusinessModel: "amazon_vc",
  entityRegion: "mainland",
  entityType: "limited_company",
  platformSites: ["united_states"],
  amazonAnnualGmvUsd: 3000000,
  platformHistoryMonths: 12,
  acceptsReceivablesArrangement: true,
  acceptsAccountControl: true,
  preferredCurrency: "usd",
  requestedAmount: 1000000,
  fundUse: "receivables_turnover",
  hasCurrentOverdue: false,
  hasMaterialCreditOrJudicialNegative: false,
  contactName: "Progressive VC Contact",
  phone: "13800138101",
  consentToDataUse: true,
  ...overrides,
});

async function startTestServer(t, options = {}) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "meiou-leads-"));
  const leadsFilePath = path.join(temporaryDirectory, "leads.json");
  const { seedStore, ...serverOptions } = options;
  if (seedStore) {
    await writeFile(leadsFilePath, JSON.stringify(seedStore.leads ?? []), "utf8");
    await chmod(leadsFilePath, seedStore.mode ?? 0o644);
  }
  const server = createMeiouServer({
    leadsFilePath,
    adminCredentials: testAdminCredentials,
    logger: { error() {} },
    ...serverOptions,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  t.after(async () => {
    if (server.listening) {
      server.close();
      await once(server, "close");
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const address = server.address();
  return {
    leadsFilePath,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function postLead(url, payload = completeAmazonScPayload()) {
  return fetch(`${url}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createAdminScriptVm(leads) {
  class FakeClassList {
    constructor() {
      this.values = new Set();
    }

    add(value) { this.values.add(value); }
    remove(value) { this.values.delete(value); }
    contains(value) { return this.values.has(value); }
  }

  class FakeElement {
    constructor(id, ownerDocument) {
      this.id = id;
      this.ownerDocument = ownerDocument;
      this.listeners = new Map();
      this.classList = new FakeClassList();
      this.dataset = {};
      this.value = "";
      this.textContent = "";
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
      this.indeterminate = false;
      this.isConnected = true;
      this.offsetParent = {};
      this._innerHTML = "";
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    async dispatch(type, init = {}) {
      const event = {
        target: this,
        preventDefault() {},
        ...init,
      };
      await Promise.all((this.listeners.get(type) ?? []).map((listener) => listener(event)));
    }

    focus() {
      this.ownerDocument.activeElement = this;
    }

    click() {
      return this.dispatch("click");
    }

    querySelectorAll(selector) {
      if (this.id === "rows") return this.ownerDocument.rowElements.get(selector) ?? [];
      if (this.id === "advisorDrawer") {
        return ["closeDrawer", "reviewStatus", "reviewNote", "retryAi", "saveReview"]
          .map((id) => this.ownerDocument.getElement(id));
      }
      return [];
    }

    set innerHTML(value) {
      this._innerHTML = value;
      if (this.id === "rows") this.ownerDocument.rebuildRows(value);
    }

    get innerHTML() {
      return this._innerHTML;
    }
  }

  class FakeDocument {
    constructor() {
      this.elements = new Map();
      this.rowElements = new Map();
      this.listeners = new Map();
      this.body = { classList: new FakeClassList() };
      this.activeElement = null;
    }

    getElement(id) {
      if (!this.elements.has(id)) this.elements.set(id, new FakeElement(id, this));
      return this.elements.get(id);
    }

    querySelector(selector) {
      return this.getElement(selector.replace(/^#/, ""));
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    createElement(tagName) {
      return this.getElement(`created-${tagName}`);
    }

    rebuildRows(html) {
      const viewButtons = [...html.matchAll(/class="view-button"[^>]*data-lead-id="([^"]+)"/g)]
        .map((match) => {
          const button = new FakeElement(`view-${match[1]}`, this);
          button.classList.add("view-button");
          button.dataset.leadId = match[1];
          return button;
        });
      const checkboxes = [...html.matchAll(/class="row-select"[^>]*value="([^"]+)"/g)]
        .map((match) => {
          const checkbox = new FakeElement(`select-${match[1]}`, this);
          checkbox.value = match[1];
          return checkbox;
        });
      this.rowElements.set(".view-button", viewButtons);
      this.rowElements.set(".row-select", checkboxes);
    }
  }

  const document = new FakeDocument();
  document.getElement("advisorDrawer").hidden = true;
  document.getElement("drawerBackdrop").hidden = true;
  document.getElement("retryAi").hidden = true;
  const fetchCalls = [];
  let fetchHandler = async (url) => {
    if (url.startsWith("/api/leads")) {
      return { ok: true, json: async () => ({ leads }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const html = buildAdminPage({ leadColumns: [["companyName", "企业名称"]], products: [] });
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  runInNewContext(script, {
    document,
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      return fetchHandler(url, options);
    },
    btoa: (value) => Buffer.from(value).toString("base64"),
    URL,
    URLSearchParams,
    console,
  });

  return {
    document,
    fetchCalls,
    element: (id) => document.getElement(id),
    setFetchHandler(handler) { fetchHandler = handler; },
    viewButton(leadId) {
      return (document.rowElements.get(".view-button") ?? [])
        .find((button) => button.dataset.leadId === leadId);
    },
  };
}

test("createMeiouServer authenticates only the explicitly injected credentials", async (t) => {
  const { url } = await startTestServer(t);
  const explicitResponse = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const oldFallbackResponse = await fetch(`${url}/api/leads`, {
    headers: { Authorization: basicAuthorization("admin", "meiou2026") },
  });

  assert.equal(explicitResponse.status, 200);
  assert.equal(oldFallbackResponse.status, 401);
});

test("a server constructed without credentials cannot authenticate admin requests", async (t) => {
  const { url } = await startTestServer(t, { adminCredentials: null });
  const explicitResponse = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const oldFallbackResponse = await fetch(`${url}/api/leads`, {
    headers: { Authorization: basicAuthorization("admin", "meiou2026") },
  });

  assert.equal(explicitResponse.status, 401);
  assert.equal(oldFallbackResponse.status, 401);
});

test("GET /api/products returns only the strict customer-safe catalog projection", async (t) => {
  const { url } = await startTestServer(t);
  const response = await fetch(`${url}/api/products`);
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(payload), ["products"]);
  assert.equal(payload.products.length, 7);
  for (const product of payload.products) {
    assert.deepEqual(Object.keys(product).sort(), [
      "currency",
      "id",
      "institution",
      "keyPrerequisite",
      "limit",
      "name",
      "pricing",
      "scenario",
      "targetProfile",
      "term",
    ]);
    assert.deepEqual(Object.keys(product.scenario).sort(), ["id", "label", "order"]);
  }
  assert.doesNotMatch(
    serialized,
    /ruleSet|ruleVersion|internalReason|fitScore|failedRules|confidence|priority|反洗钱黑名单|预警信息|两个年度销售收入下滑超过 30%/,
  );
});

test("direct server startup fails clearly when required production credentials are absent", async () => {
  const environment = { ...process.env };
  delete environment.MEIOU_ADMIN_USER;
  delete environment.MEIOU_ADMIN_PASSWORD;
  environment.ADMIN_USERNAME = "ignored-legacy-user";
  environment.ADMIN_PASSWORD = "ignored-legacy-password";
  environment.ADMIN_TOKEN = "ignored-legacy-token";
  const child = spawn(process.execPath, [serverEntryPath], {
    env: environment,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exitResult = once(child, "exit").then(([code, signal]) => ({ code, signal }));
  let timeoutId;
  const timeoutResult = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), 1000);
  });
  const result = await Promise.race([
    exitResult,
    timeoutResult,
  ]);
  clearTimeout(timeoutId);

  if (result == null) {
    child.kill("SIGTERM");
    await exitResult;
    assert.fail("direct startup did not fail when production credentials were absent");
  }
  assert.equal(result.code, 1);
  assert.equal(result.signal, null);
  assert.match(stderr, /MEIOU_ADMIN_USER and MEIOU_ADMIN_PASSWORD are required/);
});

test("POST /api/leads matches a complete Amazon SC profile and persists audit evidence", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  const response = await postLead(url);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.lead.matchReport.primary.productId, "linklogis-amazon-sc");
  assert.equal(payload.lead.matchReport.primary.presentationLabel, "优先匹配");
  assert.equal(payload.lead.productMatches, undefined);
  assert.equal(payload.lead.ruleVersion, undefined);
  assert.equal(payload.lead.estimationMode, "complex");
  assert.equal(payload.lead.estimate, undefined);
  assert.equal(payload.lead.aiInsight, undefined);

  const persistedLeads = JSON.parse(await readFile(leadsFilePath, "utf8"));
  assert.equal(typeof persistedLeads[0].estimate.score, "number");
  assert.equal(persistedLeads[0].rawInput.qualifiedStoreCount, 1);
  assert.equal(persistedLeads[0].profile.raw, undefined);
  assert.ok(persistedLeads[0].productMatches.every((match) => !Object.hasOwn(match.inputSnapshot, "companyName")));
  assert.deepEqual(
    persistedLeads[0].productMatches.find((match) => match.productId === "linklogis-amazon-sc").inputSnapshot,
    { qualifiedStoreCount: 1 },
  );
  assert.match(persistedLeads[0].ruleVersion, /^2026-/);
  assert.equal(persistedLeads[0].matchReport.ruleVersion, undefined);
  assert.ok(persistedLeads[0].productMatches.every((match) => /^2026-/.test(match.ruleVersion)));
});

test("POST persists the lead before AI generation and returns a customer-safe initial report", async (t) => {
  let leadsFilePath;
  let sawPersistedPending = false;
  let pendingStoreMode = null;
  let generatedCount = 0;
  const generatedAnalysis = {
    status: "generated",
    customerReport: {
      statusMessage: "AI 初筛完成，专业顾问待复核。",
      businessSummary: ["当前为 Amazon SC 经营场景。"],
      productExplanations: [{
        productId: "linklogis-amazon-sc",
        reasons: ["当前经营场景与产品方向一致。"],
        itemsToConfirm: ["需核验销售数据。"],
      }],
      preparationActions: ["准备近 12 个月销售数据。"],
    },
    advisorFocus: ["确认回款账户安排。"],
    meta: {
      provider: "deepseek",
      model: "deepseek-v4-pro",
      promptVersion: "meiou-ai-advisor-v1",
      generatedAt: "2026-08-27T00:00:00.000Z",
      durationMs: 50,
      usage: { inputTokens: 40, outputTokens: 20 },
      errorCategory: null,
    },
  };
  const aiReportService = {
    generate: async (lead) => {
      generatedCount += 1;
      const stored = JSON.parse(await readFile(leadsFilePath, "utf8"));
      sawPersistedPending = stored.some((item) => item.id === lead.id && item.aiAnalysis.status === "pending");
      pendingStoreMode = (await stat(leadsFilePath)).mode & 0o777;
      return generatedAnalysis;
    },
  };
  const started = await startTestServer(t, { aiReportService });
  leadsFilePath = started.leadsFilePath;
  const response = await postLead(started.url, completeProgressiveAmazonScPayload());
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(sawPersistedPending, true);
  assert.equal(pendingStoreMode, 0o600);
  assert.equal(generatedCount, 1);
  assert.equal(body.lead.aiReport.source, "ai");
  assert.equal(body.lead.aiReport.reviewStatus, "pending");
  assert.equal("advisorFocus" in body.lead.aiReport, false);
  assert.equal("meta" in body.lead.aiReport, false);

  const [stored] = JSON.parse(await readFile(leadsFilePath, "utf8"));
  assert.deepEqual(stored.aiAnalysis, generatedAnalysis);
  assert.deepEqual(stored.advisorReview, {
    status: "pending",
    note: "",
    updatedAt: null,
  });
  assert.equal((await stat(leadsFilePath)).mode & 0o777, 0o600);
  assert.equal(stored.rawInput.aiAnalysis, undefined);
  assert.equal(stored.rawInput.advisorReview, undefined);
  assert.doesNotMatch(
    JSON.stringify(body),
    /advisorFocus|"meta"|"provider"|"model"|promptVersion|"usage"|errorCategory|fitScore|confidence|ruleVersion|advisorReview/,
  );
});

test("POST without an injected service returns and persists a deterministic local fallback", async (t) => {
  const now = () => new Date("2026-08-27T00:00:00.000Z");
  const { leadsFilePath, url } = await startTestServer(t, { now });
  const response = await postLead(url, completeProgressiveAmazonScPayload());
  const body = await response.json();
  const [stored] = JSON.parse(await readFile(leadsFilePath, "utf8"));

  assert.equal(response.status, 201);
  assert.equal(body.lead.aiReport.source, "rules_fallback");
  assert.equal(stored.aiAnalysis.status, "fallback");
  assert.equal(stored.aiAnalysis.meta.provider, "local");
  assert.equal(stored.aiAnalysis.meta.generatedAt, "2026-08-27T00:00:00.000Z");
});

test("POST recovers from a rejecting AI service with a persisted safe fallback", async (t) => {
  const logged = [];
  const aiReportService = {
    generate: async () => {
      throw new Error("customer data must not escape the lifecycle boundary");
    },
  };
  const { leadsFilePath, url } = await startTestServer(t, {
    aiReportService,
    logger: { error: (...args) => logged.push(args) },
  });
  const response = await postLead(url, completeProgressiveAmazonScPayload());
  const body = await response.json();
  const [stored] = JSON.parse(await readFile(leadsFilePath, "utf8"));

  assert.equal(response.status, 201);
  assert.equal(body.lead.aiReport.source, "rules_fallback");
  assert.equal(stored.aiAnalysis.status, "fallback");
  assert.equal(stored.aiAnalysis.meta.errorCategory, "provider_error");
  assert.equal(logged.length, 0);
  assert.doesNotMatch(JSON.stringify(body), /customer data|provider_error|"meta"|"provider"|errorCategory/);
});

test("POST resolves an injected ID collision before persisting and completes only the new lead", async (t) => {
  const generatedAnalysis = {
    status: "generated",
    customerReport: {
      statusMessage: "AI 初筛完成，专业顾问待复核。",
      businessSummary: ["新客户的分析结果。"],
      productExplanations: [],
      preparationActions: ["准备经营资料。"],
    },
    advisorFocus: [],
    meta: { provider: "test", model: "test", promptVersion: "test", generatedAt: "2026-08-28T00:00:00.000Z" },
  };
  const ids = ["forced-collision", "unique-after-collision"];
  const { leadsFilePath, url } = await startTestServer(t, {
    idFactory: () => ids.shift(),
    aiReportService: { generate: async () => generatedAnalysis },
    seedStore: {
      leads: [{
        id: "forced-collision",
        companyName: "Existing Collision Co.",
        aiAnalysis: { status: "pending", marker: "existing-lead" },
        advisorReview: { status: "pending", note: "", updatedAt: null },
      }],
    },
  });
  const response = await postLead(url, completeProgressiveAmazonScPayload({
    companyName: "Collision New Co.",
  }));
  const body = await response.json();
  const stored = JSON.parse(await readFile(leadsFilePath, "utf8"));
  const existing = stored.find((lead) => lead.id === "forced-collision");
  const created = stored.find((lead) => lead.id === "unique-after-collision");

  assert.equal(response.status, 201);
  assert.equal(body.lead.id, "unique-after-collision");
  assert.equal(stored.length, 2);
  assert.equal(existing.aiAnalysis.marker, "existing-lead");
  assert.deepEqual(created.aiAnalysis, generatedAnalysis);
  assert.equal(new Set(stored.map((lead) => lead.id)).size, 2);
});

test("POST /api/leads enforces the raw progressive version and mode envelope", async (t) => {
  const { url } = await startTestServer(t);
  const progressiveEnvelope = (overrides = {}) => ({
    ...completeProgressiveAmazonScPayload(),
    ...overrides,
  });
  const withoutVersion = (overrides = {}) => {
    const payload = progressiveEnvelope();
    delete payload.intakeVersion;
    return { ...payload, ...overrides };
  };
  const withoutMode = (overrides = {}) => {
    const payload = progressiveEnvelope();
    delete payload.estimationMode;
    return { ...payload, ...overrides };
  };

  for (const { label, payload, status, errorField } of [
    { label: "the exact progressive pair", payload: progressiveEnvelope(), status: 201 },
    { label: "a legacy complex submission without a version", payload: completeAmazonScPayload(), status: 201 },
    { label: "progressive mode without a version", payload: withoutVersion(), status: 400, errorField: "intakeVersion" },
    { label: "an unknown future version", payload: progressiveEnvelope({ intakeVersion: "progressive-v2" }), status: 400, errorField: "intakeVersion" },
    { label: "a case-variant version", payload: progressiveEnvelope({ intakeVersion: "Progressive-v1" }), status: 400, errorField: "intakeVersion" },
    { label: "a whitespace-padded version", payload: progressiveEnvelope({ intakeVersion: " progressive-v1 " }), status: 400, errorField: "intakeVersion" },
    { label: "a non-string version", payload: progressiveEnvelope({ intakeVersion: 1 }), status: 400, errorField: "intakeVersion" },
    { label: "a null version", payload: progressiveEnvelope({ intakeVersion: null }), status: 400, errorField: "intakeVersion" },
    { label: "a missing progressive mode", payload: withoutMode(), status: 400, errorField: "estimationMode" },
    { label: "a fallback progressive mode key", payload: withoutMode({ mode: "progressive" }), status: 400, errorField: "estimationMode" },
    { label: "a wrong progressive mode", payload: progressiveEnvelope({ estimationMode: "complex" }), status: 400, errorField: "estimationMode" },
    { label: "a case-variant progressive mode", payload: progressiveEnvelope({ estimationMode: "Progressive" }), status: 400, errorField: "estimationMode" },
    { label: "a whitespace-padded progressive mode", payload: progressiveEnvelope({ estimationMode: " progressive " }), status: 400, errorField: "estimationMode" },
  ]) {
    const response = await postLead(url, payload);
    const body = await response.json();

    assert.equal(response.status, status, label);
    if (errorField) assert.ok(body.errors.some((error) => error.field === errorField), label);
  }
});

test("POST /api/leads rejects every supplied invalid version regardless of legacy mode", async (t) => {
  const { url } = await startTestServer(t);

  for (const { label, payload } of [
    { label: "simple", payload: completeSimplePayload() },
    { label: "complex", payload: completeAmazonScPayload() },
  ]) {
    const response = await postLead(url, payload);
    assert.equal(response.status, 201, `legacy ${label} without intakeVersion remains valid`);
  }

  for (const { versionLabel, intakeVersion } of [
    { versionLabel: "future", intakeVersion: "progressive-v2" },
    { versionLabel: "case-variant", intakeVersion: "Progressive-v1" },
    { versionLabel: "whitespace-padded", intakeVersion: " progressive-v1 " },
    { versionLabel: "non-string", intakeVersion: 1 },
  ]) {
    for (const { mode, payload } of [
      { mode: "simple", payload: completeSimplePayload({ intakeVersion }) },
      { mode: "complex", payload: completeAmazonScPayload({ intakeVersion }) },
    ]) {
      const response = await postLead(url, payload);
      const body = await response.json();

      assert.equal(response.status, 400, `${versionLabel} intakeVersion with legacy ${mode}`);
      assert.ok(body.errors.some((error) => error.field === "intakeVersion"), `${versionLabel} intakeVersion with legacy ${mode}`);
    }
  }
});

test("POST /api/leads rejects non-string modes for the exact progressive version", async (t) => {
  const { url } = await startTestServer(t);

  for (const { label, estimationMode } of [
    { label: "null", estimationMode: null },
    { label: "number", estimationMode: 1 },
    { label: "object", estimationMode: {} },
    { label: "array", estimationMode: [] },
    { label: "boolean", estimationMode: false },
  ]) {
    const response = await postLead(url, {
      ...completeProgressiveAmazonScPayload(),
      estimationMode,
    });
    const body = await response.json();

    assert.equal(response.status, 400, label);
    assert.ok(body.errors.some((error) => error.field === "estimationMode"), label);
  }
});

test("progressive leads persist only visible customer input and skip legacy scores", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  const response = await postLead(url, completeProgressiveAmazonScPayload({
    internalBankRating: "6AAA",
    annualNetProfitRmb: 10000000,
    businessModels: ["amazon_vc"],
  }));
  const payload = await response.json();
  const [stored] = JSON.parse(await readFile(leadsFilePath, "utf8"));

  assert.equal(response.status, 201);
  assert.equal(payload.lead.estimationMode, "progressive");
  assert.equal(payload.lead.intakeVersion, undefined);
  assert.equal(payload.lead.estimate, undefined);
  assert.equal(payload.lead.aiInsight, undefined);
  assert.equal(stored.intakeVersion, "progressive-v1");
  assert.equal(stored.profile.primaryBusinessModel, "amazon_sc");
  assert.equal(stored.matchReport.primary.productId, "linklogis-amazon-sc");
  assert.equal(Object.hasOwn(stored, "estimate"), false);
  assert.equal(Object.hasOwn(stored, "aiInsight"), false);
  assert.equal(Object.hasOwn(stored.rawInput, "internalBankRating"), false);
  assert.equal(Object.hasOwn(stored.rawInput, "annualNetProfitRmb"), false);
  assert.equal(Object.hasOwn(stored.rawInput, "businessModels"), false);
  assert.ok(Array.isArray(stored.advisorVerificationFields));
  assert.equal(new Set(stored.advisorVerificationFields).size, stored.advisorVerificationFields.length);
  const expectedAdvisorFields = [...new Set(stored.productMatches
    .filter((match) => match.rank != null && match.status !== "ineligible")
    .flatMap((match) => match.advisorVerificationFields))];
  const unrankedAdvisorField = stored.productMatches
    .filter((match) => match.rank == null || match.status === "ineligible")
    .flatMap((match) => match.advisorVerificationFields)
    .find((field) => !expectedAdvisorFields.includes(field));
  assert.deepEqual(stored.advisorVerificationFields, expectedAdvisorFields);
  assert.ok(unrankedAdvisorField, "SC fixture must expose an advisor field unique to an unranked product");
  assert.equal(stored.advisorVerificationFields.includes(unrankedAdvisorField), false);
  assert.doesNotMatch(JSON.stringify(payload), /internalBankRating|advisorVerificationFields|authenticatedEvidence/);
});

test("authenticated admin and selected export project progressive scenario and advisor follow-up only", async (t) => {
  const { url } = await startTestServer(t);
  const scResponse = await postLead(url, completeProgressiveAmazonScPayload());
  const sc = (await scResponse.json()).lead;
  await postLead(url, completeProgressiveAmazonVcPayload());

  const leadsResponse = await fetch(`${url}/api/leads`, { headers: { Authorization: adminAuthorization } });
  const leads = (await leadsResponse.json()).leads;
  const storedSc = leads.find((lead) => lead.id === sc.id);
  const exportResponse = await fetch(`${url}/api/leads/export?ids=${encodeURIComponent(sc.id)}`, {
    headers: { Authorization: adminAuthorization },
  });
  const excel = await exportResponse.text();

  assert.equal(leadsResponse.status, 200);
  assert.equal(storedSc.intakeVersion, "progressive-v1");
  assert.equal(storedSc.profile.primaryBusinessModel, "amazon_sc");
  assert.equal(storedSc.matchReport.primary.productId, "linklogis-amazon-sc");
  assert.deepEqual(
    storedSc.advisorVerificationFields,
    [...new Set(storedSc.productMatches
      .filter((match) => match.rank != null && match.status !== "ineligible")
      .flatMap((match) => match.advisorVerificationFields))],
  );
  assert.equal(Object.hasOwn(storedSc, "estimate"), false);
  assert.equal(Object.hasOwn(storedSc, "aiInsight"), false);
  assert.equal(exportResponse.status, 200);
  assert.match(excel, /数据版本/);
  assert.match(excel, /主融资场景/);
  assert.match(excel, /待顾问核验项/);
  assert.match(excel, /progressive-v1/);
  assert.match(excel, /amazon_sc/);
  assert.match(excel, /联易融 Amazon SC 卖家融资贷/);
  assert.doesNotMatch(excel, /Progressive Amazon VC Co\./);
  assert.doesNotMatch(excel, /companyCreditRating/);
  assert.doesNotMatch(excel, />[^<]* 分<\/td>/);
});

for (const [label, consentToDataUse] of [
  ["missing", undefined],
  ["false", false],
]) {
  test(`POST /api/leads rejects ${label} data-use consent`, async (t) => {
    const { url } = await startTestServer(t);
    const response = await postLead(url, completeAmazonScPayload({ consentToDataUse }));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.ok(payload.errors.some((error) => error.field === "consentToDataUse"));
    assert.equal(payload.lead, undefined);
    const adminResponse = await fetch(`${url}/api/leads`, {
      headers: { Authorization: adminAuthorization },
    });
    assert.deepEqual((await adminResponse.json()).leads, []);
  });
}

test("POST /api/leads persists accepted data-use consent as a canonical boolean", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  const response = await postLead(url, completeAmazonScPayload({ consentToDataUse: true }));
  const payload = await response.json();
  const persistedLead = JSON.parse(await readFile(leadsFilePath, "utf8"))[0];

  assert.equal(response.status, 201);
  assert.equal(payload.lead.consentToDataUse, undefined);
  assert.equal(persistedLead.consentToDataUse, true);
  assert.equal(persistedLead.profile.consentToDataUse, true);
});

test("POST /api/leads returns field-level 400 errors for missing and unknown values", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, {
    estimationMode: "complex",
    companyName: " ",
    contactName: "",
    phone: null,
    entityRegion: "moon",
    consentToDataUse: true,
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload.errors.map((error) => error.field).sort(), [
    "companyName",
    "contactName",
    "entityRegion",
    "phone",
  ]);
});

test("POST /api/leads rejects non-text contact values", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, completeAmazonScPayload({
    contactName: { value: "Ada Chen" },
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(payload.errors.some((error) => error.field === "contactName"));
});

for (const [field, value] of [
  ["applicantRole", ["法人"]],
  ["companyCreditRating", ["6AAA"]],
  ["settlementAccountFlowNormal", [true]],
  ["hasRiskWarning", [false]],
]) {
  test(`POST /api/leads rejects singleton-array ${field}`, async (t) => {
    const { url } = await startTestServer(t);
    const response = await postLead(url, completeAmazonScPayload({ [field]: value }));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.ok(payload.errors.some((error) => error.field === field));
    assert.equal(payload.lead, undefined);

    const adminResponse = await fetch(`${url}/api/leads`, {
      headers: { Authorization: adminAuthorization },
    });
    const adminPayload = await adminResponse.json();
    assert.equal(adminResponse.status, 200);
    assert.deepEqual(adminPayload.leads, []);
  });
}

test("POST /api/leads rejects negative qualified store counts", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, completeAmazonScPayload({
    qualifiedStoreCount: -1,
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(payload.errors.some((error) => error.field === "qualifiedStoreCount"));
});

test("POST /api/leads rejects unknown applicant roles and ratings", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, completeAmazonScPayload({
    applicantRole: "代理顾问",
    companyCreditRating: "7Z",
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(payload.errors.some((error) => error.field === "applicantRole"));
  assert.ok(payload.errors.some((error) => error.field === "companyCreditRating"));
});

test("POST /api/leads rejects malformed rating and raw-rule boolean values", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, completeAmazonScPayload({
    internalBankRating: { level: "6A" },
    settlementAccountFlowNormal: "sometimes",
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(payload.errors.some((error) => error.field === "internalBankRating"));
  assert.ok(payload.errors.some((error) => error.field === "settlementAccountFlowNormal"));
});

test("POST /api/leads rejects negative matching-only month and money values", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, completeAmazonScPayload({
    firstOrderMonthsAgo: -1,
    taxInvoiceAmount: { amount: -100, currency: "RMB" },
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(payload.errors.some((error) => error.field === "firstOrderMonthsAgo"));
  assert.ok(payload.errors.some((error) => error.field === "taxInvoiceAmount"));
});

test("POST /api/leads returns a field-level 400 for malformed JSON", async (t) => {
  const { url } = await startTestServer(t);
  const response = await fetch(`${url}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.errors[0].field, "body");
});

test("POST /api/leads keeps internal matching and advisor evidence out of the public response", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url);
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(payload.lead).sort(), [
    "aiReport",
    "createdAt",
    "estimationMode",
    "id",
    "matchReport",
  ]);
  assert.doesNotMatch(serialized, /"(?:status|score|rawScore|debtPenalty|breakdown|estimate|fitScore|confidence|failedRules|internalReason|inputSnapshot|formulaKey|priority|ruleVersion)"/);
  assert.doesNotMatch(serialized, /advisorFocus|"meta"|"provider"|"model"|promptVersion|"usage"|errorCategory|advisorReview/);
  assert.equal(payload.lead.matchReport.ruleVersion, undefined);
});

test("POST /api/leads exposes only customer-safe non-match summaries", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.ok(payload.lead.matchReport.nonMatches.length > 0);
  for (const nonMatch of payload.lead.matchReport.nonMatches) {
    assert.deepEqual(Object.keys(nonMatch).sort(), ["institution", "name", "reason"]);
    assert.equal(nonMatch.reason, "当前资料暂未满足该产品的部分基础准入要求。");
  }
  assert.doesNotMatch(JSON.stringify(payload.lead.matchReport.nonMatches), /fitScore|confidence|failedRules|internalReason|priority/);
});

test("concurrent POST /api/leads atomically preserve every generated AI analysis", async (t) => {
  const aiReportService = {
    generate: async (lead) => ({
      status: "generated",
      customerReport: {
        statusMessage: "AI 初筛完成，专业顾问待复核。",
        businessSummary: [lead.profile.companyName],
        productExplanations: [lead.matchReport.primary, ...lead.matchReport.alternatives].map((product) => ({
          productId: product.productId,
          reasons: ["需要由顾问复核经营资料。"],
          itemsToConfirm: [],
        })),
        preparationActions: ["准备经营资料。"],
      },
      advisorFocus: ["内部顾问跟进。"],
      meta: { provider: "test", model: "test-model", promptVersion: "test", generatedAt: "2026-08-27T00:00:00.000Z" },
    }),
  };
  const { leadsFilePath, url } = await startTestServer(t, { aiReportService });
  const expectedCompanyNames = Array.from(
    { length: 12 },
    (_, index) => `Concurrent Amazon SC ${String(index).padStart(2, "0")}`,
  );
  const responses = await Promise.all(expectedCompanyNames.map((companyName) => (
    postLead(url, completeAmazonScPayload({ companyName }))
  )));

  assert.ok(responses.every((response) => response.status === 201));

  const response = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const payload = await response.json();
  const persistedNames = payload.leads.map((lead) => lead.companyName).sort();
  const persistedIds = new Set(payload.leads.map((lead) => lead.id));

  assert.equal(response.status, 200);
  assert.deepEqual(persistedNames, expectedCompanyNames);
  assert.equal(persistedIds.size, expectedCompanyNames.length);
  const storedLeads = JSON.parse(await readFile(leadsFilePath, "utf8"));
  assert.equal(storedLeads.length, expectedCompanyNames.length);
  assert.deepEqual(
    storedLeads.map((lead) => lead.aiAnalysis.customerReport.businessSummary[0]).sort(),
    expectedCompanyNames,
  );
  assert.ok(storedLeads.every((lead) => lead.aiAnalysis.status === "generated"));
  assert.ok(storedLeads.every((lead) => lead.advisorReview.status === "pending"));
  assert.deepEqual(
    (await readdir(path.dirname(leadsFilePath))).filter((entry) => entry.endsWith(".tmp")),
    [],
  );
});

test("client disconnect after pending persistence does not remove the lead", async (t) => {
  let releaseGeneration;
  let signalGenerationStarted;
  const generationStarted = new Promise((resolve) => {
    signalGenerationStarted = resolve;
  });
  const aiReportService = {
    generate: async (lead) => {
      signalGenerationStarted(lead.id);
      await new Promise((resolve) => {
        releaseGeneration = resolve;
      });
      return {
        status: "generated",
        customerReport: {
          statusMessage: "AI 初筛完成，专业顾问待复核。",
          businessSummary: ["经营资料已进入顾问复核。"],
          productExplanations: [{
            productId: "linklogis-amazon-sc",
            reasons: ["当前经营场景需要顾问复核。"],
            itemsToConfirm: [],
          }],
          preparationActions: ["准备经营资料。"],
        },
        advisorFocus: [],
        meta: { provider: "test", model: "test-model", promptVersion: "test", generatedAt: "2026-08-27T00:00:00.000Z" },
      };
    },
  };
  const { leadsFilePath, url } = await startTestServer(t, { aiReportService });
  const controller = new AbortController();
  const response = fetch(`${url}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(completeProgressiveAmazonScPayload()),
    signal: controller.signal,
  });

  const leadId = await generationStarted;
  controller.abort();
  await assert.rejects(response, { name: "AbortError" });
  assert.ok(JSON.parse(await readFile(leadsFilePath, "utf8")).some((lead) => lead.id === leadId));

  releaseGeneration();
  for (let attempts = 0; attempts < 50; attempts += 1) {
    const stored = JSON.parse(await readFile(leadsFilePath, "utf8"));
    if (stored.some((lead) => lead.id === leadId && lead.aiAnalysis.status === "generated")) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("lead was not retained and completed after the client disconnected");
});

test("both pending and completed lead writes preserve mode 0600", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  const createdResponse = await postLead(url);

  assert.equal(createdResponse.status, 201);
  assert.equal((await stat(leadsFilePath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(leadsFilePath, "utf8"))[0].aiAnalysis.status, "fallback");

  await chmod(leadsFilePath, 0o400);
  const replacedResponse = await postLead(url, completeAmazonScPayload({
    companyName: "Replacement Permission Co.",
  }));

  assert.equal(replacedResponse.status, 201);
  assert.equal((await stat(leadsFilePath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(leadsFilePath, "utf8")).length, 2);
  assert.deepEqual(
    (await readdir(path.dirname(leadsFilePath))).filter((entry) => entry.endsWith(".tmp")),
    [],
  );
});

test("a failed queued lead update does not poison the next POST", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  await mkdir(leadsFilePath);

  const failedResponse = await postLead(url);
  assert.equal(failedResponse.status, 500);

  await rm(leadsFilePath, { recursive: true, force: true });
  const recoveredResponse = await postLead(url, completeAmazonScPayload({
    companyName: "Recovered Queue Co.",
  }));
  assert.equal(recoveredResponse.status, 201);

  const response = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.leads.map((lead) => lead.companyName), ["Recovered Queue Co."]);
});

test("GET /api/leads and GET /api/leads/export reject unauthenticated requests", async (t) => {
  const { url } = await startTestServer(t);
  const leadsResponse = await fetch(`${url}/api/leads`);
  const exportResponse = await fetch(`${url}/api/leads/export?ids=lead-1`);

  assert.equal(leadsResponse.status, 401);
  assert.equal(exportResponse.status, 401);
});

test("advisor review and AI retry routes authenticate before accessing the lead store", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  await mkdir(leadsFilePath);

  const reviewResponse = await fetch(`${url}/api/leads/private-lead/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed", note: "must not be read" }),
  });
  const retryResponse = await fetch(`${url}/api/leads/private-lead/ai-retry`, {
    method: "POST",
  });

  assert.equal(reviewResponse.status, 401);
  assert.equal(retryResponse.status, 401);
  assert.deepEqual(await reviewResponse.json(), { error: "后台口令不正确" });
  assert.deepEqual(await retryResponse.json(), { error: "后台口令不正确" });
});

test("malformed encoded review and retry IDs authenticate before returning cache-free 400", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  await mkdir(leadsFilePath);
  const reviewEndpoint = `${url}/api/leads/%ZZ/review`;
  const retryEndpoint = `${url}/api/leads/%ZZ/ai-retry`;

  const unauthenticatedReview = await fetch(reviewEndpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed", note: "" }),
  });
  const unauthenticatedRetry = await fetch(retryEndpoint, { method: "POST" });
  assert.equal(unauthenticatedReview.status, 401);
  assert.equal(unauthenticatedRetry.status, 401);
  assert.deepEqual(await unauthenticatedReview.json(), { error: "后台口令不正确" });
  assert.deepEqual(await unauthenticatedRetry.json(), { error: "后台口令不正确" });

  const authenticatedReview = await fetch(reviewEndpoint, {
    method: "PATCH",
    headers: { Authorization: adminAuthorization, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed", note: "" }),
  });
  const authenticatedRetry = await fetch(retryEndpoint, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });
  assert.equal(authenticatedReview.status, 400);
  assert.equal(authenticatedRetry.status, 400);
  assert.equal(authenticatedReview.headers.get("cache-control"), "no-store");
  assert.equal(authenticatedRetry.headers.get("cache-control"), "no-store");
  assert.deepEqual(await authenticatedReview.json(), { error: "客户标识格式不正确" });
  assert.deepEqual(await authenticatedRetry.json(), { error: "客户标识格式不正确" });
});

test("authenticated advisor review saves an internal review and returns 404 for a missing lead", async (t) => {
  const { url } = await startTestServer(t);
  const created = await (await postLead(url)).json();
  const endpoint = `${url}/api/leads/${created.lead.id}/review`;
  const savedResponse = await fetch(endpoint, {
    method: "PATCH",
    headers: { Authorization: adminAuthorization, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed", note: "  已核验  " }),
  });
  const saved = await savedResponse.json();
  const missingResponse = await fetch(`${url}/api/leads/missing/review`, {
    method: "PATCH",
    headers: { Authorization: adminAuthorization, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed", note: "" }),
  });
  const missingRetryResponse = await fetch(`${url}/api/leads/missing/ai-retry`, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });

  assert.equal(savedResponse.status, 200);
  assert.equal(savedResponse.headers.get("cache-control"), "no-store");
  assert.equal(saved.lead.id, created.lead.id);
  assert.equal(saved.lead.phone, "13800138000");
  assert.deepEqual(saved.lead.advisorReview, {
    status: "reviewed",
    note: "已核验",
    updatedAt: saved.lead.advisorReview.updatedAt,
  });
  assert.match(saved.lead.advisorReview.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(missingResponse.status, 404);
  assert.equal(missingRetryResponse.status, 404);
});

test("advisor review rejects invalid JSON, states, and notes without changing the lead", async (t) => {
  const { url } = await startTestServer(t);
  const created = await (await postLead(url)).json();
  const endpoint = `${url}/api/leads/${created.lead.id}/review`;
  const headers = { Authorization: adminAuthorization, "Content-Type": "application/json" };

  for (const { label, body } of [
    { label: "invalid JSON", body: "{" },
    { label: "unknown status", body: JSON.stringify({ status: "approved", note: "" }) },
    { label: "non-string note", body: JSON.stringify({ status: "reviewed", note: { html: "no" } }) },
    { label: "overlong note", body: JSON.stringify({ status: "reviewed", note: "x".repeat(2001) }) },
  ]) {
    const response = await fetch(endpoint, { method: "PATCH", headers, body });
    assert.equal(response.status, 400, label);
  }

  const leadsResponse = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const lead = (await leadsResponse.json()).leads.find((item) => item.id === created.lead.id);
  assert.deepEqual(lead.advisorReview, { status: "pending", note: "", updatedAt: null });
});

test("CORS advertises PATCH for authenticated advisor review requests", async (t) => {
  const configuredOrigin = "https://advisor.example.com";
  const { url } = await startTestServer(t, { allowedOrigins: [configuredOrigin] });
  const response = await fetch(`${url}/api/leads/lead-1/review`, {
    method: "OPTIONS",
    headers: {
      Origin: configuredOrigin,
      "Access-Control-Request-Method": "PATCH",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), configuredOrigin);
  assert.match(response.headers.get("access-control-allow-methods"), /(?:^|,)PATCH(?:,|$)/);
});

test("simultaneous advisor review and lead submission preserve both atomic updates", async (t) => {
  const { url } = await startTestServer(t);
  const existing = await (await postLead(url, completeAmazonScPayload({ companyName: "Reviewed Co." }))).json();

  const [reviewResponse, createdResponse] = await Promise.all([
    fetch(`${url}/api/leads/${existing.lead.id}/review`, {
      method: "PATCH",
      headers: { Authorization: adminAuthorization, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_review", note: "并发复核" }),
    }),
    postLead(url, completeAmazonVcPayload({ companyName: "Concurrent New Co." })),
  ]);

  assert.equal(reviewResponse.status, 200);
  assert.equal(createdResponse.status, 201);
  const leadsResponse = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const leads = (await leadsResponse.json()).leads;
  assert.equal(leads.length, 2);
  assert.equal(leads.find((lead) => lead.id === existing.lead.id).advisorReview.status, "in_review");
  assert.ok(leads.some((lead) => lead.companyName === "Concurrent New Co."));
});

test("AI retry persists its claim before generation and atomically rejects every later retry", async (t) => {
  let leadsFilePath;
  let generateCalls = 0;
  let releaseRetry;
  let signalRetryStarted;
  const retryStarted = new Promise((resolve) => { signalRetryStarted = resolve; });
  const initialFallback = {
    status: "fallback",
    customerReport: {
      statusMessage: "智能匹配结果已生成，AI 扩展分析暂不可用，专业顾问待复核。",
      businessSummary: ["当前经营资料已完成规则匹配。"],
      productExplanations: [],
      preparationActions: ["准备经营资料。"],
    },
    advisorFocus: [],
    meta: { provider: "local", model: null, promptVersion: "test", errorCategory: "not_configured", generatedAt: "2026-08-27T00:00:00.000Z" },
  };
  const generatedAnalysis = {
    status: "generated",
    customerReport: {
      statusMessage: "AI 初筛完成，专业顾问待复核。",
      businessSummary: ["重试分析已完成。"],
      productExplanations: [],
      preparationActions: ["准备经营资料。"],
    },
    advisorFocus: ["核验回款安排。"],
    meta: { provider: "test", model: "test-model", promptVersion: "test", generatedAt: "2026-08-27T01:00:00.000Z", durationMs: 10, usage: { inputTokens: 5, outputTokens: 3 }, errorCategory: null },
  };
  const aiReportService = {
    generate: async (lead) => {
      generateCalls += 1;
      if (generateCalls === 1) return initialFallback;
      const storedLead = JSON.parse(await readFile(leadsFilePath, "utf8"))
        .find((item) => item.id === lead.id);
      signalRetryStarted(storedLead);
      await new Promise((resolve) => { releaseRetry = resolve; });
      return generatedAnalysis;
    },
  };
  const started = await startTestServer(t, { aiReportService });
  leadsFilePath = started.leadsFilePath;
  const created = await (await postLead(started.url)).json();
  const endpoint = `${started.url}/api/leads/${created.lead.id}/ai-retry`;
  const retryPromise = fetch(endpoint, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });
  const persistedPending = await Promise.race([
    retryStarted,
    new Promise((_, reject) => setTimeout(() => reject(new Error("AI retry service was not invoked")), 1000)),
  ]);

  assert.equal(persistedPending.aiAnalysis.status, "pending");
  assert.equal(persistedPending.aiAnalysis.retryCount, 1);
  const reviewWhilePending = await fetch(`${started.url}/api/leads/${created.lead.id}/review`, {
    method: "PATCH",
    headers: { Authorization: adminAuthorization, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_review", note: "重试期间复核" }),
  });
  assert.equal(reviewWhilePending.status, 200);
  const simultaneousRetry = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });
  assert.equal(simultaneousRetry.status, 409);
  releaseRetry();

  const retryResponse = await retryPromise;
  const retried = await retryResponse.json();
  assert.equal(retryResponse.status, 200);
  assert.equal(retryResponse.headers.get("cache-control"), "no-store");
  assert.equal(retried.lead.aiAnalysis.status, "generated");
  assert.equal(retried.lead.aiAnalysis.retryCount, 1);
  assert.equal(retried.lead.advisorReview.status, "in_review");
  assert.equal(retried.lead.advisorReview.note, "重试期间复核");
  assert.equal(generateCalls, 2);

  const completedRetry = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });
  assert.equal(completedRetry.status, 409);
  assert.equal(generateCalls, 2);
});

test("an original pending generation cannot erase an authenticated AI retry claim", async (t) => {
  let generateCalls = 0;
  let releaseInitial;
  let releaseRetry;
  let signalInitial;
  let signalRetry;
  const initialStarted = new Promise((resolve) => { signalInitial = resolve; });
  const retryStarted = new Promise((resolve) => { signalRetry = resolve; });
  const analysis = (label, status = "generated") => ({
    status,
    customerReport: {
      statusMessage: `${label} status`,
      businessSummary: [`${label} summary`],
      productExplanations: [],
      preparationActions: [`${label} action`],
    },
    advisorFocus: [],
    meta: { provider: status === "fallback" ? "local" : "test", model: null, promptVersion: "test", errorCategory: status === "fallback" ? "timeout" : null, generatedAt: "2026-08-27T00:00:00.000Z" },
  });
  const aiReportService = {
    generate: async (lead) => {
      generateCalls += 1;
      if (generateCalls === 1) {
        signalInitial(lead.id);
        await new Promise((resolve) => { releaseInitial = resolve; });
        return analysis("original", "fallback");
      }
      if (generateCalls === 2) {
        signalRetry();
        await new Promise((resolve) => { releaseRetry = resolve; });
        return analysis("retry");
      }
      return analysis("unexpected second retry");
    },
  };
  const { leadsFilePath, url } = await startTestServer(t, { aiReportService });
  const createPromise = postLead(url);
  const leadId = await initialStarted;
  const endpoint = `${url}/api/leads/${leadId}/ai-retry`;
  const firstRetryPromise = fetch(endpoint, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });
  await retryStarted;

  releaseInitial();
  assert.equal((await createPromise).status, 201);
  const secondRetry = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });
  releaseRetry();
  const firstRetryResponse = await firstRetryPromise;

  assert.equal(secondRetry.status, 409);
  assert.equal(generateCalls, 2);
  assert.equal(firstRetryResponse.status, 200);
  const stored = JSON.parse(await readFile(leadsFilePath, "utf8"))[0];
  assert.equal(stored.aiAnalysis.retryCount, 1);
  assert.deepEqual(stored.aiAnalysis.customerReport.businessSummary, ["retry summary"]);
});

test("a rejecting AI retry service persists a safe fallback and never leaks its error", async (t) => {
  let generateCalls = 0;
  const aiReportService = {
    generate: async () => {
      generateCalls += 1;
      if (generateCalls === 1) {
        return {
          status: "fallback",
          customerReport: { statusMessage: "暂不可用", businessSummary: [], productExplanations: [], preparationActions: [] },
          advisorFocus: [],
          meta: { provider: "local", model: null, promptVersion: "test", errorCategory: "not_configured", generatedAt: "2026-08-27T00:00:00.000Z" },
        };
      }
      throw new Error("provider raw body and secret key");
    },
  };
  const { leadsFilePath, url } = await startTestServer(t, { aiReportService });
  const created = await (await postLead(url)).json();
  const response = await fetch(`${url}/api/leads/${created.lead.id}/ai-retry`, {
    method: "POST",
    headers: { Authorization: adminAuthorization },
  });
  const body = await response.json();
  const stored = JSON.parse(await readFile(leadsFilePath, "utf8"))[0];

  assert.equal(response.status, 200);
  assert.equal(body.lead.aiAnalysis.status, "fallback");
  assert.equal(body.lead.aiAnalysis.retryCount, 1);
  assert.equal(stored.aiAnalysis.status, "fallback");
  assert.equal(stored.aiAnalysis.retryCount, 1);
  assert.doesNotMatch(JSON.stringify(body), /provider raw body|secret key/);
});

test("authenticated GET /api/leads returns full internal matching evidence", async (t) => {
  const { url } = await startTestServer(t);
  await postLead(url);
  const response = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const payload = await response.json();
  const primaryMatch = payload.leads[0].productMatches.find((match) => match.rank === 1);

  assert.equal(response.status, 200);
  assert.equal(payload.leads[0].profile.companyName, "Amazon SC Trading Co.");
  assert.equal(payload.leads[0].rawInput.companyName, "Amazon SC Trading Co.");
  assert.equal(primaryMatch.productId, "linklogis-amazon-sc");
  assert.equal(typeof primaryMatch.fitScore, "number");
  assert.equal(typeof primaryMatch.confidence, "number");
  assert.ok(Array.isArray(primaryMatch.failedRules));
  assert.deepEqual(primaryMatch.inputSnapshot, { qualifiedStoreCount: 1 });
  assert.ok(payload.leads[0].aiInsight.priority);
  assert.match(payload.leads[0].ruleVersion, /^2026-/);
  assert.equal(payload.leads[0].matchReport.ruleVersion, undefined);
  assert.match(primaryMatch.ruleVersion, /^2026-/);
});

test("authenticated evidence retains dependency-level composite missing fields", async (t) => {
  const { url } = await startTestServer(t);
  await postLead(url, completeAmazonVcPayload({ acceptsAccountControl: undefined }));
  const response = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const lead = (await response.json()).leads[0];
  const vcMatch = lead.productMatches.find((match) => match.productId === "linklogis-amazon-vc");

  assert.equal(response.status, 200);
  assert.ok(vcMatch.missingFields.includes("acceptsAccountControl"));
  assert.ok(!vcMatch.missingFields.includes("acceptsNoa"));
  assert.ok(lead.matchReport.missingDocuments.includes("回款账户安排确认"));
});

test("authenticated export rejects an empty lead selection", async (t) => {
  const { url } = await startTestServer(t);
  await postLead(url);
  const response = await fetch(`${url}/api/leads/export`, {
    headers: { Authorization: adminAuthorization },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /选择/);
});

test("authenticated export includes only selected leads and escapes internal table values", async (t) => {
  const aiReportService = {
    generate: async () => ({
      status: "generated",
      customerReport: {
        statusMessage: "AI 初筛完成，专业顾问待复核。",
        businessSummary: ["经营摘要。"],
        productExplanations: [],
        preparationActions: ["准备经营资料。"],
      },
      advisorFocus: ["顾问核验。"],
      meta: {
        provider: "test-provider",
        model: "SECRET-MODEL",
        promptVersion: "SECRET-PROMPT",
        generatedAt: "2026-08-27T00:00:00.000Z",
        usage: { inputTokens: 99, outputTokens: 88 },
        providerErrorBody: "SECRET-PROVIDER-BODY",
        rawModelPayload: "SECRET-RAW-PAYLOAD",
        apiKey: "SECRET-API-KEY",
      },
    }),
  };
  const { url } = await startTestServer(t, { aiReportService });
  const selectedResponse = await postLead(url, completeAmazonScPayload({
    companyName: "<script>alert(1)</script>",
  }));
  const selectedPayload = await selectedResponse.json();
  await postLead(url, completeAmazonScPayload({ companyName: "Not Selected Co." }));
  const reviewNote = "<img src=x onerror=alert(2)>";
  const reviewResponse = await fetch(`${url}/api/leads/${selectedPayload.lead.id}/review`, {
    method: "PATCH",
    headers: { Authorization: adminAuthorization, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed", note: reviewNote }),
  });
  assert.equal(reviewResponse.status, 200);

  const response = await fetch(
    `${url}/api/leads/export?ids=${encodeURIComponent(selectedPayload.lead.id)}`,
    { headers: { Authorization: adminAuthorization } },
  );
  const excel = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/vnd\.ms-excel/);
  assert.match(excel, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(excel, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(excel, /Not Selected Co\./);
  assert.match(excel, /联易融 Amazon SC 卖家融资贷/);
  assert.match(excel, /匹配可信度/);
  assert.match(excel, /规则版本/);
  for (const column of ["AI 报告来源", "AI 生成状态", "顾问复核状态", "顾问复核时间", "顾问内部备注"]) {
    assert.equal(excel.match(new RegExp(column, "g"))?.length, 1, column);
  }
  assert.match(excel, /<td[^>]*>ai<\/td>/);
  assert.match(excel, /<td[^>]*>generated<\/td>/);
  assert.match(excel, /<td[^>]*>reviewed<\/td>/);
  assert.match(excel, /&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.doesNotMatch(excel, /<img src=x onerror=alert\(2\)>/);
  assert.doesNotMatch(excel, /SECRET-(?:MODEL|PROMPT|PROVIDER-BODY|RAW-PAYLOAD|API-KEY)|inputTokens|outputTokens|test-provider/);
});

for (const { label, payload, productId } of [
  { label: "Amazon VC", payload: completeAmazonVcPayload(), productId: "linklogis-amazon-vc" },
  { label: "B2B", payload: completeB2bPayload(), productId: "linklogis-b2b-factoring" },
  { label: "wholesale logistics", payload: completeLogisticsPayload(), productId: "pingan-foreign-trade-logistics-loan" },
]) {
  test(`POST /api/leads reaches a customer-safe eligible ${label} result`, async (t) => {
    const { url } = await startTestServer(t);
    const response = await postLead(url, payload);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.lead.matchReport.primary.productId, productId);
    assert.equal(body.lead.matchReport.primary.presentationLabel, "优先匹配");
    assert.doesNotMatch(JSON.stringify(body), /"(?:status|confidence|fitScore|ruleVersion|formulaKey|inputSnapshot|failedRules)"/);
  });
}

test("simple POST returns only a possible direction without an amount conclusion", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, completeSimplePayload());
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.lead.matchReport.primary.presentationLabel, "可能方向");
  assert.equal(body.lead.matchReport.primary.estimatedAmount, null);
  assert.doesNotMatch(JSON.stringify(body), /"(?:status|confidence|fitScore|ruleVersion|formulaKey|inputSnapshot|failedRules)"/);
});

test("POST /api/leads requires application/json", async (t) => {
  const { url } = await startTestServer(t);
  const response = await fetch(`${url}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(completeAmazonScPayload()),
  });

  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "请使用 application/json 提交" });
});

test("CORS allows same-origin and configured origins while rejecting others", async (t) => {
  const configuredOrigin = "https://ops.example.test";
  const { url } = await startTestServer(t, { allowedOrigins: [configuredOrigin] });
  const sameOriginResponse = await fetch(`${url}/api/products`, { headers: { Origin: url } });
  const configuredResponse = await fetch(`${url}/api/products`, { headers: { Origin: configuredOrigin } });
  const rejectedResponse = await fetch(`${url}/api/products`, { headers: { Origin: "https://untrusted.example.test" } });

  assert.equal(sameOriginResponse.status, 200);
  assert.equal(sameOriginResponse.headers.get("access-control-allow-origin"), url);
  assert.equal(configuredResponse.status, 200);
  assert.equal(configuredResponse.headers.get("access-control-allow-origin"), configuredOrigin);
  assert.equal(rejectedResponse.status, 403);
  assert.equal(rejectedResponse.headers.get("access-control-allow-origin"), null);
});

test("persisted raw input is allowlisted and estimator snapshots are minimal", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  const response = await postLead(url, completeAmazonScPayload({
    unexpectedSecret: "must-not-persist",
    raw: { unsafe: true },
  }));
  const lead = JSON.parse(await readFile(leadsFilePath, "utf8"))[0];

  assert.equal(response.status, 201);
  assert.equal(lead.rawInput.unexpectedSecret, undefined);
  assert.equal(lead.rawInput.raw, undefined);
  assert.equal(lead.profile.raw, undefined);
  assert.ok(lead.productMatches.every((match) => !Object.hasOwn(match.inputSnapshot, "companyName")));
  assert.deepEqual(
    lead.productMatches.find((match) => match.productId === "linklogis-amazon-sc").inputSnapshot,
    { qualifiedStoreCount: 1 },
  );
});

test("an oversized JSON body returns reliable 413 JSON and closes the connection", async (t) => {
  const { url } = await startTestServer(t);
  const response = await fetch(`${url}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(1_000_001) }),
  });

  assert.equal(response.status, 413);
  assert.equal(response.headers.get("connection"), "close");
  assert.deepEqual(await response.json(), { error: "请求内容过大" });
});

test("initialization repairs an existing lead store to mode 0600", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t, {
    seedStore: { leads: [], mode: 0o644 },
  });
  const response = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });

  assert.equal(response.status, 200);
  assert.equal((await stat(leadsFilePath)).mode & 0o777, 0o600);
});

test("unexpected server errors are logged internally and return a generic public 500", async (t) => {
  const logged = [];
  const { leadsFilePath, url } = await startTestServer(t, {
    logger: { error: (...args) => logged.push(args) },
  });
  await mkdir(leadsFilePath);

  const response = await postLead(url);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "服务器暂时无法处理请求" });
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1].pathname, "/api/leads");
  assert.doesNotMatch(JSON.stringify(body), /EISDIR|illegal operation|stack/);
});

test("lead, admin, and selected export responses disable caching", async (t) => {
  const { url } = await startTestServer(t);
  const createdResponse = await postLead(url);
  const created = await createdResponse.json();
  const adminPageResponse = await fetch(`${url}/admin`);
  const leadsResponse = await fetch(`${url}/api/leads`, {
    headers: { Authorization: adminAuthorization },
  });
  const exportResponse = await fetch(`${url}/api/leads/export?ids=${encodeURIComponent(created.lead.id)}`, {
    headers: { Authorization: adminAuthorization },
  });

  assert.equal(createdResponse.headers.get("cache-control"), "no-store");
  assert.equal(adminPageResponse.headers.get("cache-control"), "no-store");
  assert.equal(leadsResponse.headers.get("cache-control"), "no-store");
  assert.equal(exportResponse.headers.get("cache-control"), "no-store");
});

test("authenticated lead filters cover customer, product, institution, currency, status, amount, and date", async (t) => {
  const { url } = await startTestServer(t);
  const reviewedLead = await (await postLead(url, completeAmazonScPayload({ companyName: "Filter SC", requestedAmount: 1000000 }))).json();
  await postLead(url, completeAmazonVcPayload({ companyName: "Filter VC", requestedAmount: 2000000 }));
  await postLead(url, completeLogisticsPayload({ companyName: "Filter Logistics", requestedAmount: 3000000 }));
  await postLead(url, completeAmazonScPayload({
    companyName: "Filter Ineligible",
    registeredProvince: "浙江省",
    applicantRole: "法人",
    legalRepresentativeAge: 66,
    entityType: "other",
    hasMaterialCreditOrJudicialNegative: true,
    acceptsAccountControl: false,
    hasCompatibleCollectionAccount: false,
  }));
  const reviewResponse = await fetch(`${url}/api/leads/${reviewedLead.lead.id}/review`, {
    method: "PATCH",
    headers: { Authorization: adminAuthorization, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed", note: "筛选测试" }),
  });
  assert.equal(reviewResponse.status, 200);

  const query = async (parameters) => {
    const response = await fetch(`${url}/api/leads?${new URLSearchParams(parameters)}`, {
      headers: { Authorization: adminAuthorization },
    });
    assert.equal(response.status, 200);
    return (await response.json()).leads.map((lead) => lead.companyName);
  };

  assert.deepEqual(await query({ search: "filter vc" }), ["Filter VC"]);
  assert.deepEqual(await query({ product: "linklogis-amazon-sc" }), ["Filter SC"]);
  assert.deepEqual(await query({ institution: "平安银行" }), ["Filter Logistics"]);
  assert.deepEqual((await query({ currency: "USD" })).sort(), ["Filter SC", "Filter VC"]);
  assert.deepEqual((await query({ status: "eligible" })).sort(), ["Filter Logistics", "Filter SC", "Filter VC"]);
  assert.deepEqual(await query({ status: "ineligible" }), ["Filter Ineligible"]);
  assert.deepEqual(await query({ reviewStatus: "reviewed" }), ["Filter SC"]);
  assert.deepEqual((await query({ reviewStatus: "pending" })).sort(), ["Filter Ineligible", "Filter Logistics", "Filter VC"]);
  assert.deepEqual(await query({ amountMin: "2500000" }), ["Filter Logistics"]);
  assert.deepEqual(await query({ amountMax: "1500000" }), ["Filter SC"]);
  assert.deepEqual(await query({ dateTo: "2000-01-01" }), []);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await query({ dateFrom: today })).length, 4);
});

test("legacy advisor reviews project as pending for admin filtering and selected export without store mutation", async (t) => {
  const legacyLeads = [
    {
      id: "legacy-missing-review",
      createdAt: "2026-08-20T00:00:00.000Z",
      companyName: "Legacy Missing Review Co.",
      contactName: "Legacy One",
      phone: "13800139001",
      productMatches: [],
      matchReport: { alternatives: [] },
      aiAnalysis: { status: "fallback" },
    },
    {
      id: "legacy-invalid-review",
      createdAt: "2026-08-21T00:00:00.000Z",
      companyName: "Legacy Invalid Review Co.",
      contactName: "Legacy Two",
      phone: "13800139002",
      productMatches: [],
      matchReport: { alternatives: [] },
      aiAnalysis: { status: "fallback" },
      advisorReview: { status: "approved", note: { html: "bad" }, updatedAt: "not-a-date" },
    },
    {
      id: "valid-reviewed",
      createdAt: "2026-08-22T00:00:00.000Z",
      companyName: "Valid Reviewed Co.",
      contactName: "Valid Advisor",
      phone: "13800139003",
      productMatches: [],
      matchReport: { alternatives: [] },
      aiAnalysis: { status: "generated" },
      advisorReview: { status: "reviewed", note: "已核验", updatedAt: "2026-08-27T08:00:00.000Z" },
    },
  ];
  const { leadsFilePath, url } = await startTestServer(t, { seedStore: { leads: legacyLeads } });
  const beforeRead = JSON.parse(await readFile(leadsFilePath, "utf8"));
  const pendingResponse = await fetch(`${url}/api/leads?reviewStatus=pending`, {
    headers: { Authorization: adminAuthorization },
  });
  const pendingLeads = (await pendingResponse.json()).leads;
  const exportResponse = await fetch(
    `${url}/api/leads/export?ids=legacy-missing-review&ids=legacy-invalid-review`,
    { headers: { Authorization: adminAuthorization } },
  );
  const excel = await exportResponse.text();

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(pendingLeads.map((lead) => lead.id).sort(), [
    "legacy-invalid-review",
    "legacy-missing-review",
  ]);
  assert.ok(pendingLeads.every((lead) => (
    lead.advisorReview.status === "pending"
      && lead.advisorReview.note === ""
      && lead.advisorReview.updatedAt === null
  )));
  assert.equal(exportResponse.status, 200);
  assert.equal((excel.match(/<td[^>]*>pending<\/td>/g) ?? []).length, 2);
  assert.doesNotMatch(excel, /approved|not-a-date|\[object Object\]/);
  assert.deepEqual(JSON.parse(await readFile(leadsFilePath, "utf8")), beforeRead);
});

test("admin page exposes useful filters while preserving explicit selection-only export", async (t) => {
  const { url } = await startTestServer(t);
  const response = await fetch(`${url}/admin`);
  const html = await response.text();

  assert.equal(response.status, 200);
  for (const id of [
    "searchFilter",
    "productFilter",
    "institutionFilter",
    "currencyFilter",
    "statusFilter",
    "reviewStatusFilter",
    "amountMinFilter",
    "amountMaxFilter",
    "dateFromFilter",
    "dateToFilter",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="export"[^>]*disabled/);
  assert.match(html, /value === "progressive" \? "产品匹配"/);
  assert.match(html, /ids\.forEach\(\(id\) => params\.append\("ids", id\)\)/);
  assert.doesNotMatch(html, /href="\/api\/leads\/export"/);
});

test("admin page provides an accessible orderly advisor drawer and escapes build-time values", () => {
  const html = buildAdminPage({
    leadColumns: [["safe\");</script><script>alert(1)</script>//", "<img src=x onerror=alert(2)>"]],
    products: [{
      id: "product\"><script>alert(3)</script>",
      name: "<svg onload=alert(4)>",
      institution: "</option><script>alert(5)</script>",
    }],
  });

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /id="advisorDrawerTitle"/);
  for (const id of [
    "drawerCustomerSummary",
    "drawerDeterministicMatch",
    "drawerAiReport",
    "drawerAdvisorFocus",
    "drawerReview",
    "drawerActions",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="closeDrawer"/);
  assert.match(html, /id="saveReview"/);
  assert.match(html, /id="retryAi"/);
  assert.match(html, /event\.key === "Escape"/);
  assert.match(html, /drawerReturnFocus\.focus\(\)/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.drawer[^}]*width: 100%/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(html, /&lt;svg onload=alert\(4\)&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(2\)>|<svg onload=alert\(4\)>|<script>alert\([135]\)<\/script>/);
  assert.doesNotMatch(html, /safe\\?"\);<\/script>/);
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("admin drawer ignores deferred save and retry responses after switching leads", async () => {
  const lead = (id, note) => ({
    id,
    companyName: `${id} Company`,
    contactName: `${id} Contact`,
    phone: `13800138${id === "A" ? "101" : "102"}`,
    createdAt: "2026-08-27T08:00:00.000Z",
    profile: { primaryBusinessModel: "amazon_sc", requestedAmount: { amount: 1000000, currency: "USD" } },
    matchReport: { primary: null, alternatives: [] },
    advisorVerificationFields: [],
    aiAnalysis: {
      status: "fallback",
      customerReport: {
        statusMessage: `${id} AI status`,
        businessSummary: [`${id} summary`],
        productExplanations: [],
        preparationActions: [],
      },
      advisorFocus: [],
    },
    advisorReview: { status: "pending", note, updatedAt: null },
  });
  const leadA = lead("A", "A original");
  const leadB = lead("B", "B original");
  const vm = createAdminScriptVm([leadA, leadB]);
  vm.element("username").value = "admin";
  vm.element("password").value = "password";
  await vm.element("load").dispatch("click");

  const responseFor = (savedLead) => ({ ok: true, json: async () => ({ lead: savedLead }) });
  await vm.viewButton("A").dispatch("click");
  vm.element("reviewStatus").value = "reviewed";
  vm.element("reviewNote").value = "A save value";
  const deferredSaveA = createDeferred();
  vm.setFetchHandler(() => deferredSaveA.promise);
  const saveAPromise = vm.element("saveReview").dispatch("click");
  await vm.element("closeDrawer").dispatch("click");
  await vm.viewButton("B").dispatch("click");
  const bDisabledWhenOpenedDuringSave = vm.element("saveReview").disabled;

  deferredSaveA.resolve(responseFor({
    ...leadA,
    advisorReview: { status: "reviewed", note: "A save value", updatedAt: "2026-08-27T09:00:00.000Z" },
  }));
  await saveAPromise;
  const afterStaleSave = {
    title: vm.element("advisorDrawerTitle").textContent,
    note: vm.element("reviewNote").value,
    status: vm.element("drawerActionStatus").textContent,
    saveDisabled: vm.element("saveReview").disabled,
  };

  vm.element("reviewStatus").value = "in_review";
  vm.element("reviewNote").value = "B subsequent save";
  let subsequentSaveBody;
  vm.setFetchHandler(async (url, options) => {
    subsequentSaveBody = { url, body: JSON.parse(options.body) };
    return responseFor({
      ...leadB,
      advisorReview: { status: "in_review", note: "B subsequent save", updatedAt: "2026-08-27T10:00:00.000Z" },
    });
  });
  await vm.element("saveReview").dispatch("click");

  await vm.element("closeDrawer").dispatch("click");
  await vm.viewButton("A").dispatch("click");
  const deferredRetryA = createDeferred();
  vm.setFetchHandler(() => deferredRetryA.promise);
  const retryAPromise = vm.element("retryAi").dispatch("click");
  await vm.element("closeDrawer").dispatch("click");
  await vm.viewButton("B").dispatch("click");
  const bDisabledWhenOpenedDuringRetry = vm.element("saveReview").disabled;

  vm.element("reviewStatus").value = "reviewed";
  vm.element("reviewNote").value = "B save while A retry waits";
  const deferredSaveB = createDeferred();
  vm.setFetchHandler(() => deferredSaveB.promise);
  const saveBPromise = vm.element("saveReview").dispatch("click");
  deferredRetryA.resolve(responseFor({
    ...leadA,
    aiAnalysis: {
      ...leadA.aiAnalysis,
      status: "generated",
      retryCount: 1,
      customerReport: { ...leadA.aiAnalysis.customerReport, businessSummary: ["A retry value"] },
    },
  }));
  await retryAPromise;
  const afterStaleRetry = {
    title: vm.element("advisorDrawerTitle").textContent,
    note: vm.element("reviewNote").value,
    status: vm.element("drawerActionStatus").textContent,
    saveDisabled: vm.element("saveReview").disabled,
    retryDisabled: vm.element("retryAi").disabled,
  };

  deferredSaveB.resolve(responseFor({
    ...leadB,
    advisorReview: { status: "reviewed", note: "B save while A retry waits", updatedAt: "2026-08-27T11:00:00.000Z" },
  }));
  await saveBPromise;

  assert.equal(bDisabledWhenOpenedDuringSave, false);
  assert.deepEqual(afterStaleSave, {
    title: "B Company",
    note: "B original",
    status: "",
    saveDisabled: false,
  });
  assert.deepEqual(subsequentSaveBody, {
    url: "/api/leads/B/review",
    body: { status: "in_review", note: "B subsequent save" },
  });
  assert.equal(bDisabledWhenOpenedDuringRetry, false);
  assert.deepEqual(afterStaleRetry, {
    title: "B Company",
    note: "B save while A retry waits",
    status: "正在保存复核...",
    saveDisabled: true,
    retryDisabled: true,
  });
  assert.equal(vm.element("advisorDrawerTitle").textContent, "B Company");
  assert.equal(vm.element("reviewNote").value, "B save while A retry waits");
  assert.equal(vm.element("drawerActionStatus").textContent, "复核已保存。");
  assert.equal(vm.element("saveReview").disabled, false);
});

test("admin drawer cache keeps the newest successful same-lead operation when responses reverse", async () => {
  const leadA = {
    id: "A",
    companyName: "A Company",
    contactName: "A Contact",
    phone: "13800138101",
    createdAt: "2026-08-27T08:00:00.000Z",
    profile: { primaryBusinessModel: "amazon_sc", requestedAmount: { amount: 1000000, currency: "USD" } },
    matchReport: { primary: null, alternatives: [] },
    advisorVerificationFields: [],
    aiAnalysis: {
      status: "generated",
      customerReport: {
        statusMessage: "A AI status",
        businessSummary: ["A summary"],
        productExplanations: [],
        preparationActions: [],
      },
      advisorFocus: [],
    },
    advisorReview: { status: "pending", note: "A original", updatedAt: null },
  };
  const vm = createAdminScriptVm([leadA]);
  vm.element("username").value = "admin";
  vm.element("password").value = "password";
  await vm.element("load").dispatch("click");

  const responseFor = (lead) => ({ ok: true, json: async () => ({ lead }) });
  const operationOne = createDeferred();
  const operationTwo = createDeferred();
  let saveNumber = 0;
  vm.setFetchHandler(() => {
    saveNumber += 1;
    return saveNumber === 1 ? operationOne.promise : operationTwo.promise;
  });

  await vm.viewButton("A").dispatch("click");
  vm.element("reviewStatus").value = "in_review";
  vm.element("reviewNote").value = "operation one";
  const operationOnePromise = vm.element("saveReview").dispatch("click");
  await vm.element("closeDrawer").dispatch("click");
  await vm.viewButton("A").dispatch("click");
  vm.element("reviewStatus").value = "reviewed";
  vm.element("reviewNote").value = "operation two";
  const operationTwoPromise = vm.element("saveReview").dispatch("click");

  operationTwo.resolve(responseFor({
    ...leadA,
    advisorReview: { status: "reviewed", note: "operation two", updatedAt: "2026-08-27T10:00:00.000Z" },
  }));
  await operationTwoPromise;
  await vm.element("closeDrawer").dispatch("click");
  operationOne.resolve(responseFor({
    ...leadA,
    advisorReview: { status: "in_review", note: "operation one", updatedAt: "2026-08-27T09:00:00.000Z" },
  }));
  await operationOnePromise;

  await vm.viewButton("A").dispatch("click");
  assert.equal(vm.element("reviewStatus").value, "reviewed");
  assert.equal(vm.element("reviewNote").value, "operation two");

  let subsequentSave;
  vm.setFetchHandler(async (url, options) => {
    subsequentSave = { url, body: JSON.parse(options.body) };
    return responseFor({
      ...leadA,
      advisorReview: { status: "reviewed", note: "operation two", updatedAt: "2026-08-27T11:00:00.000Z" },
    });
  });
  await vm.element("saveReview").dispatch("click");
  assert.deepEqual(subsequentSave, {
    url: "/api/leads/A/review",
    body: { status: "reviewed", note: "operation two" },
  });
});

test("admin drawer cache allows an older success when the newer same-lead operation fails", async () => {
  const leadA = {
    id: "A",
    companyName: "A Company",
    contactName: "A Contact",
    phone: "13800138101",
    createdAt: "2026-08-27T08:00:00.000Z",
    profile: {},
    matchReport: { primary: null, alternatives: [] },
    advisorVerificationFields: [],
    aiAnalysis: { status: "generated", customerReport: {}, advisorFocus: [] },
    advisorReview: { status: "pending", note: "A original", updatedAt: null },
  };
  const vm = createAdminScriptVm([leadA]);
  vm.element("username").value = "admin";
  vm.element("password").value = "password";
  await vm.element("load").dispatch("click");

  const operationOne = createDeferred();
  const operationTwo = createDeferred();
  let saveNumber = 0;
  vm.setFetchHandler(() => {
    saveNumber += 1;
    return saveNumber === 1 ? operationOne.promise : operationTwo.promise;
  });
  await vm.viewButton("A").dispatch("click");
  vm.element("reviewStatus").value = "in_review";
  vm.element("reviewNote").value = "older success";
  const operationOnePromise = vm.element("saveReview").dispatch("click");
  await vm.element("closeDrawer").dispatch("click");
  await vm.viewButton("A").dispatch("click");
  vm.element("reviewStatus").value = "reviewed";
  vm.element("reviewNote").value = "newer failure";
  const operationTwoPromise = vm.element("saveReview").dispatch("click");

  operationTwo.resolve({ ok: false, json: async () => ({ error: "save rejected" }) });
  await operationTwoPromise;
  await vm.element("closeDrawer").dispatch("click");
  operationOne.resolve({
    ok: true,
    json: async () => ({
      lead: {
        ...leadA,
        advisorReview: { status: "in_review", note: "older success", updatedAt: "2026-08-27T09:00:00.000Z" },
      },
    }),
  });
  await operationOnePromise;

  await vm.viewButton("A").dispatch("click");
  assert.equal(vm.element("reviewStatus").value, "in_review");
  assert.equal(vm.element("reviewNote").value, "older success");
});
