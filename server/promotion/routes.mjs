import QRCode from "qrcode";
import { PromotionError, normalizePublicSiteUrl } from "./validation.mjs";
import { buildPromotionAdminPage } from "./adminPage.mjs";

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}
async function readJson(request, limit) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) throw new PromotionError("请使用 application/json 提交", 415);
  if (Number(request.headers["content-length"]) > limit) { request.resume(); throw new PromotionError("请求内容过大", 413); }
  return new Promise((resolve, reject) => {
    let size = 0, rejected = false; const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        if (!rejected) reject(new PromotionError("请求内容过大", 413));
        rejected = true; chunks.length = 0;
      } else if (!rejected) chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new PromotionError("JSON 格式不正确")); }
    });
    request.on("aborted", () => reject(new PromotionError("请求已中断")));
    request.on("error", reject);
  });
}
export function createPromotionHandler({ getStore, publicSiteUrl, isAuthorized, now = () => new Date() }) {
  let origin = null, configurationError = null;
  try { origin = normalizePublicSiteUrl(publicSiteUrl); } catch (error) { configurationError = error.message; }
  const decorate = salesperson => ({ ...salesperson, promotionUrl: origin ? origin + "/?ref=" + salesperson.referralCode : null });
  const buckets = new Map();
  let windowStart = 0, globalCount = 0;
  function allowEvent(request) {
    const instant = now().getTime(), window = Math.floor(instant / 60_000);
    if (window !== windowStart) { buckets.clear(); globalCount = 0; windowStart = window; }
    if (++globalCount > 3000) return false;
    const key = request.socket.remoteAddress ?? "unknown", count = buckets.get(key) ?? 0;
    if (!buckets.has(key) && buckets.size >= 10000) return false;
    buckets.set(key, count + 1);
    return count < 120;
  }
  return async (request, response, url) => {
    if (url.pathname === "/admin/promotions") {
      if (request.method !== "GET") { json(response, 405, { error: "请求方法不支持" }); return true; }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
      response.end(buildPromotionAdminPage()); return true;
    }
    const collection = "/api/admin/promotions/salespeople";
    const isEvent = url.pathname === "/api/promotion/events";
    const isAdmin = url.pathname.startsWith("/api/admin/promotions/");
    if (!isEvent && !isAdmin) return false;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (isAdmin && !isAuthorized(request)) throw new PromotionError("后台口令不正确", 401);
      if (isEvent) {
        if (request.method !== "POST") throw new PromotionError("请求方法不支持", 405);
        if (!allowEvent(request)) { response.setHeader("Retry-After", "60"); throw new PromotionError("访问上报过于频繁", 429); }
        const input = await readJson(request, 2048);
        (await getStore()).recordVisit(input);
        response.writeHead(204); response.end(); return true;
      }
      if (url.pathname === collection && request.method === "GET") {
        const rows = (await getStore()).listSalespeople({ dateFrom: url.searchParams.get("dateFrom"), dateTo: url.searchParams.get("dateTo") });
        json(response, 200, { salespeople: rows.map(decorate), configurationError }); return true;
      }
      if (url.pathname === collection && request.method === "POST") {
        const input = await readJson(request, 4096);
        json(response, 201, { salesperson: decorate((await getStore()).createSalesperson(input)) }); return true;
      }
      const match = url.pathname.match(/^\/api\/admin\/promotions\/salespeople\/([a-f0-9-]{36})(\/qr\.png)?$/);
      if (match && !match[2] && request.method === "PATCH") {
        const input = await readJson(request, 4096);
        json(response, 200, { salesperson: decorate((await getStore()).updateSalesperson(match[1], input)) }); return true;
      }
      if (match && match[2] && request.method === "GET") {
        if (!origin) throw new PromotionError(configurationError, 503);
        const salesperson = (await getStore()).getSalesperson(match[1]);
        if (!salesperson) throw new PromotionError("销售不存在", 404);
        const png = await QRCode.toBuffer(decorate(salesperson).promotionUrl, { width: 512, margin: 4, errorCorrectionLevel: "M" });
        response.writeHead(200, { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="sales-' + salesperson.id + '.png"' });
        response.end(png); return true;
      }
      throw new PromotionError(url.pathname === collection || match ? "请求方法不支持" : "接口不存在", url.pathname === collection || match ? 405 : 404);
    } catch (error) {
      json(response, error instanceof PromotionError ? error.status : 503,
        { error: error instanceof PromotionError ? error.message : "推广服务暂时不可用，请稍后重试" });
      return true;
    }
  };
}
