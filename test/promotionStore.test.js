import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openPromotionStore } from "../server/promotion/store.mjs";
import { validateDateRange, normalizePublicSiteUrl } from "../server/promotion/validation.mjs";

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "promotion-"));
  let instant = new Date("2026-09-22T02:00:00Z");
  const options = { databasePath: path.join(dir, "test.sqlite"), now: () => instant };
  let store = openPromotionStore(options);
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  return { get store() { return store; }, setTime(value) { instant = new Date(value); },
    reopen() { store.close(); store = openPromotionStore(options); },
    event(ref, suffix = "a".repeat(32)) { return { ref, eventType: "page_view", eventId: instant.getTime() + "-" + suffix }; } };
}
test("sales identity persists across edits, restarts; events deduplicate globally", async t => {
  const f = await fixture(t), a = f.store.createSalesperson({ name: "小李" }), b = f.store.createSalesperson({ name: "小李" });
  assert.notEqual(a.id, b.id); assert.notEqual(a.referralCode, b.referralCode);
  const event = f.event(a.referralCode);
  assert.equal(f.store.recordVisit(event).inserted, true);
  assert.equal(f.store.recordVisit(event).inserted, false);
  assert.equal(f.store.recordVisit({ ...event, ref: b.referralCode }).inserted, false);
  f.store.updateSalesperson(a.id, { name: "小李改名", active: false });
  assert.equal(f.store.recordVisit(f.event(a.referralCode, "b".repeat(32))).inserted, false);
  f.store.updateSalesperson(a.id, { active: true });
  f.reopen();
  const rows = f.store.listSalespeople();
  assert.equal(rows.find(x => x.id === a.id).totalViews, 1);
  assert.equal(rows.find(x => x.id === b.id).totalViews, 0);
  assert.equal(rows.find(x => x.id === a.id).referralCode, a.referralCode);
});
test("Shanghai dates and archive do not change historical totals or latest visit", async t => {
  const f = await fixture(t), a = f.store.createSalesperson({ name: "上海测试" });
  f.setTime("2026-09-21T15:59:59Z"); f.store.recordVisit(f.event(a.referralCode));
  f.setTime("2026-09-21T16:00:00Z"); const old = f.event(a.referralCode); f.store.recordVisit(old);
  const stats = () => f.store.listSalespeople({ dateFrom: "2026-09-22", dateTo: "2026-09-22" })[0];
  assert.equal(stats().periodViews, 1); assert.equal(stats().totalViews, 2);
  const last = stats().lastVisitAt;
  f.setTime("2027-01-01T00:00:00Z"); f.store.archiveExpiredEvents(); f.store.archiveExpiredEvents();
  assert.equal(stats().periodViews, 1); assert.equal(stats().totalViews, 2);
  assert.equal(stats().lastVisitAt, last);
  assert.throws(() => f.store.recordVisit(old), /时间/);
  f.reopen(); assert.equal(stats().totalViews, 2);
});
test("validation rejects malformed input, expired events, invalid dates and public origins", async t => {
  const f = await fixture(t);
  for (const name of [" ", "x".repeat(81), 4]) assert.throws(() => f.store.createSalesperson({ name }));
  const a = f.store.createSalesperson({ name: "测试", internalNote: "<img onerror=alert(1)>" });
  assert.throws(() => f.store.updateSalesperson(a.id, { active: "false" }));
  assert.throws(() => f.store.updateSalesperson("missing", { name: "x" }));
  assert.throws(() => f.store.recordVisit({ ...f.event(a.referralCode), eventType: "customer" }));
  assert.equal(f.store.recordVisit(f.event("0".repeat(32))).inserted, false);
  for (const dateFrom of ["2026-02-30", "2026-13-01", "yesterday"]) assert.throws(() => validateDateRange({ dateFrom }));
  assert.throws(() => validateDateRange({ dateFrom: "2026-09-23", dateTo: "2026-09-22" }));
  for (const value of ["http://example.org", "https://localhost", "https://example.org/path", "https://a:b@example.org", "https://example.org/?x=1"]) assert.throws(() => normalizePublicSiteUrl(value));
  assert.equal(normalizePublicSiteUrl("https://yundai.meiouyuncang.com/"), "https://yundai.meiouyuncang.com");
});
