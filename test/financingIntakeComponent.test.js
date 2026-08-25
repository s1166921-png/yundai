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

test("Amazon SC switch stays before the four-group accordion across WeBank expansion", async (t) => {
  const { AmazonScStepFields, groupIntakeStepFields } = await loadComponent(t);
  const { getVisibleIntakeFields } = await import("../src/lib/matching/intakeSchema.js");
  for (const includeWebankAssessment of [false, true]) {
    const profile = {
      primaryBusinessModel: "amazon_sc",
      includeWebankAssessment,
      preferredCurrency: "usd",
      requestedAmount: 1000000,
    };
    const stepFields = getVisibleIntakeFields(profile).filter((field) => field.step === 2);
    const groups = groupIntakeStepFields(stepFields, profile);
    const markup = renderToStaticMarkup(createElement(AmazonScStepFields, {
      groups,
      stepFields,
      profile,
      errors: {},
      openGroupId: "financing-needs",
      onOpenGroup: () => {},
      onChange: () => {},
      registerField: () => () => {},
    }));

    assert.ok(markup.indexOf('role="switch"') < markup.indexOf('class="intake-field-groups"'));
    assert.deepEqual(groups.map(({ id, title }) => ({ id, title })), [
      { id: "financing-needs", title: "融资需求" },
      { id: "operating-scale", title: "经营规模" },
      { id: "amazon-data", title: "Amazon 经营数据" },
      { id: "account-risk", title: "账户与风险控制" },
    ]);
    assert.equal(groups.flatMap((group) => group.fields).some((field) => field.key === "includeWebankAssessment"), false);
    assert.match(markup, /已填写 2\/3/);
  }
});

test("selecting Amazon SC leaves the remaining stage-one fields ungrouped and visible", async (t) => {
  const { groupIntakeStepFields } = await loadComponent(t);
  const { getVisibleIntakeFields } = await import("../src/lib/matching/intakeSchema.js");
  const profile = { primaryBusinessModel: "amazon_sc" };
  const stepOneFields = getVisibleIntakeFields(profile).filter((field) => field.step === 1);
  const groups = groupIntakeStepFields(stepOneFields, profile);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, null);
  assert.deepEqual(groups[0].fields.map((field) => field.key), [
    "companyName", "primaryBusinessModel", "entityRegion", "entityType",
  ]);
});

test("Amazon SC accordion renders at most one open field group", async (t) => {
  const { AmazonScStepFields, groupIntakeStepFields } = await loadComponent(t);
  const { getVisibleIntakeFields } = await import("../src/lib/matching/intakeSchema.js");
  const profile = { primaryBusinessModel: "amazon_sc", includeWebankAssessment: true };
  const stepFields = getVisibleIntakeFields(profile).filter((field) => field.step === 2);
  const groups = groupIntakeStepFields(stepFields, profile);
  const markup = renderToStaticMarkup(createElement(AmazonScStepFields, {
    groups,
    stepFields,
    profile,
    errors: {},
    openGroupId: "amazon-data",
    onOpenGroup: () => {},
    onChange: () => {},
    registerField: () => () => {},
  }));

  assert.equal((markup.match(/aria-expanded="true"/g) ?? []).length, 1);
  assert.equal((markup.match(/aria-expanded="false"/g) ?? []).length, 3);
  assert.equal((markup.match(/role="tabpanel"/g) ?? []).length, 4);
  assert.equal((markup.match(/ hidden=""/g) ?? []).length, 3);
});

test("Amazon SC stepper keyboard navigation wraps and supports Home and End", async (t) => {
  const { nextIntakeGroupIndex } = await loadComponent(t);

  assert.equal(nextIntakeGroupIndex(0, 4, "ArrowRight"), 1);
  assert.equal(nextIntakeGroupIndex(0, 4, "ArrowLeft"), 3);
  assert.equal(nextIntakeGroupIndex(2, 4, "Home"), 0);
  assert.equal(nextIntakeGroupIndex(1, 4, "End"), 3);
  assert.equal(nextIntakeGroupIndex(1, 4, "Enter"), null);
});

test("first invalid field resolves to the group that must open before focus", async (t) => {
  const { findIntakeGroupForField, groupIntakeStepFields } = await loadComponent(t);
  const { getVisibleIntakeFields } = await import("../src/lib/matching/intakeSchema.js");
  const profile = { primaryBusinessModel: "amazon_sc", includeWebankAssessment: true };
  const groups = groupIntakeStepFields(
    getVisibleIntakeFields(profile).filter((field) => field.step === 2),
    profile,
  );

  assert.equal(findIntakeGroupForField(groups, "preferredCurrency"), "financing-needs");
  assert.equal(findIntakeGroupForField(groups, "amazonAhrScore"), "amazon-data");
  assert.equal(findIntakeGroupForField(groups, "acceptsAccountControl"), "account-risk");
});

test("WeBank accordion preserves expanded payload and clears hidden values when disabled", async (t) => {
  const { buildProgressiveSubmission, clearInactiveIntakeValues } = await loadComponent(t);
  const profile = {
    intakeVersion: "progressive-v1",
    companyName: "Payload Co.",
    primaryBusinessModel: "amazon_sc",
    preferredCurrency: "rmb",
    requestedAmount: 1000000,
    fundUse: "platform_operations",
    includeWebankAssessment: true,
    singleStoreGmvUsd: 6000000,
    amazonAhrScore: 320,
    borrowerMatchesCollectionEntity: true,
  };

  assert.deepEqual(buildProgressiveSubmission(profile), {
    intakeVersion: "progressive-v1",
    estimationMode: "progressive",
    companyName: "Payload Co.",
    primaryBusinessModel: "amazon_sc",
    preferredCurrency: "rmb",
    requestedAmount: 1000000,
    fundUse: "platform_operations",
    singleStoreGmvUsd: 6000000,
    includeWebankAssessment: true,
    amazonAhrScore: 320,
    borrowerMatchesCollectionEntity: true,
  });

  const disabled = clearInactiveIntakeValues({ ...profile, includeWebankAssessment: false }, "amazon_sc");
  assert.deepEqual(buildProgressiveSubmission(disabled), {
    intakeVersion: "progressive-v1",
    estimationMode: "progressive",
    companyName: "Payload Co.",
    primaryBusinessModel: "amazon_sc",
    preferredCurrency: "rmb",
    requestedAmount: 1000000,
    fundUse: "platform_operations",
    singleStoreGmvUsd: 6000000,
    includeWebankAssessment: false,
  });
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
