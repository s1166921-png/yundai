import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  INTAKE_INVALIDATION_REASONS,
  invalidateIntakeResult,
} from "../src/lib/matching/intakeLifecycle.js";

async function loadComponent(t) {
  const server = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.mjs", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  t.after(() => server.close());
  return server.ssrLoadModule("/src/components/FinancingIntake.jsx");
}

test("completed intake results invalidate for every required lifecycle event", () => {
  const received = [];

  for (const reason of ["field_change", "mode_change", "submit_start", "submit_failure"]) {
    assert.equal(invalidateIntakeResult((value) => received.push(value), reason), true);
  }

  assert.deepEqual(received, INTAKE_INVALIDATION_REASONS);
});

test("completion and navigation events do not invalidate a result", () => {
  let calls = 0;
  assert.equal(invalidateIntakeResult(() => { calls += 1; }, "submit_success"), false);
  assert.equal(invalidateIntakeResult(() => { calls += 1; }, "step_change"), false);
  assert.equal(calls, 0);
});

test("switching the primary scenario removes hidden values before the next submit", async (t) => {
  const { clearInactiveIntakeValues } = await loadComponent(t);
  const next = clearInactiveIntakeValues({
    primaryBusinessModel: "amazon_sc",
    companyName: "Lifecycle Co.",
    singleStoreGmvUsd: 6000000,
    includeWebankAssessment: true,
    amazonAhrScore: 95,
  }, "b2b_supermarket");

  assert.deepEqual(next, {
    primaryBusinessModel: "b2b_supermarket",
    companyName: "Lifecycle Co.",
  });
});
