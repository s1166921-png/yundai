import test from "node:test";
import assert from "node:assert/strict";
import {
  INTAKE_INVALIDATION_REASONS,
  invalidateIntakeResult,
} from "../src/lib/matching/intakeLifecycle.js";

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
