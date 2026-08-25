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
