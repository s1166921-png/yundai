import { createServer } from "node:http";
import { chmod, readFile, writeFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCreditEstimate } from "../src/lib/creditEstimator.js";
import { calculateSimpleEstimate } from "../src/lib/simpleEstimator.js";
import { createAiInsight } from "../src/lib/aiInsight.js";
import { normalizeCustomerProfile, validateCustomerProfile } from "../src/lib/matching/customerProfile.js";
import { matchProducts } from "../src/lib/matching/productMatcher.js";
import { buildCustomerMatchReport } from "../src/lib/matching/reportBuilder.js";
import { getProductById } from "../src/lib/matching/productCatalog.js";
import { getPublicProducts } from "../src/lib/matching/publicProductProjection.js";
import { INTAKE_FIELD_KEYS, INTAKE_VERSION, getVisibleIntakeFields } from "../src/lib/matching/intakeSchema.js";
import { publicAiReport } from "../src/lib/ai/aiReportContract.js";
import { createAiReportService, createAiReportServiceFromEnvironment } from "./ai/aiReportService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const leadsFile = path.join(dataDir, "leads.json");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);

const contactFields = ["companyName", "contactName", "phone"];
const leadUpdateQueues = new Map();
const storeFileMode = 0o600;
const maximumBodyBytes = 1_000_000;

const legacyBaseFields = [
  "companyName",
  "contactName",
  "phone",
  "platform",
  "productInterest",
];

const simpleEstimateFields = [
  "annualRevenue",
  "annualProfit",
  "revenueGrowth",
  "employeeCount",
  "bankCount",
  "desiredAmount",
];

const complexEstimateFields = [
  "annualRevenue",
  "annualProfit",
  "businessStability",
  "bankCredit",
  "businessQualification",
  "controllerAssets",
  "debtOverRevenue70",
];

const persistedRawInputFields = Object.freeze([...new Set([
  ...INTAKE_FIELD_KEYS,
  "estimationMode",
  "mode",
  ...legacyBaseFields,
  ...simpleEstimateFields,
  ...complexEstimateFields,
  "note",
])]);

const leadColumns = [
  ["createdAt", "提交时间"],
  ["intakeVersion", "数据版本"],
  ["estimationMode", "测算版本"],
  ["companyName", "企业名称"],
  ["contactName", "联系人"],
  ["phone", "联系电话"],
  ["platform", "主营平台"],
  ["productInterest", "意向产品"],
  ["matching.primaryScenario", "主融资场景"],
  ["matching.primaryProduct", "第一产品方向"],
  ["matching.alternatives", "备选产品"],
  ["matching.status", "匹配状态"],
  ["matching.fitScore", "产品适配度"],
  ["matching.confidence", "匹配可信度"],
  ["matching.ruleVersion", "规则版本"],
  ["matching.amountRange", "参考额度或范围"],
  ["matching.currency", "币种"],
  ["matching.missingFields", "缺失字段"],
  ["matching.failedRules", "未通过条件"],
  ["matching.advisorNextStep", "融资顾问跟进建议"],
  ["matching.advisorFollowUp", "待顾问核验项"],
  ["annualRevenue", "年营业收入"],
  ["annualProfit", "年净利润"],
  ["revenueGrowth", "预计营收增速"],
  ["employeeCount", "当前员工人数"],
  ["bankCount", "贷款合作银行家数"],
  ["desiredAmount", "本次融资意向金额"],
  ["businessStability", "业务稳定性"],
  ["bankCredit", "现有银行授信情况"],
  ["businessQualification", "企业资质软实力"],
  ["controllerAssets", "实控人家庭资产"],
  ["debtOverRevenue70", "贷款余额超营收70%"],
  ["estimate.score", "测算总分"],
  ["estimate.band", "测算额度区间"],
  ["estimate.referenceAmountLabel", "测算参考额度"],
  ["estimate.audience", "客群定位"],
  ["aiInsight.profile", "AI 经营画像"],
  ["aiInsight.priority", "AI 跟进优先级"],
  ["aiInsight.financingDirection", "AI 资金安排建议"],
  ["aiInsight.nextStep", "AI 建议下一步"],
  ["note", "补充说明"],
];

class PublicInputError extends Error {
  constructor(errors) {
    super("提交信息有误");
    this.errors = errors;
  }
}

class PayloadTooLargeError extends Error {}
class UnsupportedMediaTypeError extends Error {}

async function ensureStore(leadsFilePath = leadsFile) {
  await mkdir(path.dirname(leadsFilePath), { recursive: true });
  try {
    const target = await stat(leadsFilePath);
    if (target.isFile()) await chmod(leadsFilePath, storeFileMode);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await writeFile(leadsFilePath, "[]", {
        encoding: "utf8",
        flag: "wx",
        mode: storeFileMode,
      });
      await chmod(leadsFilePath, storeFileMode);
    } catch (writeError) {
      if (writeError.code !== "EEXIST") throw writeError;
      const target = await stat(leadsFilePath);
      if (target.isFile()) await chmod(leadsFilePath, storeFileMode);
    }
  }
}

