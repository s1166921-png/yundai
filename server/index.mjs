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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const leadsFile = path.join(dataDir, "leads.json");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);

const contactFields = ["companyName", "contactName", "phone"];
const leadUpdateQueues = new Map();
const storeFileMode = 0o600;

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

const leadColumns = [
  ["createdAt", "提交时间"],
  ["estimationMode", "测算版本"],
  ["companyName", "企业名称"],
  ["contactName", "联系人"],
  ["phone", "联系电话"],
  ["platform", "主营平台"],
  ["productInterest", "意向产品"],
  ["matching.primaryProduct", "第一推荐产品"],
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

async function ensureStore(leadsFilePath = leadsFile) {
  await mkdir(path.dirname(leadsFilePath), { recursive: true });
  try {
    await stat(leadsFilePath);
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
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new PublicInputError([{ field: "body", message: "is too large" }]));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
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

function normalizeLead(input) {
  const requestedMode = input.estimationMode ?? input.mode;
  const estimationMode = requestedMode == null
    ? "complex"
    : typeof requestedMode === "string"
      ? requestedMode.trim().toLowerCase()
      : requestedMode;
  const profile = normalizeCustomerProfile(input);
  const validation = validateCustomerProfile(profile, estimationMode);
  const errors = [
    ...contactFields
      .filter((field) => !profile[field])
      .map((field) => ({ field, message: "is required" })),
    ...validation.errors.map((error) => (
      error.field === "mode" ? { ...error, field: "estimationMode" } : error
    )),
  ];

  if (errors.length > 0) {
    throw new PublicInputError(errors);
  }

  const lead = {};
  const allFields = [...new Set([...legacyBaseFields, ...simpleEstimateFields, ...complexEstimateFields, "note"])];

  for (const key of allFields) {
    lead[key] = String(input[key] ?? "").trim();
  }

  const estimate = estimationMode === "complex" ? calculateCreditEstimate(lead) : calculateSimpleEstimate(lead);
  const aiInsight = createAiInsight(lead, estimate, estimationMode);
  const productMatches = matchProducts(profile);
  const matchReport = addProductIdsToReport(buildCustomerMatchReport(profile, productMatches), productMatches);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    estimationMode,
    ...lead,
    estimate,
    aiInsight,
    profile,
    productMatches,
    matchReport,
    ruleVersion: matchReport.ruleVersion,
  };
}

function publicProfile(profile) {
  const { raw: _raw, ...safeProfile } = profile;
  return safeProfile;
}

function publicEstimatedAmount(estimatedAmount) {
  if (!estimatedAmount || typeof estimatedAmount !== "object") return null;
  const { kind, currency, min, max, note } = estimatedAmount;
  return { kind, currency, min, max, note };
}

function publicProductMatch(match) {
  return {
    productId: match.productId,
    status: match.status,
    rank: match.rank,
    estimatedAmount: publicEstimatedAmount(match.estimatedAmount),
    ruleVersion: match.ruleVersion,
  };
}

function publicAiInsight(aiInsight) {
  const { priority: _priority, ...safeInsight } = aiInsight;
  return safeInsight;
}

function publicLead(lead) {
  return {
    ...lead,
    profile: publicProfile(lead.profile),
    productMatches: lead.productMatches.map(publicProductMatch),
    aiInsight: publicAiInsight(lead.aiInsight),
  };
}

function getLeadValue(lead, key) {
  return key.split(".").reduce((value, part) => value?.[part], lead) ?? "";
}

function getPrimaryMatch(lead) {
  return lead.productMatches?.find((match) => match.rank === 1) ?? null;
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
    case "matching.alternatives":
      return lead.matchReport?.alternatives?.map((product) => product.name).filter(Boolean).join("；") ?? "";
    case "matching.status":
      return primaryMatch == null ? "无推荐" : formatMatchStatus(primaryMatch.status);
    case "matching.fitScore":
      return Number.isFinite(primaryMatch?.fitScore) ? `${primaryMatch.fitScore} 分` : "";
    case "matching.confidence":
      return Number.isFinite(primaryMatch?.confidence) ? `${primaryMatch.confidence}%` : "";
    case "matching.ruleVersion":
      return lead.ruleVersion ?? primaryMatch?.ruleVersion ?? "";
    case "matching.amountRange":
      return formatAmountRange(primaryMatch?.estimatedAmount);
    case "matching.currency":
      return primaryMatch?.estimatedAmount?.currency ?? lead.matchReport?.primary?.currency ?? "";
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
    default:
      return "";
  }
}

