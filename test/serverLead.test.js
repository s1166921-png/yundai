import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, readFile, readdir, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMeiouServer } from "../server/index.mjs";

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
    "createdAt",
    "estimationMode",
    "id",
    "matchReport",
  ]);
  assert.doesNotMatch(serialized, /"(?:status|score|rawScore|debtPenalty|breakdown|estimate|fitScore|confidence|failedRules|internalReason|inputSnapshot|formulaKey|priority|ruleVersion)"/);
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

test("concurrent POST /api/leads requests persist every accepted lead exactly once", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
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
  assert.deepEqual(
    (await readdir(path.dirname(leadsFilePath))).filter((entry) => entry.endsWith(".tmp")),
    [],
  );
});

test("successful lead store creation and replacement preserve mode 0600", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  const createdResponse = await postLead(url);

  assert.equal(createdResponse.status, 201);
  assert.equal((await stat(leadsFilePath)).mode & 0o777, 0o600);

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
  const { url } = await startTestServer(t);
  const selectedResponse = await postLead(url, completeAmazonScPayload({
    companyName: "<script>alert(1)</script>",
  }));
  const selectedPayload = await selectedResponse.json();
  await postLead(url, completeAmazonScPayload({ companyName: "Not Selected Co." }));

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
  await postLead(url, completeAmazonScPayload({ companyName: "Filter SC", requestedAmount: 1000000 }));
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
  assert.deepEqual(await query({ amountMin: "2500000" }), ["Filter Logistics"]);
  assert.deepEqual(await query({ amountMax: "1500000" }), ["Filter SC"]);
  assert.deepEqual(await query({ dateTo: "2000-01-01" }), []);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await query({ dateFrom: today })).length, 4);
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
    "amountMinFilter",
    "amountMaxFilter",
    "dateFromFilter",
    "dateToFilter",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="export"[^>]*disabled/);
  assert.match(html, /ids\.forEach\(\(id\) => params\.append\("ids", id\)\)/);
  assert.doesNotMatch(html, /href="\/api\/leads\/export"/);
});
