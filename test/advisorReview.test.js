import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAdvisorReview } from "../server/advisorReview.mjs";

const currentReview = Object.freeze({
  status: "pending",
  note: "",
  updatedAt: null,
});

test("review accepts the exact workflow states and trims a bounded plain-text note", () => {
  const now = () => new Date("2026-08-27T08:00:00.000Z");

  for (const status of ["pending", "in_review", "reviewed", "needs_information"]) {
    const review = normalizeAdvisorReview(
      { status, note: "  已电话确认店铺经营时长。  " },
      currentReview,
      now,
    );
    assert.deepEqual(review, {
      status,
      note: "已电话确认店铺经营时长。",
      updatedAt: "2026-08-27T08:00:00.000Z",
    });
  }

  assert.equal(normalizeAdvisorReview(
    { status: "in_review", note: ` ${"x".repeat(2000)} ` },
    currentReview,
    now,
  ).note.length, 2000);
});

test("review rejects unknown states and non-string or overlong notes", () => {
  for (const input of [
    { status: "approved", note: "" },
    { status: "PENDING", note: "" },
    { status: null, note: "" },
  ]) {
    assert.throws(() => normalizeAdvisorReview(input, currentReview), /status/);
  }

  for (const note of [null, 1, {}, [], "x".repeat(2001)]) {
    assert.throws(
      () => normalizeAdvisorReview({ status: "pending", note }, currentReview),
      /note/,
    );
  }
});

test("an unchanged review preserves its timestamp without consulting the clock", () => {
  const existing = {
    status: "reviewed",
    note: "已核验",
    updatedAt: "2026-08-26T01:02:03.000Z",
  };

  assert.deepEqual(normalizeAdvisorReview(
    { status: "reviewed", note: " 已核验 " },
    existing,
    () => { throw new Error("clock must not be called"); },
  ), existing);
});

test("invalid review input never advances updatedAt", () => {
  let clockCalls = 0;
  assert.throws(() => normalizeAdvisorReview(
    { status: "reviewed", note: "x".repeat(2001) },
    currentReview,
    () => {
      clockCalls += 1;
      return new Date();
    },
  ), /note/);
  assert.equal(clockCalls, 0);
});