function formatLeadValue(lead, key) {
  if (key.startsWith("matching.")) return formatMatchingValue(lead, key);
  const value = getLeadValue(lead, key);
  if (key === "createdAt") return value ? new Date(value).toLocaleString("zh-CN") : "";
  if (key === "debtOverRevenue70") return value === "yes" ? "是（扣 10 分）" : value === "no" ? "否" : "";
  if (key === "estimationMode") return value === "simple" ? "简易版" : value === "complex" ? "复杂版" : "";
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

function buildAdminPage() {
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
    .panel { border: 1px solid #d9e1ee; border-radius: 14px; background: #fff; box-shadow: 0 12px 34px rgba(22,34,58,.08); }
    .topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid #e7edf5; }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .tools { display: flex; flex-wrap: wrap; gap: 10px; }
    input, button, a { font: inherit; }
    input { width: 220px; height: 40px; padding: 0 12px; border: 1px solid #cbd6e5; border-radius: 8px; color: #17243d; outline: none; }
    input:focus { border-color: #5b8def; box-shadow: 0 0 0 3px rgba(91,141,239,.14); }
    button, a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border: 1px solid #cbd6e5; border-radius: 8px; background: #fff; color: #17243d; font-weight: 700; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { background: #f5f8fc; }
    a.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
    a.primary:hover { background: #1d4ed8; }
    a.disabled { opacity: .45; pointer-events: none; }
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
    @media (max-width: 720px) { main { width: min(100% - 20px, 1440px); padding-top: 12px; } .topbar { align-items: stretch; flex-direction: column; } .tools, input, button, a { width: 100%; } }
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
    let loadedLeads = [];
    const selectedIds = new Set();
    const getAuthHeaders = () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      return username && password ? { Authorization: "Basic " + btoa(username + ":" + password) } : null;
    };
    const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const primaryMatchFor = (lead) => (lead.productMatches || []).find((match) => match.rank === 1) || null;
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
      if (key === "matching.status") return primaryMatch ? formatMatchStatus(primaryMatch.status) : "无推荐";
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
      if (key === "estimationMode") return value === "simple" ? "简易版" : value === "complex" ? "复杂版" : "";
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
    loadButton.addEventListener("click", async () => {
      const headers = getAuthHeaders();
      if (!headers) {
        statusNode.textContent = "请输入管理员账户和密码。";
        return;
      }
      syncExport();
      statusNode.textContent = "正在读取客户信息...";
      try {
        const response = await fetch("/api/leads", { headers });
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

async function handleRequest(request, response, { leadsFilePath, adminCredentials }) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  try {
    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(buildAdminPage());
      return;
    }

    if (url.pathname === "/api/leads" && request.method === "POST") {
      const body = await readBody(request);
      const lead = normalizeLead(parseJsonBody(body));
      await updateLeads(leadsFilePath, (leads) => [lead, ...leads]);
      sendJson(response, 201, { ok: true, lead: publicLead(lead) });
      return;
    }

    if (url.pathname === "/api/leads" && request.method === "GET") {
      if (!isAuthorized(request, adminCredentials)) {
        sendJson(response, 401, { error: "后台口令不正确" });
        return;
      }
      sendJson(response, 200, { leads: await readLeads(leadsFilePath) });
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
      });
      response.end(excel);
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    if (error instanceof PublicInputError) {
      sendJson(response, 400, { error: error.message, errors: error.errors });
      return;
    }
    sendJson(response, 500, { error: error.message || "服务器错误" });
  }
}

export function createMeiouServer({ leadsFilePath = leadsFile, adminCredentials = null } = {}) {
  const credentials = normalizeAdminCredentials(adminCredentials);
  const resolvedLeadsFilePath = path.resolve(leadsFilePath);
  return createServer((request, response) => handleRequest(request, response, {
    leadsFilePath: resolvedLeadsFilePath,
    adminCredentials: credentials,
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const adminCredentials = requiredStartupAdminCredentials();
  await ensureStore(leadsFile);
  createMeiouServer({ adminCredentials }).listen(port, "127.0.0.1", () => {
    console.log(`Meiou lead server running at http://127.0.0.1:${port}`);
  });
}
