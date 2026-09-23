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
import { publicAiReport, validateAiNarrative } from "../src/lib/ai/aiReportContract.js";
import { buildAiAnalysisInput } from "../src/lib/ai/analysisInputBuilder.js";
import { buildFallbackAiAnalysis } from "../src/lib/ai/fallbackReportBuilder.js";
import { buildFinancingScenarioInput } from "../src/lib/matching/financingScenarioEngine.js";
import { resolveAdvisorFocusCode } from "../src/lib/ai/aiReportReferences.js";
import { resolveTermCode } from "../src/lib/ai/loanAnalystReferences.js";
import { createAiReportService, createAiReportServiceFromEnvironment } from "./ai/aiReportService.mjs";
import { buildAdminPage } from "./adminPage.mjs";
import { createPromotionHandler } from "./promotion/routes.mjs";
import { createSalesAuthHandler } from "./sales/authRoutes.mjs";
import { normalizeAdvisorReview, projectStoredAdvisorReview } from "./advisorReview.mjs";

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
const localDevelopmentOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
const loopbackHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

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
class InvalidLeadIdError extends Error {}
class LeadRevisionConflictError extends Error {
  constructor(lead) {
    super("lead revision is stale");
    this.lead = lead;
  }
}
class AiRetryUnavailableError extends Error {
  constructor(reason, lead) {
    super("AI retry is currently unavailable");
    this.reason = reason;
    this.lead = lead;
  }
}

function decodeLeadId(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) throw new InvalidLeadIdError("lead ID is malformed");
    throw error;
  }
}

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
  return new Set(values.filter((value) => value !== "").map((value) => {
    const origin = parseSerializedHttpOrigin(value);
    if (origin == null) {
      throw new Error("MEIOU_ALLOWED_ORIGINS entries must be exact serialized HTTP origins");
    }
    return origin;
  }));
}

function parseSerializedHttpOrigin(value) {
  if (typeof value !== "string" || value !== value.trim() || !value) return null;
  try {
    const origin = new URL(value);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return null;
    if (origin.origin !== value || origin.username || origin.password) return null;
    return origin.origin;
  } catch {
    return null;
  }
}

