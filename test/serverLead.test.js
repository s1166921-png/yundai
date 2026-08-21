import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMeiouServer } from "../server/index.mjs";

const adminAuthorization = `Basic ${Buffer.from(
  `${process.env.ADMIN_USERNAME || "admin"}:${process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || "meiou2026"}`,
).toString("base64")}`;

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
  preferredCurrency: "usd",
  preferredTermMonths: 3,
  ...overrides,
});

async function startTestServer(t) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "meiou-leads-"));
  const leadsFilePath = path.join(temporaryDirectory, "leads.json");
  const server = createMeiouServer({ leadsFilePath });
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

test("POST /api/leads matches a complete Amazon SC profile and persists audit evidence", async (t) => {
  const { leadsFilePath, url } = await startTestServer(t);
  const response = await postLead(url);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.lead.matchReport.primary.productId, "linklogis-amazon-sc");
  assert.ok(payload.lead.productMatches.filter((match) => match.rank != null).length <= 3);
  assert.match(payload.lead.ruleVersion, /^2026-/);
  assert.equal(payload.lead.estimationMode, "complex");
  assert.equal(typeof payload.lead.estimate.score, "number");
  assert.ok(payload.lead.aiInsight);

  const persistedLeads = JSON.parse(await readFile(leadsFilePath, "utf8"));
  assert.equal(persistedLeads[0].profile.raw.qualifiedStoreCount, 1);
  assert.equal(persistedLeads[0].productMatches[0].inputSnapshot.raw.companyName, "Amazon SC Trading Co.");
  assert.equal(persistedLeads[0].ruleVersion, payload.lead.ruleVersion);
});

test("POST /api/leads returns field-level 400 errors for missing and unknown values", async (t) => {
  const { url } = await startTestServer(t);
  const response = await postLead(url, {
    estimationMode: "complex",
    companyName: " ",
    contactName: "",
    phone: null,
    entityRegion: "moon",
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
  assert.equal(payload.lead.profile.raw, undefined);
  assert.doesNotMatch(serialized, /"(?:fitScore|confidence|failedRules|internalReason|inputSnapshot|formulaKey|priority)"/);
  for (const match of payload.lead.productMatches) {
    assert.deepEqual(Object.keys(match).sort(), [
      "estimatedAmount",
      "productId",
      "rank",
      "ruleVersion",
      "status",
    ]);
  }
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
  assert.equal(payload.leads[0].profile.raw.companyName, "Amazon SC Trading Co.");
  assert.equal(primaryMatch.productId, "linklogis-amazon-sc");
  assert.equal(typeof primaryMatch.fitScore, "number");
  assert.equal(typeof primaryMatch.confidence, "number");
  assert.ok(Array.isArray(primaryMatch.failedRules));
  assert.ok(primaryMatch.inputSnapshot.raw);
  assert.ok(payload.leads[0].aiInsight.priority);
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
