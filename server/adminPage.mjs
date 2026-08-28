function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeScriptString(value) {
  return JSON.stringify(String(value))
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function buildAdminPage({ leadColumns, products }) {
  const publicProducts = products;
  const productOptions = publicProducts
    .map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`)
    .join("");
  const institutionOptions = [...new Set(publicProducts.map((product) => product.institution))]
    .map((institution) => `<option value="${escapeHtml(institution)}">${escapeHtml(institution)}</option>`)
    .join("");
  const headerCells = leadColumns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rowCells = leadColumns
    .map(([key]) => {
      return `<td>\${escapeHtml(formatLeadValue(lead, ${escapeScriptString(key)}))}</td>`;
    })
    .join("");
  const emptyColspan = leadColumns.length + 2;

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
    input, select, textarea, button, a { font: inherit; }
    input, select { width: 220px; height: 40px; padding: 0 12px; border: 1px solid #cbd6e5; border-radius: 6px; color: #17243d; background: #fff; outline: none; }
    textarea { width: 100%; min-height: 120px; padding: 10px 12px; resize: vertical; border: 1px solid #cbd6e5; border-radius: 6px; color: #17243d; background: #fff; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: #5b8def; box-shadow: 0 0 0 3px rgba(91,141,239,.14); }
    button, a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border: 1px solid #cbd6e5; border-radius: 8px; background: #fff; color: #17243d; font-weight: 700; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { background: #f5f8fc; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid rgba(37,99,235,.28); outline-offset: 2px; }
    button:disabled { opacity: .5; cursor: not-allowed; }
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
    .detail-col { width: 72px; text-align: center; }
    .view-button { min-height: 30px; padding: 0 10px; border-radius: 6px; color: #1d4ed8; font-size: 13px; }
    input[type="checkbox"] { width: 16px; height: 16px; accent-color: #2563eb; cursor: pointer; }
    [hidden] { display: none !important; }
    body.drawer-open { overflow: hidden; }
    .drawer-backdrop { position: fixed; top: 0; right: 0; bottom: 0; left: 0; inset: 0; z-index: 20; background: rgba(15,23,42,.42); }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; left: auto; inset: 0 0 0 auto; z-index: 21; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(620px, 100%); height: 100vh; height: 100dvh; border-left: 1px solid #cbd6e5; background: #fff; box-shadow: -12px 0 32px rgba(15,23,42,.16); }
    .drawer-header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; background: #fff; }
    .drawer-header h2 { margin: 0; font-size: 19px; line-height: 1.3; }
    .icon-button { width: 40px; min-width: 40px; padding: 0; font-size: 24px; font-weight: 400; }
    .drawer-body { overflow-y: auto; overscroll-behavior: contain; }
    .drawer-section { padding: 18px 20px; border-bottom: 1px solid #e8edf4; }
    .drawer-section h3 { margin: 0 0 12px; font-size: 15px; line-height: 1.35; }
    .drawer-section p { margin: 6px 0; color: #475569; line-height: 1.6; overflow-wrap: anywhere; }
    .drawer-section ul { margin: 8px 0 0; padding-left: 20px; color: #475569; }
    .drawer-section li { margin: 5px 0; line-height: 1.55; overflow-wrap: anywhere; }
    .definition-list { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px 14px; margin: 0; }
    .definition-list dt { color: #64748b; font-size: 13px; }
    .definition-list dd { margin: 0; color: #17243d; overflow-wrap: anywhere; }
    .product-row + .product-row, .explanation-row + .explanation-row { margin-top: 14px; padding-top: 14px; border-top: 1px solid #edf1f7; }
    .product-row strong, .explanation-row strong { display: block; margin-bottom: 6px; }
    .field-label { display: grid; gap: 7px; margin-top: 12px; color: #475569; font-size: 13px; font-weight: 700; }
    .field-label select { width: 100%; }
    .field-meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; color: #64748b; font-size: 12px; }
    .empty-copy { color: #94a3b8 !important; }
    .drawer-actions { position: sticky; bottom: 0; z-index: 1; display: flex; align-items: center; justify-content: flex-end; gap: 10px; min-height: 72px; padding: 14px 20px; border-top: 1px solid #dbe3ee; background: #fff; }
    .drawer-actions .action-status { min-width: 0; margin-right: auto; color: #53637a; font-size: 13px; line-height: 1.4; }
    .primary-command { border-color: #2563eb; background: #2563eb; color: #fff; }
    .primary-command:hover { background: #1d4ed8; }
    @media (max-width: 980px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 720px) { main { width: min(100% - 20px, 1440px); padding-top: 12px; } .topbar { align-items: stretch; flex-direction: column; } .tools, .tools input, .tools button, .tools a, .filters { width: 100%; } .filters { grid-template-columns: 1fr; } .drawer { width: 100%; border-left: 0; } .definition-list { grid-template-columns: 1fr; gap: 3px; } .definition-list dd + dt { margin-top: 8px; } .drawer-actions { flex-wrap: wrap; } .drawer-actions .action-status { flex-basis: 100%; } }
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
        <label>顾问复核状态<select id="reviewStatusFilter"><option value="">全部复核状态</option><option value="pending">待复核</option><option value="in_review">复核中</option><option value="reviewed">已复核</option><option value="needs_information">待补充资料</option></select></label>
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
            <tr><th class="select-col"><input id="selectAll" type="checkbox" aria-label="全选客户" /></th><th class="detail-col">操作</th>${headerCells}</tr>
          </thead>
          <tbody id="rows"><tr><td colspan="${emptyColspan}">暂无已读取数据</td></tr></tbody>
        </table>
      </div>
    </section>
  </main>
  <div id="drawerBackdrop" class="drawer-backdrop" hidden></div>
  <aside id="advisorDrawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="advisorDrawerTitle" tabindex="-1" hidden>
    <header class="drawer-header">
      <h2 id="advisorDrawerTitle">客户详情</h2>
      <button id="closeDrawer" class="icon-button" type="button" aria-label="关闭客户详情">×</button>
    </header>
    <div class="drawer-body">
      <section id="drawerCustomerSummary" class="drawer-section">
        <h3>客户与融资概况</h3>
        <div id="drawerCustomerContent"></div>
      </section>
      <section id="drawerDeterministicMatch" class="drawer-section">
        <h3>产品匹配结果</h3>
        <div id="drawerMatchContent"></div>
      </section>
      <section id="drawerAiReport" class="drawer-section">
        <h3>AI 客户报告</h3>
        <div id="drawerAiContent"></div>
      </section>
      <section id="drawerAdvisorFocus" class="drawer-section">
        <h3>顾问核验重点</h3>
        <div id="drawerAdvisorContent"></div>
      </section>
      <section id="drawerReview" class="drawer-section">
        <h3>顾问复核</h3>
        <label class="field-label">复核状态
          <select id="reviewStatus">
            <option value="pending">待复核</option>
            <option value="in_review">复核中</option>
            <option value="reviewed">已复核</option>
            <option value="needs_information">待补充资料</option>
          </select>
        </label>
        <label class="field-label">内部备注
          <textarea id="reviewNote" maxlength="2000" rows="6"></textarea>
        </label>
        <div class="field-meta"><span id="reviewUpdatedAt">尚未更新</span><span id="reviewNoteCount">0 / 2000</span></div>
      </section>
    </div>
    <footer id="drawerActions" class="drawer-actions">
      <span id="drawerActionStatus" class="action-status" aria-live="polite"></span>
      <button id="retryAi" type="button" hidden>重试 AI 分析</button>
      <button id="saveReview" class="primary-command" type="button">保存复核</button>
    </footer>
  </aside>
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
    const drawerBackdrop = document.querySelector("#drawerBackdrop");
    const advisorDrawer = document.querySelector("#advisorDrawer");
    const advisorDrawerTitle = document.querySelector("#advisorDrawerTitle");
    const closeDrawerButton = document.querySelector("#closeDrawer");
    const drawerCustomerContent = document.querySelector("#drawerCustomerContent");
    const drawerMatchContent = document.querySelector("#drawerMatchContent");
    const drawerAiContent = document.querySelector("#drawerAiContent");
    const drawerAdvisorContent = document.querySelector("#drawerAdvisorContent");
    const reviewStatusInput = document.querySelector("#reviewStatus");
    const reviewNoteInput = document.querySelector("#reviewNote");
    const reviewUpdatedAtNode = document.querySelector("#reviewUpdatedAt");
    const reviewNoteCountNode = document.querySelector("#reviewNoteCount");
    const drawerActionStatus = document.querySelector("#drawerActionStatus");
    const retryAiButton = document.querySelector("#retryAi");
    const saveReviewButton = document.querySelector("#saveReview");
    const filterInputs = {
      search: document.querySelector("#searchFilter"),
      product: document.querySelector("#productFilter"),
      institution: document.querySelector("#institutionFilter"),
      currency: document.querySelector("#currencyFilter"),
      status: document.querySelector("#statusFilter"),
      reviewStatus: document.querySelector("#reviewStatusFilter"),
      amountMin: document.querySelector("#amountMinFilter"),
      amountMax: document.querySelector("#amountMaxFilter"),
      dateFrom: document.querySelector("#dateFromFilter"),
      dateTo: document.querySelector("#dateToFilter"),
    };
    const applyFiltersButton = document.querySelector("#applyFilters");
    const clearFiltersButton = document.querySelector("#clearFilters");
    let loadedLeads = [];
    let activeLeadId = null;
    let drawerReturnFocus = null;
    let drawerGeneration = 0;
    let drawerOperationSequence = 0;
    let activeDrawerOperation = null;
    let loadSequence = 0;
    let activeLoadController = null;
    const selectedIds = new Set();
    const getAuthHeaders = () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      return username && password ? { Authorization: "Basic " + btoa(username + ":" + password) } : null;
    };
    const getFilterQuery = () => {
      const params = new URLSearchParams();
      Object.keys(filterInputs).forEach((key) => {
        const input = filterInputs[key];
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
      if (key === "matching.failedRules") return (lead.productMatches || []).reduce((reasons, match) => reasons.concat((match.failedRules || []).map((rule) => productNameFor(lead, match.productId) + "：" + (rule.internalReason || rule.message || rule.id || "未通过"))), []).join("；");
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
    const asArray = (value) => Array.isArray(value) ? value : [];
    const formatDateTime = (value) => value ? new Date(value).toLocaleString("zh-CN") : "尚未更新";
    const renderStringList = (values, emptyText = "暂无") => {
      const items = asArray(values).filter((value) => value !== null && value !== undefined && String(value).trim());
      return items.length
        ? "<ul>" + items.map((value) => \`<li>\${escapeHtml(value)}</li>\`).join("") + "</ul>"
        : \`<p class="empty-copy">\${escapeHtml(emptyText)}</p>\`;
    };
    const renderDefinitionList = (entries) => '<dl class="definition-list">' + entries
      .map(([label, value]) => \`<dt>\${escapeHtml(label)}</dt><dd>\${escapeHtml(value || "-")}</dd>\`)
      .join("") + "</dl>";
    const renderDrawer = (lead) => {
      const profile = lead.profile || {};
      const requestedAmount = profile.requestedAmount || {};
      const requestedAmountLabel = Number.isFinite(requestedAmount.amount)
        ? requestedAmount.amount + (requestedAmount.currency ? " " + requestedAmount.currency : "")
        : "-";
      advisorDrawerTitle.textContent = lead.companyName || "客户详情";
      drawerCustomerContent.innerHTML = renderDefinitionList([
        ["企业名称", lead.companyName],
        ["联系人", lead.contactName],
        ["联系电话", lead.phone],
        ["提交时间", formatDateTime(lead.createdAt)],
        ["融资场景", profile.primaryBusinessModel || lead.platform],
        ["意向金额", requestedAmountLabel],
        ["资金用途", profile.fundUse],
        ["偏好币种", profile.preferredCurrency],
      ]);

      const rankedProducts = [lead.matchReport && lead.matchReport.primary]
        .concat((lead.matchReport && lead.matchReport.alternatives) || [])
        .filter(Boolean);
      drawerMatchContent.innerHTML = rankedProducts.length
        ? rankedProducts.map((product, index) => \`
            <div class="product-row">
              <strong>\${escapeHtml(index === 0 ? "第一推荐：" + (product.name || "") : "备选：" + (product.name || ""))}</strong>
              <p>\${escapeHtml([product.institution, product.currency, product.term, product.limit].filter(Boolean).join(" · "))}</p>
              \${renderStringList(product.whyMatched, "暂无匹配说明")}
            </div>\`).join("")
        : '<p class="empty-copy">暂无推荐产品</p>';

      const analysis = lead.aiAnalysis || {};
      const customerReport = lead.aiReport || analysis.customerReport || {};
      const explanations = asArray(customerReport.productExplanations);
      drawerAiContent.innerHTML = \`
        <p><strong>\${escapeHtml(customerReport.statusMessage || "AI 报告生成中")}</strong></p>
        \${renderStringList(customerReport.businessSummary, "暂无经营摘要")}
        \${explanations.map((explanation) => \`
          <div class="explanation-row">
            <strong>\${escapeHtml(productNameFor(lead, explanation.productId))}</strong>
            \${renderStringList(explanation.reasons, "暂无补充说明")}
            \${renderStringList(explanation.itemsToConfirm, "暂无待确认项")}
          </div>\`).join("")}
        <div class="explanation-row"><strong>资料准备建议</strong>\${renderStringList(customerReport.preparationActions, "暂无资料建议")}</div>\`;

      drawerAdvisorContent.innerHTML = \`
        <strong>AI 顾问关注项</strong>
        \${renderStringList(analysis.advisorFocus, "暂无 AI 顾问关注项")}
        <div class="explanation-row"><strong>规则核验字段</strong>\${renderStringList(lead.advisorVerificationFields, "暂无待核验字段")}</div>\`;

      const review = lead.advisorReview || { status: "pending", note: "", updatedAt: null };
      reviewStatusInput.value = review.status;
      reviewNoteInput.value = review.note || "";
      reviewUpdatedAtNode.textContent = formatDateTime(review.updatedAt);
      reviewNoteCountNode.textContent = reviewNoteInput.value.length + " / 2000";
      const retryCapability = lead.aiRetry || { allowed: false };
      retryAiButton.hidden = retryCapability.allowed !== true;
      drawerActionStatus.textContent = "";
    };
    const openDrawer = (lead, trigger) => {
      drawerGeneration += 1;
      activeDrawerOperation = null;
      activeLeadId = lead.id;
      drawerReturnFocus = trigger;
      renderDrawer(lead);
      saveReviewButton.disabled = false;
      retryAiButton.disabled = false;
      drawerBackdrop.hidden = false;
      advisorDrawer.hidden = false;
      document.body.classList.add("drawer-open");
      closeDrawerButton.focus();
    };
    const closeDrawer = () => {
      if (advisorDrawer.hidden) return;
      drawerGeneration += 1;
      activeDrawerOperation = null;
      advisorDrawer.hidden = true;
      drawerBackdrop.hidden = true;
      document.body.classList.remove("drawer-open");
      activeLeadId = null;
      if (drawerReturnFocus && drawerReturnFocus.isConnected) drawerReturnFocus.focus();
      drawerReturnFocus = null;
    };
    const beginDrawerOperation = (leadId) => {
      const operation = {
        leadId,
        generation: drawerGeneration,
        token: drawerOperationSequence + 1,
      };
      drawerOperationSequence = operation.token;
      activeDrawerOperation = operation;
      return operation;
    };
    const isCurrentDrawerOperation = (operation) => (
      activeDrawerOperation !== null
        && activeDrawerOperation.token === operation.token
        && activeDrawerOperation.generation === operation.generation
        && activeDrawerOperation.leadId === operation.leadId
        && operation.generation === drawerGeneration
        && operation.leadId === activeLeadId
        && !advisorDrawer.hidden
    );
    const finishDrawerOperation = (operation) => {
      if (!isCurrentDrawerOperation(operation)) return;
      saveReviewButton.disabled = false;
      retryAiButton.disabled = false;
      activeDrawerOperation = null;
    };
    const syncExport = () => {
      const ids = Array.from(selectedIds);
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
            <td class="select-col"><input class="row-select" type="checkbox" value="\${escapeHtml(lead.id)}" \${selectedIds.has(lead.id) ? "checked" : ""} aria-label="选择客户" /></td>
            <td class="detail-col"><button class="view-button" type="button" data-lead-id="\${escapeHtml(lead.id)}" aria-label="查看 \${escapeHtml(lead.companyName || "客户")} 详情">查看</button></td>${rowCells}
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
      rowsNode.querySelectorAll(".view-button").forEach((button) => {
        button.addEventListener("click", () => {
          const lead = loadedLeads.find((item) => item.id === button.dataset.leadId);
          if (lead) openDrawer(lead, button);
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
    closeDrawerButton.addEventListener("click", closeDrawer);
    drawerBackdrop.addEventListener("click", closeDrawer);
    reviewNoteInput.addEventListener("input", () => {
      reviewNoteCountNode.textContent = reviewNoteInput.value.length + " / 2000";
    });
    document.addEventListener("keydown", (event) => {
      if (advisorDrawer.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.prototype.slice.call(advisorDrawer.querySelectorAll('button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hidden && element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    const loadLeads = (options = {}) => {
      const headers = getAuthHeaders();
      if (!headers) {
        statusNode.textContent = "请输入管理员账户和密码。";
        return Promise.resolve(false);
      }
      loadSequence += 1;
      const requestSequence = loadSequence;
      if (activeLoadController) activeLoadController.abort();
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      activeLoadController = controller;
      const requestOptions = { headers, cache: "no-store" };
      if (controller) requestOptions.signal = controller.signal;
      const preserveLeadId = options.preserveLeadId || null;
      syncExport();
      statusNode.textContent = "正在读取客户信息...";
      return fetch("/api/leads" + getFilterQuery(), requestOptions)
        .then((response) => response.json().then((payload) => ({ response, payload })))
        .then(({ response, payload }) => {
          if (requestSequence !== loadSequence) return false;
          if (!response.ok) throw new Error(payload.error || "读取失败");
          if (!Array.isArray(payload.leads)) throw new Error("读取结果格式不正确");
          if (activeLoadController === controller) activeLoadController = null;
          loadedLeads = payload.leads;
          Array.from(selectedIds).forEach((id) => {
            if (!loadedLeads.some((lead) => lead.id === id)) selectedIds.delete(id);
          });
          statusNode.textContent = "已读取 " + payload.leads.length + " 条客户信息";
          countNode.textContent = payload.leads.length;
          renderRows();
          if (preserveLeadId && !advisorDrawer.hidden) {
            const refreshedLead = loadedLeads.find((lead) => lead.id === preserveLeadId);
            if (refreshedLead) {
              const drawerOperation = options.drawerOperation || null;
              const mayRenderDrawer = activeDrawerOperation === null || (
                drawerOperation !== null
                  && activeDrawerOperation.token === drawerOperation.token
                  && activeDrawerOperation.generation === drawerOperation.generation
                  && activeDrawerOperation.leadId === drawerOperation.leadId
              );
              if (mayRenderDrawer) renderDrawer(refreshedLead);
            } else {
              closeDrawer();
            }
          } else if (options.closeDrawer !== false) {
            closeDrawer();
          }
          return true;
        })
        .catch((error) => {
          if (requestSequence !== loadSequence || error.name === "AbortError") return false;
          if (activeLoadController === controller) activeLoadController = null;
          statusNode.textContent = error.message || "读取失败";
          syncExport();
          return false;
        });
    };
    const refreshAfterMutation = (operation, message) => {
      const preserveLeadId = activeLeadId;
      return loadLeads({ preserveLeadId, closeDrawer: false, drawerOperation: operation }).then((refreshed) => {
        if (refreshed && isCurrentDrawerOperation(operation)) {
          drawerActionStatus.textContent = message;
        }
        return refreshed;
      });
    };
    const performMutation = ({ pathSuffix, method, pendingText, successText, body }) => {
      const headers = getAuthHeaders();
      if (!headers || !activeLeadId) return Promise.resolve(false);
      const requestLeadId = activeLeadId;
      const requestLead = loadedLeads.find((lead) => lead.id === requestLeadId);
      if (!requestLead) return Promise.resolve(false);
      const expectedRevision = Number.isInteger(requestLead.revision) ? requestLead.revision : 0;
      const operation = beginDrawerOperation(requestLeadId);
      const requestHeaders = {
        Authorization: headers.Authorization,
        "Content-Type": "application/json",
      };
      saveReviewButton.disabled = true;
      retryAiButton.disabled = true;
      drawerActionStatus.textContent = pendingText;
      const requestBody = { expectedRevision };
      Object.keys(body || {}).forEach((key) => { requestBody[key] = body[key]; });
      const request = fetch("/api/leads/" + encodeURIComponent(requestLeadId) + pathSuffix, {
        method,
        headers: requestHeaders,
        cache: "no-store",
        body: JSON.stringify(requestBody),
      }).then((response) => response.json().then((payload) => ({ response, payload })));

      return request.then(
        ({ response, payload }) => {
          const message = response.ok
            ? successText + "，已刷新最新状态。"
            : (payload.error || "操作未完成") + "，已刷新最新状态。";
          return refreshAfterMutation(operation, message);
        },
        () => refreshAfterMutation(operation, "服务器响应不确定，已刷新最新状态。"),
      ).then((result) => {
        finishDrawerOperation(operation);
        return result;
      }, (error) => {
        if (isCurrentDrawerOperation(operation)) {
          drawerActionStatus.textContent = error.message || "刷新失败";
        }
        finishDrawerOperation(operation);
        return false;
      });
    };
    saveReviewButton.addEventListener("click", () => performMutation({
      pathSuffix: "/review",
      method: "PATCH",
      pendingText: "正在保存复核...",
      successText: "复核已保存",
      body: { status: reviewStatusInput.value, note: reviewNoteInput.value },
    }));
    retryAiButton.addEventListener("click", () => {
      if (retryAiButton.hidden) return Promise.resolve(false);
      return performMutation({
        pathSuffix: "/ai-retry",
        method: "POST",
        pendingText: "正在重试 AI 分析...",
        successText: "AI 分析已更新",
        body: {},
      });
    });
    const loadFromControls = () => {
      closeDrawer();
      return loadLeads({ closeDrawer: false });
    };
    loadButton.addEventListener("click", loadFromControls);
    applyFiltersButton.addEventListener("click", loadFromControls);
    clearFiltersButton.addEventListener("click", () => {
      Object.keys(filterInputs).forEach((key) => { filterInputs[key].value = ""; });
      return loadFromControls();
    });
    exportLink.addEventListener("click", () => {
      const headers = getAuthHeaders();
      const ids = Array.from(selectedIds);
      if (!headers || ids.length === 0) return Promise.resolve(false);
      const params = new URLSearchParams();
      ids.forEach((id) => params.append("ids", id));
      statusNode.textContent = "正在生成 Excel...";
      return fetch("/api/leads/export?" + params.toString(), { headers })
        .then((response) => {
          if (response.ok) return response.blob();
          return response.json().then((payload) => {
            throw new Error(payload.error || "导出失败");
          });
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "meiou-leads.xls";
          link.click();
          URL.revokeObjectURL(url);
          statusNode.textContent = "Excel 已开始下载。";
          return true;
        })
        .catch((error) => {
          statusNode.textContent = error.message || "导出失败";
          return false;
        });
    });
  </script>
</body>
</html>`;
}