async function readLeads(leadsFilePath = leadsFile) {
  await ensureStore(leadsFilePath);
  const raw = await readFile(leadsFilePath, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeLeads(leads, leadsFilePath = leadsFile) {
  await ensureStore(leadsFilePath);
  const temporaryFilePath = path.join(
    path.dirname(leadsFilePath),
    `.${path.basename(leadsFilePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryFilePath, JSON.stringify(leads, null, 2), {
      encoding: "utf8",
      flag: "wx",
      mode: storeFileMode,
    });
    await chmod(temporaryFilePath, storeFileMode);
    await rename(temporaryFilePath, leadsFilePath);
  } catch (error) {
    try {
      await unlink(temporaryFilePath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        error.cause = cleanupError;
      }
    }
    throw error;
  }
}

function updateLeads(leadsFilePath, updater) {
  const queueKey = path.resolve(leadsFilePath);
  const previousOperation = leadUpdateQueues.get(queueKey) ?? Promise.resolve();
  const operation = previousOperation.then(async () => {
    const leads = await readLeads(queueKey);
    const updatedLeads = await updater(leads);
    await writeLeads(updatedLeads, queueKey);
    return updatedLeads;
  });
  let queueTail;
  const clearQueue = () => {
    if (leadUpdateQueues.get(queueKey) === queueTail) leadUpdateQueues.delete(queueKey);
  };
  queueTail = operation.then(clearQueue, clearQueue);
  leadUpdateQueues.set(queueKey, queueTail);
  return operation;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maximumBodyBytes) {
      request.resume();
      reject(new PayloadTooLargeError("request body is too large"));
      return;
    }

    const chunks = [];
    let receivedBytes = 0;
    let settled = false;
    const rejectOversized = () => {
      if (settled) return;
      settled = true;
      request.off("data", onData);
      request.resume();
      reject(new PayloadTooLargeError("request body is too large"));
    };
    const onData = (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maximumBodyBytes) {
        rejectOversized();
        return;
      }
      chunks.push(chunk);
    };
    request.on("data", onData);
    request.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function parseJsonBody(body) {
  let input;
  try {
    input = JSON.parse(body || "{}");
  } catch {
    throw new PublicInputError([{ field: "body", message: "must be valid JSON" }]);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PublicInputError([{ field: "body", message: "must be a JSON object" }]);
  }
  return input;
}

function normalizeAllowedOrigins(origins) {
  const values = origins == null
    ? String(process.env.MEIOU_ALLOWED_ORIGINS ?? "").split(",")
    : typeof origins === "string" ? origins.split(",") : [...origins];
  return new Set(values.map((value) => String(value).trim()).filter(Boolean).map((value) => {
    try {
      return new URL(value).origin;
    } catch {
      return "";
    }
  }).filter(Boolean));
}

function applyCorsHeaders(request, response, url, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return true;

  let normalizedOrigin;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }
  if (normalizedOrigin !== url.origin && !allowedOrigins.has(normalizedOrigin)) return false;

  response.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");
  return true;
}

function hasJsonContentType(request) {
  const contentType = request.headers["content-type"];
  return typeof contentType === "string" && /^application\/json(?:\s*;|$)/i.test(contentType);
}

function normalizeAdminCredentials(credentials) {
  if (!credentials || typeof credentials !== "object") return null;
  const username = typeof credentials.username === "string" ? credentials.username.trim() : "";
  const password = typeof credentials.password === "string" ? credentials.password : "";
  return username && password ? { username, password } : null;
}

function requiredStartupAdminCredentials(environment = process.env) {
  const credentials = normalizeAdminCredentials({
    username: environment.MEIOU_ADMIN_USER,
    password: environment.MEIOU_ADMIN_PASSWORD,
  });
  if (credentials == null) {
    throw new Error("MEIOU_ADMIN_USER and MEIOU_ADMIN_PASSWORD are required to start the Meiou server");
  }
  return credentials;
}

function isAuthorized(request, adminCredentials) {
  if (adminCredentials == null) return false;
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Basic ")) return false;

  try {
    const [username, password] = Buffer.from(authorization.slice(6), "base64").toString("utf8").split(":");
    const expected = `${adminCredentials.username}:${adminCredentials.password}`;
    const received = `${username || ""}:${password || ""}`;
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function addProductIdsToReport(report, matches) {
  const rankedMatches = new Map(matches.filter((match) => match.rank != null).map((match) => [match.rank, match]));
  return {
    ...report,
    primary: report.primary == null
      ? null
      : { productId: rankedMatches.get(1)?.productId ?? null, ...report.primary },
    alternatives: report.alternatives.map((product, index) => ({
      productId: rankedMatches.get(index + 2)?.productId ?? null,
      ...product,
    })),
  };
}

function allowlistedRawInput(input) {
  return Object.fromEntries(persistedRawInputFields
    .filter((key) => Object.hasOwn(input, key))
    .map((key) => [key, structuredClone(input[key])]));
}

function progressiveRawInput(input) {
  const visibleFields = new Set(getVisibleIntakeFields(input).map(({ key }) => key));
  return Object.fromEntries([
    ["intakeVersion", INTAKE_VERSION],
    ["estimationMode", "progressive"],
    ...[...visibleFields]
      .filter((key) => Object.hasOwn(input, key))
      .map((key) => [key, structuredClone(input[key])]),
  ]);
}

function collectAdvisorVerificationFields(productMatches) {
  return [...new Set(productMatches
    .filter((match) => match.rank != null && match.status !== "ineligible")
    .flatMap((match) => match.advisorVerificationFields ?? []))];
}

function normalizeLead(input, now = () => new Date()) {
  const hasSuppliedIntakeVersion = Object.hasOwn(input, "intakeVersion");
  const hasProgressiveVersion = input.intakeVersion === INTAKE_VERSION;
  const rawEstimationMode = input.estimationMode;
  const requestedMode = hasProgressiveVersion ? rawEstimationMode : input.estimationMode ?? input.mode;
  const estimationMode = requestedMode == null
    ? "complex"
    : typeof requestedMode === "string"
      ? requestedMode.trim().toLowerCase()
      : requestedMode;
  const isProgressive = hasProgressiveVersion && rawEstimationMode === "progressive";
  const rawInput = hasProgressiveVersion ? progressiveRawInput(input) : allowlistedRawInput(input);
  const profile = normalizeCustomerProfile(hasProgressiveVersion ? rawInput : input);
  const validation = validateCustomerProfile(profile, estimationMode);
  const consentHasTypeError = validation.errors.some((error) => error.field === "consentToDataUse");
  const errors = [
    ...contactFields
      .filter((field) => !profile[field])
      .map((field) => ({ field, message: "is required" })),
    ...validation.errors.map((error) => (
      error.field === "mode" ? { ...error, field: "estimationMode" } : error
    )),
    ...(hasSuppliedIntakeVersion && !hasProgressiveVersion
      ? [{ field: "intakeVersion", message: `must be exactly ${INTAKE_VERSION}` }]
      : []),
    ...(!hasSuppliedIntakeVersion && estimationMode === "progressive"
      ? [{ field: "intakeVersion", message: `must be ${INTAKE_VERSION} when estimationMode is progressive` }]
      : []),
    ...(hasProgressiveVersion && rawEstimationMode !== "progressive"
      ? [{ field: "estimationMode", message: "must be progressive when intakeVersion is progressive-v1" }]
      : []),
    ...(profile.consentToDataUse === true || consentHasTypeError
      ? []
      : [{ field: "consentToDataUse", message: "must be accepted" }]),
  ];

  if (errors.length > 0) {
    throw new PublicInputError(errors);
  }

  const lead = {};
  const allFields = [...new Set([...legacyBaseFields, ...simpleEstimateFields, ...complexEstimateFields, "note"])];

  for (const key of allFields) {
    lead[key] = String(input[key] ?? "").trim();
  }

  const productMatches = matchProducts(profile, { intakeVersion: profile.intakeVersion });
  const matchReport = addProductIdsToReport(buildCustomerMatchReport(profile, productMatches), productMatches);
  const base = {
    profile,
    rawInput,
    productMatches,
    matchReport,
    intakeVersion: profile.intakeVersion,
    ruleVersion: productMatches.find((match) => typeof match.ruleVersion === "string")?.ruleVersion ?? null,
    consentToDataUse: profile.consentToDataUse,
    aiAnalysis: { status: "pending" },
    advisorReview: {
      status: "pending",
      note: "",
      updatedAt: null,
    },
  };
  const identity = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now().toISOString(),
    estimationMode,
    companyName: profile.companyName,
    contactName: profile.contactName,
    phone: profile.phone,
  };

  if (isProgressive) {
    return {
      ...identity,
      ...base,
      advisorVerificationFields: collectAdvisorVerificationFields(productMatches),
    };
  }

  const estimate = estimationMode === "complex" ? calculateCreditEstimate(lead) : calculateSimpleEstimate(lead);
  const aiInsight = createAiInsight(lead, estimate, estimationMode);

  return {
    ...identity,
    ...lead,
    estimate,
    aiInsight,
    ...base,
  };
}

function publicEstimatedAmount(estimatedAmount) {
  if (!estimatedAmount || typeof estimatedAmount !== "object") return null;
  const { kind, currency, min, max, note } = estimatedAmount;
  return { kind, currency, min, max, note };
}

function publicReportProduct(product) {
  if (!product || typeof product !== "object") return null;
  return {
    productId: product.productId,
    institution: product.institution,
    name: product.name,
    currency: product.currency,
    pricing: product.pricing,
    term: product.term,
    limit: product.limit,
    presentationLabel: product.presentationLabel,
    estimatedAmount: publicEstimatedAmount(product.estimatedAmount),
    whyMatched: Array.isArray(product.whyMatched) ? [...product.whyMatched] : [],
  };
}

function publicNonMatch(nonMatch) {
  if (!nonMatch || typeof nonMatch !== "object") return null;
  return {
    institution: nonMatch.institution,
    name: nonMatch.name,
    reason: nonMatch.reason,
  };
}

function publicMatchReport(report) {
  return {
    primary: publicReportProduct(report?.primary),
    alternatives: Array.isArray(report?.alternatives)
      ? report.alternatives.map(publicReportProduct).filter(Boolean)
      : [],
    nonMatches: Array.isArray(report?.nonMatches)
      ? report.nonMatches.map(publicNonMatch).filter(Boolean)
      : [],
    missingDocuments: Array.isArray(report?.missingDocuments) ? [...report.missingDocuments] : [],
    summary: report?.summary ?? "",
    disclaimer: report?.disclaimer ?? "",
  };
}

function publicLead(lead) {
  return {
    id: lead.id,
    createdAt: lead.createdAt,
    estimationMode: lead.estimationMode,
    matchReport: publicMatchReport(lead.matchReport),
    aiReport: publicAiReport(lead.aiAnalysis, lead.advisorReview),
  };
}

function getLeadValue(lead, key) {
  return key.split(".").reduce((value, part) => value?.[part], lead) ?? "";
}

function getPrimaryMatch(lead) {
  return lead.productMatches?.find((match) => match.rank === 1) ?? null;
}

function getOverallMatchStatus(lead) {
  const primaryMatch = getPrimaryMatch(lead);
  if (primaryMatch) return primaryMatch.status;

  const matches = Array.isArray(lead.productMatches) ? lead.productMatches : [];
  return matches.length > 0 && matches.every((match) => match.status === "ineligible")
    ? "ineligible"
    : null;
}

function getProductName(productId) {
  return getProductById(productId)?.name ?? productId ?? "";
}

function formatMatchStatus(status) {
  return {
    eligible: "符合准入",
    needs_information: "待补充资料",
    ineligible: "暂不匹配",
  }[status] ?? status ?? "";
}

function formatAmountRange(estimatedAmount) {
  if (!estimatedAmount || typeof estimatedAmount !== "object") return "";
  const { min, max, note } = estimatedAmount;
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return min === max ? String(min) : `${min} - ${max}`;
  }
  return note ?? "";
}

function formatMatchingValue(lead, key) {
  const primaryMatch = getPrimaryMatch(lead);
  switch (key) {
    case "matching.primaryProduct":
      return lead.matchReport?.primary?.name ?? getProductName(primaryMatch?.productId);
    case "matching.primaryScenario":
      return lead.profile?.primaryBusinessModel ?? "";
    case "matching.alternatives":
      return lead.matchReport?.alternatives?.map((product) => product.name).filter(Boolean).join("；") ?? "";
    case "matching.status":
      return formatMatchStatus(getOverallMatchStatus(lead)) || "无推荐";
    case "matching.fitScore":
      if (lead.intakeVersion === INTAKE_VERSION) return "";
      return Number.isFinite(primaryMatch?.fitScore) ? `${primaryMatch.fitScore} 分` : "";
    case "matching.confidence":
      if (lead.intakeVersion === INTAKE_VERSION) return "";
      return Number.isFinite(primaryMatch?.confidence) ? `${primaryMatch.confidence}%` : "";
    case "matching.ruleVersion":
      return lead.ruleVersion ?? primaryMatch?.ruleVersion ?? "";
    case "matching.amountRange":
      return formatAmountRange(lead.matchReport?.primary?.estimatedAmount);
    case "matching.currency":
      return lead.matchReport?.primary?.estimatedAmount?.currency ?? lead.matchReport?.primary?.currency ?? "";
    case "matching.missingFields":
      return primaryMatch?.missingFields?.join("；") ?? "";
    case "matching.failedRules":
      return (lead.productMatches ?? []).flatMap((match) => (
        (match.failedRules ?? []).map((rule) => (
          `${getProductName(match.productId)}：${rule.internalReason ?? rule.message ?? rule.id ?? "未通过"}`
        ))
      )).join("；");
    case "matching.advisorNextStep":
      return lead.aiInsight?.nextStep ?? "";
    case "matching.advisorFollowUp":
      return lead.advisorVerificationFields?.join("；") ?? "";
    default:
      return "";
  }
}

function formatLeadValue(lead, key) {
  if (key.startsWith("matching.")) return formatMatchingValue(lead, key);
  const value = getLeadValue(lead, key);
  if (key === "createdAt") return value ? new Date(value).toLocaleString("zh-CN") : "";
  if (key === "debtOverRevenue70") return value === "yes" ? "是（扣 10 分）" : value === "no" ? "否" : "";
  if (key === "estimationMode") return value === "simple" ? "简易版" : value === "complex" ? "复杂版" : value === "progressive" ? "渐进式匹配" : "";
  if (lead.intakeVersion === INTAKE_VERSION && (key.startsWith("estimate.") || key.startsWith("aiInsight."))) return "";
  if (key === "estimate.score") return value === "" ? "-" : `${value} 分`;
  return value || (key.startsWith("estimate.") ? "-" : "");
}

function buildExcel(leads) {
  const headers = leadColumns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = leads
    .map((lead) => {
      const cells = leadColumns
        .map(([key]) => {
          const value = formatLeadValue(lead, key);
          return `<td style="mso-number-format:'\\@';">${escapeHtml(value)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, "Microsoft YaHei", sans-serif; }
    th, td { border: 1px solid #999; padding: 8px 12px; white-space: nowrap; }
    th { background: #eaf6ff; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function getSelectedLeads(url, leads) {
  const ids = url.searchParams.getAll("ids").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);

  if (ids.length === 0) {
    return [];
  }

  const selected = new Set(ids);
  return leads.filter((lead) => selected.has(lead.id));
}

function filterLeads(url, leads) {
  const search = (url.searchParams.get("search") ?? url.searchParams.get("customer") ?? "").trim().toLowerCase();
  const productId = (url.searchParams.get("product") ?? "").trim();
  const institution = (url.searchParams.get("institution") ?? "").trim();
  const currency = (url.searchParams.get("currency") ?? "").trim().toUpperCase();
  const status = (url.searchParams.get("status") ?? "").trim();
  const amountMin = Number(url.searchParams.get("amountMin"));
  const amountMax = Number(url.searchParams.get("amountMax"));
  const hasAmountMin = url.searchParams.has("amountMin") && Number.isFinite(amountMin);
  const hasAmountMax = url.searchParams.has("amountMax") && Number.isFinite(amountMax);
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const fromTime = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : Number.NaN;
  const toTime = dateTo ? Date.parse(`${dateTo}T23:59:59.999`) : Number.NaN;

  return leads.filter((lead) => {
    const primary = getPrimaryMatch(lead);
    const product = getProductById(primary?.productId);
    const submittedAmount = lead.profile?.requestedAmount?.amount;
    const createdTime = Date.parse(lead.createdAt);
    const searchable = [lead.companyName, lead.contactName, lead.phone]
      .map((value) => String(value ?? "").toLowerCase());

    if (search && !searchable.some((value) => value.includes(search))) return false;
    if (productId && primary?.productId !== productId) return false;
    if (institution && product?.institution !== institution) return false;
    if (currency && product?.currency !== currency) return false;
    if (status && getOverallMatchStatus(lead) !== status) return false;
    if (hasAmountMin && (!Number.isFinite(submittedAmount) || submittedAmount < amountMin)) return false;
    if (hasAmountMax && (!Number.isFinite(submittedAmount) || submittedAmount > amountMax)) return false;
    if (Number.isFinite(fromTime) && (!Number.isFinite(createdTime) || createdTime < fromTime)) return false;
    if (Number.isFinite(toTime) && (!Number.isFinite(createdTime) || createdTime > toTime)) return false;
    return true;
  });
}

function buildAdminPage() {
  const publicProducts = getPublicProducts();
  const productOptions = publicProducts
    .map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`)
    .join("");
  const institutionOptions = [...new Set(publicProducts.map((product) => product.institution))]
    .map((institution) => `<option value="${escapeHtml(institution)}">${escapeHtml(institution)}</option>`)
    .join("");
  const headerCells = leadColumns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rowCells = leadColumns
    .map(([key]) => {
      return `<td>\${escapeHtml(formatLeadValue(lead, "${key}"))}</td>`;
    })
    .join("");
  const emptyColspan = leadColumns.length + 1;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>美鸥云贷客户信息后台</title>
  <style>
    :root { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; color: #17243d; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: #f5f7fb; }
    main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 40px; }
    .panel { border: 1px solid #d9e1ee; border-radius: 8px; background: #fff; box-shadow: 0 12px 34px rgba(22,34,58,.08); }
    .topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid #e7edf5; }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .tools { display: flex; flex-wrap: wrap; gap: 10px; }
    input, select, button, a { font: inherit; }
    input, select { width: 220px; height: 40px; padding: 0 12px; border: 1px solid #cbd6e5; border-radius: 6px; color: #17243d; background: #fff; outline: none; }
    input:focus, select:focus { border-color: #5b8def; box-shadow: 0 0 0 3px rgba(91,141,239,.14); }
    button, a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border: 1px solid #cbd6e5; border-radius: 8px; background: #fff; color: #17243d; font-weight: 700; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { background: #f5f8fc; }
    a.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
    a.primary:hover { background: #1d4ed8; }
    a.disabled { opacity: .45; pointer-events: none; }
    .filters { display: grid; grid-template-columns: repeat(5, minmax(150px, 1fr)); gap: 12px; padding: 16px 20px; border-bottom: 1px solid #e7edf5; }
    .filters label { display: grid; gap: 6px; min-width: 0; color: #53637a; font-size: 12px; font-weight: 700; }
    .filters input, .filters select { width: 100%; }
    .filter-actions { display: flex; align-items: end; gap: 8px; }
    .summary { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 14px 20px; border-bottom: 1px solid #e7edf5; color: #53637a; font-size: 14px; }
    .summary strong { color: #17243d; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; min-width: 2380px; border-collapse: collapse; background: #fff; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #edf1f7; color: #34445b; text-align: left; white-space: nowrap; font-size: 14px; }
    th { position: sticky; top: 0; z-index: 1; color: #17243d; font-size: 13px; font-weight: 800; background: #f8fafc; }
    tbody tr:hover td { background: #f8fbff; }
    td:last-child { max-width: 360px; white-space: normal; line-height: 1.55; }
    .select-col { width: 48px; text-align: center; }
    input[type="checkbox"] { width: 16px; height: 16px; accent-color: #2563eb; cursor: pointer; }
    @media (max-width: 980px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 720px) { main { width: min(100% - 20px, 1440px); padding-top: 12px; } .topbar { align-items: stretch; flex-direction: column; } .tools, .tools input, .tools button, .tools a, .filters { width: 100%; } .filters { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <div class="topbar">
        <h1>客户信息后台</h1>
        <div class="tools">
          <input id="username" autocomplete="username" placeholder="管理员账户" />
          <input id="password" type="password" autocomplete="current-password" placeholder="管理员密码" />
          <button id="load" type="button">读取客户信息</button>
          <button id="export" class="primary" type="button" disabled>导出选中 Excel</button>
        </div>
      </div>
      <div class="filters" aria-label="客户筛选">
        <label>客户搜索<input id="searchFilter" type="search" placeholder="企业、联系人或电话" /></label>
        <label>第一推荐产品<select id="productFilter"><option value="">全部产品</option>${productOptions}</select></label>
        <label>机构<select id="institutionFilter"><option value="">全部机构</option>${institutionOptions}</select></label>
        <label>币种<select id="currencyFilter"><option value="">全部币种</option><option value="RMB">RMB</option><option value="USD">USD</option></select></label>
        <label>匹配状态<select id="statusFilter"><option value="">全部状态</option><option value="eligible">符合准入</option><option value="needs_information">待补充资料</option><option value="ineligible">暂不匹配</option></select></label>
        <label>融资金额下限<input id="amountMinFilter" type="number" min="0" step="1" inputmode="decimal" /></label>
        <label>融资金额上限<input id="amountMaxFilter" type="number" min="0" step="1" inputmode="decimal" /></label>
        <label>提交日期起<input id="dateFromFilter" type="date" /></label>
        <label>提交日期止<input id="dateToFilter" type="date" /></label>
        <div class="filter-actions"><button id="applyFilters" type="button">应用筛选</button><button id="clearFilters" type="button">清空</button></div>
      </div>
      <div class="summary">
        <span id="status">请输入管理员账户和密码。</span>
        <span>客户数量：<strong id="count">0</strong></span>
        <span>已选择：<strong id="selectedCount">0</strong></span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th class="select-col"><input id="selectAll" type="checkbox" aria-label="全选客户" /></th>${headerCells}</tr>
          </thead>
          <tbody id="rows"><tr><td colspan="${emptyColspan}">暂无已读取数据</td></tr></tbody>
        </table>
      </div>
    </section>
  </main>
  <script>
    const usernameInput = document.querySelector("#username");
    const passwordInput = document.querySelector("#password");
    const loadButton = document.querySelector("#load");
    const exportLink = document.querySelector("#export");
    const statusNode = document.querySelector("#status");
    const countNode = document.querySelector("#count");
    const selectedCountNode = document.querySelector("#selectedCount");
    const selectAllNode = document.querySelector("#selectAll");
    const rowsNode = document.querySelector("#rows");
    const filterInputs = {
      search: document.querySelector("#searchFilter"),
      product: document.querySelector("#productFilter"),
      institution: document.querySelector("#institutionFilter"),
      currency: document.querySelector("#currencyFilter"),
      status: document.querySelector("#statusFilter"),
      amountMin: document.querySelector("#amountMinFilter"),
      amountMax: document.querySelector("#amountMaxFilter"),
      dateFrom: document.querySelector("#dateFromFilter"),
      dateTo: document.querySelector("#dateToFilter"),
    };
    const applyFiltersButton = document.querySelector("#applyFilters");
    const clearFiltersButton = document.querySelector("#clearFilters");
    let loadedLeads = [];
    const selectedIds = new Set();
    const getAuthHeaders = () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      return username && password ? { Authorization: "Basic " + btoa(username + ":" + password) } : null;
    };
    const getFilterQuery = () => {
      const params = new URLSearchParams();
      Object.entries(filterInputs).forEach(([key, input]) => {
        const value = input.value.trim();
        if (value) params.set(key, value);
      });
      const query = params.toString();
      return query ? "?" + query : "";
    };
    const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const primaryMatchFor = (lead) => (lead.productMatches || []).find((match) => match.rank === 1) || null;
    const overallMatchStatusFor = (lead) => {
      const primary = primaryMatchFor(lead);
      if (primary) return primary.status;
      const matches = lead.productMatches || [];
      return matches.length && matches.every((match) => match.status === "ineligible") ? "ineligible" : "";
    };
    const productNameFor = (lead, productId) => {
      const products = [lead.matchReport && lead.matchReport.primary].concat((lead.matchReport && lead.matchReport.alternatives) || []).filter(Boolean);
      const product = products.find((item) => item.productId === productId);
      return (product && product.name) || productId || "";
    };
    const formatMatchStatus = (status) => ({ eligible: "符合准入", needs_information: "待补充资料", ineligible: "暂不匹配" }[status] || status || "");
    const formatAmountRange = (amount) => {
      if (!amount || typeof amount !== "object") return "";
      if (Number.isFinite(amount.min) && Number.isFinite(amount.max)) {
        return amount.min === amount.max ? String(amount.min) : amount.min + " - " + amount.max;
      }
      return amount.note || "";
    };
    const formatMatchingValue = (lead, key) => {
      const primaryMatch = primaryMatchFor(lead);
      if (key === "matching.primaryProduct") return (lead.matchReport && lead.matchReport.primary && lead.matchReport.primary.name) || productNameFor(lead, primaryMatch && primaryMatch.productId);
      if (key === "matching.alternatives") return (((lead.matchReport && lead.matchReport.alternatives) || []).map((product) => product.name).filter(Boolean).join("；"));
      if (key === "matching.status") return formatMatchStatus(overallMatchStatusFor(lead)) || "无推荐";
      if (key === "matching.fitScore") return primaryMatch && Number.isFinite(primaryMatch.fitScore) ? primaryMatch.fitScore + " 分" : "";
      if (key === "matching.confidence") return primaryMatch && Number.isFinite(primaryMatch.confidence) ? primaryMatch.confidence + "%" : "";
      if (key === "matching.ruleVersion") return lead.ruleVersion || (primaryMatch && primaryMatch.ruleVersion) || "";
      if (key === "matching.amountRange") return formatAmountRange(primaryMatch && primaryMatch.estimatedAmount);
      if (key === "matching.currency") return (primaryMatch && primaryMatch.estimatedAmount && primaryMatch.estimatedAmount.currency) || (lead.matchReport && lead.matchReport.primary && lead.matchReport.primary.currency) || "";
      if (key === "matching.missingFields") return primaryMatch ? (primaryMatch.missingFields || []).join("；") : "";
      if (key === "matching.failedRules") return (lead.productMatches || []).flatMap((match) => (match.failedRules || []).map((rule) => productNameFor(lead, match.productId) + "：" + (rule.internalReason || rule.message || rule.id || "未通过"))).join("；");
      if (key === "matching.advisorNextStep") return (lead.aiInsight && lead.aiInsight.nextStep) || "";
      return "";
    };
    const formatLeadValue = (lead, key) => {
      if (key.startsWith("matching.")) return formatMatchingValue(lead, key);
      const value = key.split(".").reduce((current, part) => current && current[part], lead);
      if (key === "createdAt") return value ? new Date(value).toLocaleString("zh-CN") : "";
      if (key === "estimationMode") return value === "simple" ? "简易版" : value === "complex" ? "复杂版" : value === "progressive" ? "产品匹配" : "";
      if (key === "debtOverRevenue70") return value === "yes" ? "是（扣 10 分）" : value === "no" ? "否" : "";
      if (key === "estimate.score") return value === undefined || value === null ? "-" : value + " 分";
      return value || (key.startsWith("estimate.") ? "-" : "");
    };
    const syncExport = () => {
      const ids = [...selectedIds];
      const credentials = getAuthHeaders();
      exportLink.disabled = !credentials || ids.length === 0;
      selectedCountNode.textContent = ids.length;
      selectAllNode.checked = loadedLeads.length > 0 && ids.length === loadedLeads.length;
      selectAllNode.indeterminate = ids.length > 0 && ids.length < loadedLeads.length;
      exportLink.textContent = ids.length ? "导出选中 " + ids.length + " 条" : "导出选中 Excel";
    };
    const renderRows = () => {
      rowsNode.innerHTML = loadedLeads.length ? loadedLeads.map((lead) => \`
          <tr>
            <td class="select-col"><input class="row-select" type="checkbox" value="\${escapeHtml(lead.id)}" \${selectedIds.has(lead.id) ? "checked" : ""} aria-label="选择客户" /></td>${rowCells}
          </tr>\`).join("") : '<tr><td colspan="${emptyColspan}">暂无客户信息</td></tr>';
      rowsNode.querySelectorAll(".row-select").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selectedIds.add(checkbox.value);
          } else {
            selectedIds.delete(checkbox.value);
          }
          syncExport();
        });
      });
      syncExport();
    };
    usernameInput.addEventListener("input", syncExport);
    passwordInput.addEventListener("input", syncExport);
    selectAllNode.addEventListener("change", () => {
      if (selectAllNode.checked) {
        loadedLeads.forEach((lead) => selectedIds.add(lead.id));
      } else {
        selectedIds.clear();
      }
      renderRows();
    });
    const loadLeads = async () => {
      const headers = getAuthHeaders();
      if (!headers) {
        statusNode.textContent = "请输入管理员账户和密码。";
        return;
      }
      syncExport();
      statusNode.textContent = "正在读取客户信息...";
      try {
        const response = await fetch("/api/leads" + getFilterQuery(), { headers, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "读取失败");
        loadedLeads = payload.leads;
        selectedIds.clear();
        statusNode.textContent = "已读取 " + payload.leads.length + " 条客户信息";
        countNode.textContent = payload.leads.length;
        renderRows();
      } catch (error) {
        statusNode.textContent = error.message || "读取失败";
        countNode.textContent = "0";
        selectedIds.clear();
        syncExport();
      }
    };
    loadButton.addEventListener("click", loadLeads);
    applyFiltersButton.addEventListener("click", loadLeads);
    clearFiltersButton.addEventListener("click", () => {
      Object.values(filterInputs).forEach((input) => { input.value = ""; });
      loadLeads();
    });
    exportLink.addEventListener("click", async () => {
      const headers = getAuthHeaders();
      const ids = [...selectedIds];
      if (!headers || ids.length === 0) return;
      const params = new URLSearchParams();
      ids.forEach((id) => params.append("ids", id));
      statusNode.textContent = "正在生成 Excel...";
      try {
        const response = await fetch("/api/leads/export?" + params.toString(), { headers });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || "导出失败");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "meiou-leads.xls";
        link.click();
        URL.revokeObjectURL(url);
        statusNode.textContent = "Excel 已开始下载。";
      } catch (error) {
        statusNode.textContent = error.message || "导出失败";
      }
    });
  </script>
</body>
</html>`;
}

function shouldUseLegacyMobileBundle(request) {
  return /iP(?:hone|ad|od)/i.test(request.headers["user-agent"] || "");
}

function buildLegacyMobileHtml(html) {
  return html
    .replace(/<script type="module"[\s\S]*?<\/script>\s*/g, "")
    .replace(/\snomodule(?=[\s>])/g, "");
}

async function serveStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.normalize(path.join(distDir, requested));

  if (!filePath.startsWith(distDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const target = await stat(filePath);
    if (!target.isFile()) throw new Error("Not a file");
    if (requested === "index.html" && shouldUseLegacyMobileBundle(request)) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(buildLegacyMobileHtml(await readFile(filePath, "utf8")));
      return;
    }
    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(response);
  } catch {
    const indexPath = path.join(distDir, "index.html");
    try {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (shouldUseLegacyMobileBundle(request)) {
        response.end(buildLegacyMobileHtml(await readFile(indexPath, "utf8")));
        return;
      }
      createReadStream(indexPath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  }
}

async function handleRequest(request, response, {
  leadsFilePath,
  adminCredentials,
  allowedOrigins,
  logger,
  aiReportService,
  now,
}) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (["/admin", "/api/leads", "/api/leads/export"].includes(url.pathname)) {
    response.setHeader("Cache-Control", "no-store");
  }

  if (!applyCorsHeaders(request, response, url, allowedOrigins)) {
    sendJson(response, 403, { error: "请求来源不被允许" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    });
    response.end();
    return;
  }

  try {
    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/products" && request.method === "GET") {
      sendJson(response, 200, { products: getPublicProducts() });
      return;
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(buildAdminPage());
      return;
    }

    if (url.pathname === "/api/leads" && request.method === "POST") {
      if (!hasJsonContentType(request)) throw new UnsupportedMediaTypeError("application/json is required");
      const body = await readBody(request);
      const lead = normalizeLead(parseJsonBody(body), now);
      await updateLeads(leadsFilePath, (leads) => [lead, ...leads]);
      const aiAnalysis = await aiReportService.generate(lead);
      let completedLead;
      await updateLeads(leadsFilePath, (leads) => leads.map((item) => {
        if (item.id !== lead.id) return item;
        completedLead = { ...item, aiAnalysis };
        return completedLead;
      }));
      sendJson(response, 201, { ok: true, lead: publicLead(completedLead) });
      return;
    }

    if (url.pathname === "/api/leads" && request.method === "GET") {
      if (!isAuthorized(request, adminCredentials)) {
        sendJson(response, 401, { error: "后台口令不正确" });
        return;
      }
      const leads = await readLeads(leadsFilePath);
      sendJson(response, 200, { leads: filterLeads(url, leads) });
      return;
    }

    if (url.pathname === "/api/leads/export" && request.method === "GET") {
      if (!isAuthorized(request, adminCredentials)) {
        sendJson(response, 401, { error: "后台口令不正确" });
        return;
      }
      const leads = await readLeads(leadsFilePath);
      const selectedLeads = getSelectedLeads(url, leads);
      if (selectedLeads.length === 0) {
        sendJson(response, 400, { error: "请选择客户信息后导出" });
        return;
      }
      const excel = buildExcel(selectedLeads);
      response.writeHead(200, {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="meiou-leads-${new Date().toISOString().slice(0, 10)}.xls"`,
        "Cache-Control": "no-store",
      });
      response.end(excel);
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      response.setHeader("Connection", "close");
      sendJson(response, 413, { error: "请求内容过大" });
      return;
    }
    if (error instanceof UnsupportedMediaTypeError) {
      sendJson(response, 415, { error: "请使用 application/json 提交" });
      return;
    }
    if (error instanceof PublicInputError) {
      sendJson(response, 400, { error: error.message, errors: error.errors });
      return;
    }
    logger.error("Unhandled Meiou server request error", {
      method: request.method,
      pathname: url.pathname,
      error,
    });
    sendJson(response, 500, { error: "服务器暂时无法处理请求" });
  }
}

export function createMeiouServer({
  leadsFilePath = leadsFile,
  adminCredentials = null,
  allowedOrigins = null,
  logger = console,
  aiReportService = null,
  now = () => new Date(),
} = {}) {
  const credentials = normalizeAdminCredentials(adminCredentials);
  const resolvedLeadsFilePath = path.resolve(leadsFilePath);
  const normalizedOrigins = normalizeAllowedOrigins(allowedOrigins);
  const safeLogger = logger && typeof logger.error === "function" ? logger : console;
  const safeNow = typeof now === "function" ? now : () => new Date();
  const localAiReportService = createAiReportService({
    client: { isConfigured: false },
    logger: safeLogger,
    now: safeNow,
  });
  const configuredAiReportService = aiReportService && typeof aiReportService.generate === "function"
    ? aiReportService
    : localAiReportService;
  return createServer((request, response) => handleRequest(request, response, {
    leadsFilePath: resolvedLeadsFilePath,
    adminCredentials: credentials,
    allowedOrigins: normalizedOrigins,
    logger: safeLogger,
    aiReportService: configuredAiReportService,
    now: safeNow,
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const adminCredentials = requiredStartupAdminCredentials();
  const aiReportService = createAiReportServiceFromEnvironment();
  await ensureStore(leadsFile);
  createMeiouServer({ adminCredentials, aiReportService }).listen(port, "127.0.0.1", () => {
    console.log(`Meiou lead server running at http://127.0.0.1:${port}`);
  });
}
