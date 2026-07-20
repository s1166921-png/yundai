import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCreditEstimate } from "../src/lib/creditEstimator.js";
import { calculateSimpleEstimate } from "../src/lib/simpleEstimator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const leadsFile = path.join(dataDir, "leads.json");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);
const adminToken = process.env.ADMIN_TOKEN || "meiou2026";

const baseFields = [
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
  ["note", "补充说明"],
];

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    await stat(leadsFile);
  } catch {
    await writeFile(leadsFile, "[]", "utf8");
  }
}

async function readLeads() {
  await ensureStore();
  const raw = await readFile(leadsFile, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeLeads(leads) {
  await ensureStore();
  await writeFile(leadsFile, JSON.stringify(leads, null, 2), "utf8");
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
        reject(new Error("请求内容过大"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function isAuthorized(url) {
  return url.searchParams.get("token") === adminToken;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeLead(input) {
  const lead = {};
  const estimationMode = input.estimationMode === "simple" ? "simple" : "complex";
  const requiredFields = [...baseFields, ...(estimationMode === "simple" ? simpleEstimateFields : complexEstimateFields)];
  const allFields = [...new Set([...baseFields, ...simpleEstimateFields, ...complexEstimateFields, "note"])];

  for (const key of allFields) {
    lead[key] = String(input[key] || "").trim();
  }

  const missing = requiredFields.filter((key) => !lead[key]);
  if (missing.length > 0) {
    throw new Error("请完整填写必填项");
  }

  const estimate = estimationMode === "complex" ? calculateCreditEstimate(lead) : calculateSimpleEstimate(lead);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    estimationMode,
    ...lead,
    estimate,
  };
}

function getLeadValue(lead, key) {
  return key.split(".").reduce((value, part) => value?.[part], lead) ?? "";
}

function formatLeadValue(lead, key) {
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
          <input id="token" type="password" placeholder="后台口令" />
          <button id="load" type="button">读取客户信息</button>
          <a id="export" class="primary disabled" href="#">导出选中 Excel</a>
        </div>
      </div>
      <div class="summary">
        <span id="status">请输入后台口令。</span>
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
    const tokenInput = document.querySelector("#token");
    const loadButton = document.querySelector("#load");
    const exportLink = document.querySelector("#export");
    const statusNode = document.querySelector("#status");
    const countNode = document.querySelector("#count");
    const selectedCountNode = document.querySelector("#selectedCount");
    const selectAllNode = document.querySelector("#selectAll");
    const rowsNode = document.querySelector("#rows");
    let loadedLeads = [];
    const selectedIds = new Set();
    const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const formatLeadValue = (lead, key) => {
      const value = key.split(".").reduce((current, part) => current && current[part], lead);
      if (key === "createdAt") return value ? new Date(value).toLocaleString("zh-CN") : "";
      if (key === "debtOverRevenue70") return value === "yes" ? "是（扣 10 分）" : value === "no" ? "否" : "";
      if (key === "estimate.score") return value === undefined || value === null ? "-" : value + " 分";
      return value || (key.startsWith("estimate.") ? "-" : "");
    };
    const syncExport = () => {
      const token = tokenInput.value.trim();
      const ids = [...selectedIds];
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      ids.forEach((id) => params.append("ids", id));
      exportLink.href = token && ids.length ? "/api/leads/export?" + params.toString() : "#";
      exportLink.classList.toggle("disabled", !token || ids.length === 0);
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
    tokenInput.addEventListener("input", syncExport);
    selectAllNode.addEventListener("change", () => {
      if (selectAllNode.checked) {
        loadedLeads.forEach((lead) => selectedIds.add(lead.id));
      } else {
        selectedIds.clear();
      }
      renderRows();
    });
    loadButton.addEventListener("click", async () => {
      const token = tokenInput.value.trim();
      syncExport();
      statusNode.textContent = "正在读取客户信息...";
      try {
        const response = await fetch("/api/leads?token=" + encodeURIComponent(token));
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
  </script>
</body>
</html>`;
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
    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(response);
  } catch {
    const indexPath = path.join(distDir, "index.html");
    try {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      createReadStream(indexPath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  }
}

const server = createServer(async (request, response) => {
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
      const lead = normalizeLead(JSON.parse(body || "{}"));
      const leads = await readLeads();
      leads.unshift(lead);
      await writeLeads(leads);
      sendJson(response, 201, { ok: true, lead });
      return;
    }

    if (url.pathname === "/api/leads" && request.method === "GET") {
      if (!isAuthorized(url)) {
        sendJson(response, 401, { error: "后台口令不正确" });
        return;
      }
      sendJson(response, 200, { leads: await readLeads() });
      return;
    }

    if (url.pathname === "/api/leads/export" && request.method === "GET") {
      if (!isAuthorized(url)) {
        sendJson(response, 401, { error: "后台口令不正确" });
        return;
      }
      const leads = await readLeads();
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
    sendJson(response, 500, { error: error.message || "服务器错误" });
  }
});

await ensureStore();
server.listen(port, "127.0.0.1", () => {
  console.log(`Meiou lead server running at http://127.0.0.1:${port}`);
});
