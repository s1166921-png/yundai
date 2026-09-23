import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { startPromotionTracking } from "../src/lib/promotionTracking.js";
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ hidden = false, search = "?ref=" + "a".repeat(32), fail = false } = {}) {
  const callbacks = new Set(), timers = new Map(), sent = []; let timerId = 0;
  const documentObject = {
    visibilityState: hidden ? "hidden" : "visible",
    addEventListener: (_, fn) => callbacks.add(fn), removeEventListener: (_, fn) => callbacks.delete(fn),
    visible() { this.visibilityState = "visible"; callbacks.forEach(fn => fn()); },
  };
  const windowObject = { location: { search }, crypto: webcrypto,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  return { documentObject, windowObject, sent, timers, callbacks,
    async fetchImpl(url, options) { sent.push({ url, ...options }); if (fail) throw new Error("offline"); return { status: 204 }; },
    fireTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
  };
}
test("only a visible valid referral is reported, once across repeated starts", async () => {
  const f = fixture({ hidden: true });
  const stop = startPromotionTracking(f);
  assert.equal(f.sent.length, 0); stop();
  startPromotionTracking(f); f.documentObject.visible(); await flush();
  startPromotionTracking(f); f.documentObject.visible(); await flush();
  assert.equal(f.sent.length, 1);
  assert.equal(JSON.parse(f.sent[0].body).ref, "a".repeat(32));
  assert.equal(JSON.parse(f.sent[0].body).eventType, "page_view");
});
test("failed request retries once with identical eventId, cleanup is safe", async () => {
  const f = fixture({ fail: true }); const stop = startPromotionTracking(f);
  await flush(); assert.equal(f.sent.length, 1);
  f.fireTimers(); await flush(); f.fireTimers(); await flush();
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[0].body, f.sent[1].body);
  stop(); assert.equal(f.timers.size, 0);
});
test("no ref, duplicate ref, bad ref, crypto unavailable never block page", async () => {
  for (const search of ["", "?ref=bad", "?ref=" + "a".repeat(32) + "&ref=" + "b".repeat(32)]) {
    const f = fixture({ search }); startPromotionTracking(f); await flush(); assert.equal(f.sent.length, 0);
  }
  const f = fixture(); f.windowObject.crypto = undefined;
  assert.doesNotThrow(() => startPromotionTracking(f)); await flush(); assert.equal(f.sent.length, 0);
});
test("nonretryable errors and synchronous fetch errors are contained", async () => {
  const f = fixture(); f.fetchImpl = async () => { f.sent.push(1); return { status: 400 }; };
  startPromotionTracking(f); await flush(); f.fireTimers(); assert.equal(f.sent.length, 1);
  const g = fixture(); g.fetchImpl = () => { throw new Error("sync failure"); };
  assert.doesNotThrow(() => startPromotionTracking(g)); await flush(); g.fireTimers(); await flush();
});
