import { isIP } from "node:net";

export class PromotionError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateSalespersonInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PromotionError("销售信息格式不正确");
  const result = {};
  for (const [key, limit, required] of [["name", 80, true], ["internalNote", 500, false]]) {
    if (partial && !Object.hasOwn(input, key)) continue;
    const value = input[key] ?? (required ? null : "");
    if (typeof value !== "string" || value.trim().length > limit || (required && !value.trim())) {
      throw new PromotionError(key === "name" ? "销售姓名须为 1–80 个字符" : "备注不能超过 500 个字符");
    }
    result[key] = value.trim();
  }
  if (Object.hasOwn(input, "active")) {
    if (typeof input.active !== "boolean") throw new PromotionError("启用状态须为布尔值");
    result.active = input.active;
  }
  if (partial && !Object.keys(result).length) throw new PromotionError("没有可更新的销售信息");
  return result;
}
export function validateDateRange({ dateFrom, dateTo } = {}) {
  const result = {};
  for (const [key, value] of Object.entries({ dateFrom, dateTo })) {
    if (value == null || value === "") continue;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw new PromotionError("请输入有效的 YYYY-MM-DD 日期");
    }
    result[key] = value;
  }
  if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) throw new PromotionError("开始日期不能晚于结束日期");
  return result;
}
export function validateVisit(input, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      typeof input.ref !== "string" || !/^[a-f0-9]{32}$/.test(input.ref) ||
      typeof input.eventId !== "string" || !/^\d{13}-[a-f0-9]{32}$/.test(input.eventId) ||
      input.eventType !== "page_view") throw new PromotionError("访问事件格式不正确");
  if (Math.abs(Number(input.eventId.slice(0, 13)) - now.getTime()) > 86_400_000) {
    throw new PromotionError("访问事件时间超出有效范围");
  }
  return { ref: input.ref, eventId: input.eventId, eventType: "page_view" };
}
export function normalizePublicSiteUrl(value) {
  const invalid = () => new PromotionError("请配置 MEIOU_PUBLIC_SITE_URL 为正式 HTTPS 网站域名", 503);
  if (typeof value !== "string" || value !== value.trim()) throw invalid();
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      url.port || !url.hostname.includes(".") || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") ||
      isIP(url.hostname) || url.hostname.startsWith("[")) throw invalid();
  return url.origin;
}
