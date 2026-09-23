import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { createMeiouServer } from "../server/index.mjs";

const admin = { username: "test-admin", password: "test-only-password" };
const Authorization = "Basic " + Buffer.from(admin.username + ":" + admin.password).toString("base64");
async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "promotion-api-"));
  const server = createMeiouServer({ leadsFilePath: path.join(dir, "leads.json"),
    adminCredentials: admin, publicSiteUrl: "https://example.org", ...options });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const request = (route, method = "GET", body, headers = {}) => fetch(base + route, {
    method, signal: AbortSignal.timeout(5000), headers: { Authorization, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const create = async name => {
    const response = await request("/api/admin/promotions/salespeople", "POST", { name });
    assert.equal(response.status, 201); return (await response.json()).salesperson;
  };
  return { base, request, create, dir };
}
const eventFor = ref => ({ ref, eventType: "page_view", eventId: Date.now() + "-" + randomBytes(16).toString("hex") });
test("promotion endpoints require admin and isolate sales with concurrent idempotent events", async t => {
  const f = await setup(t);
  assert.equal((await f.request("/api/admin/promotions/salespeople", "GET", undefined, { Authorization: "" })).status, 401);
  const a = await f.create("销售 A"), b = await f.create("销售 B");
  const event = eventFor(a.referralCode);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.request("/api/promotion/events", "POST", event, { Authorization: "", Origin: f.base })));
  assert.ok(results.every(r => r.status === 204));
  const rows = (await (await f.request("/api/admin/promotions/salespeople")).json()).salespeople;
  assert.equal(rows.find(r => r.id === a.id).totalViews, 1);
  assert.equal(rows.find(r => r.id === b.id).totalViews, 0);
  await f.request("/api/admin/promotions/salespeople/" + a.id, "PATCH", { active: false });
  assert.equal((await f.request("/api/promotion/events", "POST", eventFor(a.referralCode))).status, 204);
  const result = await f.request("/api/promotion/events", "POST", eventFor("0".repeat(32)));
  assert.equal(await result.text(), "");
  assert.equal((await f.request("/api/admin/promotions/salespeople?dateFrom=2026-02-30")).status, 400);
});
test("QR PNG decodes to server-configured referral URL and is authenticated", async t => {
  const f = await setup(t), a = await f.create("二维码测试"), route = "/api/admin/promotions/salespeople/" + a.id + "/qr.png";
  assert.equal((await fetch(f.base + route)).status, 401);
  const response = await f.request(route);
  assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /image\/png/);
  const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, "https://example.org/?ref=" + a.referralCode);
  assert.match(response.headers.get("cache-control"), /no-store/);
});
test("promotion rejects malicious origin and oversized/malformed writes", async t => {
  const f = await setup(t);
  assert.equal((await f.request("/api/admin/promotions/salespeople", "POST", { name: "x" }, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await f.request("/api/promotion/events", "POST", { ref: "x".repeat(3000) })).status, 413);
  assert.equal((await f.request("/api/promotion/events", "POST", {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await f.request("/api/promotion/events", "POST", {})).status, 400);
  assert.equal((await f.request("/api/admin/promotions/salespeople", "DELETE")).status, 405);
  const a = await f.create("测试");
  const invalid = await fetch(f.base + "/api/promotion/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(invalid.status, 400);
  assert.equal((await f.request("/api/admin/promotions/salespeople/" + a.id, "PATCH", { active: "false" })).status, 400);
});
test("missing public URL leaves admin usable but never generates localhost QR", async t => {
  const f = await setup(t, { publicSiteUrl: "" }), a = await f.create("测试");
  const data = await (await f.request("/api/admin/promotions/salespeople")).json();
  assert.ok(data.configurationError); assert.equal(data.salespeople[0].promotionUrl, null);
  assert.equal((await f.request("/api/admin/promotions/salespeople/" + a.id + "/qr.png")).status, 503);
});
test("promotion storage failure does not prevent existing products endpoint", async t => {
  const badDir = await mkdtemp(path.join(tmpdir(), "promotion-failure-"));
  t.after(() => rm(badDir, { recursive: true, force: true }));
  const file = path.join(badDir, "not-directory"); await writeFile(file, "x");
  const f = await setup(t, { promotionDatabasePath: path.join(file, "store.sqlite") });
  assert.equal((await f.request("/api/admin/promotions/salespeople")).status, 503);
  assert.equal((await f.request("/api/products")).status, 200);
});