function isLoopbackSocketAddress(address) {
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function isTrustedDirectLoopbackSameOrigin(request, normalizedOrigin) {
  const host = request.headers.host;
  if (typeof host !== "string") return false;

  const protocol = request.socket?.encrypted === true ? "https:" : "http:";
  const requestOrigin = parseSerializedHttpOrigin(`${protocol}//${host}`);
  if (requestOrigin !== normalizedOrigin) return false;

  const origin = new URL(normalizedOrigin);
  const port = Number(origin.port || (origin.protocol === "https:" ? 443 : 80));
  return loopbackHostnames.has(origin.hostname)
    && Number.isInteger(request.socket?.localPort)
    && request.socket.localPort === port
    && isLoopbackSocketAddress(request.socket.localAddress);
}

function applyCorsHeaders(request, response, allowedOrigins, allowLocalDevelopmentOrigins) {
  const origin = request.headers.origin;
  if (!origin) return true;

  const normalizedOrigin = parseSerializedHttpOrigin(origin);
  if (normalizedOrigin == null) return false;
  const isDocumentedLocalDevelopmentOrigin = allowLocalDevelopmentOrigins
    && localDevelopmentOrigins.has(normalizedOrigin);
  const isTrustedDirectLoopbackOrigin = isTrustedDirectLoopbackSameOrigin(request, normalizedOrigin);
  if (!isTrustedDirectLoopbackOrigin && !isDocumentedLocalDevelopmentOrigin && !allowedOrigins.has(normalizedOrigin)) return false;

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

function isPlainObject(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function plainObjectArray(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function normalizeStoredProductMatches(value) {
  return plainObjectArray(value).map((match) => ({
    ...match,
    missingFields: stringArray(match.missingFields),
    advisorVerificationFields: stringArray(match.advisorVerificationFields),
    passedRules: plainObjectArray(match.passedRules),
    unknownRules: plainObjectArray(match.unknownRules),
    failedRules: plainObjectArray(match.failedRules),
  }));
}

function normalizeStoredMatchReport(value) {
  const report = isPlainObject(value) ? value : {};
  return {
    ...report,
    primary: isPlainObject(report.primary) ? report.primary : null,
    alternatives: plainObjectArray(report.alternatives),
    nonMatches: plainObjectArray(report.nonMatches),
    missingDocuments: stringArray(report.missingDocuments),
  };
}

function projectStoredLead(lead) {
  const storedLead = isPlainObject(lead) ? lead : {};
  return {
    ...storedLead,
    productMatches: normalizeStoredProductMatches(storedLead.productMatches),
    matchReport: normalizeStoredMatchReport(storedLead.matchReport),
  };
}

function addProductIdsToReport(report, matches) {
  const safeReport = normalizeStoredMatchReport(report);
  const rankedMatches = new Map(normalizeStoredProductMatches(matches)
    .filter((match) => match.rank != null)
    .map((match) => [match.rank, match]));
  return {
    ...safeReport,
    primary: safeReport.primary == null
      ? null
      : { productId: rankedMatches.get(1)?.productId ?? null, ...safeReport.primary },
    alternatives: safeReport.alternatives.map((product, index) => ({
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
  return [...new Set(normalizeStoredProductMatches(productMatches)
    .filter((match) => match.rank != null && match.status !== "ineligible")
    .flatMap((match) => match.advisorVerificationFields))];
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

function storedLeadRevision(lead) {
  return Number.isInteger(lead?.revision) && lead.revision >= 0 ? lead.revision : 0;
}

function expectedLeadRevision(input) {
  if (!Number.isInteger(input?.expectedRevision) || input.expectedRevision < 0) {
    throw new PublicInputError([{
      field: "expectedRevision",
      message: "must be a non-negative integer",
    }]);
  }
  return input.expectedRevision;
}

function assertLeadRevision(lead, expectedRevision) {
  if (storedLeadRevision(lead) !== expectedRevision) {
    throw new LeadRevisionConflictError(lead);
  }
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
    itemsToConfirm: Array.isArray(product.itemsToConfirm) ? [...product.itemsToConfirm] : [],
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

function publicImprovementPath(path) {
  if (!isPlainObject(path) || typeof path.productId !== "string") return null;
  const failedConditions = stringArray(path.failedConditions).slice(0, 3);
  const reassessmentActions = stringArray(path.reassessmentActions).slice(0, 3);
  if (failedConditions.length === 0 || reassessmentActions.length === 0) return null;
  return {
    productId: path.productId,
    presentationLabel: "暂不匹配/提升路径",
    failedConditions,
    reassessmentActions,
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
    improvementPaths: Array.isArray(report?.improvementPaths)
      ? report.improvementPaths.map(publicImprovementPath).filter(Boolean).slice(0, 2)
      : [],
    missingDocuments: Array.isArray(report?.missingDocuments) ? [...report.missingDocuments] : [],
    summary: report?.summary ?? "",
    disclaimer: report?.disclaimer ?? "",
  };
}

function canonicalMatchReportForLead(lead) {
  const projectedLead = projectStoredLead(lead);
  if (isPlainObject(projectedLead.profile)) {
    try {
      return addProductIdsToReport(
        buildCustomerMatchReport(projectedLead.profile, projectedLead.productMatches),
        projectedLead.productMatches,
      );
    } catch {
      // Historical records without a complete canonical profile use the stored projection below.
    }
  }
  return projectedLead.matchReport;
}

function projectedAiReportForLead(lead, matchReport = canonicalMatchReportForLead(lead)) {
  const projectedLead = projectStoredLead(lead);
  const analysisInput = buildAiAnalysisInput({
    profile: projectedLead.profile,
    productMatches: projectedLead.productMatches,
    matchReport,
  });
  return publicAiReport(projectedLead.aiAnalysis, projectedLead.advisorReview, analysisInput);
}

function projectAiMetadata(meta = {}) {
  const safeMeta = meta !== null && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  const usage = safeMeta.usage ?? {};
  return {
    provider: typeof safeMeta.provider === "string" ? safeMeta.provider : null,
    model: typeof safeMeta.model === "string" ? safeMeta.model : null,
    promptVersion: typeof safeMeta.promptVersion === "string" ? safeMeta.promptVersion : null,
    generatedAt: typeof safeMeta.generatedAt === "string" ? safeMeta.generatedAt : null,
    durationMs: Number.isFinite(safeMeta.durationMs) ? safeMeta.durationMs : null,
    usage: {
      inputTokens: Number.isFinite(usage.inputTokens) ? usage.inputTokens : null,
      outputTokens: Number.isFinite(usage.outputTokens) ? usage.outputTokens : null,
    },
    errorCategory: typeof safeMeta.errorCategory === "string" ? safeMeta.errorCategory : null,
    providerAttempted: safeMeta.providerAttempted === true,
  };
}

function auditMetadata(analysis) {
  return {
    status: ["pending", "generated", "fallback"].includes(analysis?.status) ? analysis.status : "pending",
    ...projectAiMetadata(analysis?.meta),
  };
}

function validatedV3Narrative(analysis, analysisInput) {
  const customerReport = analysis?.customerReport;
  if (customerReport === null || typeof customerReport !== "object" || Array.isArray(customerReport)) {
    return { ok: false };
  }
  const narrative = {
    schemaVersion: customerReport.schemaVersion,
    portfolioSummaryCodes: customerReport.portfolioSummaryCodes,
    productAnalyses: Array.isArray(customerReport.productAnalyses)
      ? customerReport.productAnalyses.map((product) => ({
        productId: product?.productId,
        selectedAmountScenarioCode: product?.selectedAmountScenarioCode,
        selectedTermCode: product?.selectedTermCode,
        reasonCodes: product?.reasonCodes,
        riskCodes: product?.riskCodes,
        sensitivityCodes: product?.sensitivityCodes,
        confidenceCode: product?.confidenceCode,
      }))
      : customerReport.productAnalyses,
    preparationActionCodes: customerReport.preparationActionCodes,
    advisorFocusCodes: analysis?.advisorFocusCodes,
  };
  return narrative.schemaVersion === "meiou-ai-analyst-v3"
    ? validateAiNarrative(narrative, analysisInput)
    : { ok: false };
}

function projectAdminAiAnalysis(analysis, analysisInput) {
  const validation = validatedV3Narrative(analysis, analysisInput);
  const narrative = validation.ok ? validation.value : null;
  const retryCount = Number.isInteger(analysis?.retryCount) && analysis.retryCount >= 0
    ? analysis.retryCount
    : 0;
  return {
    status: ["pending", "generated", "fallback"].includes(analysis?.status) ? analysis.status : "pending",
    customerReport: narrative == null ? null : {
      schemaVersion: narrative.schemaVersion,
      portfolioSummaryCodes: narrative.portfolioSummaryCodes,
      productAnalyses: narrative.productAnalyses,
      preparationActionCodes: narrative.preparationActionCodes,
    },
    advisorFocusCodes: narrative?.advisorFocusCodes ?? [],
    advisorFocus: (narrative?.advisorFocusCodes ?? [])
      .map(resolveAdvisorFocusCode)
      .filter(Boolean),
    retryCount,
    meta: projectAiMetadata(analysis?.meta),
  };
}

function buildAiScenarioAudit(lead, matchReport = canonicalMatchReportForLead(lead)) {
  const projectedLead = projectStoredLead(lead);
  const scenarioInput = buildFinancingScenarioInput({
    profile: projectedLead.profile,
    productMatches: projectedLead.productMatches,
  });
  const analysisInput = buildAiAnalysisInput({
    profile: projectedLead.profile,
    productMatches: projectedLead.productMatches,
    matchReport,
  });
  const validation = validatedV3Narrative(projectedLead.aiAnalysis, analysisInput);
  const selectedByProduct = new Map(
    (validation.ok ? validation.value.productAnalyses : [])
      .map((item) => [item.productId, item]),
  );

  return {
    policyVersion: scenarioInput.policyVersion,
    products: scenarioInput.products.map((product) => {
      const selectedTermCode = selectedByProduct.get(product.productId)?.selectedTermCode ?? null;
      return {
        ...product,
        termOptions: product.termOptions
          .map((code) => ({ code, label: resolveTermCode(code) }))
          .filter((term) => term.label !== null),
        selectedScenarioCode: selectedByProduct.get(product.productId)?.selectedAmountScenarioCode ?? null,
        selectedTermCode,
        selectedTermLabel: resolveTermCode(selectedTermCode),
      };
    }),
    missingDocuments: Array.isArray(matchReport?.missingDocuments) ? [...matchReport.missingDocuments] : [],
    meta: auditMetadata(projectedLead.aiAnalysis),
    advisorReview: projectStoredAdvisorReview(projectedLead.advisorReview),
  };
}

function publicLead(lead) {
  const projectedLead = projectStoredLead(lead);
  const matchReport = canonicalMatchReportForLead(projectedLead);
  return {
    id: projectedLead.id,
    createdAt: projectedLead.createdAt,
    estimationMode: projectedLead.estimationMode,
    matchReport: publicMatchReport(matchReport),
    aiReport: projectedAiReportForLead(projectedLead, matchReport),
  };
}

function getLeadValue(lead, key) {
  return key.split(".").reduce((value, part) => value?.[part], lead) ?? "";
}

function getPrimaryMatch(lead) {
  return normalizeStoredProductMatches(lead?.productMatches).find((match) => match.rank === 1) ?? null;
}

function getOverallMatchStatus(lead) {
  const primaryMatch = getPrimaryMatch(lead);
  if (primaryMatch) return primaryMatch.status;

  const matches = normalizeStoredProductMatches(lead?.productMatches);
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
      return plainObjectArray(lead.matchReport?.alternatives).map((product) => product.name).filter(Boolean).join("；");
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
      return stringArray(primaryMatch?.missingFields).join("；");
    case "matching.failedRules":
      return normalizeStoredProductMatches(lead.productMatches).flatMap((match) => (
        plainObjectArray(match.failedRules).map((rule) => (
          `${getProductName(match.productId)}：${rule.internalReason ?? rule.message ?? rule.id ?? "未通过"}`
        ))
      )).join("；");
    case "matching.advisorNextStep":
      return lead.aiInsight?.nextStep ?? "";
    case "matching.advisorFollowUp":
      return stringArray(lead.advisorVerificationFields).join("；");
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

function serviceRetryCapability(aiReportService) {
  if (typeof aiReportService?.getRetryCapability !== "function") {
    return { allowed: true, reason: null };
  }
  try {
    const capability = aiReportService.getRetryCapability();
    if (capability?.allowed === true) return { allowed: true, reason: null };
    const reason = new Set(["not_configured", "daily_limit", "service_unavailable"])
      .has(capability?.reason)
      ? capability.reason
      : "service_unavailable";
    return { allowed: false, reason };
  } catch {
    return { allowed: false, reason: "service_unavailable" };
  }
}

function retryCapabilityForLead(lead, aiReportService) {
  const analysis = lead?.aiAnalysis;
  const retryCount = Number.isInteger(analysis?.retryCount) && analysis.retryCount >= 0
    ? analysis.retryCount
    : 0;
  if (retryCount >= 1) return { allowed: false, reason: "retry_used" };
  if (!new Set(["pending", "fallback"]).has(analysis?.status)) {
    return { allowed: false, reason: "analysis_complete" };
  }
  if (analysis?.operationKind === "retry") {
    return { allowed: false, reason: "retry_in_progress" };
  }
  return serviceRetryCapability(aiReportService);
}

function adminLead(lead, aiReportService = null) {
  const projectedLead = projectStoredLead(lead);
  const matchReport = canonicalMatchReportForLead(projectedLead);
  const analysisInput = buildAiAnalysisInput({
    profile: projectedLead.profile,
    productMatches: projectedLead.productMatches,
    matchReport,
  });
  return {
    ...projectedLead,
    matchReport,
    revision: storedLeadRevision(projectedLead),
    aiAnalysis: projectAdminAiAnalysis(projectedLead.aiAnalysis, analysisInput),
    aiReport: projectedAiReportForLead(projectedLead, matchReport),
    aiScenarioAudit: buildAiScenarioAudit(projectedLead, matchReport),
    aiRetry: retryCapabilityForLead(projectedLead, aiReportService),
    advisorReview: projectStoredAdvisorReview(projectedLead.advisorReview),
  };
}

function buildExcel(leads) {
  const headers = exportColumns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = leads
    .map((storedLead) => {
      const lead = adminLead(storedLead);
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
    if (reviewStatus && projectStoredAdvisorReview(lead.advisorReview).status !== reviewStatus) return false;
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
  promotionHandler,
  salesAuthHandler,
  leadsFilePath,
  adminCredentials,
  allowedOrigins,
  allowLocalDevelopmentOrigins,
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

  if (!applyCorsHeaders(request, response, allowedOrigins, allowLocalDevelopmentOrigins)) {
    sendJson(response, 403, { error: "请求来源不被允许" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-CSRF-Token",
    });
    response.end();
    return;
  }

  if (advisorRoute && !isAuthorized(request, adminCredentials)) {
    sendJson(response, 401, { error: "后台口令不正确" });
    return;
  }

  try {
    if (await salesAuthHandler(request, response, url)) return;
    if (await promotionHandler(request, response, url)) return;
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
        lead = {
          ...normalizedLead,
          id: uniqueLeadId(leads, idFactory),
          revision: 1,
          aiAnalysis: {
            ...normalizedLead.aiAnalysis,
            operationId: randomUUID(),
            operationKind: "initial",
          },
        };
        return [lead, ...leads];
      });
      let aiAnalysis;
      try {
        aiAnalysis = await aiReportService.generate(lead);
      } catch {
        const analysisInput = buildAiAnalysisInput(lead);
        aiAnalysis = buildFallbackAiAnalysis({
          analysisInput,
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
          if (item.aiAnalysis?.operationId !== lead.aiAnalysis.operationId) {
            completedLead = item;
            return item;
          }
          completedLead = {
            ...item,
            revision: storedLeadRevision(item) + 1,
            aiAnalysis,
          };
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
      sendJson(response, 200, {
        leads: filterLeads(url, leads).map((lead) => adminLead(lead, aiReportService)),
      });
      return;
    }

    if (advisorRoute?.[2] === "review" && request.method === "PATCH") {
      const leadId = decodeLeadId(advisorRoute[1]);
      if (!hasJsonContentType(request)) throw new UnsupportedMediaTypeError("application/json is required");
      const input = parseJsonBody(await readBody(request));
      const expectedRevision = expectedLeadRevision(input);
      let updatedLead;
      await updateLeads(leadsFilePath, (leads) => {
        const leadIndex = leads.findIndex((lead) => lead.id === leadId);
        if (leadIndex === -1) throw new LeadNotFoundError("lead does not exist");
        assertLeadRevision(leads[leadIndex], expectedRevision);

        let advisorReview;
        try {
          advisorReview = normalizeAdvisorReview(input, leads[leadIndex].advisorReview, now);
        } catch (error) {
          if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
          const field = /status/.test(error.message) ? "status" : "note";
          throw new PublicInputError([{ field, message: error.message }]);
        }

        updatedLead = {
          ...leads[leadIndex],
          revision: storedLeadRevision(leads[leadIndex]) + 1,
          advisorReview,
        };
        const updatedLeads = [...leads];
        updatedLeads[leadIndex] = updatedLead;
        return updatedLeads;
      });
      sendJson(response, 200, { ok: true, lead: adminLead(updatedLead, aiReportService) });
      return;
    }

    if (advisorRoute?.[2] === "ai-retry" && request.method === "POST") {
      const leadId = decodeLeadId(advisorRoute[1]);
      if (!hasJsonContentType(request)) throw new UnsupportedMediaTypeError("application/json is required");
      const input = parseJsonBody(await readBody(request));
      const expectedRevision = expectedLeadRevision(input);
      let retryLead;
      let previousRetryCount;
      const retryOperationId = randomUUID();
      await updateLeads(leadsFilePath, (leads) => {
        const leadIndex = leads.findIndex((lead) => lead.id === leadId);
        if (leadIndex === -1) throw new LeadNotFoundError("lead does not exist");
        assertLeadRevision(leads[leadIndex], expectedRevision);

        const currentAnalysis = leads[leadIndex].aiAnalysis;
        previousRetryCount = Number.isInteger(currentAnalysis?.retryCount)
          && currentAnalysis.retryCount >= 0
          ? currentAnalysis.retryCount
          : 0;
        const capability = retryCapabilityForLead(leads[leadIndex], aiReportService);
        if (!capability.allowed && new Set(["not_configured", "daily_limit", "service_unavailable"])
          .has(capability.reason)) {
          throw new AiRetryUnavailableError(capability.reason, leads[leadIndex]);
        }
        if (!capability.allowed) {
          throw new AiRetryConflictError("AI analysis cannot be retried");
        }

        retryLead = {
          ...leads[leadIndex],
          revision: storedLeadRevision(leads[leadIndex]) + 1,
          aiAnalysis: {
            status: "pending",
            retryCount: previousRetryCount,
            operationId: retryOperationId,
            operationKind: "retry",
          },
        };
        const updatedLeads = [...leads];
        updatedLeads[leadIndex] = retryLead;
        return updatedLeads;
      });

      let aiAnalysis;
      try {
        aiAnalysis = await aiReportService.generate(retryLead);
      } catch {
        const analysisInput = buildAiAnalysisInput(retryLead);
        aiAnalysis = buildFallbackAiAnalysis({
          analysisInput,
          errorCategory: "provider_error",
          now,
          providerAttempted: true,
        });
      }

      let completedLead;
      await updateLeads(leadsFilePath, (leads) => {
        const leadIndex = leads.findIndex((lead) => lead.id === leadId);
        if (leadIndex === -1) throw new LeadLifecycleInvariantError("AI retry target must still exist");
        if (leads[leadIndex].aiAnalysis?.operationId !== retryOperationId) {
          completedLead = leads[leadIndex];
          return leads;
        }
        const providerAttempted = aiAnalysis?.meta?.providerAttempted !== false;
        const retryCount = previousRetryCount + (providerAttempted ? 1 : 0);
        completedLead = {
          ...leads[leadIndex],
          revision: storedLeadRevision(leads[leadIndex]) + 1,
          aiAnalysis: { ...aiAnalysis, retryCount },
        };
        const updatedLeads = [...leads];
        updatedLeads[leadIndex] = completedLead;
        return updatedLeads;
      });
      sendJson(response, 200, { ok: true, lead: adminLead(completedLead, aiReportService) });
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
    if (error instanceof LeadRevisionConflictError) {
      sendJson(response, 409, {
        error: "客户信息已更新，请刷新后重试",
        code: "revision_conflict",
        lead: adminLead(error.lead, aiReportService),
      });
      return;
    }
    if (error instanceof AiRetryUnavailableError) {
      sendJson(response, 409, {
        error: "AI 分析当前不可重试",
        code: "ai_retry_unavailable",
        reason: error.reason,
        lead: adminLead(error.lead, aiReportService),
      });
      return;
    }
    if (error instanceof AiRetryConflictError) {
      sendJson(response, 409, { error: "AI 分析不可再次重试" });
      return;
    }
    if (error instanceof InvalidLeadIdError) {
      sendJson(response, 400, { error: "客户标识格式不正确" });
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
  allowLocalDevelopmentOrigins = false,
  logger = console,
  aiReportService = null,
  now = () => new Date(),
  idFactory = randomUUID,
  promotionDatabasePath = null,
  publicSiteUrl = "",
  salesCookieSecure = true,
} = {}) {
  if (salesCookieSecure === false && !allowLocalDevelopmentOrigins) throw new Error('Insecure sales cookies require explicit local development mode');
  const credentials = normalizeAdminCredentials(adminCredentials);
  const resolvedLeadsFilePath = path.resolve(leadsFilePath);
  const normalizedOrigins = normalizeAllowedOrigins(allowedOrigins);
  const canUseLocalDevelopmentOrigins = allowLocalDevelopmentOrigins === true;
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
  let promotionStorePromise = null;
  const getPromotionStore = () => {
      if (!promotionStorePromise) {
        promotionStorePromise = import("./promotion/store.mjs").then(({ openPromotionStore }) =>
          openPromotionStore({ databasePath: promotionDatabasePath ?? path.join(path.dirname(resolvedLeadsFilePath), "promotions.sqlite"), now: safeNow })
        ).catch(error => { promotionStorePromise = null; throw error; });
      }
      return promotionStorePromise;
    };
  const promotionHandler = createPromotionHandler({
    publicSiteUrl, now: safeNow, getStore: getPromotionStore,
    isAuthorized: request => isAuthorized(request, credentials),
  });
  const salesAuthHandler = createSalesAuthHandler({
    getStore: getPromotionStore, isAdmin: request => isAuthorized(request, credentials), now: safeNow, cookieSecure: salesCookieSecure,
  });
  const server = createServer((request, response) => handleRequest(request, response, {
    promotionHandler,
    salesAuthHandler,
    leadsFilePath: resolvedLeadsFilePath,
    adminCredentials: credentials,
    allowedOrigins: normalizedOrigins,
    allowLocalDevelopmentOrigins: canUseLocalDevelopmentOrigins,
    logger: safeLogger,
    aiReportService: configuredAiReportService,
    now: safeNow,
    idFactory: safeIdFactory,
  }));
  server.on("close", () => { promotionStorePromise?.then(store => store.close()).catch(() => {}); });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const adminCredentials = requiredStartupAdminCredentials();
  const aiReportService = createAiReportServiceFromEnvironment();
  await ensureStore(leadsFile);
  createMeiouServer({
    adminCredentials,
    aiReportService,
    publicSiteUrl: process.env.MEIOU_PUBLIC_SITE_URL ?? "",
    promotionDatabasePath: process.env.MEIOU_PROMOTION_DB_PATH ?? null,
    allowLocalDevelopmentOrigins: process.env.MEIOU_LOCAL_DEV_ORIGINS === "1",
  }).listen(port, "127.0.0.1", () => {
    console.log(`Meiou lead server running at http://127.0.0.1:${port}`);
  });
}
