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
import { buildFallbackAiAnalysis } from "../src/lib/ai/fallbackReportBuilder.js";
import { createAiReportService, createAiReportServiceFromEnvironment } from "./ai/aiReportService.mjs";
import { buildAdminPage } from "./adminPage.mjs";
import { normalizeAdvisorReview } from "./advisorReview.mjs";

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

const advisorExportColumns = [
  ["aiAnalysis.source", "AI 报告来源"],
  ["aiAnalysis.status", "AI 生成状态"],
  ["advisorReview.status", "顾问复核状态"],
  ["advisorReview.updatedAt", "顾问复核时间"],
  ["advisorReview.note", "顾问内部备注"],
];

const exportColumns = [...leadColumns, ...advisorExportColumns];

class PublicInputError extends Error {
  constructor(errors) {
    super("提交信息有误");
    this.errors = errors;
  }
}

class PayloadTooLargeError extends Error {}
class UnsupportedMediaTypeError extends Error {}
class LeadLifecycleInvariantError extends Error {}
class LeadNotFoundError extends Error {}
class AiRetryConflictError extends Error {}

function uniqueLeadId(leads, idFactory) {
  const existingIds = new Set(leads.map((lead) => lead?.id).filter((id) => typeof id === "string" && id));
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = idFactory();
    if (typeof candidate === "string" && candidate && !existingIds.has(candidate)) return candidate;
  }
  let candidate;
  do {
    candidate = randomUUID();
  } while (existingIds.has(candidate));
  return candidate;
}

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
  if (key === "aiAnalysis.source") {
    return lead.aiAnalysis?.status === "generated"
      ? "ai"
      : lead.aiAnalysis?.status === "fallback" ? "rules_fallback" : "";
  }
  const value = getLeadValue(lead, key);
  if (key === "createdAt") return value ? new Date(value).toLocaleString("zh-CN") : "";
  if (key === "debtOverRevenue70") return value === "yes" ? "是（扣 10 分）" : value === "no" ? "否" : "";
  if (key === "estimationMode") return value === "simple" ? "简易版" : value === "complex" ? "复杂版" : value === "progressive" ? "渐进式匹配" : "";
  if (lead.intakeVersion === INTAKE_VERSION && (key.startsWith("estimate.") || key.startsWith("aiInsight."))) return "";
  if (key === "estimate.score") return value === "" ? "-" : `${value} 分`;
  return value || (key.startsWith("estimate.") ? "-" : "");
}

