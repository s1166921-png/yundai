import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { buildPromotionAdminPage } from "../server/promotion/adminPage.mjs";
import { mountPromotionAdmin } from "../server/promotion/adminClient.mjs";
const tick = () => new Promise(resolve => setImmediate(resolve));
const row = { id: "sales-a", name: "<img src=x onerror=alert(1)>", internalNote: "内部备注", active: true,
  promotionUrl: "https://example.org/?ref=" + "a".repeat(32), totalViews: 3, periodViews: 2, lastVisitAt: "2026-09-22T02:00:00Z" };
function fixture(fetchImpl) {
  const { document } = parseHTML(buildPromotionAdminPage());
  document.querySelector("#username").value = "test";
  document.querySelector("#password").value = "test-pass";
  const urls = { createObjectURL: () => "blob:test", revokeObjectURL() {} };
  const api = mountPromotionAdmin(document, { fetch: fetchImpl, btoa, URL: urls, navigator: {}, setTimeout });
  return { document, api };
}
test("admin renders untrusted names as text, supports edit and failed create retains values", async () => {
  const f = fixture(async (_, options) => options.method === "POST"
    ? { ok: false, status: 400, json: async () => ({ error: "姓名格式错误" }) }
    : { ok: true, json: async () => ({ salespeople: [row], configurationError: null }) });
  assert.equal(f.document.querySelectorAll("#sales-body tr").length, 0);
  await f.api.load();
  assert.match(f.document.querySelector("#sales-body").textContent, /<img/);
  assert.equal(f.document.querySelector("#sales-body img"), null);
  f.document.querySelector('[data-action="edit"]').click();
  assert.equal(f.document.querySelector("#sales-name").value, row.name);
  f.api.resetEditor();
  f.document.querySelector("#sales-name").value = "保留姓名";
  await f.api.save();
  assert.equal(f.document.querySelector("#sales-name").value, "保留姓名");
  assert.match(f.document.querySelector("#editor-status").textContent, /姓名格式错误/);
});
test("late filtered result cannot overwrite newest result", async () => {
  const pending = [];
  const f = fixture(() => new Promise(resolve => pending.push(resolve)));
  const a = f.api.load(), b = f.api.load();
  pending[1]({ ok: true, json: async () => ({ salespeople: [{ ...row, name: "最新" }] }) }); await b;
  pending[0]({ ok: true, json: async () => ({ salespeople: [{ ...row, name: "过时" }] }) }); await a;
  assert.match(f.document.querySelector("#sales-body").textContent, /最新/);
  assert.doesNotMatch(f.document.querySelector("#sales-body").textContent, /过时/);
});
test("missing configuration, authentication errors and unavailable clipboard have explicit feedback", async () => {
  let expired = false;
  const f = fixture(async () => expired
    ? { ok: false, status: 401, json: async () => ({ error: "后台口令不正确" }) }
    : { ok: true, json: async () => ({ salespeople: [{ ...row, promotionUrl: null }], configurationError: "请配置域名" }) });
  await f.api.load();
  assert.match(f.document.querySelector("#configuration").textContent, /请配置域名/);
  assert.equal(f.document.querySelector('[data-action="qr"]').disabled, true);
  expired = true; await f.api.load();
  assert.equal(f.document.querySelectorAll("#sales-body tr").length, 0);
  assert.match(f.document.querySelector("#status").textContent, /后台口令不正确/);
});
test("copy fallback and PNG download failure do not falsely report success", async () => {
  const f = fixture(async url => url.endsWith("qr.png")
    ? { ok: false, status: 503, json: async () => ({ error: "二维码暂不可用" }) }
    : { ok: true, json: async () => ({ salespeople: [row] }) });
  await f.api.load();
  f.document.querySelector('[data-action="copy"]').click(); await tick();
  assert.match(f.document.querySelector("#status").textContent, /复制/);
  f.document.querySelector('[data-action="qr"]').click(); await tick();
  assert.match(f.document.querySelector("#status").textContent, /二维码暂不可用/);
});
test("QR selection races and credential changes cannot restore stale downloads", async () => {
  const pending = [], second = { ...row, id: "sales-b", name: "第二位销售" };
  const f = fixture(async url => url.endsWith("qr.png")
    ? new Promise(resolve => pending.push(resolve))
    : { ok: true, json: async () => ({ salespeople: [row, second] }) });
  await f.api.load();
  const qrButtons = f.document.querySelectorAll('[data-action="qr"]');
  qrButtons[0].click(); qrButtons[1].click();
  pending[1]({ ok: true, blob: async () => ({}) }); await tick();
  assert.equal(f.document.querySelector("#download-qr").download, "sales-sales-b.png");
  pending[0]({ ok: true, blob: async () => ({}) }); await tick();
  assert.equal(f.document.querySelector("#download-qr").download, "sales-sales-b.png");
  qrButtons[0].click();
  f.document.querySelector("#password").dispatchEvent(new f.document.defaultView.Event("input"));
  pending[2]({ ok: true, blob: async () => ({}) }); await tick();
  assert.equal(f.document.querySelector("#qr-panel").hidden, true);
});
