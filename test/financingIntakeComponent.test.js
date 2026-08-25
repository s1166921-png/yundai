import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

async function loadComponent(t) {
  const server = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.mjs", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  t.after(() => server.close());
  return server.ssrLoadModule("/src/components/FinancingIntake.jsx");
}

test("progressive intake renders one three-step flow without legacy modes", async (t) => {
  const { FinancingIntake } = await loadComponent(t);
  const markup = renderToStaticMarkup(createElement(FinancingIntake));

  assert.doesNotMatch(markup, /简易版|复杂版|选择测算版本/);
  assert.equal((markup.match(/<li/g) ?? []).length, 3);
  assert.match(markup, /主要融资场景/);
  assert.doesNotMatch(markup, /Amazon AHR 分数/);
});

test("progressive payload includes its version and visible non-empty fields only", async (t) => {
  const { buildProgressiveSubmission, clearInactiveIntakeValues } = await loadComponent(t);
  const amazonSc = {
    companyName: "Component Co.",
    primaryBusinessModel: "amazon_sc",
    entityRegion: "mainland",
    entityType: "limited_company",
    preferredCurrency: "usd",
    requestedAmount: 1000000,
    fundUse: "inventory_procurement",
    singleStoreGmvUsd: 6000000,
    includeWebankAssessment: true,
    amazonAhrScore: 95,
  };
  const switched = clearInactiveIntakeValues(amazonSc, "b2b_supermarket");
  const payload = buildProgressiveSubmission(switched);

  assert.deepEqual(payload, {
    intakeVersion: "progressive-v1",
    estimationMode: "progressive",
    companyName: "Component Co.",
    primaryBusinessModel: "b2b_supermarket",
    entityRegion: "mainland",
    entityType: "limited_company",
    preferredCurrency: "usd",
    requestedAmount: 1000000,
    fundUse: "inventory_procurement",
  });
});

test("expanded Amazon SC fields are partitioned into semantic groups without changing field keys", async (t) => {
  const { groupIntakeStepFields } = await loadComponent(t);
  const { getVisibleIntakeFields } = await import("../src/lib/matching/intakeSchema.js");
  const profile = { primaryBusinessModel: "amazon_sc", includeWebankAssessment: true };
  const stepFields = getVisibleIntakeFields(profile).filter((field) => field.step === 2);
  const groups = groupIntakeStepFields(stepFields, profile);

  assert.deepEqual(groups.map(({ id, title }) => ({ id, title })), [
    { id: "financing-needs", title: "融资需求" },
    { id: "operating-scale", title: "经营规模" },
    { id: "amazon-data", title: "Amazon 经营数据" },
    { id: "account-risk", title: "账户与风险控制" },
  ]);
  assert.deepEqual(
    groups.flatMap((group) => group.fields.map((field) => field.key)).sort(),
    stepFields.map((field) => field.key).sort(),
  );
  assert.equal(new Set(groups.flatMap((group) => group.fields)).size, stepFields.length);
});

test("step heading focus and scroll respect reduced motion with legacy fallbacks", async (t) => {
  const { focusWizardStepHeading } = await loadComponent(t);
  const calls = [];
  const heading = {
    focus: (options) => {
      calls.push(["focus", options]);
      if (options && typeof options === "object") throw new TypeError("focus options unsupported");
    },
    scrollIntoView: (options) => {
      calls.push(["scroll", options]);
      if (options && typeof options === "object") throw new TypeError("scroll options unsupported");
    },
  };

  assert.equal(focusWizardStepHeading(heading, {
    matchMedia: () => ({ matches: true }),
  }), true);
  assert.deepEqual(calls, [
    ["focus", { preventScroll: true }],
    ["focus", undefined],
    ["scroll", { behavior: "auto", block: "start" }],
    ["scroll", true],
  ]);
});

test("preferred result presents its reference amount once", async (t) => {
  const server = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.mjs", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  t.after(() => server.close());
  const { ProductMatchCenter } = await server.ssrLoadModule("/src/components/ProductMatchCenter.jsx");
  const report = {
    primary: {
      institution: "联易融",
      name: "联易融 Amazon SC 卖家融资贷",
      presentationLabel: "优先匹配",
      estimatedAmount: { kind: "range", currency: "USD", min: 1000000, max: 3000000 },
      whyMatched: [],
      term: "90天",
      pricing: "待核定",
    },
    alternatives: [],
    missingDocuments: [],
    nonMatches: [],
  };
  const markup = renderToStaticMarkup(createElement(ProductMatchCenter, { report, products: [] }));

  assert.equal((markup.match(/100万-300万美元/g) ?? []).length, 1);
  assert.match(markup, /<dt>币种<\/dt>/);
  assert.match(markup, /<dt>期限<\/dt>/);
  assert.match(markup, /<dt>参考定价<\/dt>/);
});