function buildExcel(leads) {
  const headers = exportColumns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = leads
    .map((lead) => {
      const cells = exportColumns
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
  const reviewStatus = (url.searchParams.get("reviewStatus") ?? "").trim();
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
    if (reviewStatus && lead.advisorReview?.status !== reviewStatus) return false;
    if (hasAmountMin && (!Number.isFinite(submittedAmount) || submittedAmount < amountMin)) return false;
    if (hasAmountMax && (!Number.isFinite(submittedAmount) || submittedAmount > amountMax)) return false;
    if (Number.isFinite(fromTime) && (!Number.isFinite(createdTime) || createdTime < fromTime)) return false;
    if (Number.isFinite(toTime) && (!Number.isFinite(createdTime) || createdTime > toTime)) return false;
    return true;
  });
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
  idFactory,
}) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const advisorRoute = url.pathname.match(/^\/api\/leads\/([^/]+)\/(review|ai-retry)$/);

  if (["/admin", "/api/leads", "/api/leads/export"].includes(url.pathname) || advisorRoute) {
    response.setHeader("Cache-Control", "no-store");
  }

  if (!applyCorsHeaders(request, response, url, allowedOrigins)) {
    sendJson(response, 403, { error: "请求来源不被允许" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    });
    response.end();
    return;
  }

  if (advisorRoute && !isAuthorized(request, adminCredentials)) {
    sendJson(response, 401, { error: "后台口令不正确" });
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
      response.end(buildAdminPage({ leadColumns, products: getPublicProducts() }));
      return;
    }

    if (url.pathname === "/api/leads" && request.method === "POST") {
      if (!hasJsonContentType(request)) throw new UnsupportedMediaTypeError("application/json is required");
      const body = await readBody(request);
      const normalizedLead = normalizeLead(parseJsonBody(body), now);
      let lead;
      await updateLeads(leadsFilePath, (leads) => {
        lead = { ...normalizedLead, id: uniqueLeadId(leads, idFactory) };
        return [lead, ...leads];
      });
      let aiAnalysis;
      try {
        aiAnalysis = await aiReportService.generate(lead);
      } catch {
        aiAnalysis = buildFallbackAiAnalysis({
          matchReport: lead.matchReport,
          errorCategory: "provider_error",
          now,
        });
      }
      let completedLead;
      await updateLeads(leadsFilePath, (leads) => {
        let matchedLeadCount = 0;
        const updatedLeads = leads.map((item) => {
          if (item.id !== lead.id) return item;
          matchedLeadCount += 1;
          if (Number.isInteger(item.aiAnalysis?.retryCount) && item.aiAnalysis.retryCount >= 1) {
            completedLead = item;
            return item;
          }
          completedLead = { ...item, aiAnalysis };
          return completedLead;
        });
        if (matchedLeadCount !== 1) throw new LeadLifecycleInvariantError("lead completion target must exist exactly once");
        return updatedLeads;
      });
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

    if (advisorRoute?.[2] === "review" && request.method === "PATCH") {
      if (!hasJsonContentType(request)) throw new UnsupportedMediaTypeError("application/json is required");
      const input = parseJsonBody(await readBody(request));
      const leadId = decodeURIComponent(advisorRoute[1]);
      let updatedLead;
      await updateLeads(leadsFilePath, (leads) => {
        const leadIndex = leads.findIndex((lead) => lead.id === leadId);
        if (leadIndex === -1) throw new LeadNotFoundError("lead does not exist");

        let advisorReview;
        try {
          advisorReview = normalizeAdvisorReview(input, leads[leadIndex].advisorReview, now);
        } catch (error) {
          if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
          const field = /status/.test(error.message) ? "status" : "note";
          throw new PublicInputError([{ field, message: error.message }]);
        }

        updatedLead = { ...leads[leadIndex], advisorReview };
        const updatedLeads = [...leads];
        updatedLeads[leadIndex] = updatedLead;
        return updatedLeads;
      });
      sendJson(response, 200, { ok: true, lead: updatedLead });
      return;
    }

    if (advisorRoute?.[2] === "ai-retry" && request.method === "POST") {
      const leadId = decodeURIComponent(advisorRoute[1]);
      let retryLead;
      let retryCount;
      await updateLeads(leadsFilePath, (leads) => {
        const leadIndex = leads.findIndex((lead) => lead.id === leadId);
        if (leadIndex === -1) throw new LeadNotFoundError("lead does not exist");

        const currentAnalysis = leads[leadIndex].aiAnalysis;
        const previousRetryCount = Number.isInteger(currentAnalysis?.retryCount)
          && currentAnalysis.retryCount >= 0
          ? currentAnalysis.retryCount
          : 0;
        if (!new Set(["pending", "fallback"]).has(currentAnalysis?.status) || previousRetryCount >= 1) {
          throw new AiRetryConflictError("AI analysis cannot be retried");
        }

        retryCount = previousRetryCount + 1;
        retryLead = {
          ...leads[leadIndex],
          aiAnalysis: { status: "pending", retryCount },
        };
        const updatedLeads = [...leads];
        updatedLeads[leadIndex] = retryLead;
        return updatedLeads;
      });

      let aiAnalysis;
      try {
        aiAnalysis = await aiReportService.generate(retryLead);
      } catch {
        aiAnalysis = buildFallbackAiAnalysis({
          matchReport: retryLead.matchReport,
          errorCategory: "provider_error",
          now,
        });
      }

      let completedLead;
      await updateLeads(leadsFilePath, (leads) => {
        const leadIndex = leads.findIndex((lead) => lead.id === leadId);
        if (leadIndex === -1) throw new LeadLifecycleInvariantError("AI retry target must still exist");
        completedLead = {
          ...leads[leadIndex],
          aiAnalysis: { ...aiAnalysis, retryCount },
        };
        const updatedLeads = [...leads];
        updatedLeads[leadIndex] = completedLead;
        return updatedLeads;
      });
      sendJson(response, 200, { ok: true, lead: completedLead });
      return;
    }

    if (advisorRoute) {
      sendJson(response, 405, { error: "请求方法不被允许" });
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
    if (error instanceof LeadNotFoundError) {
      sendJson(response, 404, { error: "客户信息不存在" });
      return;
    }
    if (error instanceof AiRetryConflictError) {
      sendJson(response, 409, { error: "AI 分析不可再次重试" });
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
  idFactory = randomUUID,
} = {}) {
  const credentials = normalizeAdminCredentials(adminCredentials);
  const resolvedLeadsFilePath = path.resolve(leadsFilePath);
  const normalizedOrigins = normalizeAllowedOrigins(allowedOrigins);
  const safeLogger = logger && typeof logger.error === "function" ? logger : console;
  const safeNow = typeof now === "function" ? now : () => new Date();
  const safeIdFactory = typeof idFactory === "function" ? idFactory : randomUUID;
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
    idFactory: safeIdFactory,
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
